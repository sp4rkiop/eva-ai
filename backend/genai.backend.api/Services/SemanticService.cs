using Microsoft.EntityFrameworkCore;
using Microsoft.SemanticKernel.ChatCompletion;
using Microsoft.SemanticKernel.Connectors.OpenAI;
using Microsoft.SemanticKernel;
using StackExchange.Redis;
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
    public class SemanticService
    {
        private readonly IConfiguration _configuration;
        private readonly Kernel chatKernel;
        private readonly IChatCompletionService chatCompletion;
        private readonly IConnectionMultiplexer _redisConnection;
        private readonly Cassandra.ISession _session;
        private readonly ResponseStream _responseStream;
        private readonly UserService _userService;
        private readonly IMemoryCache _cache;
        private readonly TimeSpan _cacheDuration = TimeSpan.FromHours(6);
        /// <summary>
        /// Initializes a new instance of the <see cref="SemanticService"/> class.
        /// </summary>
        /// <param name="configuration">The configuration object.</param>
        /// <param name="dbContext">The application database context.</param>
        public SemanticService(IConfiguration configuration, Cassandra.ISession session, ResponseStream responseStream, UserService userService, IMemoryCache cache)
        {
            _configuration = configuration;
            _session = session;
            _responseStream = responseStream;
            _userService = userService;
            _cache = cache;
            /*// Get values from appsettings.json
            var redisConnection = _configuration["ConnectionStrings:Redis"];
            _redisConnection = ConnectionMultiplexer.Connect(redisConnection);*/
        }

        /// <summary>
        /// Handles the semantic chat operation.
        /// </summary>
        /// <param name="userId">The user ID.</param>
        /// <param name="userInput">The user input.</param>
        /// <param name="chatId">The chat ID.</param>
        public async Task<string> semanticChatAsync(Guid userId, Guid modelId, string userInput, string? chatId = null)
        {
            try
            {
                bool isModelSubscribed = await _cache.GetOrCreateAsync($"subscribed-{userId}-{modelId}", async entry =>
                {
                    entry.AbsoluteExpirationRelativeToNow = _cacheDuration;
                    var checkSubscriptionStatement = "SELECT COUNT(*) FROM usersubscriptions WHERE userid = ? AND modelid = ?";
                    var preparedStatement = _session.Prepare(checkSubscriptionStatement);
                    var boundStatement = preparedStatement.Bind(userId, modelId);
                    var result = await _session.ExecuteAsync(boundStatement).ConfigureAwait(false);
                    return result.First().GetValue<long>(0) > 0;
                });

                if (!isModelSubscribed)
                {
                    throw new Exception("Either Model is not available or you are not subscribed to it.");
                }
                var GptModel = await _cache.GetOrCreateAsync($"model-details-{modelId}", async entry =>
                {
                    entry.AbsoluteExpirationRelativeToNow = _cacheDuration;
                    var getModelDetailsStatement = "SELECT deploymentname, endpoint, apikey FROM availablemodels WHERE deploymentid = ?";
                    var preparedStatement = _session.Prepare(getModelDetailsStatement);
                    var boundStatement = preparedStatement.Bind(modelId);
                    var result = await _session.ExecuteAsync(boundStatement).ConfigureAwait(false);
                    return result.Select(row => new
                    {
                        ModelName = row.GetValue<string>("deploymentname"),
                        ModelUrl = row.GetValue<string>("endpoint"),
                        ModelKey = row.GetValue<string>("apikey")
                    }).ToList();
                });
                var chatKernel = Kernel.CreateBuilder()
                .AddAzureOpenAIChatCompletion(
                    deploymentName: GptModel[0].ModelName,
                    modelId: GptModel[0].ModelName,
                    endpoint: GptModel[0].ModelUrl,
                    apiKey: GptModel[0].ModelKey)
                .Build();
                //chatKernel.Plugins.AddFromType<BingPlugin>("WebSearch");
                chatKernel.Plugins.AddFromType<DateTimePlugin>("CurrentDateTimePlugin");
                chatKernel.Plugins.AddFromType<GooglePlugin>("GoogleWebSearchPlugin");
                var chatCompletion = chatKernel.GetRequiredService<IChatCompletionService>();
                if (chatId != null)
                {
                    ContinueExistingChat(chatKernel, chatCompletion, userId, Guid.Parse(chatId), userInput);
                    return null;
                }
                else
                {
                    return await StartNewChat(chatKernel, chatCompletion, userId, userInput);

                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error processing semantic function: {ex.Message}");
                throw;
            }
        }

        private async Task ContinueExistingChat(Microsoft.SemanticKernel.Kernel chatKernel, Microsoft.SemanticKernel.ChatCompletion.IChatCompletionService chatCompletion, Guid userId, Guid chatId, string userInput)
        {
            try
            {
                // Prepare and execute the CQL query to fetch chat history by chatId
                var chatSelectStatement = "SELECT chathistoryjson FROM chathistory WHERE userid = ? AND chatid = ?";
                var preparedStatement = _session.Prepare(chatSelectStatement);
                var boundStatement = preparedStatement.Bind(userId, chatId);
                var resultSet = await _session.ExecuteAsync(boundStatement).ConfigureAwait(false);
                var row = resultSet.FirstOrDefault();

                if (row == null)
                {
                    await _responseStream.PartialResponse(userId.ToString(), $"Error continuing chat with existing history: Chat history not found for chat ID: {chatId}");
                    return;
                }
                var oldchatHistory = JsonSerializer.Deserialize<Microsoft.SemanticKernel.ChatCompletion.ChatHistory>(Encoding.UTF8.GetString(row.GetValue<byte[]>("chathistoryjson")));
                //oldchatHistory.AddMessage(AuthorRole.User, userInput);
                oldchatHistory.Add(
                    new()
                    {
                        Role = AuthorRole.User,
                        Items = [
                            new TextContent{ Text = userInput },
                            ],
                        ModelId = chatCompletion.GetModelId(),
                        Metadata = new Dictionary<string, object?>
                        {
                            { "TokenConsumed", TokenCalculator(chatCompletion.GetModelId(), userInput, null).PromptTokens },
                            { "CreatedOn", DateTime.UtcNow.ToString() }
                        }.ToDictionary(kvp => kvp.Key, kvp => (object)kvp.Value)
                    }
                );
                OpenAIPromptExecutionSettings openAIPromptExecutionSettings = new()
                {
                    //MaxTokens = 4096,
                    Temperature =0.001,
                    ToolCallBehavior = ToolCallBehavior.AutoInvokeKernelFunctions
                };
                var llmresponse = chatCompletion.GetStreamingChatMessageContentsAsync(oldchatHistory, executionSettings: openAIPromptExecutionSettings, kernel: chatKernel);

                var fullMessage = new StringBuilder();
                //await _responseStream.BeginStream(chatId);
                await foreach (var chatUpdate in llmresponse)
                {
                    if (!string.IsNullOrEmpty(chatUpdate.Content))
                    {
                        fullMessage.Append(chatUpdate.Content);
                        //Console.Write(chatUpdate.Content);
                        await _responseStream.PartialResponse(userId.ToString(), JsonSerializer.Serialize(new { ChatId = chatId.ToString(), PartialContent = chatUpdate.Content }));
                        await Task.Delay(20);//20ms response stream delay for smooth chat stream
                    }
                }
                await _responseStream.EndStream(userId.ToString());

                var completionToken = TokenCalculator(chatCompletion.GetModelId(), null, fullMessage.ToString()).CompletionTokens;

                oldchatHistory.Add(
                    new()
                    {
                        Role = AuthorRole.Assistant,
                        Items = [
                            new TextContent{ Text = fullMessage.ToString() },
                            ],
                        ModelId = chatCompletion.GetModelId(),
                        Metadata = new Dictionary<string, object?>
                        {
                            { "TokenConsumed", completionToken},
                            { "CreatedOn", DateTime.UtcNow.ToString() }
                        }.ToDictionary(kvp => kvp.Key, kvp => (object)kvp.Value)
                    }
                );

                //oldchatHistory.AddAssistantMessage(fullMessage.ToString());
                // Serialize the updated chat history and prepare to update in Cassandra
                var updatedChatHistoryJson = Encoding.UTF8.GetBytes(JsonSerializer.Serialize<Microsoft.SemanticKernel.ChatCompletion.ChatHistory>(oldchatHistory));
                var updateStatement = "UPDATE chathistory SET chathistoryjson = ? , createdon = ? WHERE userid = ? AND chatid = ?";
                var updatePreparedStatement = _session.Prepare(updateStatement);
                var updateBoundStatement = updatePreparedStatement.Bind(updatedChatHistoryJson, DateTime.UtcNow, userId, chatId);
                await _session.ExecuteAsync(updateBoundStatement).ConfigureAwait(false);
            }
            catch (Exception ex)
            {
                if (ex.InnerException is Azure.RequestFailedException requestFailedException && requestFailedException.ErrorCode == "content_filter")
                {
                    await _responseStream.PartialResponse(userId.ToString(), "Your query got a filtered content warning,\r\nPlease remove any words showing **HATE, SELF HARM, SEXUAL, VIOLENCE** from your query and rewrite it.");
                }
                await _responseStream.PartialResponse(chatId.ToString(), $"Error continuing chat with existing history: {ex.Message}");
                throw;
            }
        }

        /// <summary>
        /// Starts a new chat.
        /// </summary>
        /// <param name="userId">The user ID.</param>
        /// <param name="userInput">The user input.</param>
        public async Task<string> StartNewChat(Microsoft.SemanticKernel.Kernel chatKernel, Microsoft.SemanticKernel.ChatCompletion.IChatCompletionService chatCompletion, Guid userId, string userInput)
        {
            var newChatId = Guid.NewGuid();
            try
            {
                var promptTemplate = _configuration.GetValue<string>("Prompt");

                var promptTemplateFactory = new KernelPromptTemplateFactory();
                var systemMessage = await promptTemplateFactory.Create(new PromptTemplateConfig(promptTemplate)).RenderAsync(chatKernel);
                var newChatHistory = new Microsoft.SemanticKernel.ChatCompletion.ChatHistory(systemMessage);
                //newChatHistory.AddMessage(AuthorRole.User, userInput);
                newChatHistory.Add(
                    new()
                    {
                        Role = AuthorRole.User,
                        Items = [
                            new TextContent{ Text = userInput },
                            ],
                        ModelId = chatCompletion.GetModelId(),
                        Metadata = new Dictionary<string, object?>
                        {
                            { "TokenConsumed", TokenCalculator(chatCompletion.GetModelId(), userInput, null).PromptTokens },
                            { "CreatedOn", DateTime.UtcNow.ToString() }
                        }.ToDictionary(kvp => kvp.Key, kvp => (object)kvp.Value)
                    }
                );
                OpenAIPromptExecutionSettings openAIPromptExecutionSettings = new()
                {
                    //MaxTokens = 4096,
                    Temperature = 0.001,
                    ToolCallBehavior = ToolCallBehavior.AutoInvokeKernelFunctions
                };
                var llmresponse = chatCompletion.GetStreamingChatMessageContentsAsync(newChatHistory, executionSettings: openAIPromptExecutionSettings, kernel: chatKernel);
                var fullMessage = new StringBuilder();
                //await _responseStream.BeginStream(userId);
                await foreach (var chatUpdate in llmresponse)
                {
                    if (!string.IsNullOrEmpty(chatUpdate.Content))
                    {
                        fullMessage.Append(chatUpdate.Content);
                        //Console.Write(chatUpdate.Content);
                        await _responseStream.PartialResponse(userId.ToString(), JsonSerializer.Serialize(new { ChatId = userId.ToString(), PartialContent = chatUpdate.Content }));
                        await Task.Delay(20);//20ms response stream delay for smooth chat stream
                    }
                }
                await _responseStream.EndStream(userId.ToString());
                //newChatHistory.AddMessage(AuthorRole.Assistant, fullMessage.ToString());
                var completionToken = TokenCalculator(chatCompletion.GetModelId(), null, fullMessage.ToString()).CompletionTokens;
                newChatHistory.Add(
                    new()
                    {
                        Role = AuthorRole.Assistant,
                        Items = [
                            new TextContent{ Text = fullMessage.ToString() },
                            ],
                        ModelId = chatCompletion.GetModelId(),
                        Metadata = new Dictionary<string, object?>
                        {
                            { "TokenConsumed", completionToken },
                            { "CreatedOn", DateTime.UtcNow.ToString() }
                        }.ToDictionary(kvp => kvp.Key, kvp => (object)kvp.Value)
                    }
                );

                var updatedJsonChatHistory = JsonSerializer.Serialize<Microsoft.SemanticKernel.ChatCompletion.ChatHistory>(newChatHistory);
                var newTitle = await NewChatTitle(chatKernel, newChatHistory.ElementAt(1).Content.ToString());
                // Prepare and execute the CQL query to insert new chat history
                var insertStatement = "INSERT INTO chathistory (userid, chatid, chattitle, chathistoryjson, createdon, nettokenconsumption) VALUES (?, ?, ?, ?, ?, ?) IF NOT EXISTS";
                var preparedStatement = _session.Prepare(insertStatement);
                var boundStatement = preparedStatement.Bind(userId, newChatId, newTitle, Encoding.UTF8.GetBytes(updatedJsonChatHistory), DateTime.UtcNow, completionToken);
                await _session.ExecuteAsync(boundStatement).ConfigureAwait(false);

                return newChatId.ToString();
            }
            catch (Exception ex)
            {
                if (ex.InnerException is Azure.RequestFailedException requestFailedException && requestFailedException.ErrorCode == "content_filter")
                {
                    await _responseStream.PartialResponse(userId.ToString(), "Your query got a filtered content warning,\r\nPlease remove any words showing **HATE, SELF HARM, SEXUAL, VIOLENCE** from your query and rewrite it.");
                }
                await _responseStream.PartialResponse(userId.ToString(), $"Error starting new chat: {ex.InnerException?.Message ?? ex.Message}");
                throw new Exception(ex.InnerException?.Message ?? ex.Message);
            }
        }

        public async Task<string> GetConversation(Guid userId, Guid chatId)
        {
            try
            {
                // Prepare and execute the CQL query to fetch chat history by chatId
                var chatSelectStatement = "SELECT chathistoryjson FROM chathistory WHERE userid = ? AND chatid = ?";
                var preparedStatement = _session.Prepare(chatSelectStatement);
                var boundStatement = preparedStatement.Bind(userId, chatId);
                var resultSet = await _session.ExecuteAsync(boundStatement).ConfigureAwait(false);
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

        private async Task<string> NewChatTitle(Microsoft.SemanticKernel.Kernel chatKernel, string userInput)
        {
            var prompt = "You are a chatbot specialized in generating concise titles. I will provide a message and you will respond with a title in no more than 5 word which should capture the essence of message." +
                " My first Message: '{{$input}}'";
            var func = chatKernel.CreateFunctionFromPrompt(prompt);
            var response = await func.InvokeAsync(chatKernel, new() { ["input"] = userInput });
            var title = response.GetValue<string>();

            // Remove double quotes if they exist
            if (title.StartsWith('"') && title.EndsWith('"') && title.Length > 1)
            {
                title = title[1..^1]; // Remove the first and last characters
            }
            else if (title.StartsWith('\'') && title.EndsWith('\'') && title.Length > 1)
            {
                title = title[1..^1]; // Remove the first and last characters
            }

            return title;
        }
        private (int? PromptTokens, int? CompletionTokens) TokenCalculator(string ModelId, string prompt = null, string answer = null)
        {
            try
            {
                var encodingForModel = ModelToEncoder.For(ModelId);
                if (encodingForModel == null) return (PromptTokens: null, CompletionTokens: null);

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
            catch (Exception exception)
            {
                // log exception
                return (PromptTokens: null, CompletionTokens: null);
            }
        }

    }
}

