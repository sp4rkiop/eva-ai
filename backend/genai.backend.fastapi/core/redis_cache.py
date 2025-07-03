# core/redis_cache.py

import logging
import redis.asyncio as redis
from redis.exceptions import RedisError
from core.config import settings

logger = logging.getLogger(__name__)


class RedisCache:
    _connection: redis.Redis

    @classmethod
    async def initialize(cls):
        try:
            cls._connection = redis.Redis(
                host=settings.REDIS_HOST,
                port=settings.REDIS_PORT,
                password=settings.REDIS_PASSWORD,
                decode_responses=True,
                socket_timeout=5,
                socket_connect_timeout=5,
                health_check_interval=30,
                retry_on_timeout=True,
            )
            # Test connection
            await cls._connection.ping()
            logger.info("Redis connection initialized successfully.")
        except RedisError as e:
            logger.error(f"Failed to initialize Redis: {e}")
            raise

    @classmethod
    def get_connection(cls) -> redis.Redis:
        if cls._connection is None:
            raise RuntimeError(
                "Redis connection is not initialized. Call `initialize()` first."
            )
        return cls._connection

    @classmethod
    async def close_connection(cls):
        if cls._connection:
            await cls._connection.close()
            logger.info("Redis connection closed.")
