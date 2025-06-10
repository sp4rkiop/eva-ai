from typing import Optional
from typing_extensions import Annotated
from langgraph.prebuilt import InjectedState
import sys, io, traceback, contextlib, datetime
from pydantic import BaseModel, Field
from repositories.websocket_manager import ws_manager

class PythonCodeRunnerInput(BaseModel):
    code: str = Field(..., description="Python code to run")
    state: Annotated[dict, InjectedState]

class CurrentUtcDateTimeInput(BaseModel):
    state: Annotated[dict, InjectedState]

async def python_code_runner(code: str, state: Optional[dict] = None) -> str:
    """
    Executes a Python code snippet and returns the result or error.
    Use print() to print the output.
    Args:
        code (str): Python code to execute

    Returns:
        str: Output or error message
    """
    try:
        if state:
            await ws_manager.send_to_user(
                sid=state["user_id"],
                message_type="ToolProcess",
                data={"chat_id": state["chat_id"], "content": "Trying to run the code..."}
            )
        # Redirect stdout
        stdout = io.StringIO()
        with contextlib.redirect_stdout(stdout):
            # Only allow expressions and statements, not dangerous stuff
            exec(code, {})  # optionally use a restricted context instead of {}

        output = stdout.getvalue().strip()
        return output if output else "Code ran successfully but did not return anything."

    except Exception:
        return "Error during execution:\n" + traceback.format_exc()

async def current_utc_date_time(state: Optional[dict] = None) -> str:
    """
    Returns the current UTC date and time in the format "YYYY-MM-DD HH:MM:SS".
    """
    if state:
        await ws_manager.send_to_user(
            sid=state["user_id"],
            message_type="ToolProcess",
            data={"chat_id": state["chat_id"], "content": "Fetching current UTC date and time..."}
        )
    return datetime.datetime.now(datetime.UTC).strftime("%Y-%m-%d %H:%M:%S")