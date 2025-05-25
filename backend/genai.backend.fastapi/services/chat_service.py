import uuid, pickle, logging, re, asyncio
from pydantic import SecretStr
from core.database import CassandraDatabase
from core.config import settings
from typing import Dict, Any, List, Optional, Sequence
from datetime import datetime, timezone
from models.generative_model import GenerativeModel
from models.response_model import ChatResponse
from repositories.cache_repository import CacheRepository
from repositories.websocket_manager import ws_manager
from services.user_service import UserService
from services.management_service import ModelData
from langchain_openai import AzureChatOpenAI
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser
from langchain_core.chat_history import BaseChatMessageHistory
from langchain_core.messages import BaseMessage
from pydantic import BaseModel, Field
from copy import deepcopy
from langchain_core.runnables import ConfigurableFieldSpec
from langchain_core.runnables.history import RunnableWithMessageHistory

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

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

class ChatService:
    def __init__(self):
        self.parser = StrOutputParser()
        self.llm: AzureChatOpenAI
        self.store = {}
        self.branch = "main"
        self.user_service = UserService()

    async def chat_shield(self, userId: uuid.UUID, modelId: uuid.UUID, userInput: str, chatId: Optional[uuid.UUID] = None) -> ChatResponse:
        """
        Checks if a model is subscribed by a user and runs the chat shield on the given input.

        Args:
            userId: User's UUID
            modelId: Model's UUID
            userInput: The message content from the user
            chatId: Chat UUID (optional)

        Returns:
            ChatResponse containing the success status and chat ID if successful, or an error message if not
        """
        try:
            if not await self.user_service.is_model_subscribed(userId, modelId):
                await self.send_failed_socket_message(
                    userId, 
                    str(chatId if chatId else userId), 
                    "You are not subscribed to this model"
                )
                return ChatResponse(success=False, error_message="Model is not subscribed")
            else:
                available_models: List[GenerativeModel] = await ModelData.get_all_models()
                # Find the requested model from the list
                selected_model = next((m for m in available_models if m.deployment_id == modelId and m.is_active), None)
                if selected_model is None:
                    await self.send_failed_socket_message(
                        userId, 
                        str(chatId if chatId else userId), 
                        "Selected model is not available, Try with different model"
                    )
                    return ChatResponse(success=False, error_message="Selected model not available")
                # Initialize LLM from selected model
                self.llm = self.get_llm_from_model(selected_model)
                chat_id = await self.lanchain_chat(userId, userInput, chatId)
                return ChatResponse(success=True, chat_id=chat_id)
        except Exception as e:
            await self.send_failed_socket_message(
                userId, 
                str(chatId if chatId else userId), 
                f"Something went wrong, please wait for a while. Error: {str(e)}"
            )
            return ChatResponse(success=False, error_message= "Server handling error: " + str(e))

    def get_llm_from_model(self, model: GenerativeModel) -> AzureChatOpenAI:
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

    def append_message_to_branch(self, message: BaseMessage, branch: str) -> None:
        if branch not in self.store:
            self.store[branch] = InMemoryHistory()
        self.store[branch].messages.append(message)

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

    async def process_input(self, userId: uuid.UUID, chatId: str, userInput: str, branch: str):
        """
        Process a user's input and send the response to the user's websocket.

        Args:
            userId: User's UUID
            chatId: Chat UUID
            userInput: The message content from the user
            branch: Chat branch name

        """
        chat_history = self.get_chat_history_by_branch(branch).messages[-4:]
        prompt = ChatPromptTemplate.from_messages([
            ("system", settings.SYSTEM_PROMPT),
            *chat_history,
            ("human", "{input}"),
        ])
        chain = prompt | self.llm
        chain_with_history = RunnableWithMessageHistory(
            chain,
            get_session_history=self.get_chat_history_by_branch,
            input_messages_key="input",
            history_factory_config=[
                ConfigurableFieldSpec(
                    id="branch",
                    annotation=str,
                    name="Chat Branch Name",
                    description="Unique name for the chat branch",
                    default="",
                    is_shared=True,
                ),
            ],
        )
        async for chunk in chain_with_history.astream({"input": userInput},
                                                    config={"configurable": {"branch": branch}}):
            await ws_manager.send_to_user(
                sid=userId, 
                message_type="StreamMessage", 
                data={"chat_id": chatId, "content": chunk.content}
            )
            await asyncio.sleep(0.015)  # 15ms delay

    async def lanchain_chat(self, userId: uuid.UUID, userInput: str, chatId: Optional[uuid.UUID] = None, branch: str = "main") -> Optional[str]:
        """
        Handles a single chat message from a user.

        Args:
            userId: Unique identifier for the user.
            userInput: The message content from the user.
            chatId: The UUID of the chat (optional). If not provided, a new chat will be created.
            branch: The name of the chat branch (optional, default is "main").

        Returns:
            The UUID of the chat if successful, or None if there was an error.

        Raises:
            Exception: If there was an error while processing the chat message. The exception message
                will contain a human-readable error message.
        """

        try:
            if not chatId:
                chatId = uuid.uuid4()
                await self.process_input(userId, str(userId), userInput, branch)
                token_uses = 0
                chat_title = await self.generate_chat_title(userInput)
                last_message = self.store[branch].messages[-1]
                if hasattr(last_message, 'usage_metadata'):
                    token_uses = last_message.usage_metadata.get('total_tokens', 0)
                total_tokens = chat_title['token_uses'] + token_uses
                chat_blob = pickle.dumps(self.store)
                def _save_new_chat():
                    with CassandraDatabase.get_session() as session:
                        chat_insert_statement = "INSERT INTO chathistory (userid, chatid, chattitle, chathistoryjson, createdon, nettokenconsumption, visible) VALUES (%s, %s, %s, %s, %s, %s, %s)"
                        return session.execute(chat_insert_statement, (userId, chatId, chat_title['content'], chat_blob, datetime.now(timezone.utc), total_tokens, True))
                chat_saved = await asyncio.to_thread(_save_new_chat)
                if chat_saved and getattr(chat_saved[0], 'applied', True):
                    logger.info(f"Chat saved with chatId: {chatId} for user: {userId}")
                await ws_manager.send_to_user(
                    sid=userId, 
                    message_type="EndStream", 
                    data=""
                )
                return str(chatId)
            else:
                chat_history_data = await self.user_service.get_single_conversation(userId, chatId)
                self.store = chat_history_data['conversation']
                token_used = chat_history_data['token_consumed']
                await self.process_input(userId, str(chatId), userInput, branch)
                last_message = self.store[branch].messages[-1]
                if hasattr(last_message, 'usage_metadata'):
                    token_used += last_message.usage_metadata.get('total_tokens', 0)
                updated_blob = pickle.dumps(self.store)

                def _update_existing_chat():
                    with CassandraDatabase.get_session() as session:
                        chat_update_statement = "UPDATE chathistory SET chathistoryjson = %s, createdon = %s, nettokenconsumption = %s WHERE userid = %s AND chatid = %s"
                        return session.execute(chat_update_statement, (pickle.dumps(self.store), datetime.now(timezone.utc), token_used, userId, chatId))
                chat_saved = await asyncio.to_thread(_update_existing_chat)
                if chat_saved and getattr(chat_saved[0], 'applied', True):
                    logger.info(f"Chat updated with chatId: {chatId} for user: {userId}")
                await ws_manager.send_to_user(
                    sid=userId, 
                    message_type="EndStream", 
                    data=""
                )
        except Exception as e:
            logger.error(f"Error processing chat: {e}")
            raise Exception("Something went wrong, please wait for a while.")

    async def generate_chat_title(self, userInput: str) -> Dict[str, Any]:
        """
        Generate a concise title for a chat message.

        This method uses a chatbot model to generate a title that captures 
        the essence of the given user input message. The title is limited to 
        5 words.

        Args:
            userInput: The message content from which the title is to be generated.

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
            response = await chain.ainvoke({"input": userInput})
            raw_content = response.content
            if isinstance(raw_content, str):
                clear_output = re.sub(r'^"(.*)"$', r'\1', raw_content)
            else:
                clear_output = raw_content
            token_uses = response.response_metadata['token_usage']['total_tokens'] if response.response_metadata else 0
            return {"content": clear_output, "token_uses": token_uses}
        except Exception as e:
            logger.error(f"Failed to generate title with error: {str(e)}")
            return {"content": "Failed to generate title", "token_uses": 0}
    
    async def send_failed_socket_message(self, userId: uuid.UUID, chatId: str, message: str):
        """
        Send a failed socket message to the user.

        Args:
            userId: The ID of the user to send the message to.
            chatId: The ID of the chat to send the message to.
            message: The message to send.
        """
        await ws_manager.send_to_user(
            sid=userId, 
            message_type="StreamMessage", 
            data={"chat_id": chatId, "content": message}
        )
        await ws_manager.send_to_user(
            sid=userId,
            message_type="EndStream", 
            data=""
        )
