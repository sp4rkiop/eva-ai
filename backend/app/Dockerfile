# Use an official Python runtime as a parent image
FROM python:3.12.11-slim

# Set the working directory in the container
WORKDIR /app

# Install uv
RUN curl -LsSf https://astral.sh/uv/install.sh | sh

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

# Install dependencies into the system Python
ENV UV_SYSTEM_PYTHON=1
RUN uv sync --frozen --no-dev

# Now copy the rest of the application code
COPY . .

# Make the startup script executable
RUN chmod +x /app/start.sh

# Expose the ports
EXPOSE 8000

# Command to run the startup script
CMD ["/app/start.sh"]
