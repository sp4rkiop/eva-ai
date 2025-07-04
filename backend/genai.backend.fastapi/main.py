import uuid
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Query, Depends
from fastapi.middleware.cors import CORSMiddleware
from core.config import settings
from core.database import PostgreSQLDatabase
from core.redis_cache import RedisCache
from core.curl_cffi_session_manager import CurlCFFIAsyncSession
from contextlib import asynccontextmanager
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from repositories.websocket_manager import ws_manager
from dependencies.auth_dependencies import (
    auth_user_role,
    get_current_user,
    authenticate_websocket,
)
from services.management_service import ManagementService
from api.v1.endpoints import user, chat, document, analytics


@asynccontextmanager
async def lifespan(app: FastAPI):
    # --- startup ---
    await PostgreSQLDatabase.initialize()
    await RedisCache.initialize()
    await CurlCFFIAsyncSession.initialize()
    await ManagementService.get_all_models()
    scheduler = AsyncIOScheduler()
    scheduler.add_job(
        scheduled_data_fetch, "interval", seconds=86400
    )  # 86400 seconds = every 24 hours
    scheduler.start()
    yield
    # --- shutdown ---
    await PostgreSQLDatabase.close_all_connections()
    await RedisCache.close_connection()
    await CurlCFFIAsyncSession.close_session()
    scheduler.shutdown()


async def scheduled_data_fetch():
    await ManagementService.get_all_models()


app = FastAPI(
    title="Eva",
    lifespan=lifespan,
    openapi_url="",  # remove this line to enable API documentation
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ALLOWED_HOSTS.split(";"),
    allow_credentials=True,
    allow_methods=["*"],  # Allow all methods
    allow_headers=["*"],  # Allow all headers
    expose_headers=["X-Auth-Token"],
)


@app.websocket("/hub")
async def websocket_endpoint(websocket: WebSocket):
    try:
        payload = await authenticate_websocket(websocket)
        if payload:
            sid = uuid.UUID(payload["user_id"])
            await ws_manager.connect(websocket, sid)
            try:
                while True:
                    await websocket.receive_text()
            except WebSocketDisconnect:
                await ws_manager.disconnect(websocket)
        else:
            await websocket.close(code=1008)  # Auth failed
    except Exception as e:
        raise WebSocketDisconnect(code=1008)


# Include routers
app.include_router(user.router, prefix="/api/v1/user", tags=["user"])
app.include_router(
    chat.router,
    prefix="/api/v1/chat",
    tags=["chat"],
    dependencies=[Depends(get_current_user)],
)
app.include_router(
    document.router,
    prefix="/api/v1/document",
    tags=["document"],
    dependencies=[Depends(get_current_user)],
)
app.include_router(
    analytics.router,
    prefix="/api/v1/analytics",
    tags=["analytics"],
    dependencies=[Depends(auth_user_role)],
)
