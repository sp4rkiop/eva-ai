# Use an official Python runtime as a parent image
FROM python:3.13.3-slim

# Set the working directory in the container
WORKDIR /app

# Copy the current directory contents into the container at /app
COPY . /app

# Install any needed packages specified in requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Make the startup script executable
RUN chmod +x /app/start.sh

# Expose the ports
EXPOSE 8000

# Command to run the startup script
CMD ["/app/start.sh"]