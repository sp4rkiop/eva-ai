import logging
from contextlib import contextmanager
from cassandra.cluster import Cluster
from core.config import settings

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class CassandraDatabase:
    _cluster = None
    _session = None
    
    @classmethod
    def initialize(cls):
        # Create keyspace and tables if they don't exist first
        cls._setup_keyspace_and_tables()
        
        # Then connect to the keyspace
        contact_points = settings.SCYLLA_HOST.split(',')
        cls._cluster = Cluster(contact_points, port=settings.SCYLLA_PORT)
        cls._session = cls._cluster.connect(settings.SCYLLA_KEYSPACE)
    
    @classmethod
    @contextmanager
    def get_session(cls):
        if cls._session is None:
            cls.initialize()
            if cls._session is None:
                raise Exception("Cassandra session not initialized")
        try:
            yield cls._session
        except Exception as e:
            # Log the exception for debugging purposes
            logger.error("Error occurred while using Cassandra session", exc_info=e)
            raise e
        
    @classmethod
    def close_all_connections(cls):
        if cls._session:
            cls._session.shutdown()
        if cls._cluster:
            cls._cluster.shutdown()

    @classmethod
    def _setup_keyspace_and_tables(cls):
        """
        Create keyspace and tables if they don't exist
        """
        # Connect to ScyllaDB without specifying a keyspace
        contact_points = settings.SCYLLA_HOST.split(',')
        setup_cluster = Cluster(contact_points, port=settings.SCYLLA_PORT)
        setup_session = setup_cluster.connect()
        
        try:
            # Create keyspace if not exists
            keyspace = settings.SCYLLA_KEYSPACE
            setup_session.execute(f"""
                CREATE KEYSPACE IF NOT EXISTS {keyspace}
                WITH replication = {{'class': 'SimpleStrategy', 'replication_factor': '1'}}
            """)
            
            # Set keyspace for subsequent queries
            setup_session.set_keyspace(keyspace)
            
            # Create tables
            table_queries = [
                """
                CREATE TABLE IF NOT EXISTS chathistory (
                    userid uuid,
                    chatid uuid,
                    visible boolean,
                    chathistoryjson blob,
                    chattitle text,
                    createdon timestamp,
                    nettokenconsumption int,
                    PRIMARY KEY (userid, chatid)
                );
                """,
                """
                CREATE MATERIALIZED VIEW IF NOT EXISTS chathistory_by_visible AS
                SELECT userid, chatid, chathistoryjson, chattitle, createdon, nettokenconsumption
                FROM chathistory
                WHERE visible IS NOT NULL AND userid IS NOT NULL AND chatid IS NOT NULL
                PRIMARY KEY (visible, userid, chatid);
                """,
                """
                CREATE TABLE IF NOT EXISTS availablemodels (
                    deploymentid uuid,
                    isactive boolean,
                    apikey text,
                    deploymentname text,
                    endpoint text,
                    modelname text,
                    modeltype text,
                    modelversion text,
                    provider text,
                    PRIMARY KEY ((deploymentid), isactive)
                );
                """,
                """
                CREATE TABLE IF NOT EXISTS usersubscriptions (
                    userid uuid,
                    modelid uuid,
                    PRIMARY KEY (userid, modelid)
                );
                """,
                """
                CREATE TABLE IF NOT EXISTS users (
                    email text,
                    partner text,
                    userid uuid,
                    firstname text,
                    lastname text,
                    role text,
                    PRIMARY KEY ((email, partner), userid)
                );
                """
            ]
            
            for query in table_queries:
                setup_session.execute(query)
            
            # # Log created tables for verification
            # rows = setup_session.execute(f"SELECT table_name FROM system_schema.tables WHERE keyspace_name='{keyspace}';")
            # print(f"Tables in keyspace {keyspace}:")
            # for row in rows:
            #     print(f"- {row.table_name}")
                
        except Exception as e:
            print(f"Error setting up keyspace and tables: {e}")
            raise
        finally:
            # Close setup connection
            setup_session.shutdown()
            setup_cluster.shutdown()
