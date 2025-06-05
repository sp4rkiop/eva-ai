from typing import Any, Dict, Optional
from fastapi import Depends, HTTPException, WebSocket
from datetime import datetime, timezone
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt import decode, PyJWTError
from core.config import settings

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
        raise HTTPException(status_code=401, detail="Invalid authorization header format")
    
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


async def verify_jwt_token(token: str) -> Dict[str, Any]:
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
        payload = decode(token, settings.JWT_SECRET_KEY, algorithms=["HS256"])
        
        # Check if token has required claims
        if not payload or "sid" not in payload:
            raise HTTPException(status_code=403, detail="Could not validate credentials")
        
        # Check token expiration
        if "exp" in payload and payload["exp"] < int(datetime.now(timezone.utc).timestamp()):
            raise HTTPException(status_code=403, detail="Token expired")
            
        return payload
    except PyJWTError:
        raise HTTPException(status_code=403, detail="Could not validate credentials")
