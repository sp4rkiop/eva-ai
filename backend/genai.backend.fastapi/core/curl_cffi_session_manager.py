from contextlib import asynccontextmanager
from typing import Any, AsyncGenerator, Optional, Dict
from curl_cffi.requests import AsyncSession

class CurlCFFIAsyncSession:
    _session: Optional[AsyncSession] = None

    @classmethod
    async def initialize(cls, headers: Optional[Dict[str, str]] = None):
        """
        Create a new AsyncSession with optional headers.
        """
        cls._session = AsyncSession(headers=headers)

    @classmethod
    @asynccontextmanager
    async def get_session(cls) -> AsyncGenerator[AsyncSession, Any]:
        """
        Return the shared AsyncSession. Initialize if needed.
        """
        if cls._session is None:
            await cls.initialize()
        if cls._session is not None:
            try:
                yield cls._session
            finally:
                # Optionally, you can decide whether to close the session here
                pass

    @classmethod
    async def close_session(cls):
        """
        Cleanly close the AsyncSession.
        """
        if cls._session:
            await cls._session.close()
            cls._session = None
