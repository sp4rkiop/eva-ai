using System.ComponentModel.DataAnnotations;

namespace genai.backend.api.Models
{
    public class ChatHistory
    {
        public Guid ChatId { get; set; }
        public Guid UserId { get; set; }
        public string ChatTitle { get; set; }
        public byte[] ChatHistoryJson { get; set; } // BLOB is mapped to byte array
        public DateTime CreatedOn { get; set; }
        public int NetTokenConsumption { get; set; }
        public bool visible { get; set; }
    }
}
