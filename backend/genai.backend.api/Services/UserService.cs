using Cassandra;
using genai.backend.api.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.IdentityModel.Tokens;
using System;
using System.IdentityModel.Tokens.Jwt;
using System.Linq;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace genai.backend.api.Services
{
    public class UserService
    {
        private readonly IConfiguration? _configuration;
        private readonly Cassandra.ISession _session;
        private readonly ResponseStream _responseStream;
        private readonly IMemoryCache _cache;
        public UserService(IConfiguration configuration, Cassandra.ISession session, ResponseStream responseStream, IMemoryCache cache)
        {
            _configuration = configuration;
            _session = session;
            _responseStream = responseStream;
            _cache = cache;
        }
        public async Task<Object> GetCreateUser(string emailId, string? firstName, string? lastName, string partner)
        {
            // Attempt to fetch the user and their subscribed models in a single query
            var userSelectStatement = "SELECT userid, role FROM users WHERE email = ? AND partner = ? LIMIT 1";
            var userPreparedStatement = _session.Prepare(userSelectStatement);
            var user = await _session.ExecuteAsync(userPreparedStatement.Bind(emailId, partner)).ConfigureAwait(false);
            var userRow = user.FirstOrDefault();

            if (userRow == null)
            {
                // User doesn't exist, so create a new one
                var userId = Guid.NewGuid();
                var defaultRole = "user";
                var userInsertStatement = "INSERT INTO users (userid, role, firstname, lastname, email, partner) VALUES (?, ?, ?, ?, ?, ?) IF NOT EXISTS";
                var userInsertPreparedStatement = _session.Prepare(userInsertStatement);
                var resultSet = await _session.ExecuteAsync(userInsertPreparedStatement.Bind(userId, defaultRole, firstName, lastName, emailId, partner)).ConfigureAwait(false);
                var appliedInfo = resultSet.FirstOrDefault();

                if (appliedInfo != null && appliedInfo.GetValue<bool>("[applied]"))
                {
                    // Create a default entry for UserSubscriptions
                    var defaultModelId = _configuration.GetValue<Guid>("DefaultModelId");
                    var subscriptionInsertStatement = "INSERT INTO usersubscriptions (userid, modelid) VALUES (?, ?) IF NOT EXISTS";
                    var subscriptionInsertPreparedStatement = _session.Prepare(subscriptionInsertStatement);
                    await _session.ExecuteAsync(subscriptionInsertPreparedStatement.Bind(userId, defaultModelId)).ConfigureAwait(false);

                    return new { UserId = userId, Token = GenerateJwtToken(userId, defaultRole) };
                }
                else
                {
                    // If the insert was not applied, it means the user was created by another request
                    user = await _session.ExecuteAsync(userPreparedStatement.Bind(emailId, partner)).ConfigureAwait(false);
                    userRow = user.FirstOrDefault();
                    return new { UserId = userRow.GetValue<Guid>("userid"), Token = GenerateJwtToken(userRow.GetValue<Guid>("userid"), userRow.GetValue<string>("role")) };
                }
            }
            else
            {
                return new { UserId = userRow.GetValue<Guid>("userid"), Token = GenerateJwtToken(userRow.GetValue<Guid>("userid"), userRow.GetValue<string>("role")) };
            }

        }
        private string GenerateJwtToken(Guid userId, string role)
        {
            var tokenHandler = new JwtSecurityTokenHandler();
            var key = Encoding.UTF8.GetBytes(_configuration["Jwt:SecretKey"]);
            var tokenDescriptor = new SecurityTokenDescriptor
            {
                Subject = new ClaimsIdentity(new Claim[]
                {
                    new Claim(JwtRegisteredClaimNames.Sid, userId.ToString()),
                    new Claim(ClaimTypes.Role, role)
                }),
                Expires = DateTime.UtcNow.AddDays(1),
                SigningCredentials = new SigningCredentials(new SymmetricSecurityKey(key), SecurityAlgorithms.HmacSha256Signature)
            };
            var token = tokenHandler.CreateToken(tokenDescriptor);
            return tokenHandler.WriteToken(token);
        }
        public async Task<Object> Conversations(Guid userId)
        {
            try
            {
                // Prepare and execute the CQL query to fetch chat history
                var chatSelectStatement = "SELECT chatid, chattitle, createdon FROM chathistory_by_visible WHERE visible = true AND userid = ?";
                var preparedStatement = _session.Prepare(chatSelectStatement);
                var boundStatement = preparedStatement.Bind(userId);
                var resultSet = await _session.ExecuteAsync(boundStatement).ConfigureAwait(false);
                // Convert the result set to a list of chat titles
                var chatTitles = new List<dynamic>();
                foreach (var row in resultSet)
                {
                    chatTitles.Add(new
                    {
                        id = row.GetValue<Guid>("chatid"),
                        title = row.GetValue<string>("chattitle"),
                        lastActivity = row.GetValue<DateTime>("createdon")
                    });
                }

                // Serialize and return the chat titles if any are found
                if (chatTitles.Count > 0)
                {
                    return JsonSerializer.Serialize(chatTitles);
                }
                return new { };
            }
            catch (Exception ex)
            {
                // Log the exception
                Console.WriteLine(ex.ToString());
                return new { };
            }
        }
        public async Task<Object> GetSubscribedModels(Guid userId)
        {
            // First query to get model IDs from usersubscriptions
            var modelSelectStatement = "SELECT modelid FROM usersubscriptions WHERE userid = ?";
            var preparedStatement = _session.Prepare(modelSelectStatement);
            var boundStatement = preparedStatement.Bind(userId);
            var resultSet = await _session.ExecuteAsync(boundStatement).ConfigureAwait(false);

            var modelIds = resultSet.Select(row => row.GetValue<Guid>("modelid")).ToList();

            if (modelIds.Any())
            {
                // Dynamically create the query with the correct number of placeholders for IN clause
                var placeholders = string.Join(",", modelIds.Select(_ => "?"));
                var deploymentNameSelectStatement = $"SELECT deploymentid, deploymentname FROM availablemodels WHERE deploymentid IN ({placeholders}) AND isactive = true";

                // Prepare the dynamically constructed query
                var deploymentNamePreparedStatement = _session.Prepare(deploymentNameSelectStatement);

                // Bind each individual modelId as a separate parameter
                var deploymentNameBoundStatement = deploymentNamePreparedStatement.Bind(modelIds.Cast<object>().ToArray());

                // Execute the query
                var deploymentNameResultSet = await _session.ExecuteAsync(deploymentNameBoundStatement).ConfigureAwait(false);

                // Process the result and return the list of models
                var models = deploymentNameResultSet.Select(row => new
                {
                    id = row.GetValue<Guid>("deploymentid").ToString(),
                    name = row.GetValue<string>("deploymentname").ToUpper()
                }).ToList();

                return JsonSerializer.Serialize(models);
            }

            return new { };
        }

        public async Task<bool> RenameConversation(Guid userId, Guid chatId, string newTitle)
        {
            var chatSelectStatement = "SELECT chatid FROM chathistory_by_visible WHERE visible = true AND userid = ? AND chatid = ? LIMIT 1";
            var preparedStatement = _session.Prepare(chatSelectStatement);
            var boundStatement = preparedStatement.Bind(userId, chatId);
            var resultSet = await _session.ExecuteAsync(boundStatement).ConfigureAwait(false);

            if (resultSet.FirstOrDefault() == null)
            {
                return false; // Chat not found
            }

            var chatUpdateStatement = "UPDATE chathistory SET chattitle = ? WHERE userid = ? AND chatid = ?";
            var updatePreparedStatement = _session.Prepare(chatUpdateStatement);
            var updateBoundStatement = updatePreparedStatement.Bind(newTitle, userId, chatId);
            await _session.ExecuteAsync(updateBoundStatement).ConfigureAwait(false);

            return true;
        }

        public async Task<bool> DeleteConversation(Guid userId, Guid chatId)
        {
            var chatSelectStatement = "SELECT chatid FROM chathistory_by_visible WHERE visible = true AND userid = ? AND chatid = ? LIMIT 1";
            var preparedStatement = _session.Prepare(chatSelectStatement);
            var boundStatement = preparedStatement.Bind(userId, chatId);
            var resultSet = await _session.ExecuteAsync(boundStatement).ConfigureAwait(false);

            if (resultSet.FirstOrDefault() == null)
            {
                return false; // Chat not found
            }

            var chatDeleteStatement = "UPDATE chathistory SET visible = false WHERE userid = ? AND chatid = ?";
            var deletePreparedStatement = _session.Prepare(chatDeleteStatement);
            var deleteBoundStatement = deletePreparedStatement.Bind(userId, chatId);
            await _session.ExecuteAsync(deleteBoundStatement).ConfigureAwait(false);

            return true;
        }
    }
}
