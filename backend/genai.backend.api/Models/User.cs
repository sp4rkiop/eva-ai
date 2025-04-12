namespace genai.backend.api.Models
{
    public class User
    {
        public Guid UserId { get; set; }
        public required string Role { get; set; }
        public required string FirstName { get; set; }
        public required string LastName { get; set; }
        public required string Email { get; set; }
        public required string Partner { get; set; }
    }
}
