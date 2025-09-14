# Use an official and slim Python runtime as a parent image for a smaller final size.
FROM python:3.9-slim

# Set the working directory inside the container to /app.
# All subsequent commands will run from this directory.
WORKDIR /app

# Copy the requirements file first. This is a best practice for Docker layer caching.
# If requirements.txt doesn't change, Docker can reuse this layer, speeding up future builds.
COPY requirements.txt .

# Install the Python dependencies specified in requirements.txt.
# --no-cache-dir ensures that pip doesn't store the download cache, making the image smaller.
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of your application's source code (app.py, detector.py, etc.)
# and model files into the container at /app.
COPY . .

# Define the command to run your application using Gunicorn, a production-ready web server.
# This is more robust than using Flask's built-in server for production deployments.
CMD ["python", "app.py"]