from typing import Optional, Dict
from curl_cffi import requests

class CurlCFFISession:
    _session = None

    @classmethod
    def initialize(cls, headers: Optional[Dict[str, str]]=None):
        """
        Initialize the curl_cffi session with optional headers.
        """
        cls._session = requests.Session()

    @classmethod
    def get_session(cls):
        """
        Return the curl_cffi session. Initialize it if not already done.
        """
        if cls._session is None:
            cls.initialize()
        return cls._session

    @classmethod
    def close_session(cls):
        """
        Close the curl_cffi session.
        """
        if cls._session:
            cls._session.close()
            cls._session = None
