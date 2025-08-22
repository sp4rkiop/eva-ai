from typing import Optional, Annotated
from langgraph.prebuilt import InjectedState
import sys, io, traceback, contextlib, datetime
from pydantic import BaseModel
from repositories.websocket_manager import ws_manager


class PythonCodeRunnerInput(BaseModel):
    code: str
    state: Annotated[dict, InjectedState]
    packages: Optional[list[str]] = None  # List of required packages for this run


class CurrentUtcDateTimeInput(BaseModel):
    state: Annotated[dict, InjectedState]


import tempfile
import subprocess
import os
import shlex


async def python_code_runner(
    code: str, state: Optional[dict] = None, packages: Optional[list[str]] = None
) -> str:
    """
    Executes a Python code snippet in a sandboxed subprocess and returns the result or error.
    Optionally installs required packages for this run.
    Args:
        code (str): Python code to execute
        packages (list[str], optional): List of required packages to install

    Returns:
        str: Output or error message
    """
    try:
        if state:
            await ws_manager.send_to_user(
                sid=state["user_id"],
                message_type="ToolProcess",
                data={
                    "chat_id": state["chat_id"],
                    "content": "Preparing sandbox environment...",
                },
            )

        with tempfile.TemporaryDirectory() as tmpdir:
            code_file = os.path.join(tmpdir, "user_code.py")
            with open(code_file, "w") as f:
                f.write(code)

            # Prepare the command to run the code
            python_cmd = [sys.executable, code_file]

            # If packages are specified, install them in the subprocess
            install_output = ""
            if packages:
                if state:
                    await ws_manager.send_to_user(
                        sid=state["user_id"],
                        message_type="ToolProcess",
                        data={
                            "chat_id": state["chat_id"],
                            "content": f"Installing packages: {', '.join(packages)}",
                        },
                    )
                # Install packages using pip
                pip_cmd = [sys.executable, "-m", "pip", "install"] + packages
                try:
                    pip_proc = subprocess.run(
                        pip_cmd,
                        stdout=subprocess.PIPE,
                        stderr=subprocess.STDOUT,
                        timeout=60,
                        cwd=tmpdir,
                        check=True,
                        text=True,
                    )
                    install_output = pip_proc.stdout
                except subprocess.CalledProcessError as e:
                    return f"Error installing packages:\n{e.output}"
                except subprocess.TimeoutExpired:
                    return "Package installation timed out."

            # Run the code in a subprocess with timeout and resource limits
            try:
                proc = subprocess.run(
                    python_cmd,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.STDOUT,
                    timeout=10,
                    cwd=tmpdir,
                    check=False,
                    text=True,
                )
                output = proc.stdout.strip()
                if install_output:
                    output = f"Package installation output:\n{install_output}\n\nCode output:\n{output}"
                return (
                    output
                    if output
                    else "Code ran successfully but did not return anything."
                )
            except subprocess.TimeoutExpired:
                return "Code execution timed out."
            except Exception as e:
                return f"Error during execution:\n{str(e)}"

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
            data={
                "chat_id": state["chat_id"],
                "content": "Fetching current UTC date and time...",
            },
        )
    return datetime.datetime.now(datetime.UTC).strftime("%Y-%m-%d %H:%M:%S")
