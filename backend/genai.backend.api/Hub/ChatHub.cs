using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using System.IdentityModel.Tokens.Jwt;
using genai.backend.api.Middlewares;

namespace genai.backend.api.Hub
{
    [Authorize(AuthenticationSchemes = JwtBearerDefaults.AuthenticationScheme)]
    [RateLimit(requestsPerMinute: 60)]
    public class ChatHub : Microsoft.AspNetCore.SignalR.Hub
    {
        public override async Task OnConnectedAsync()
        {
            await base.OnConnectedAsync();
            var sid = Context.User?.FindFirst(JwtRegisteredClaimNames.Sid)?.Value;
            if (sid != null)
            {
                await Groups.AddToGroupAsync(Context.ConnectionId, groupName: sid);
                Console.WriteLine($"User {sid} has connected to chat and added to group.");
            }
            else
            {
                Console.WriteLine($"Id {Context.ConnectionId} connected without a valid SID. Disconnecting them");
                Context.Abort();
            }
        }
        public override async Task OnDisconnectedAsync(Exception? exception)
        {
            var sid = Context.User?.FindFirst(JwtRegisteredClaimNames.Sid)?.Value;
            if (sid != null)
            {
                await Groups.RemoveFromGroupAsync(Context.ConnectionId, groupName:sid);
                Console.WriteLine($"User {sid} has disconnected and removed from group.");
            }
            else
            {
                Console.WriteLine($"Id {Context.UserIdentifier} disconnected without a valid SID.");
            }

            await base.OnDisconnectedAsync(exception);
        }

        /*public async Task SendMessage(string chatId, string message)
        {
            if(_connection.TryGetValue(key:Context.ConnectionId, out var userConnection))
            {
                await Clients.Group(groupName:userConnection.ChatId!)
                    .SendAsync(method:"ReceiveMessage", arg1:userConnection.UserId, arg2:chatId, arg3:message);
            } else { }
        }*/
    }
}
