FROM node:20-alpine

# Allow overriding the API base used by the frontend at build time.
ARG VITE_API_BASE="http://rust-backend:8000"
ENV VITE_API_BASE=${VITE_API_BASE}

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 5173

# Run the Vite dev server and bind to 0.0.0.0 so it's reachable from other containers.
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "5173"]
