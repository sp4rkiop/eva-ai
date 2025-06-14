import logging
from typing import List
from sqlalchemy import select
from core.database import PostgreSQLDatabase
from repositories.cache_repository import CacheRepository
from models.ai_models_model import AiModels
from models.subscriptions_model import Subscriptions
from models.users_model import Users
from models.chat_history_model import ChatHistory

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class ModelData:
    @staticmethod
    async def get_all_models() -> List[AiModels]:
        """
        Get all models.
            
        Returns:
            List of models or empty list
        """
        try:
            model_list = CacheRepository.get("all_models")
            if model_list is not None:
                return model_list
            async with PostgreSQLDatabase.get_session() as session:
                # Query AI models
                stmt = select(AiModels)
                result = await session.execute(stmt)
                ai_models = result.scalars().all()
                
                model_list = []
                for model in ai_models:
                    model_list.append(model)
                #save into cache
                CacheRepository.set("all_models", model_list, 86400) # 86400 seconds = 1 day
                return model_list
        except Exception as ex:
            # Log the exception
            logger.error(f"Failed to get models: {str(ex)}")
            raise Exception(f"Failed to get models: {str(ex)}")