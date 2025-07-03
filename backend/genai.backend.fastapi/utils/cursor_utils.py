from datetime import datetime, UTC, timedelta
from uuid import UUID
from typing import Optional, Tuple
from core.config import settings
from jose import jwt
from jose.exceptions import JWTError

ALGORITHM = "HS256"


def encode_cursor(
    last_id: UUID | str, forward: bool, query: Optional[str] = None
) -> str:
    """
    last_id   : The PK value of the edge row
    forward   : True if cursor was produced while paging forward,
                False if produced while paging backward
    """
    payload = {
        "lid": str(last_id),
        "fwd": int(forward),  # 1 / 0 (JWT only accepts JSON types)
        "q": query,
        "iat": datetime.now(UTC).timestamp(),
        "exp": (datetime.now(UTC) + timedelta(days=1)).timestamp(),
    }
    return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=ALGORITHM)


def decode_cursor(
    token: Optional[str],
) -> Tuple[Optional[UUID], Optional[bool], Optional[str]]:
    """
    Returns (last_id, forward) or (None, None) if token missing/bad.
    """
    if not token:
        return None, None, None
    try:
        data = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[ALGORITHM])
        return UUID(data["lid"]), bool(data["fwd"]), data["q"]
    except (JWTError, ValueError):
        return None, None, None
