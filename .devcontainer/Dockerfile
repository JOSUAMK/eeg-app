FROM mcr.microsoft.com/devcontainers/python:3.10

# Install Node.js and Vite
RUN curl -fsSL https://deb.nodesource.com/setup_18.x | bash - && \
    apt-get install -y nodejs && \
    npm install -g npm && \
    npm install -g vite

WORKDIR /workspaces/eeg-app
