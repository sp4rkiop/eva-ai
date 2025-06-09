from fastapi import HTTPException
import uuid, jwt, json, logging, pickle, asyncio
from pydantic import EmailStr
from sqlalchemy import update
from core.database import PostgreSQLDatabase
from core.config import settings
from typing import Dict, List, Any, Optional
from datetime import datetime, timedelta, timezone
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload
from sqlalchemy.exc import IntegrityError
from models.users_model import Users
from models.chat_history_model import ChatHistory
from models.ai_models_model import AiModels
from models.subscriptions_model import Subscriptions
from repositories.cache_repository import CacheRepository

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class UserService:


    async def get_create_user(self, email_id: EmailStr, first_name: Optional[str], 
                             last_name: Optional[str], partner: str) -> Dict[str, Any]:
        """
        Get or create a user based on email ID and partner.
        
        Args:
            email_id: User's email address
            first_name: User's first name (optional)
            last_name: User's last name (optional)
            partner: Partner identifier
            
        Returns:
            Dictionary containing user ID and JWT token
        """
        logger.info(f"Getting or creating user for email: {email_id}, partner: {partner}")
        async with PostgreSQLDatabase.get_session() as session:
            try:
                # Try to get existing user
                stmt = select(Users).where(
                    Users.email == email_id,
                    Users.partner == partner
                )
                result = await session.execute(stmt)
                user = result.scalar_one_or_none()
                
                if user:
                    token = self._generate_jwt_token(user.user_id, user.role)
                    return {
                        "user_id": user.user_id,
                        "token": token
                    }
                
                # Create new user if not exists
                new_user = Users(
                    email=email_id,
                    partner=partner,
                    first_name=first_name,
                    last_name=last_name
                )
                session.add(new_user)
                await session.flush()  # Flush to get generated userid
                
                # Add default subscription
                default_model_id = uuid.UUID(settings.DEFAULT_MODEL_ID)
                new_sub = Subscriptions(
                    user_id=new_user.user_id,
                    model_id=default_model_id
                )
                session.add(new_sub)

                token = self._generate_jwt_token(new_user.user_id, new_user.role)
                # Build response before commit to include all data
                response = {
                    "user_id": new_user.user_id,
                    "token": token
                }
                await session.commit()
                
                logger.info(f"New user created for email: {email_id}, partner: {partner}")
                return response
                
            except IntegrityError as ex:
                # Handle race condition where user was created by another request
                await session.rollback()
                
                # Retry fetching the user
                result = await session.execute(select(Users).where(
                    Users.email == email_id,
                    Users.partner == partner
                ))
                user = result.scalar_one_or_none()
                
                if user:
                    token = self._generate_jwt_token(user.user_id, user.role)
                    return {
                        "user_id": user.user_id,
                        "token": token
                    }
                
                # If still not found, re-raise the original exception
                logger.error(f"Failed to create user due to database constraints: {ex}", exc_info=True)
                raise ValueError("Failed to create user due to database constraints") from ex
                
            except Exception as e:
                await session.rollback()
                logger.exception(f"User operation failed: {e}", exc_info=True)
                raise RuntimeError("User operation failed") from e


    @staticmethod
    def _generate_jwt_token( user_id: uuid.UUID, role: str) -> str:
        """
        Generate a JWT token for the user.
        
        Args:
            user_id: User's UUID
            role: User's role
            
        Returns:
            JWT token string
        """
        key = settings.JWT_SECRET_KEY
        payload = {
            'sid': str(user_id),
            'role': role,
            'exp': datetime.now(timezone.utc) + timedelta(days=1)
        }
        return jwt.encode(payload, key, algorithm='HS256')

    async def get_conversations(self, user_id: uuid.UUID) -> List[Dict[str, Any]]:
        """
        Get all visible conversations for a user.
        
        Args:
            user_id: User's UUID
            
        Returns:
            List of conversations or empty list
        """
        try:
            async with PostgreSQLDatabase.get_session() as session:
                # Query chat history
                stmt = (
                    select(ChatHistory)
                    .where(ChatHistory.user_id == user_id)
                    .where(ChatHistory.visible == True)
                )
                result = await session.execute(stmt)
                conversations = result.scalars().all()
                return list(
                    map(
                        lambda conversation: {
                            "id": conversation.chat_id,
                            "title": conversation.chat_title,
                            "last_activity": conversation.last_updated
                        },
                        conversations
                    )
                )
        except Exception as ex:
            # Log the exception
            logger.exception(f"Failed to get conversations: {str(ex)}", exc_info=True)
            raise Exception(f"Failed to get conversations: {str(ex)}")
        
    async def get_single_conversation(self, user_id: uuid.UUID, chat_id: uuid.UUID) -> Dict[str, Any]:
        """
        Get a single conversation for a user.
        
        Args:
            user_id: User's UUID
            chat_id: Chat UUID
            
        Returns:
            Conversation or blank if not found
        """
        try:
            async with PostgreSQLDatabase.get_session() as session:
                # Query chat history
                stmt = (
                    select(ChatHistory)
                    .where(
                        (ChatHistory.user_id == user_id) &
                        (ChatHistory.chat_id == chat_id) &
                        (ChatHistory.visible == True)
                    )
                )
                result = await session.execute(stmt)
                chat = result.scalar_one_or_none()
                if not chat:
                    raise HTTPException(status_code=404, detail="Conversation not found")
                return {
                    "conversation": pickle.loads(chat.history_blob) if chat.history_blob else [],
                    "token_consumed": chat.token_count
                }
        except HTTPException:
            raise
        except Exception as ex:
            # Log the exception
            logger.exception(f"Failed to get conversation: {str(ex)}", exc_info=True)
            raise Exception(f"Failed to get conversation: {str(ex)}") from ex

    async def get_subscribed_models(self, user_id: uuid.UUID) -> List[Dict[str, Any]]:
        """
        Get all models the user is subscribed to.
        
        Args:
            user_id: User's UUID
            
        Returns:
            List of subscribed models or empty list
        """
        try:
            async with PostgreSQLDatabase.get_session() as session:
                # Query subscriptions with joined model details
                stmt = (
                    select(Subscriptions)
                    .options(selectinload(Subscriptions.ai_models))
                    .where(Subscriptions.user_id == user_id)
                )
                result = await session.execute(stmt)
                subscriptions = result.scalars().all()

                # Extract model details from relationships
                return [
                    {
                        "id": sub.ai_models.model_id,
                        "name": sub.ai_models.deployment_name
                    }
                    for sub in subscriptions
                ]
        except Exception as ex:
            # Log the exception
            logger.exception(f"Failed to get subscribed models: {str(ex)}", exc_info=True)
            raise Exception(f"Failed to get subscribed models: {str(ex)}")
    
    async def is_model_subscribed(self, user_id: uuid.UUID, model_id: uuid.UUID) -> bool:
        """
        Check if a model is subscribed by a user.
        
        Args:
            user_id: User's UUID
            model_id: Model's UUID
            
        Returns:
            True if the model is subscribed, False otherwise
        """
        cache_key = f"model_sub_{user_id}_{model_id}"
        try:
            model_sub = CacheRepository.get(cache_key)
            if model_sub is not None:
                return model_sub
            async with PostgreSQLDatabase.get_session() as session:
                # Query subscriptions with joined model details
                stmt = (
                    select(Subscriptions)
                    .join(Subscriptions.ai_models)
                    .where(AiModels.model_id == model_id,
                           Subscriptions.user_id == user_id,
                           AiModels.is_active == True)
                )
                result = await session.execute(stmt)
                subscriptions = result.scalars().all()

                # Extract model details from relationships
                is_subscribed = len(subscriptions) > 0
            if is_subscribed:
                CacheRepository.set(cache_key, is_subscribed, 14400)  # Cache for 4 hours
            return is_subscribed
        except Exception as e:
            logger.exception(f"Failed to check if model is subscribed for user {user_id} and model {model_id} with error: {str(e)}", exc_info=True)
            raise Exception(f"Failed to check if model is subscribed for user {user_id} and model {model_id} with error: {str(e)}")

    async def rename_conversation(self, user_id: uuid.UUID, chat_id: uuid.UUID, new_title: str) -> bool:
        """
        Rename a conversation title.
        
        Args:
            user_id: User's UUID
            chat_id: Chat UUID to rename
            new_title: New title for the chat
            
        Returns:
            True if successful, False otherwise
        """
        try:
            async with PostgreSQLDatabase.get_session() as session:
                update_stmt = (
                    update(ChatHistory)
                    .where(
                        ChatHistory.chat_id == chat_id,
                        ChatHistory.user_id == user_id
                    )
                    .values(chat_title=new_title)
                )
                result = await session.execute(update_stmt)

                # Return True if exactly 1 row was affected
                return result.rowcount == 1
        
        except Exception as ex:
            logger.exception(f"Failed to rename conversation: {str(ex)}", exc_info=True)
            raise Exception(f"Failed to rename conversation: {str(ex)}")

    async def delete_conversation(self, user_id: uuid.UUID, chat_id: uuid.UUID) -> bool:
        """
        Mark a conversation as not visible (soft delete).
        
        Args:
            user_id: User's UUID
            chat_id: Chat UUID to delete
            
        Returns:
            True if successful, False otherwise
        """
        try:
            async with PostgreSQLDatabase.get_session() as session:
                update_stmt = (
                    update(ChatHistory)
                    .where(
                        ChatHistory.chat_id == chat_id,
                        ChatHistory.user_id == user_id
                    )
                    .values(visible=False)
                )
                result = await session.execute(update_stmt)

                # Return True if exactly 1 row was affected
                return result.rowcount == 1
        
        except Exception as ex:
            logger.exception(f"Failed to delete conversation: {str(ex)}", exc_info=True)
            raise Exception(f"Failed to delete conversation: {str(ex)}")