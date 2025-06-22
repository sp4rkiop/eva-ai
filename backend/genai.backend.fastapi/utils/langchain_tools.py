from langchain.tools import Tool, StructuredTool
from typing import List
from services.document_service import DocumentRetrieverTool, DocumentService
from .py_code_runner import current_utc_date_time, python_code_runner, PythonCodeRunnerInput, CurrentUtcDateTimeInput
from .web_search import WebSearchService, ScrapUrlListInput, SearchInput


def get_tools() -> List[Tool | StructuredTool]:
    web = WebSearchService()
    doc = DocumentService()
    return [
        StructuredTool.from_function(
            func=web.scrap_url_list,
            coroutine=web.scrap_url_list,
            name=web.scrap_url_list.__getattribute__("__name__"),
            description=web.scrap_url_list.__getattribute__("__doc__"),
            args_schema=ScrapUrlListInput,
        ),
        StructuredTool.from_function(
            func=web.search,
            coroutine=web.search,
            name=web.search.__getattribute__("__name__"),
            description=web.search.__getattribute__("__doc__"),
            args_schema=SearchInput,
        ),
        StructuredTool.from_function(
            func=doc.get_relevant_docs,
            coroutine=doc.get_relevant_docs,
            name=doc.get_relevant_docs.__getattribute__("__name__"),
            description="Use to get relevant content from Files when you don't know the question. " + doc.get_relevant_docs.__getattribute__("__doc__"),
            args_schema=DocumentRetrieverTool,
        ),
        StructuredTool.from_function(
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
            return_direct=True,
            args_schema=CurrentUtcDateTimeInput,
        ),
    ]