from fastapi import HTTPException
import uuid, jwt, logging, pickle, asyncio
from pydantic import EmailStr
from core.database import CassandraDatabase
from core.config import settings
from typing import Dict, List, Any, Optional
from datetime import datetime, timedelta, timezone
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
        logger.info(f"Getting or creating user for email: {email_id}, first name: {first_name}, last name: {last_name}, partner: {partner}")
        def _sync_db_work():
            with CassandraDatabase().get_session() as session:
                # Attempt to fetch the user
                user_select_statement = "SELECT userid, role FROM users WHERE email = %s AND partner = %s LIMIT 1"
                user_row = session.execute(user_select_statement, (email_id, partner)).one()

                if user_row is None:
                    logger.info(f"User not found for email: {email_id}, first name: {first_name}, last name: {last_name}, partner: {partner}. Creating a new user.")
                    # User doesn't exist, create a new one
                    user_id = uuid.uuid4()
                    default_role = "user"
                    user_insert_statement = "INSERT INTO users (userid, role, firstname, lastname, email, partner) VALUES (%s, %s, %s, %s, %s, %s) IF NOT EXISTS"
                    applied_info = session.execute(user_insert_statement, 
                                                        (user_id, default_role, first_name, last_name, email_id, partner)).one()

                    if applied_info and applied_info.applied:
                        # Create a default entry for UserSubscriptions
                        default_model_id = uuid.UUID(settings.DEFAULT_MODEL_ID)
                        subscription_insert_statement = "INSERT INTO usersubscriptions (userid, modelid) VALUES (%s, %s) IF NOT EXISTS"
                        session.execute(subscription_insert_statement, (user_id, default_model_id))
                        logger.info(f"New user created for email: {email_id}, first name: {first_name}, last name: {last_name}, partner: {partner}")
                        return {"user_id": user_id, "token": self._generate_jwt_token(user_id, default_role)}
                    else:
                        logger.info(f"User already exists for email: {email_id}, first name: {first_name}, last name: {last_name}, partner: {partner}")
                        # If the insert was not applied, it means the user was created by another request
                        user_row = session.execute(user_select_statement, (email_id, partner)).one()

                if user_row:
                    logger.info(f"User found for email: {email_id}, first name: {first_name}, last name: {last_name}, partner: {partner}")
                    return {"user_id": user_row.userid, "token": self._generate_jwt_token(user_row.userid, user_row.role)}
                else:
                    raise RuntimeError("Failed to create or retrieve user.")
        try:
            user_data = await asyncio.to_thread(_sync_db_work)
            return {
                "user_id": user_data["user_id"],
                "token": user_data["token"]
            }
        except Exception as e:
            logger.exception(f"Failed to get or create user: {str(e)}")
            raise Exception(str(e))


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
        def _sync_db_work():
            with CassandraDatabase().get_session() as session:
                # Prepare and execute the CQL query to fetch chat history
                chat_select_statement = "SELECT chatid, chattitle, createdon FROM chathistory_by_visible WHERE visible = true AND userid = %s"
                result_set = session.execute(chat_select_statement, (user_id,))
                return [
                    {
                        "id": row.chatid,
                        "title": row.chattitle,
                        "last_activity": row.createdon
                    }
                    for row in result_set
                ]
        try:
            chat_titles = await asyncio.to_thread(_sync_db_work)
            return chat_titles
        except Exception as ex:
            # Log the exception
            logger.error(f"Failed to get conversations: {str(ex)}")
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
        def _sync_db_fetch():
            with CassandraDatabase().get_session() as session:
                # Prepare and execute the CQL query to fetch chat history
                query = "SELECT chathistoryjson, nettokenconsumption FROM chathistory_by_visible WHERE visible = true AND userid = %s AND chatid = %s LIMIT 1"
                row = session.execute(query, (user_id, chat_id)).one()
                if not row:
                    return None
                return {
                    "conversation": pickle.loads(row.chathistoryjson),
                    "token_consumed": row.nettokenconsumption
                }
        try:
            result = await asyncio.to_thread(_sync_db_fetch)
            if not result:
                raise HTTPException(status_code=404, detail="Conversation not found")
            return result
        except HTTPException:
            raise
        except Exception as ex:
            # Log the exception
            logger.error(f"Failed to get conversation: {str(ex)}")
            raise Exception(f"Failed to get conversation: {str(ex)}")

    async def get_subscribed_models(self, user_id: uuid.UUID) -> List[Dict[str, Any]]:
        """
        Get all models the user is subscribed to.
        
        Args:
            user_id: User's UUID
            
        Returns:
            List of subscribed models or empty list
        """
        def _sync_db_fetch():
            with CassandraDatabase().get_session() as session:
                # First query to get model IDs from usersubscriptions
                model_select_statement = "SELECT modelid FROM usersubscriptions WHERE userid = %s"
                result_set = session.execute(model_select_statement, (user_id,))

                model_ids = [row.modelid for row in result_set]
                if not model_ids:
                    return []
                
                # Create query with placeholders for the IN clause
                placeholders = ','.join(['%s'] * len(model_ids))
                deployment_name_select_statement = f"SELECT deploymentid, modelname FROM availablemodels WHERE deploymentid IN ({placeholders}) AND isactive = true"

                # Execute the query with model_ids as parameters
                deployment_name_result_set = session.execute(deployment_name_select_statement, model_ids)

                # Process the result and return the list of models
                return [
                    {
                        "id": row.deploymentid,
                        "name": row.modelname
                    }
                    for row in deployment_name_result_set
                ]
        try:
            return await asyncio.to_thread(_sync_db_fetch)
        except Exception as ex:
            # Log the exception
            logger.error(f"Failed to get subscribed models: {str(ex)}")
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
                logger.info(f"Model {model_id} is subscribed for user {user_id}")
                return model_sub
            def _sync_check():
                with CassandraDatabase().get_session() as session:
                    model_select_statement = "SELECT modelid FROM usersubscriptions WHERE userid = %s AND modelid = %s LIMIT 1"
                    result = session.execute(model_select_statement, (user_id, model_id)).one()
                    return result is not None
            
            is_subscribed = await asyncio.to_thread(_sync_check)
            if is_subscribed:
                CacheRepository.set(cache_key, is_subscribed, 14400)  # Cache for 4 hours
                logger.info(f"Model {model_id} is subscribed for user {user_id}")
            return is_subscribed
        except Exception as e:
            logger.error(f"Failed to check if model is subscribed for user {user_id} and model {model_id} with error: {str(e)}")
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
            def _sync_rename():
                with CassandraDatabase().get_session() as session:
                    chat_update_statement = "UPDATE chathistory SET chattitle = %s WHERE userid = %s AND chatid = %s IF EXISTS"
                    saved = session.execute(chat_update_statement, (new_title, user_id, chat_id))
                    return saved and saved[0].applied
            
            success = await asyncio.to_thread(_sync_rename)
            if success:
                logger.info(f"Renamed conversation {chat_id} for user {user_id}")
            else:
                logger.warning(f"Rename failed for conversation {chat_id} for user {user_id}")
            return success
        
        except Exception as ex:
            logger.error(f"Failed to rename conversation: {str(ex)}")
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
            def _sync_delete():
                with CassandraDatabase().get_session() as session:
                    chat_delete_statement = "UPDATE chathistory SET visible = false WHERE userid = %s AND chatid = %s IF visible = true"
                    saved = session.execute(chat_delete_statement, (user_id, chat_id))
                    return saved and saved[0].applied
                
            success = await asyncio.to_thread(_sync_delete)
            if success:
                logger.info(f"Soft-deleted chat {chat_id} for user {user_id}")
            else:
                logger.warning(f"Soft-delete failed for chat {chat_id} for user {user_id}")
            return success
        
        except Exception as ex:
            logger.error(f"Failed to delete conversation: {str(ex)}")
            raise Exception(f"Failed to delete conversation: {str(ex)}")