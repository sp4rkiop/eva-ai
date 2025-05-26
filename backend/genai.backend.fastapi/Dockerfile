# Use an official Python runtime as a parent image
FROM python:3.13.3-slim

# Set the working directory in the container
WORKDIR /app

# Copy only requirements.txt first to leverage Docker layer caching
COPY requirements.txt /app/

# Install dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of the application code
COPY . /app

# Make the startup script executable
RUN chmod +x /app/start.sh

# Expose the ports
EXPOSE 8000

# Command to run the startup script
CMD ["/app/start.sh"]