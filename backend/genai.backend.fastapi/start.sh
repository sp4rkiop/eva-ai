#!/bin/sh

# Start FastAPI server and wait for it to initialize
uvicorn main:app --host 0.0.0.0 --port 8000 &
UVICORN_PID=$!
sleep 2  # Adjust the sleep duration as needed to ensure Uvicorn is fully started


# Wait for all background processes to finish
wait $UVICORN_PID