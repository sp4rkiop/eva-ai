using genai.backend.api.Services;
using Microsoft.AspNetCore.Mvc;
using System.IdentityModel.Tokens.Jwt;

namespace genai.backend.api.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class SemanticController(SemanticService semanticService) : Controller
    {
        public class PostRequest
        {
            public required Guid modelId { get; set; }
            public required string userInput { get; set; }
            public string? chatId { get; set; }
        }

        [HttpPost]
        public async Task<IActionResult> PostQuery([FromBody] PostRequest requestBody)
        {
            try
            {
                var userId = HttpContext.User.FindFirst(JwtRegisteredClaimNames.Sid)?.Value;
                if (userId != null && !string.IsNullOrEmpty(requestBody.userInput))
                {
                    var result = await semanticService.SemanticChatAsync(Guid.Parse(userId), 
                        requestBody.modelId, requestBody.userInput, requestBody.chatId);
                    
                    if (!result.Success)
                    {
                        // Return the error message to the client
                        return BadRequest(result.ErrorMessage);
                    }
                    
                    return Ok(result.ChatId);
                }
                return BadRequest();
            }
            catch (Exception ex)
            {
                // Log the exception and return internal server error
                Console.WriteLine($"Semantic Controller: {ex.Message}");
                return StatusCode(500, $"{ex.Message}");
            }
        }

        

    }
}
