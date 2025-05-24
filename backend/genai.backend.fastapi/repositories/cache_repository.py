import time
from typing import Any

class CacheRepository:
    _cache = {}

    @staticmethod
    def get(key: str):
        data = CacheRepository._cache.get(key)
        if data and data['expiry'] > time.time():
            return data['value']
        else:
            CacheRepository.delete(key)
        return None

    @staticmethod
    def set(key: str, value: Any, expiry: int):
        CacheRepository._cache[key] = {
            'value': value,
            'expiry': time.time() + expiry
        }

    @staticmethod
    def delete(key: str):
        if key in CacheRepository._cache:
            del CacheRepository._cache[key]
            