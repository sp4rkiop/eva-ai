using Microsoft.Extensions.Caching.Memory;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;

namespace genai.backend.api.Middlewares
{
    [AttributeUsage(AttributeTargets.Class | AttributeTargets.Method, AllowMultiple = false)]
    public class RateLimitAttribute : Attribute
    {
        public int RequestsPerMinute { get; set; }
        public RateLimitAttribute(int requestsPerMinute)
        {
            RequestsPerMinute = requestsPerMinute;
        }
    }

    public class RateLimitingMiddleware
    {
        private readonly RequestDelegate _next;
        private readonly IMemoryCache _cache;
        private readonly IConfiguration _configuration;
        private readonly ILogger<RateLimitingMiddleware> _logger;

        public RateLimitingMiddleware(RequestDelegate next, IMemoryCache cache, IConfiguration configuration, ILogger<RateLimitingMiddleware> logger)
        {
            _next = next;
            _cache = cache;
            _configuration = configuration;
            _logger = logger;
        }

        public async Task InvokeAsync(HttpContext context)
        {
            _logger.LogInformation("Request Path: {Path}, Authenticated: {IsAuthenticated}", context.Request.Path, context.User.Identity?.IsAuthenticated);

            var endpoint = context.GetEndpoint();
            var rateLimitAttribute = endpoint?.Metadata.GetMetadata<RateLimitAttribute>();
            var user = context.User;

            var ipAddress = context.Connection.RemoteIpAddress?.ToString();
            if (ipAddress != null && user.Identity?.IsAuthenticated == false)
            {
                var ipRateLimit = _configuration.GetValue<int>("RateLimits:IP");
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
                            var rateLimit = _configuration.GetValue<int>($"RateLimits:{role}");
                            if (await CheckRateLimitAsync(context, userId, rateLimit, 60))
                            {
                                return;
                            }
                        }
                    }
                }
            }

            await _next(context);
        }

        private async Task<bool> CheckRateLimitAsync(HttpContext context, string userId, int limit, int expirationSeconds)
        {
            var cacheKey = $"{userId}-rate-limit-{context.Request.Path.Value}";
            var requestCount = await _cache.GetOrCreateAsync(cacheKey, entry =>
            {
                entry.SetAbsoluteExpiration(TimeSpan.FromSeconds(expirationSeconds));
                return Task.FromResult(0);
            });

            if (requestCount >= limit)
            {
                context.Response.StatusCode = StatusCodes.Status429TooManyRequests;
                return true;
            }

            _cache.Set(cacheKey, requestCount + 1, TimeSpan.FromSeconds(expirationSeconds));
            return false;
        }
    }
}