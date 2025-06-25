import logging, uuid, pickle
from datetime import date, timedelta
from typing import Any, Dict, List, Optional
from fastapi import HTTPException, status
from sqlalchemy import func, or_, select, cast, Date
from core.database import PostgreSQLDatabase
from core.redis_cache import RedisCache
from models.request_model import AiModel
from services.user_service import UserService
from utils.cursor_utils import encode_cursor, decode_cursor
from models.ai_models_model import AiModels
from models.subscriptions_model import Subscriptions
from models.users_model import Users
from models.chat_history_model import ChatHistory

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

MAX_LIMIT = 100  # hard safety cap

class ManagementService:
    @staticmethod
    async def get_all_models() -> List[AiModels]:
        """
        Get all models.
            
        Returns:
            List of models or empty list
        """
        redis = RedisCache.get_connection()
        try:
            model_list = await redis.get("all_models")
            if model_list is not None:
                return pickle.loads(model_list)
            async with PostgreSQLDatabase.get_session() as session:
                # Query AI models
                stmt = select(AiModels)
                result = await session.execute(stmt)
                ai_models = result.scalars().all()
                
                model_list = list(ai_models)
                #save into cache
                await redis.set("all_models", pickle.dumps(model_list), 86400) # 86400 seconds = 1 day
                return list(model_list)
        except Exception as ex:
            # Log the exception
            logger.error(f"Failed to get models: {str(ex)}", exc_info=True)
            raise Exception(f"Failed to get models: {str(ex)}")
        
    async def get_users_details_paginated(
        self,
        page_size: int = 5,
        search_query: Optional[str] = None,
        cursor: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Key‑set paginated users + pure‑SQL aggregations:
         • chat_count & total_tokens from ChatHistory
         • models_sub list from Subscriptions → AiModels
        """
        page_size = min(max(page_size, 1), MAX_LIMIT)
        last_id, came_from_forward, q_from_cursor = decode_cursor(cursor)
        forward = came_from_forward if came_from_forward is not None else True

        async with PostgreSQLDatabase.get_session() as session:
            # --- 1) Page Users table only --------------------------------
            user_stmt = select(Users)
            
            search_query = q_from_cursor if q_from_cursor is not None else search_query
            
            if search_query is not None and search_query.strip() != "":
                user_stmt = user_stmt.where(
                    or_(
                        Users.first_name.ilike(f"%{search_query}%"),
                        Users.last_name.ilike(f"%{search_query}%"),
                        Users.email.ilike(f"%{search_query}%")
                    )
                )

            if forward:
                user_stmt = user_stmt.order_by(Users.user_id.asc())
                if last_id:
                    user_stmt = user_stmt.where(Users.user_id > last_id)
            else:
                user_stmt = user_stmt.order_by(Users.user_id.desc())
                if last_id:
                    user_stmt = user_stmt.where(Users.user_id < last_id)

            user_stmt = user_stmt.limit(page_size + 1)
            user_rows = await session.execute(user_stmt)
            users_page = user_rows.scalars().all()

            has_more = len(users_page) == page_size + 1
            page = users_page[:page_size]

            # build cursors
            if page:
                if forward:
                    next_cur = encode_cursor(page[-1].user_id, True, search_query) if has_more else None
                    prev_cur = encode_cursor(page[0].user_id, False, search_query) if last_id else None
                else:
                    next_cur = encode_cursor(page[0].user_id, True, search_query) if last_id else None
                    prev_cur = encode_cursor(page[-1].user_id, False, search_query) if has_more else None
            else:
                next_cur = prev_cur = None

            paged_ids = [u.user_id for u in page]

            # --- 2) Aggregate chat_history in pure SQL -------------------
            agg_stmt = (
                select(
                    ChatHistory.user_id,
                    func.count().label("chat_count"),
                    func.coalesce(func.sum(ChatHistory.token_count), 0).label("total_tokens"),
                    func.max(ChatHistory.last_updated).label("latest_activity")
                )
                .where(ChatHistory.user_id.in_(paged_ids))
                .group_by(ChatHistory.user_id)
            )
            agg_rows = await session.execute(agg_stmt)
            agg_map = {
                row.user_id: {
                    "chat_count": row.chat_count,
                    "total_tokens": row.total_tokens,
                    "latest_activity": (
                        row.latest_activity.isoformat() if row.latest_activity else None
                    ),
                }
                for row in agg_rows
            }

            # --- 3) Pull subscriptions & model details -------------------
            subq = (
                select(
                    Subscriptions.user_id.label("uid"),
                    AiModels.model_id,
                    AiModels.model_name,
                    AiModels.provider
                )
                .join(AiModels, Subscriptions.model_id == AiModels.model_id)
                .where(Subscriptions.user_id.in_(paged_ids))
            )
            sub_rows = await session.execute(subq)
            subs_map: Dict[uuid.UUID, List[Dict[str, Any]]] = {}
            for uid, model_id, name, provider in sub_rows:
                subs_map.setdefault(uid, []).append({
                    "model_id": model_id,
                    "model_name": name,
                    "provider": provider
                })

            # --- 4) Build final payload ---------------------------------
            users_payload: List[Dict[str, Any]] = []
            for u in page:
                stats = agg_map.get(u.user_id, {"chat_count": 0, "total_tokens": 0, "latest_activity": None})
                users_payload.append({
                    "user_id":      u.user_id,
                    "email":        u.email,
                    "first_name":   u.first_name,
                    "last_name":    u.last_name,
                    "role":         u.role,
                    "partner":      u.partner,
                    "chat_count":   stats["chat_count"],
                    "total_tokens": stats["total_tokens"],
                    "latest_activity": stats["latest_activity"],
                    "models_sub":   subs_map.get(u.user_id, []),
                })

            # reverse order for backward paging
            if not forward:
                users_payload.reverse()

            return {
                "page_size": page_size,
                "users": users_payload,
                "next_cursor": next_cur,
                "prev_cursor": prev_cur,
            }
        
    async def get_models_paginated(
        self,
        page_size: int = 5,
        search_query: Optional[str] = None,
        cursor: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Cursor-paginated list of AI models.

        Returns:
            {
            "models": [...],
            "next_cursor": "...",
            "prev_cursor": "..."
            }
        """
        page_size = min(max(page_size, 1), MAX_LIMIT)
        last_id, came_from_forward, q_from_cursor = decode_cursor(cursor)
        forward = came_from_forward if came_from_forward is not None else True

        async with PostgreSQLDatabase.get_session() as session:
            stmt = select(AiModels)

            search_query = q_from_cursor if q_from_cursor is not None else search_query

            if search_query is not None and search_query.strip() != "":
                stmt = stmt.where(
                    or_(
                        AiModels.deployment_name.ilike(f"%{search_query}%"),
                        AiModels.model_name.ilike(f"%{search_query}%"),
                        AiModels.provider.ilike(f"%{search_query}%"),
                        AiModels.model_type.ilike(f"%{search_query}%")
                    )
                )


            if forward:
                stmt = stmt.order_by(AiModels.model_id.asc())
                if last_id:
                    stmt = stmt.where(AiModels.model_id > last_id)
            else:
                stmt = stmt.order_by(AiModels.model_id.desc())
                if last_id:
                    stmt = stmt.where(AiModels.model_id < last_id)

            stmt = stmt.limit(page_size + 1)
            rows = (await session.execute(stmt)).scalars().all()

            slice_ = rows[:page_size]
            has_more = len(rows) == page_size + 1

            if forward:
                next_cur = encode_cursor(slice_[-1].model_id, True, search_query) if has_more else None
                prev_cur = encode_cursor(slice_[0].model_id, False, search_query) if last_id else None
            else:
                next_cur = encode_cursor(slice_[0].model_id, True, search_query) if last_id else None
                prev_cur = encode_cursor(slice_[-1].model_id, False, search_query) if has_more else None

            models = slice_ if forward else list(reversed(slice_))

            return {
                "page_size": page_size,
                "models": [
                    {
                        "model_id": m.model_id,
                        "model_name": m.model_name,
                        "provider": m.provider,
                        "is_active": m.is_active,
                        "model_type": m.model_type,
                        "deployment_name": m.deployment_name,
                        "api_key": m.api_key,
                        "endpoint": m.endpoint,
                        "model_version": m.model_version,
                    }
                    for m in models
                ],
                "next_cursor": next_cur,
                "prev_cursor": prev_cur,
            }

    

    async def get_usage_data(
        self,
        last_days: int = 7,
    ) -> List[Dict[str, Any]]:
        """
        token usage up to a specific day, grouped by date.

        Returns:
            [{ "date": "2024-04-01", "tokens_used": 1234 }, ...]
        """        
        async with PostgreSQLDatabase.get_session() as session:
            last_date = date.today() - timedelta(days=last_days)
            stmt = (
                select(
                    cast(ChatHistory.last_updated, Date).label("usage_date"),
                    func.sum(ChatHistory.token_count).label("tokens_used")
                )
                .where(ChatHistory.last_updated >= last_date)
                .group_by(cast(ChatHistory.last_updated, Date))
                .order_by("usage_date")
            )

            rows = await session.execute(stmt)
            return [
                {"date": r.usage_date.isoformat(), "tokens_used": r.tokens_used}
                for r in rows
            ]

    async def get_analytics_home_data(self):
        async with PostgreSQLDatabase.get_session() as session:

            # Total users
            stmt = select(func.count(Users.user_id))
            total_users = (await session.execute(stmt)).scalar()

            # Usage chart data
            usage_data = await self.get_usage_data(last_days=90)

            # Active models
            stmt = select(func.count(AiModels.model_id)).where(AiModels.is_active == True)
            active_models = (await session.execute(stmt)).scalar()

            # Recent 3 user by their last chat time
            stmt = (
                select(Users.user_id, Users.first_name, Users.last_name, Users.email, func.max(ChatHistory.last_updated).label("last_active"))
                .join(ChatHistory, Users.user_id == ChatHistory.user_id)
                .group_by(Users.user_id, Users.first_name, Users.last_name, Users.email)
                .order_by(func.max(ChatHistory.last_updated).desc())
                .limit(5)
            )
            rows = await session.execute(stmt)
            recent_users = [
                {
                    "user_id": r.user_id,
                    "first_name": r.first_name,
                    "last_name": r.last_name,
                    "email": r.email,
                    "last_active": r.last_active,
                }
                for r in rows
            ]

            return {
                "total_users": total_users,
                "usage_chat": usage_data,
                "active_models": active_models,
                "recent_users": recent_users
            }
    
    #Altering functions
    async def modify_user(self, user_id: uuid.UUID, query_params: Dict[str, Any]):
        async with PostgreSQLDatabase.get_session() as session:
            user = await session.get(Users, user_id)
            if user is None:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
            if query_params.get('role'):
                user.role = query_params['role'].lower() if query_params['role'].lower() in ['user', 'premium','admin'] else user.role
                user_service = UserService()
                await user_service.delete_all_user_sessions(user_id) # Delete all sessions for the user to force them to re-authenticate
            
            if query_params.get('model_id') is not None :
                model_id = uuid.UUID(query_params['model_id']) if isinstance(query_params['model_id'], str) else query_params['model_id'] 
                model = await session.get(AiModels, model_id)
                if model is None:
                    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Model not found")
                
                new_sub = Subscriptions(
                    user_id=user_id,
                    model_id=model_id
                )
                session.add(new_sub)
            await session.commit()
    
    async def delete_user(self, user_id: uuid.UUID):
        async with PostgreSQLDatabase.get_session() as session:
            user = await session.get(Users, user_id)
            if user is None:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
            await session.delete(user)
            await session.commit()
            user_service = UserService()
            await user_service.delete_all_user_sessions(user_id) # Delete all sessions for the user

    async def modify_model(self, model_id: uuid.UUID, query_params: Dict[str, Any]):
        async with PostgreSQLDatabase.get_session() as session:
            model = await session.get(AiModels, model_id)
            if model is None:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Model not found")
            if query_params.get('is_active') is not None and isinstance(query_params['is_active'], bool):
                model.is_active = query_params['is_active']
            else:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid is_active value")
            if query_params.get('model_name'):
                model.model_name = query_params['model_name']
            if query_params.get('model_type'):
                model.model_type = query_params['model_type']
            if query_params.get('provider'):
                model.provider = query_params['provider']
            if query_params.get('api_key'):
                model.api_key = query_params['api_key']
            if query_params.get('endpoint'):
                model.endpoint = query_params['endpoint']
            if query_params.get('deployment_name'):
                model.deployment_name = query_params['deployment_name']
            if query_params.get('model_version'):
                model.model_version = query_params['model_version']
            await session.commit()
            await self.get_all_models()

    async def add_model(self, model_data: AiModel) -> uuid.UUID:
        async with PostgreSQLDatabase.get_session() as session:
            new_model = AiModels(
                model_name=model_data.model_name,
                model_type=model_data.model_type,
                provider=model_data.provider,
                api_key=model_data.api_key,
                endpoint=model_data.endpoint,
                deployment_name=model_data.deployment_name,
                model_version=model_data.model_version,
                is_active=model_data.is_active
            )
            session.add(new_model)
            await session.commit()
            await self.get_all_models()
            return new_model.model_id

    async def delete_model(self, model_id: uuid.UUID):
        async with PostgreSQLDatabase.get_session() as session:
            model = await session.get(AiModels, model_id)
            if model is None:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Model not found")
            await session.delete(model)
            await session.commit()
            await self.get_all_models()