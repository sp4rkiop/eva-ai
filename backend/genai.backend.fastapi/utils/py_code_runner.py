from langchain_core.tools import Tool
import sys, io, traceback, contextlib, datetime
from pydantic import BaseModel, Field

class PythonCodeRunnerInput(BaseModel):
    code: str = Field(..., description="Python code to run")

async def python_code_runner(code: str) -> str:
    """
    Executes a Python code snippet and returns the result or error.
    First check if the code is valid, modify it if not.
    Args:
        code (str): Python code to execute

    Returns:
        str: Output or error message
    """
    try:
        print(code)
        # Redirect stdout
        stdout = io.StringIO()
        with contextlib.redirect_stdout(stdout):
            # Only allow expressions and statements, not dangerous stuff
            exec(code, {})  # optionally use a restricted context instead of {}

        output = stdout.getvalue().strip()
        print("output:", output)
        return output if output else "Code ran successfully but did not return anything."

    except Exception:
        return "Error during execution:\n" + traceback.format_exc()

async def current_utc_date_time( _: str) -> str:
    """
    Returns the current UTC date and time in the format "YYYY-MM-DD HH:MM:SS".
    """
    dt = datetime.datetime.now(datetime.UTC).strftime("%Y-%m-%d %H:%M:%S")
    print(dt)
    return dt