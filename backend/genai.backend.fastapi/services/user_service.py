import uuid, jwt, logging, pickle
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
        try:
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
                        return {"userId": user_id, "token": self._generate_jwt_token(user_id, default_role)}
                    else:
                        logger.info(f"User already exists for email: {email_id}, first name: {first_name}, last name: {last_name}, partner: {partner}")
                        # If the insert was not applied, it means the user was created by another request
                        user = session.execute(user_select_statement, (email_id, partner))
                        user_row = user.one()
                        return {"userId": user_row.userid, "token": self._generate_jwt_token(user_row.userid, user_row.role)}
                else:
                    logger.info(f"User found for email: {email_id}, first name: {first_name}, last name: {last_name}, partner: {partner}")
                    return {"userId": user_row.userid, "token": self._generate_jwt_token(user_row.userid, user_row.role)}
        except Exception as e:
            logger.error(f"Failed to get or create user: {str(e)}")
            return {}

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
            with CassandraDatabase().get_session() as session:
                # Prepare and execute the CQL query to fetch chat history
                chat_select_statement = "SELECT chatid, chattitle, createdon FROM chathistory_by_visible WHERE visible = true AND userid = %s"
                result_set = session.execute(chat_select_statement, (user_id,))
                # Convert the result set to a list of chat titles
                chat_titles = []
                for row in result_set:
                    chat_titles.append({
                        "id": row.chatid,
                        "title": row.chattitle,
                        "lastActivity": row.createdon
                    })

                # Serialize and return the chat titles if any are found
                if chat_titles:
                    return chat_titles
                raise Exception("Unable to find conversations")
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
        try:
            with CassandraDatabase().get_session() as session:
                # Prepare and execute the CQL query to fetch chat history
                chat_select_statement = "SELECT chathistoryjson, nettokenconsumption FROM chathistory_by_visible WHERE visible = true AND userid = %s AND chatid = %s LIMIT 1"
                conversation = session.execute(chat_select_statement, (user_id, chat_id)).one()
                
                # Serialize and return the chat titles if any are found
                if conversation:
                    return {"conversation": pickle.loads(conversation.chathistoryjson), "token_consumed": conversation.nettokenconsumption}
                raise Exception("Unable to find conversation")
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
        try:
            with CassandraDatabase().get_session() as session:
                # First query to get model IDs from usersubscriptions
                model_select_statement = "SELECT modelid FROM usersubscriptions WHERE userid = %s"
                result_set = session.execute(model_select_statement, (user_id,))

                model_ids = [row.modelid for row in result_set]

                if model_ids:
                    # Create query with placeholders for the IN clause
                    placeholders = ','.join(['%s'] * len(model_ids))
                    deployment_name_select_statement = f"SELECT deploymentid, deploymentname FROM availablemodels WHERE deploymentid IN ({placeholders}) AND isactive = true"

                    # Execute the query with model_ids as parameters
                    deployment_name_result_set = session.execute(deployment_name_select_statement, model_ids)

                    # Process the result and return the list of models
                    models = []
                    for row in deployment_name_result_set:
                        models.append({
                            "id": row.deploymentid,
                            "name": row.deploymentname.upper()
                        })

                    return models

                return []
        except Exception as ex:
            # Log the exception
            logger.error(f"Failed to get subscribed models: {str(ex)}")
            return []
    
    async def is_model_subscribed(self, userId: uuid.UUID, modelId: uuid.UUID) -> bool:
        """
        Check if a model is subscribed by a user.
        
        Args:
            user_id: User's UUID
            model_id: Model's UUID
            
        Returns:
            True if the model is subscribed, False otherwise
        """
        cache_key = 'model_sub_' + str(userId) + '_' + str(modelId)
        try:
            model_sub = CacheRepository.get(cache_key)
            if model_sub is not None:
                logger.info(f"Model {modelId} is subscribed for user {userId}")
                return model_sub
            else:
                with CassandraDatabase().get_session() as session:
                    model_select_statement = "SELECT modelid FROM usersubscriptions WHERE userid = %s AND modelid = %s LIMIT 1"
                    result = session.execute(model_select_statement, (userId, modelId)).one()
                    is_subscribed = result is not None
                    if is_subscribed:
                        CacheRepository.set(cache_key, is_subscribed, 60)
                    logger.info(f"Model {modelId} is {'subscribed' if is_subscribed else 'not subscribed'} for user {userId}")
                    return is_subscribed
        except Exception as e:
            logger.error(f"Failed to check if model is subscribed for user {userId} and model {modelId} with error: {str(e)}")
            return False

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
            with CassandraDatabase().get_session() as session:
                # chat_select_statement = "SELECT chatid FROM chathistory_by_visible WHERE visible = true AND userid = %s AND chatid = %s LIMIT 1"
                # result_set = session.execute(chat_select_statement, (user_id, chat_id)).one()

                # if result_set is None:
                #     return False  # Chat not found

                chat_update_statement = "UPDATE chathistory SET chattitle = %s WHERE userid = %s AND chatid = %s IF EXISTS"
                saved = session.execute(chat_update_statement, (new_title, user_id, chat_id))
                if saved and saved[0].applied:
                    logger.info(f"Successfully renamed conversation {chat_id} for user {user_id}")
                    return True
                logger.error(f"Failed to rename conversation {chat_id} for user {user_id}")
                return False
        except Exception as ex:
            # Log the exception
            logger.error(f"Failed to rename conversation: {str(ex)}")
            return False

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
            with CassandraDatabase().get_session() as session:
                # chat_select_statement = "SELECT chatid FROM chathistory_by_visible WHERE visible = true AND userid = %s AND chatid = %s LIMIT 1"
                # result_set = session.execute(chat_select_statement, (user_id, chat_id))

                # if result_set.one() is None:
                #     return False  # Chat not found

                chat_delete_statement = "UPDATE chathistory SET visible = false WHERE userid = %s AND chatid = %s IF visible = true"
                saved = session.execute(chat_delete_statement, (user_id, chat_id))

                if saved and saved[0].applied:
                    logger.info(f"Chat deleted with chatId: {chat_id} for user: {user_id}")
                    return True
                logger.error(f"Failed to delete conversation {chat_id} for user {user_id}")
                return False
        except Exception as ex:
            # Log the exception
            logger.error(f"Failed to delete conversation: {str(ex)}")
            return False