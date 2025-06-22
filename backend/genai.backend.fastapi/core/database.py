# core/database.py
import logging
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.ext.asyncio import async_sessionmaker
from contextlib import asynccontextmanager
from core.config import settings
from models.base import Base
from typing import AsyncGenerator, Any
from urllib.parse import quote_plus


# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Async database engine and session factory
DATABASE_URL = f"postgresql+asyncpg://{quote_plus(settings.POSTGRES_USER)}:{quote_plus(settings.POSTGRES_PASSWORD)}@{settings.POSTGRES_HOST}:{settings.POSTGRES_PORT}/{quote_plus(settings.POSTGRES_DB)}"
engine = create_async_engine(
    DATABASE_URL,
    pool_pre_ping=True
)
AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    autocommit=False,
    autoflush=False,
    expire_on_commit=False,
    class_=AsyncSession
)

class PostgreSQLDatabase:
    @classmethod
    async def initialize(cls) -> None:
        """
        Initialize the database by creating tables if they don't exist.
        Uses async connection and reflects table creation status.
        """
        try:
            async with engine.begin() as conn:
                # Enable pgcrypto for UUID generation
                await conn.execute(text("CREATE EXTENSION IF NOT EXISTS \"pgcrypto\";"))
                # Enable vector extension
                await conn.execute(text('CREATE EXTENSION IF NOT EXISTS "vector";'))
                # Create all tables defined in the ORM models
                await conn.run_sync(Base.metadata.create_all)
            logger.info("Database connection initialized successfully.")
        except Exception as e:
            logger.error(f"Failed to initialize database: {e}")
            raise

    @classmethod
    @asynccontextmanager
    async def get_session(cls) -> AsyncGenerator[AsyncSession, Any]:
        """
        Async context manager for database sessions.
        Ensures proper transaction handling and resource cleanup.
        """
        async with AsyncSessionLocal() as session:
            try:
                yield session
                await session.commit()
            except Exception:
                await session.rollback()
                logger.error("Transaction rolled back due to an error")
                raise

    @classmethod
    async def close_all_connections(cls) -> None:
        """
        Close all database connections and dispose connection pool.
        """
        await engine.dispose()
        logger.info("Database connection closed and connection pool disposed.")