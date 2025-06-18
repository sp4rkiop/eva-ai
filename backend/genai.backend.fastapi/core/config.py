from pydantic_settings import BaseSettings
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

class Settings(BaseSettings):
    DEFAULT_MODEL_ID: str = "1"
    CORS_ALLOWED_HOSTS: str = "http://localhost:8000"
    JWT_SECRET_KEY: str = "secret@123"
    RATE_LIMIT_ADMIN: int = 60
    RATE_LIMIT_USER: int = 14
    RATE_LIMIT_ANONYMOUS: int = 5
    SYSTEM_PROMPT: str = "You are eva, a helpful assistant."
    POSTGRES_USER: str = "dev_user"
    POSTGRES_PASSWORD: str = "dev_password"
    POSTGRES_HOST: str = "localhost"
    POSTGRES_PORT: int = 5432
    POSTGRES_DB: str = "postgres"
    REDIS_HOST: str = "localhost"
    REDIS_PORT: int = 6379
    REDIS_PASSWORD: str = "dev_password"
    OPENROUTER_URI: str = "https://openrouter.ai/api/v1"
    OPENROUTER_TOKEN: str = "YOUR_OPENROUTER_TOKEN"
    AZURE_OPENAI_API_VERSION: str = "2024-10-21"

    class Config:
        env_file = ".env"

settings = Settings()