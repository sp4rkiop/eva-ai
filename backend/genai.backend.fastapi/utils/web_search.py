from typing import Dict, Optional, List
import logging, re, urllib.parse, asyncio
from pydantic import BaseModel, Field
from curl_cffi import ProxySpec
from bs4 import BeautifulSoup, Tag
from typing_extensions import Annotated
from langgraph.prebuilt import InjectedState
from langchain.text_splitter import RecursiveCharacterTextSplitter
from core.curl_cffi_session_manager import CurlCFFIAsyncSession
from repositories.websocket_manager import ws_manager

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class ScrapUrlListInput(BaseModel):
    url_list: List[str] = Field(..., description="List of URLs to scrape")
    query: Optional[str] = Field(..., description="Search query for relevant (simple keyword match) content from scraped data")
    state: Annotated[dict, InjectedState]

class SearchInput(BaseModel):
    query: str = Field(..., description="Search query")
    state: Annotated[dict, InjectedState]

class WebSearchService:
    def __init__(self):
        self.baseurl= "https://html.duckduckgo.com/html"
        self.headers = {
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
            "Accept-Encoding": "gzip, deflate, br, zstd",
            "Accept-Language": "en-US,en;q=0.9",
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "Pragma": "no-cache",
            "Upgrade-Insecure-Requests": "1",
            "Sec-Fetch-Dest": "document",
            "Sec-Fetch-Mode": "navigate",
            "Sec-Fetch-Site": "same-origin",
            "Sec-Fetch-User": "?1",
            "sec-ch-ua": '"Not A;Brand";v="99", "Chromium";v="124", "Google Chrome";v="124"',
            "sec-ch-ua-mobile": '?0',
            "sec-ch-ua-platform": '"Windows"',
            "Host": "html.duckduckgo.com",
        }
        self.proxies: ProxySpec = {}
        self.text_splitter = RecursiveCharacterTextSplitter(
            chunk_size=800,
            chunk_overlap=100,
        )

    async def search(self, query: str, latest_by: str = "", region: str = "", state: Optional[dict] = None) -> Optional[list]: #https://duckduckgo.com/duckduckgo-help-pages/settings/params
        """
        Perform a web search using DuckDuckGo and return a list of search results in 
        the format {'title': title of page, 'url': url, 'description': short description of page related to query}.
        It can fail to return results if the request fails. So do not spam it.
        Args:
            query (str): The search query string.
            latest_by (str, optional): Filter results by recency. Use 'd' for day, 'w' for week, 'm' for month, 'y' for year.
            region (str, optional): Specify the region for search results. /utils/duckduckgo-regions.json
            
        Returns:
            Optional[list]: A list of dictionaries containing the search result's title, URL, and description, 
                            or None if the search fails.
        """
        search_result = []
        params = {
            "q": query, #+ " site:febbox.com"
            "kl": region,
            "df": latest_by, #d for day, w for week, m for month, y for year
            # "filter": 0  # uncomment if needed
        }
        search_url = self.baseurl + "/?" + urllib.parse.urlencode(params)
        try:
            if state:
                await ws_manager.send_to_user(
                    sid=state["user_id"],
                    message_type="ToolProcess",
                    data={"chat_id": state["chat_id"], "content": "Searching the web..."}
                )
            async with CurlCFFIAsyncSession.get_session() as ssn:
                request = await ssn.get(search_url, headers=self.headers, impersonate="chrome", proxies=self.proxies) # type: ignore
                if request.status_code == 200:
                    response = request.text
                    soup = BeautifulSoup(response, 'html.parser')
                    results = soup.find_all('div', {'class': 'web-result'})
                    for result in results:
                        if isinstance(result, Tag):  # Check if result is a Tag object
                            title = result.find('a', {'class': 'result__a'})
                            url = result.find('a', {'class': 'result__url'})
                            description = result.find('a', {'class': 'result__snippet'})
                            if title and url and description:
                                search_result.append({'title': title.text.strip(), 'url': url.text.strip(), 'description': description.text.strip()})
                        else:
                            raise TypeError(f"Expected a Tag object, but got {type(result)}")
                    
                    if search_result:
                        if state:
                            await ws_manager.send_to_user(
                                sid=state["user_id"],
                                message_type="ToolProcess",
                                data={"chat_id": state["chat_id"], "content": "Got few results..."}
                            )
                        return search_result
                else:
                    logger.error(f"Failed to search for {query}. Status code: {request.status_code}")
                    return [{"error": f"Failed to search for {query}. Status code: {request.status_code}. Try again later."}]
        except Exception as e:
            logger.exception(f"An error occurred while searching for {query} : {e}")
            return [{"error": f"Try again later. An error occurred while searching for {query} : {e}."}]

    async def scrap_url_list(self, url_list: list[str], query: Optional[str], state: Optional[dict] = None) -> Optional[Dict[str, list[str]]]:
        """
        Scrap a list of URLs and return a dictionary with the URL as the key and the list of relevant chunks of scraped content as the value.
        It can fail if the URL is not valid or if the request fails. So do not spam it.
        Args:
            url_list (list[str]): A list of URLs to be scraped.
            query (str): The search query string which will be used to get relevent (simple keyword match) content from scraped data.

        Returns:
            Optional[Dict[str, str]]: A dictionary with the scraped content, or None if an error occurred
        """
        scrap_result = {}
        try:
            if state:
                await ws_manager.send_to_user(
                    sid=state["user_id"],
                    message_type="ToolProcess",
                    data={"chat_id": state["chat_id"], "content": "Extracting content from the link..."}
                )
            async with CurlCFFIAsyncSession.get_session() as s:
                tasks = []
                for url in url_list:
                    header = {
                        "Host": url.replace('https://', '').replace('http://', '').partition('/')[0], # hostname from the URL (str.split('/)[0] can be slower if the url has many seperators so used partition())
                        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                        "Accept-Language": "en-US,en;q=0.5",
                        "Accept-Encoding": "gzip, deflate, br, zstd",
                        "Referer": "https://html.duckduckgo.com/",
                        "DNT": "1",
                        "Sec-GPC": "1",
                        "Connection": "keep-alive",
                        "Upgrade-Insecure-Requests": "1",
                        "Sec-Fetch-Dest": "document",
                        "Sec-Fetch-Mode": "navigate",
                        "Sec-Fetch-Site": "cross-site",
                        "Sec-Fetch-User": "?1",
                        "Priority": "u=0, i",
                        "sec-ch-ua": '"Not A;Brand";v="99", "Chromium";v="124", "Google Chrome";v="124"',
                        "sec-ch-ua-mobile": '?0',
                        "sec-ch-ua-platform": '"Windows"'
                    }
                    task = s.get(url, headers=header, impersonate="chrome", proxies=self.proxies)
                    tasks.append(task)
                results = await asyncio.gather(*tasks)
                for result in results:
                    if result.status_code == 200:
                        user_query = ""
                        if state: 
                            user_query = query if query else state["user_input"]
                            await ws_manager.send_to_user(
                                sid=state["user_id"],
                                message_type="ToolProcess",
                                data={"chat_id": state["chat_id"], "content": f"Summarizing content from {result.url}..."}
                            )
                        markdown = self.markdown_html_content(result.text, result.url)
                        chunks = self.text_splitter.split_text(markdown)
                        if user_query:
                            # Filter top 10 related chunks based on the user's query (simple keyword match)
                            chunks = [chunk for chunk in chunks if any(word in chunk.lower() for word in user_query.lower().split())][:10]
                        scrap_result[result.url] = chunks
                    else:
                        logger.error(f"Failed to scrap {result.url}. Status code: {result.status_code}")
                        return {"error": [f"Failed to scrap {result.url}. Status code: {result.status_code}. Try again later."]}

                if state:
                    await ws_manager.send_to_user(
                        sid=state["user_id"],
                        message_type="ToolProcess",
                        data={"chat_id": state["chat_id"], "content": "Extraction completed..."}
                    )
                return scrap_result 
        except Exception as e:
            logger.exception(f"Failed to scrap {url_list}: {e}")
            return {"error": [f"Failed to scrap {url_list}. Try again later."]}

    def markdown_html_content(self, html_content, page_url):
        """
        Convert HTML content to a Markdown-formatted string.

        This method extracts the title, main content from the <body>, and 
        navigation links from <a> tags within the provided HTML content and 
        formats them as a Markdown string.

        Args:
            html_content: The raw HTML content of the page.
            page_url: The URL of the webpage being converted.

        Returns:
            A Markdown-formatted string containing the title, page URL, 
            main text content, and navigation links.
        """
        
        # Parse the HTML content
        soup = BeautifulSoup(html_content, 'html.parser')

        # Remove unnecessary sections
        for tag in soup(["script", "style", "nav", "footer", "header", "form", "aside"]):
            tag.decompose()
        
        # Extract the title
        title = soup.title.string if soup.title else "No Title Found"
        
        # Extract main text content (from <body>)
        main_content = ""
        main_section = soup.find('body')
        if main_section:
            main_content = ' '.join(main_section.stripped_strings)
        else:
            main_content = "No Main Content Found"
        
        # Extract navigation links (from <a> tags)
        links = []
        for a_tag in soup.find_all('a', href=True):
            if isinstance(a_tag, Tag):
                link_text = a_tag.get_text(strip=True)
                link_href = a_tag['href']
                if link_text:
                    links.append(f"- [{link_text}]({link_href})")
        
        # Format the extracted data as Markdown
        markdown_output = f"""
    ## Title:**{title}**

    ## Page URL:{page_url}

    ## Main Content:{main_content}

    ## Navigation Links
    {chr(10).join(links)}
        """
        return markdown_output
    