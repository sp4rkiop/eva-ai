# Use an official Python runtime as a parent image
FROM python:3.12.11-slim

# Set the working directory in the container
WORKDIR /app

# Install uv
RUN pip install --no-cache-dir uv

# Install system dependencies required by LangChain document loaders
# RUN apt-get update && apt-get install -y --no-install-recommends \
#     build-essential \
#     gcc \
#     g++ \
#     libmagic-dev \
#     libpoppler-cpp-dev \
#     poppler-utils \
#     tesseract-ocr \
#     qpdf \
#  && rm -rf /var/lib/apt/lists/*

# Copy only dependency manifests first (for Docker layer caching)
COPY pyproject.toml uv.lock ./

# Install dependencies
RUN uv sync --frozen --no-dev

# Now copy the rest of the application code
COPY . .

# Expose the ports
EXPOSE 8000

# Starting FastAPI directly from the virtual environment
CMD ["/app/.venv/bin/uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
