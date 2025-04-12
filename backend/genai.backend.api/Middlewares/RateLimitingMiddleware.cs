using Microsoft.Extensions.Caching.Memory;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;

namespace genai.backend.api.Middlewares
{
    [AttributeUsage(AttributeTargets.Class | AttributeTargets.Method, AllowMultiple = false)]
    public class RateLimitAttribute(int requestsPerMinute) : Attribute
    {
        public int RequestsPerMinute { get; set; } = requestsPerMinute;
    }

    public class RateLimitingMiddleware(
        RequestDelegate next,
        IMemoryCache cache,
        IConfiguration configuration,
        ILogger<RateLimitingMiddleware> logger)
    {
        public async Task InvokeAsync(HttpContext context)
        {
            logger.LogInformation("Request Path: {Path}, Authenticated: {IsAuthenticated}", context.Request.Path, context.User.Identity?.IsAuthenticated);

            var endpoint = context.GetEndpoint();
            var rateLimitAttribute = endpoint?.Metadata.GetMetadata<RateLimitAttribute>();
            var user = context.User;

            var ipAddress = context.Connection.RemoteIpAddress?.ToString();
            if (ipAddress != null && user.Identity?.IsAuthenticated == false)
            {
                if (await CheckRateLimitAsync(context, $"ip-{ipAddress}", limit:5, 60))
                {
                    return;
                }
            }
            if (user.Identity?.IsAuthenticated == true)
            {
                var userId = user.FindFirst(JwtRegisteredClaimNames.Sid)?.Value;
                if (userId != null)
                {
                    if (rateLimitAttribute != null)
                    {
                        if (await CheckRateLimitAsync(context, userId, rateLimitAttribute.RequestsPerMinute, 60))
                        {
                            return;
                        }
                    }
                    else
                    {
                        var role = user.FindFirst(ClaimTypes.Role)?.Value;
                        if (role != null)
                        {
                            var rateLimit = configuration.GetValue<int>($"RateLimits:{role}");
                            if (await CheckRateLimitAsync(context, userId, rateLimit, 60))
                            {
                                return;
                            }
                        }
                    }
                }
            }

            await next(context);
        }

        private async Task<bool> CheckRateLimitAsync(HttpContext context, string userId, int limit, int expirationSeconds)
        {
            var cacheKey = $"{userId}-rate-limit-{context.Request.Path.Value}";
            var requestCount = await cache.GetOrCreateAsync(cacheKey, entry =>
            {
                entry.SetAbsoluteExpiration(TimeSpan.FromSeconds(expirationSeconds));
                return Task.FromResult(0);
            });

            if (requestCount >= limit)
            {
                context.Response.StatusCode = StatusCodes.Status429TooManyRequests;
                return true;
            }

            cache.Set(cacheKey, requestCount + 1, TimeSpan.FromSeconds(expirationSeconds));
            return false;
        }
    }
}