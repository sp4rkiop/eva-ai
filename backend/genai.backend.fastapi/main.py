from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Query, Depends
from fastapi.middleware.cors import CORSMiddleware
from core.config import settings
from core.database import CassandraDatabase
from core.session_manager import CurlCFFISession
from contextlib import asynccontextmanager
from repositories.websocket_manager import ws_manager
from dependencies.auth_dependencies import get_current_user, authenticate_websocket
from api.v1.endpoints import user, chat

@asynccontextmanager
async def lifespan(app: FastAPI):
    # --- startup ---
    CassandraDatabase.initialize()
    CurlCFFISession.initialize()
    yield
    # --- shutdown ---
    CassandraDatabase.close_all_connections()
    CurlCFFISession.close_session()

app = FastAPI(
    title="Eva", 
    lifespan=lifespan,
    # openapi_url="", # remove this line to enable API documentation
    )

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ALLOWED_HOSTS.split(';'),
    allow_credentials=True,
    allow_methods=["*"],  # Allow all methods
    allow_headers=["*"],  # Allow all headers
)

@app.websocket("/hub")
async def websocket_endpoint(websocket: WebSocket):
    try:
        payload = await authenticate_websocket(websocket)
        if payload:
            sid = payload["sid"]
            await ws_manager.connect(websocket, sid)
            try:
                while True:
                    await websocket.receive_text()
            except WebSocketDisconnect:
                await ws_manager.disconnect(websocket)
        else:
            await websocket.close(code=1008) # Auth failed
    except Exception as e:
        raise WebSocketDisconnect(code=1008)

# Include routers
app.include_router(user.router, prefix="/api/v1/user", tags=["user"])
app.include_router(chat.router, prefix="/api/v1/chat", tags=["chat"], dependencies=[Depends(get_current_user)])