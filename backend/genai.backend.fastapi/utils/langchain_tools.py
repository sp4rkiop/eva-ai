from langchain.tools import Tool
from typing import List
from .py_code_runner import current_utc_date_time, python_code_runner, PythonCodeRunnerInput
from .web_search import WebSearchService, ScrapUrlListInput, SearchInput

web = WebSearchService()
def get_tools() -> List[Tool]:
    return [
        Tool.from_function(
            func=web.scrap_url_list,
            coroutine=web.scrap_url_list,
            name=web.scrap_url_list.__getattribute__("__name__"),
            description=web.scrap_url_list.__getattribute__("__doc__"),
            args_schema=ScrapUrlListInput,
        ),
        Tool.from_function(
            func=web.search,
            coroutine=web.search,
            name=web.search.__getattribute__("__name__"),
            description=web.search.__getattribute__("__doc__"),
            args_schema=SearchInput,
        ),
        Tool.from_function(
            func=python_code_runner,
            coroutine=python_code_runner,
            name=python_code_runner.__getattribute__("__name__"),
            description=python_code_runner.__getattribute__("__doc__"),
            return_direct=True,
            args_schema=PythonCodeRunnerInput,
        ),
        Tool.from_function(
            func=current_utc_date_time,
            coroutine=current_utc_date_time,
            name=current_utc_date_time.__getattribute__("__name__"),
            description=current_utc_date_time.__getattribute__("__doc__"),
            return_direct=True
        ),
    ]