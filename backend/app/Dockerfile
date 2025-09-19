# Use an official Python runtime as a parent image
FROM python:3.13.3-slim

# Set the working directory in the container
WORKDIR /app

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

# Copy only requirements.txt first to leverage Docker layer caching
COPY requirements.txt /app/

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of the application code
COPY . /app

# Make the startup script executable
RUN chmod +x /app/start.sh

# Expose the ports
EXPOSE 8000

# Command to run the startup script
CMD ["/app/start.sh"]
