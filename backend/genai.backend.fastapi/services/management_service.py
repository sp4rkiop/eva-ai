import asyncio, logging
from typing import Any, Dict, List
from core.database import CassandraDatabase
from repositories.cache_repository import CacheRepository
from models.generative_model import GenerativeModel

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class ModelData:
    @staticmethod
    async def get_all_models() -> List[GenerativeModel]:
        """
        Get all models.
            
        Returns:
            List of models or empty list
        """
        def _sync_db_fetch():
            with CassandraDatabase().get_session() as session:
                
                query = f"SELECT deploymentid, apikey, deploymentname, endpoint, modelname, modeltype, modelversion, provider, isactive FROM availablemodels"

                # Execute the query with model_ids as parameters
                result_set = session.execute(query)

                model_list = []

                for row in result_set:
                    model = GenerativeModel(
                        deployment_id=row.deploymentid,
                        api_key=row.apikey,
                        deployment_name=row.deploymentname,
                        endpoint=row.endpoint,
                        model_name=row.modelname,
                        model_type=row.modeltype,
                        model_version=row.modelversion,
                        provider=row.provider,
                        is_active=row.isactive
                    )
                    model_list.append(model)

                #save into cache
                CacheRepository.set("all_models", model_list, 86400) # 86400 seconds = 1 day
                return model_list
        try:
            model_list = CacheRepository.get("all_models")
            if model_list is not None:
                return model_list
            return await asyncio.to_thread(_sync_db_fetch)
        except Exception as ex:
            # Log the exception
            logger.error(f"Failed to get models: {str(ex)}")
            raise Exception(f"Failed to get models: {str(ex)}")