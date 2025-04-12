using System.ComponentModel.DataAnnotations;

namespace genai.backend.api.Models
{
    public class AvailableModel
    {
        public Guid DeploymentId { get; set; }
        public required string DeploymentName { get; set; }
        public required string ModelName { get; set; }
        public required string ModelType { get; set; }
        public required string ModelVersion { get; set; }
        public required string Provider { get; set; }
        public required string Endpoint { get; set; }
        public required string ApiKey { get; set; }
        public bool IsActive { get; set; }
    }
}
