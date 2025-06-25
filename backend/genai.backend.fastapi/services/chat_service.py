import uuid, pickle, logging, re, asyncio, openai
from pydantic import SecretStr
from sqlalchemy import update
from core.database import PostgreSQLDatabase
from core.config import settings
from typing import TypedDict, Dict, Any, List, Optional, Sequence
from models.ai_models_model import AiModels
from models.chat_history_model import ChatHistory
from models.response_model import ChatResponse
from models.user_document_model import UserDocument
from repositories.websocket_manager import ws_manager
from services.user_service import UserService
from services.document_service import DocumentService
from services.management_service import ManagementService
from langchain_openai import AzureChatOpenAI, OpenAI
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser
from langchain_core.chat_history import BaseChatMessageHistory
from langchain_core.messages import BaseMessage, HumanMessage, AIMessage, AIMessageChunk, ToolMessage
from pydantic import BaseModel, Field
from copy import deepcopy
from langgraph.graph import StateGraph, START, END
from langgraph.prebuilt import ToolNode, tools_condition
from utils.langchain_tools import get_tools

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)
class ChatService:
    def __init__(self):
        self.parser = StrOutputParser()
        self.llm: AzureChatOpenAI
        self.store = {}
        self.history_limit = 4
        self.branch = "main"
        self.user_service = UserService()
        self.doc_service = DocumentService()
        self.workflow = self.create_workflow()

    def get_llm_from_model(self, model: AiModels) -> AzureChatOpenAI:
        """
        Initializes and returns an AzureChatOpenAI instance using the model's details.
        """
        return AzureChatOpenAI(
            azure_endpoint=model.endpoint,
            api_key=SecretStr(model.api_key),
            azure_deployment=model.deployment_name,
            api_version=settings.AZURE_OPENAI_API_VERSION,
            temperature=0.01,
            stream_usage=True
        )
           
    def get_chat_history_by_branch(self, branch: str) -> BaseChatMessageHistory:
        if branch not in self.store:
            self.store[branch] = InMemoryHistory()
        return self.store[branch]

    def get_valid_chat_history(self, limit: int = 4) -> List[BaseMessage]:
        history = self.get_chat_history_by_branch(self.branch).messages[-limit:]
        valid_messages = []
        
        # Filter out any ToolMessage at the start of the history, as
        # they don't make sense in the context of a chat history.
        if len(history) > 1 and isinstance(history[0], ToolMessage):
            valid_messages = history[1:]
        else:
            valid_messages = history

        return valid_messages

    def create_branch_from(self, parent_branch: str, new_branch: str, edit_index: int, new_message: BaseMessage):
        parent_history = self.store.get(parent_branch)
        if not parent_history:
            raise ValueError(f"Parent branch '{parent_branch}' does not exist.")

        # Clone messages up to the edit point
        new_history = InMemoryHistory(messages=deepcopy(parent_history.messages[:edit_index]))
        # Add the new edited message
        new_history.add_messages([new_message])
        # Store the new branch
        self.store[new_branch] = new_history

    def create_workflow(self):
        # Define LangGraph nodes
        builder = StateGraph(GraphState)
        tools = get_tools()
        # Node 1: Process chat input
        async def process_chat(state: GraphState):
            history = self.get_valid_chat_history(limit=self.history_limit)

            # Create prompt based on state
            if state["tool_used"]:
                prompt = ChatPromptTemplate.from_messages([
                    ("system", state['sys_prompt']),
                    *history
                ])
            else:
                prompt = ChatPromptTemplate.from_messages([
                    ("system", state['sys_prompt']),
                    *history,
                    HumanMessage(content=state['user_input'])
                ])
            
            llm_with_tools = self.llm.bind_tools(tools)
            chain = prompt | llm_with_tools
            ai_message = None

            # Stream response
            async for chunk in chain.astream({}):
                await ws_manager.send_to_user(
                    sid=state['user_id'],
                    message_type="StreamMessage",
                    data={"chat_id": state['chat_id'], "content": chunk.content}
                )
                await asyncio.sleep(0.015) # 15ms delay to simulate smooth typing

                if ai_message is None:
                    ai_message = chunk
                else:
                    ai_message += chunk

            # Add message to history
            if state["tool_used"]:
                self.store[self.branch].add_messages([ai_message])
            else: 
                self.store[self.branch].add_messages([HumanMessage(content=state['user_input']), ai_message])

            # Update token usage
            last_message = self.store[self.branch].messages[-1]
            if hasattr(last_message, 'usage_metadata') and last_message.usage_metadata is not None:
                state['token_usage'] += last_message.usage_metadata.get('total_tokens', 0)

            # Update state
            state["messages"] = self.store[self.branch].messages
            return state
        
        # Node 2: Save to database
        async def save_to_db(state: GraphState):
            
            if state['new_chat']:
                # Generate title for new chat
                title_result = await self.generate_chat_title(state['user_input'])
                chat_title = title_result['content']
                # Update token usage
                state['token_usage'] += title_result['token_uses']
                # Save to database
                async with PostgreSQLDatabase.get_session() as session:
                    new_chat = ChatHistory(
                        user_id=state['user_id'],
                        history_blob=pickle.dumps(self.store),
                        chat_title=chat_title,
                        token_count=state['token_usage']
                    )
                    session.add(new_chat)
                    await session.flush()
                    state['chat_id'] = str(new_chat.chat_id)
                    await session.commit()
            else:
                if state["chat_title"].strip() == "":
                    title_result = await self.generate_chat_title(state['user_input'])
                    state['token_usage'] += title_result['token_uses']
                    state['chat_title'] = title_result['content']
                # Save to database
                async with PostgreSQLDatabase.get_session() as session:
                    update_chat = (
                        update(ChatHistory)
                        .where(
                            ChatHistory.user_id == state['user_id'],
                            ChatHistory.chat_id == uuid.UUID(state['chat_id'])
                            )
                        .values(
                            history_blob=pickle.dumps(self.store),
                            chat_title=state['chat_title'],
                            token_count=state['token_usage']
                        )
                    )
                    await session.execute(update_chat)
            
            # Send end stream signal to subscriber
            await ws_manager.send_to_user(
                state['user_id'],
                "EndStream",
                ""
            )
            return state
        
        #Node: sync tool messages to store
        async def sync_messages(state: GraphState):
            # sync state['messages'] to self.store[branch]
            self.store[self.branch].add_messages(state['messages'])
            state["tool_used"] = True
            return state
        
        # Build graph
        builder.add_node("process_chat", process_chat)
        builder.add_node("tools", ToolNode(tools))
        builder.add_node("sync_messages", sync_messages)
        builder.add_conditional_edges(
            "process_chat",
            tools_condition,
            {"tools": "tools", END: "save_to_db"},
        )
        builder.add_node("save_to_db", save_to_db)

        # Define edges
        builder.set_entry_point("process_chat") #START
        # Any time a tool is called, we return to the chatbot to decide the next step
        builder.add_edge("tools", "sync_messages")
        builder.add_edge("sync_messages", "process_chat")
        builder.add_edge("save_to_db", END)
        
        return builder.compile()
    
    async def chat_shield(self, user_id: uuid.UUID, model_id: uuid.UUID, user_input: str, chat_id: Optional[uuid.UUID] = None) -> ChatResponse:
        """
        Checks if a model is subscribed by a user and runs the chat shield on the given input.

        Args:
            user_id: User's UUID
            model_id: Model's UUID
            user_input: The message content from the user
            chat_id: Chat UUID (optional)

        Returns:
            ChatResponse containing the success status and chat ID if successful, or an error message if not
        """
        try:
            if not await self.user_service.is_model_subscribed(user_id, model_id):
                await self.send_failed_socket_message(
                    user_id, 
                    str(chat_id if chat_id else user_id), 
                    "You are not subscribed to this model"
                )
                return ChatResponse(success=False, error_message="Model is not subscribed")
            else:
                available_models: List[AiModels] = await ManagementService.get_all_models()
                # Find the requested model from the list
                selected_model = next((m for m in available_models if m.model_id == model_id and m.is_active), None)
                if selected_model is None:
                    await self.send_failed_socket_message(
                        user_id, 
                        str(chat_id if chat_id else user_id), 
                        "Selected model is not available, Try with different model"
                    )
                    return ChatResponse(success=False, error_message="Selected model not available")
                # Initialize LLM from selected model
                self.llm = self.get_llm_from_model(selected_model)
                new_chat_id = await self.lanchain_chat(user_id, user_input, chat_id)
                return ChatResponse(success=True, chat_id=new_chat_id)
            
        except openai.BadRequestError as e:
            error_code = ""

            if hasattr(e, "response"):
                if callable(getattr(e.response, "json", None)):
                    error_json = e.response.json()
                    error_code = error_json.get("error", {}).get("code", "")
                elif isinstance(e.response, dict):
                    # OpenAI native
                    error_code = e.response.get("error", {}).get("code", "")

            if error_code == "content_filter":
                await self.send_failed_socket_message(
                    user_id,
                    str(chat_id if chat_id else user_id),
                    "Your message contains sensitive content and has been blocked by the OpenAI content filter."
                )
                return ChatResponse(success=False, error_message="Your message contains sensitive content and has been blocked by the OpenAI content filter.")
            else:
                await self.send_failed_socket_message(
                    user_id,
                    str(chat_id if chat_id else user_id),
                    f"Something went wrong, please wait for a while. Error: {str(e)}"
                )
                return ChatResponse(success=False, error_message="Server handling error: " + str(e))
            
        except Exception as e:
            await self.send_failed_socket_message(
                user_id, 
                str(chat_id if chat_id else user_id), 
                f"Something went wrong, please wait for a while. Error: {str(e)}"
            )
            return ChatResponse(success=False, error_message= "Server handling error: " + str(e))

    async def lanchain_chat(self, user_id: uuid.UUID, user_input: str, chat_id: Optional[uuid.UUID] = None, branch: str = "main") -> Optional[uuid.UUID]:
        """
        Handles a single chat message from a user.

        Args:
            user_id: Unique identifier for the user.
            user_input: The message content from the user.
            chat_id: The UUID of the chat (optional). If not provided, a new chat will be created.
            branch: The name of the chat branch (optional, default is "main").

        Returns:
            The UUID of the chat if successful, or None if there was an error.

        Raises:
            Exception: If there was an error while processing the chat message. The exception message
                will contain a human-readable error message.
        """

        try:
            self.branch = branch
            # Initialize state
            state = {
                "user_id": user_id,
                "user_input": user_input,
                "chat_id": str(chat_id) if chat_id else None,
                "chat_title": "",
                "new_chat": not chat_id,
                "sys_prompt": settings.SYSTEM_PROMPT,
                "token_usage": 0,
                "tool_used": False
            }
            
            # Load existing chat history if available
            if chat_id:
                chat_history_data = await self.user_service.get_single_conversation(user_id, chat_id)
                
                doc_data = chat_history_data['files']
                self.store = chat_history_data['conversation']
                state['chat_title'] = chat_history_data['title']
                state['token_usage'] = chat_history_data['token_consumed']

                if doc_data and len(doc_data) > 0:
                    state['sys_prompt'] += "\n\n Accessible Files in the chat: " + ", ".join([file['file_name'] for file in doc_data])
            else:
                state['chat_id'] = str(user_id)  # Temporary ID for streaming
            
            # Execute workflow
            final_state = await self.workflow.ainvoke(state)
            
            return uuid.UUID(final_state['chat_id'])
            
        except Exception as e:
            logger.exception(f"Error processing chat: {e}", exc_info=True)
            raise Exception(e)

    async def generate_chat_title(self, user_input: str) -> Dict[str, Any]:
        """
        Generate a concise title for a chat message.

        This method uses a chatbot model to generate a title that captures 
        the essence of the given user input message. The title is limited to 
        5 words.

        Args:
            user_input: The message content from which the title is to be generated.

        Returns:
            A dictionary containing:
                - 'content': The generated title.
                - 'token_uses': The number of tokens used in the title generation process.

        Raises:
            Logs an error and returns a default failure response if title generation fails.
        """
        try:
            prompt = ChatPromptTemplate.from_messages(
                [
                    (
                        "system",
                        "You are a chatbot specialized in generating concise titles. "
                        "Given a message, you will respond with a title in no more than 5 word which should capture the essence of message. "
                        "Response can contain emojis and special characters if needed. Do not wrap the title in quotes.",
                    ),
                    ("human", "{input}"),
                ]
            )
            chain = prompt | self.llm
            response = await chain.ainvoke({"input": user_input})
            raw_content = response.content
            if isinstance(raw_content, str):
                clear_output = re.sub(r'^"(.*)"$', r'\1', raw_content)
            else:
                clear_output = raw_content
            token_uses = response.response_metadata['token_usage']['total_tokens'] if response.response_metadata else 0
            return {"content": clear_output, "token_uses": token_uses}
        except Exception as e:
            logger.exception(f"Failed to generate title with error: {str(e)}", exc_info=True)
            return {"content": "Failed to generate title", "token_uses": 0}
    
    async def send_failed_socket_message(self, user_id: uuid.UUID, chat_id: str, message: str):
        """
        Send a failed socket message to the user.

        Args:
            user_id: The ID of the user to send the message to.
            chat_id: The ID of the chat to send the message to.
            message: The message to send.
        """
        await ws_manager.send_to_user(
            sid=user_id, 
            message_type="StreamMessage", 
            data={"chat_id": chat_id, "content": message}
        )
        await ws_manager.send_to_user(
            sid=user_id,
            message_type="EndStream", 
            data=""
        )

class InMemoryHistory(BaseChatMessageHistory, BaseModel):
    messages: list[BaseMessage] = Field(default_factory=list)

    def add_messages(self, messages: Sequence[BaseMessage]) -> None:
        self.messages.extend(messages)

    def clear(self) -> None:
        self.messages = []
    
    def edit_message_at_index(self, index: int, new_message: BaseMessage) -> None:
        if 0 <= index < len(self.messages):
            self.messages[index] = new_message
            # Truncate all messages after the edited one
            self.messages = self.messages[:index + 1]
        else:
            raise IndexError("Message index out of range.")
        
class GraphState(TypedDict):
    user_id: uuid.UUID
    user_input: str
    chat_id: Optional[str]
    chat_title: str
    new_chat: bool
    messages: List[BaseMessage]
    sys_prompt: str
    token_usage: int
    tool_used: bool