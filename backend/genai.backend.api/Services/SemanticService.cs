using System.Globalization;
using Microsoft.SemanticKernel.ChatCompletion;
using Microsoft.SemanticKernel.Connectors.OpenAI;
using Microsoft.SemanticKernel;
using System.Text;
using System.Text.Json;
using Tiktoken;
using Microsoft.SemanticKernel.Services;
using Microsoft.Extensions.Caching.Memory;
using genai.backend.api.Plugins;

namespace genai.backend.api.Services
{
    /// <summary>
    /// Service class for handling semantic operations.
    /// </summary>
    public class SemanticService(
        IConfiguration configuration,
        Cassandra.ISession session,
        ResponseStream responseStream,
        IMemoryCache cache)
    {
        private readonly TimeSpan _cacheDuration = TimeSpan.FromHours(6);

        public class ChatResult
        {
            public string? ChatId { get; init; }
            public bool Success { get; init; }
            public string? ErrorMessage { get; init; }
        }

        /// <summary>
        /// Handles the semantic chat operation.
        /// </summary>
        /// <param name="userId">The user ID.</param>
        /// <param name="modelId">The model ID.</param>
        /// <param name="userInput">The user input.</param>
        /// <param name="chatId">The chat ID.</param>
        public async Task<ChatResult> SemanticChatAsync(Guid userId, Guid modelId, string userInput,
            string? chatId = null)
        {
            try
            {
                bool isModelSubscribed = await cache.GetOrCreateAsync($"subscribed-{userId}-{modelId}", async entry =>
                {
                    entry.AbsoluteExpirationRelativeToNow = _cacheDuration;
                    var checkSubscriptionStatement =
                        "SELECT modelid FROM usersubscriptions WHERE userid = ? AND modelid = ? LIMIT 1";
                    var preparedStatement = await session.PrepareAsync(checkSubscriptionStatement);
                    var boundStatement = preparedStatement.Bind(userId, modelId);
                    var result = await session.ExecuteAsync(boundStatement).ConfigureAwait(false);
                    return result.FirstOrDefault() != null;
                });

                if (!isModelSubscribed)
                {
                    return new ChatResult
                    {
                        Success = false, ErrorMessage = "Either Model is not available or you are not subscribed to it."
                    };
                }

                var gptModel = await cache.GetOrCreateAsync($"model-details-{modelId}", async entry =>
                {
                    entry.AbsoluteExpirationRelativeToNow = _cacheDuration;
                    var getModelDetailsStatement =
                        "SELECT deploymentname, endpoint, apikey FROM availablemodels WHERE deploymentid = ? AND isactive = true";
                    var preparedStatement = await session.PrepareAsync(getModelDetailsStatement);
                    var boundStatement = preparedStatement.Bind(modelId);
                    var result = await session.ExecuteAsync(boundStatement).ConfigureAwait(false);
                    return result.Select(row => new
                    {
                        ModelName = row.GetValue<string>("deploymentname"),
                        ModelUrl = row.GetValue<string>("endpoint"),
                        ModelKey = row.GetValue<string>("apikey")
                    }).ToList();
                });
                var chatKernel = Kernel.CreateBuilder()
                    .AddAzureOpenAIChatCompletion(
                        deploymentName: gptModel![0].ModelName,
                        modelId: gptModel[0].ModelName,
                        endpoint: gptModel[0].ModelUrl,
                        apiKey: gptModel[0].ModelKey)
                    .Build();
                //chatKernel.Plugins.AddFromType<BingPlugin>("WebSearch");
                chatKernel.Plugins.AddFromType<DateTimePlugin>("CurrentDateTimePlugin");
                chatKernel.Plugins.AddFromType<GooglePlugin>("GoogleWebSearchPlugin");
                var chatCompletion = chatKernel.GetRequiredService<IChatCompletionService>();
                if (chatId != null)
                {
                    await ContinueExistingChat(chatKernel, chatCompletion, userId, Guid.Parse(chatId), userInput);
                    return new ChatResult { Success = true };
                }
                else
                {
                    var newChatId = await StartNewChat(chatKernel, chatCompletion, userId, userInput);
                    return new ChatResult { Success = true, ChatId = newChatId };
                }
            }
            catch (Exception ex)
            {
                return new ChatResult { Success = false, ErrorMessage = $"SERVER handling error: {ex.Message}" };
            }
        }

        private async Task ContinueExistingChat(Kernel chatKernel,
            IChatCompletionService chatCompletion, Guid userId, Guid chatId,
            string userInput)
        {
            try
            {
                // Prepare and execute the CQL query to fetch chat history by chatId
                var chatSelectStatement =
                    "SELECT chathistoryjson, nettokenconsumption FROM chathistory_by_visible WHERE visible = true AND userid = ? AND chatid = ?";
                var preparedStatement = await session.PrepareAsync(chatSelectStatement);
                var boundStatement = preparedStatement.Bind(userId, chatId);
                var resultSet = await session.ExecuteAsync(boundStatement).ConfigureAwait(false);
                var row = resultSet.FirstOrDefault();

                if (row == null)
                {
                    await responseStream.PartialResponse(userId.ToString(),
                        $"Error continuing chat with existing history: Chat history not found for chat ID: {chatId}");
                    return;
                }

                var oldchatHistory =
                    JsonSerializer.Deserialize<ChatHistory>(
                        Encoding.UTF8.GetString(row.GetValue<byte[]>("chathistoryjson")));
                int oldTokenConsumption = row.GetValue<int>("nettokenconsumption");
                //oldchatHistory.AddMessage(AuthorRole.User, userInput);
                int promptTokens = TokenCalculator(chatCompletion.GetModelId()!, userInput).PromptTokens ?? 0;
                
                //check if oldChatHistory is null
                if (oldchatHistory == null)
                {
                    await responseStream.PartialResponse(userId.ToString(),
                        $"Error continuing chat with existing history: Chat history not found for chat ID: {chatId}");
                    return;
                }
                oldchatHistory.Add(
                    new()
                    {
                        Role = AuthorRole.User,
                        Items =
                        [
                            new TextContent { Text = userInput },
                        ],
                        ModelId = chatCompletion.GetModelId(),
                        Metadata = new Dictionary<string, object?>
                        {
                            { "TokenConsumed", promptTokens },
                            { "CreatedOn", DateTime.UtcNow.ToString(CultureInfo.CurrentCulture) }
                        }.ToDictionary(kvp => kvp.Key, kvp => kvp.Value)
                    }
                );
                OpenAIPromptExecutionSettings openAiPromptExecutionSettings = new()
                {
                    //MaxTokens = 4096,
                    Temperature = 0.001,
                    ToolCallBehavior = ToolCallBehavior.AutoInvokeKernelFunctions
                };
                var llmresponse = chatCompletion.GetStreamingChatMessageContentsAsync(oldchatHistory,
                    executionSettings: openAiPromptExecutionSettings, kernel: chatKernel);

                var fullMessage = new StringBuilder();
                //await _responseStream.BeginStream(chatId);
                await foreach (var chatUpdate in llmresponse)
                {
                    if (!string.IsNullOrEmpty(chatUpdate.Content))
                    {
                        fullMessage.Append(chatUpdate.Content);
                        //Console.Write(chatUpdate.Content);
                        await responseStream.PartialResponse(userId.ToString(),
                            JsonSerializer.Serialize(new
                                { ChatId = chatId.ToString(), PartialContent = chatUpdate.Content }));
                        await Task.Delay(16); //20ms response stream delay for smooth chat stream
                    }
                }

                int completionToken = TokenCalculator(modelId: chatCompletion.GetModelId()!, answer: fullMessage.ToString())
                    .CompletionTokens ?? 0;

                oldchatHistory.Add(
                    new()
                    {
                        Role = AuthorRole.Assistant,
                        Items =
                        [
                            new TextContent { Text = fullMessage.ToString() },
                        ],
                        ModelId = chatCompletion.GetModelId(),
                        Metadata = new Dictionary<string, object?>
                        {
                            { "TokenConsumed", completionToken },
                            { "CreatedOn", DateTime.UtcNow.ToString(CultureInfo.CurrentCulture) }
                        }.ToDictionary(kvp => kvp.Key, kvp => kvp.Value)
                    }
                );

                //oldchatHistory.AddAssistantMessage(fullMessage.ToString());
                // Serialize the updated chat history and prepare to update in Cassandra
                var updatedChatHistoryJson = Encoding.UTF8.GetBytes(
                    JsonSerializer.Serialize(oldchatHistory));
                var updateStatement =
                    "UPDATE chathistory SET chathistoryjson = ? , createdon = ? , nettokenconsumption = ? WHERE userid = ? AND chatid = ?";
                var updatePreparedStatement = await session.PrepareAsync(updateStatement);
                var updateBoundStatement = updatePreparedStatement.Bind(updatedChatHistoryJson, DateTime.UtcNow,
                    oldTokenConsumption + promptTokens + completionToken, userId, chatId);
                await session.ExecuteAsync(updateBoundStatement).ConfigureAwait(false);
                await responseStream.EndStream(userId.ToString());
            }
            catch (Exception ex)
            {
                if (ex.InnerException is Azure.RequestFailedException { ErrorCode: "content_filter" })
                {
                    await responseStream.PartialResponse(userId.ToString(),
                        "Your query got a filtered content warning,\r\nPlease remove any words showing **HATE, SELF HARM, SEXUAL, VIOLENCE** from your query and rewrite it.");
                }

                await responseStream.PartialResponse(chatId.ToString(),
                    $"Error continuing chat with existing history: {ex.Message}");
                throw;
            }
        }

        /// <summary>
        /// Starts a new chat.
        /// </summary>
        /// <param name="chatKernel">The chat kernel.</param>
        /// <param name="chatCompletion">The chat completion.</param>
        /// <param name="userId">The user ID.</param>
        /// <param name="userInput">The user input.</param>
        private async Task<string> StartNewChat(Kernel chatKernel,
            IChatCompletionService chatCompletion, Guid userId,
            string userInput)
        {
            var newChatId = Guid.NewGuid();
            try
            {
                var promptTemplate = configuration.GetValue<string>("Prompt");

                var promptTemplateFactory = new KernelPromptTemplateFactory();
                var systemMessage = await promptTemplateFactory.Create(new PromptTemplateConfig(promptTemplate ?? string.Empty))
                    .RenderAsync(chatKernel);
                var newChatHistory = new ChatHistory(systemMessage);
                //newChatHistory.AddMessage(AuthorRole.User, userInput);
                int promptTokens = TokenCalculator(chatCompletion.GetModelId()!, userInput ).PromptTokens ?? 0;
                newChatHistory.Add(
                    new()
                    {
                        Role = AuthorRole.User,
                        Items =
                        [
                            new TextContent { Text = userInput },
                        ],
                        ModelId = chatCompletion.GetModelId(),
                        Metadata = new Dictionary<string, object?>
                        {
                            { "TokenConsumed", promptTokens },
                            { "CreatedOn", DateTime.UtcNow.ToString(CultureInfo.CurrentCulture) }
                        }.ToDictionary(kvp => kvp.Key, kvp => kvp.Value)
                    }
                );
                OpenAIPromptExecutionSettings openAiPromptExecutionSettings = new()
                {
                    //MaxTokens = 4096,
                    Temperature = 0.001,
                    ToolCallBehavior = ToolCallBehavior.AutoInvokeKernelFunctions
                };
                var llmresponse = chatCompletion.GetStreamingChatMessageContentsAsync(newChatHistory,
                    executionSettings: openAiPromptExecutionSettings, kernel: chatKernel);
                var fullMessage = new StringBuilder();
                //await _responseStream.BeginStream(userId);
                await foreach (var chatUpdate in llmresponse)
                {
                    if (!string.IsNullOrEmpty(chatUpdate.Content))
                    {
                        fullMessage.Append(chatUpdate.Content);
                        //Console.Write(chatUpdate.Content);
                        await responseStream.PartialResponse(userId.ToString(),
                            JsonSerializer.Serialize(new
                                { ChatId = userId.ToString(), PartialContent = chatUpdate.Content }));
                        await Task.Delay(16); //20ms response stream delay for smooth chat stream
                    }
                }

                //newChatHistory.AddMessage(AuthorRole.Assistant, fullMessage.ToString());
                int completionToken = TokenCalculator(modelId: chatCompletion.GetModelId()!, answer: fullMessage.ToString())
                    .CompletionTokens ?? 0;
                newChatHistory.Add(
                    new()
                    {
                        Role = AuthorRole.Assistant,
                        Items =
                        [
                            new TextContent { Text = fullMessage.ToString() },
                        ],
                        ModelId = chatCompletion.GetModelId(),
                        Metadata = new Dictionary<string, object?>
                        {
                            { "TokenConsumed", completionToken },
                            { "CreatedOn", DateTime.UtcNow.ToString(CultureInfo.CurrentCulture) }
                        }.ToDictionary(kvp => kvp.Key, kvp => kvp.Value)
                    }
                );

                var updatedJsonChatHistory =
                    JsonSerializer.Serialize(newChatHistory);
                var newTitle = await NewChatTitle(chatKernel, userInput);
                // Prepare and execute the CQL query to insert new chat history
                var insertStatement =
                    "INSERT INTO chathistory (userid, chatid, chattitle, chathistoryjson, createdon, nettokenconsumption, visible) VALUES (?, ?, ?, ?, ?, ?, ?) IF NOT EXISTS";
                var preparedStatement = await session.PrepareAsync(insertStatement);
                var boundStatement = preparedStatement.Bind(userId, newChatId, newTitle,
                    Encoding.UTF8.GetBytes(updatedJsonChatHistory), DateTime.UtcNow, promptTokens + completionToken,
                    true);
                await session.ExecuteAsync(boundStatement).ConfigureAwait(false);
                await responseStream.EndStream(userId.ToString());
                return newChatId.ToString();
            }
            catch (Exception ex)
            {
                if (ex.InnerException is Azure.RequestFailedException { ErrorCode: "content_filter" })
                {
                    await responseStream.PartialResponse(userId.ToString(),
                        "Your query got a filtered content warning,\r\nPlease remove any words showing **HATE, SELF HARM, SEXUAL, VIOLENCE** from your query and rewrite it.");
                }

                await responseStream.PartialResponse(userId.ToString(),
                    $"Error starting new chat: {ex.InnerException?.Message ?? ex.Message}");
                throw new Exception(ex.InnerException?.Message ?? ex.Message);
            }
        }

        /// <summary>
        /// Retrieves the conversation history associated with the given user ID and chat ID.
        /// </summary>
        /// <param name="userId">The user ID.</param>
        /// <param name="chatId">The chat ID.</param>
        /// <returns>The conversation history as a JSON string.</returns>
        /// <remarks>
        /// The conversation history is retrieved from the Cassandra database. If no matching record is found, the method returns an error message.
        /// </remarks>
        public async Task<string> GetConversation(Guid userId, Guid chatId)
        {
            try
            {
                // Prepare and execute the CQL query to fetch chat history by chatId
                var chatSelectStatement =
                    "SELECT chathistoryjson FROM chathistory_by_visible WHERE visible = true AND userid = ? AND chatid = ?";
                var preparedStatement = await session.PrepareAsync(chatSelectStatement);
                var boundStatement = preparedStatement.Bind(userId, chatId);
                var resultSet = await session.ExecuteAsync(boundStatement).ConfigureAwait(false);
                var row = resultSet.FirstOrDefault();

                if (row == null)
                {
                    return $"Chat history not found for chat ID: {chatId}";
                }

                // Decode the BLOB (binary large object) data to string
                var chatHistoryJsonBlob = row.GetValue<byte[]>("chathistoryjson");
                return Encoding.UTF8.GetString(chatHistoryJsonBlob);
            }
            catch (Exception ex)
            {
                // Handle exceptions
                return $"Error getting chat history: {ex.Message}";
            }
        }

        /// <summary>
        /// Generates a concise title (in 5 words or fewer) which captures the essence of the given user input.
        /// </summary>
        /// <param name="chatKernel">The chat kernel.</param>
        /// <param name="userInput">The user input.</param>
        /// <returns>The generated title.</returns>
        private async Task<string> NewChatTitle(Kernel chatKernel, string userInput)
        {
            var prompt =
                "You are a chatbot specialized in generating concise titles. I will provide a message and you will respond with a title in no more than 5 word which should capture the essence of message." +
                " My first Message: '{{$input}}'";
            var func = chatKernel.CreateFunctionFromPrompt(prompt);
            var response = await func.InvokeAsync(chatKernel, new() { ["input"] = userInput });
            var title = response.GetValue<string>();

            // Remove double quotes if they exist
            if (title!.StartsWith('"') && title.EndsWith('"') && title.Length > 1)
            {
                title = title[1..^1]; // Remove the first and last characters
            }
            else if (title.StartsWith('\'') && title.EndsWith('\'') && title.Length > 1)
            {
                title = title[1..^1]; // Remove the first and last characters
            }

            return title;
        }

        /// <summary>
        /// Calculates the number of tokens in the given prompt and/or answer strings based on the specified model identifier.
        /// </summary>
        /// <param name="modelId">The model identifier used to determine the encoding for token calculation.</param>
        /// <param name="prompt">The input prompt string for which token count is needed.</param>
        /// <param name="answer">The answer string for which token count is needed.</param>
        /// <returns>A tuple containing the token count for the prompt and answer, or null if the model encoding is unavailable or an error occurs.</returns>
        private (int? PromptTokens, int? CompletionTokens) TokenCalculator(string modelId, string prompt = "",
            string answer = "")
        {
            try
            {
                var encodingForModel = ModelToEncoder.For(modelId);
                int? promptTokens = null;
                int? completionTokens = null;

                if (!string.IsNullOrEmpty(prompt))
                {
                    promptTokens = encodingForModel.CountTokens(prompt);
                }

                if (!string.IsNullOrEmpty(answer))
                {
                    completionTokens = encodingForModel.CountTokens(answer);
                }

                return (PromptTokens: promptTokens, CompletionTokens: completionTokens);
            }
            catch
            {
                return (PromptTokens: null, CompletionTokens: null);
            }
        }
    }
}