from typing import Any, Dict, Optional
from fastapi import Depends, HTTPException, WebSocket
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import jwt
from jose.exceptions import JWTError
from core.config import settings
from core.redis_cache import RedisCache

security = HTTPBearer()

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """
    Retrieve the current user from the JWT token provided in the Authorization header.

    Args:
        credentials: HTTPAuthorizationCredentials object containing the JWT token.

    Returns:
        A dictionary containing the decoded JWT payload if the token is valid.

    Raises:
        HTTPException: If the token is invalid or the authorization header format is incorrect.
    """
    token = credentials.credentials

    # Split the header to extract the token part
    try:
        return await verify_jwt_token(token)
    except ValueError:
        raise HTTPException(status_code=401, detail="Invalid authorization format")
    
async def auth_user_role(credentials: HTTPAuthorizationCredentials = Depends(security)):
    token = credentials.credentials

    # Split the header to extract the token part
    try:
        return await verify_jwt_token(token, check_role=True)
    except ValueError:
        raise HTTPException(status_code=401, detail="Invalid authorization format")
    
async def authenticate_websocket(websocket: WebSocket) -> Optional[Dict[str, Any]]:
    """
    Verify the JWT token from WebSocket query parameters or headers
    
    Args:
        websocket: WebSocket connection
        
    Returns:
        User SID if authentication succeeds, None otherwise
    """
    token = None
    
    # Try to get token from query params
    if "token" in websocket.query_params:
        token = websocket.query_params["token"]
    
    # Try to get token from headers
    if not token and "authorization" in websocket.headers:
        auth_header = websocket.headers["authorization"]
        try:
            scheme, token = auth_header.split()
            if scheme.lower() != 'bearer':
                return None
        except ValueError:
            return None
    
    # If no token found, return None
    if not token:
        return None
        
    try:
        # Verify token
        return await verify_jwt_token(token)
    except HTTPException:
        return None


async def verify_jwt_token(token: str, check_role: Optional[bool] = False) -> Dict[str, Any]:
    """
    Verify JWT token and return payload
    
    Args:
        token: JWT token string
        
    Returns:
        Decoded JWT payload
        
    Raises:
        HTTPException: If token is invalid or expired
    """
    try:
        # Decode the JWT token
        payload = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=["HS256"])
        
        # Check if token has required claims
        if not payload or "jti" not in payload:
            raise HTTPException(status_code=401, detail="Could not validate credentials")
        
        redis = RedisCache.get_connection()
        # Check if token is valid / revoked
        if not await redis.exists(payload["jti"]):
            raise HTTPException(status_code=401, detail="Credentials have been revoked")
        
        # Check if role is required and user has correct role
        if check_role:
            if "role" not in payload or payload["role"] != "admin":
                raise HTTPException(status_code=403, detail="Not authorized")

        return payload
    except JWTError:
        raise HTTPException(status_code=401, detail="Could not validate credentials")
