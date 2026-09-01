# --- Stage 1: Build the React Frontend ---
FROM node:18-alpine AS frontend-builder
WORKDIR /app/frontend

# Copy dependencies first for Docker layer caching
COPY frontend/package*.json ./
RUN npm install --legacy-peer-deps

# Copy the rest of the frontend code and build it
COPY frontend/ ./
RUN GENERATE_SOURCEMAP=false npm run build

# --- Stage 2: Build the FastAPI Backend & Serve Frontend ---
FROM python:3.10-slim
WORKDIR /app

# Install system dependencies (like build-essential)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Install python dependencies
COPY backend/requirements.txt ./backend/
RUN pip install --no-cache-dir -r backend/requirements.txt

# Copy backend application code
COPY backend/ ./backend/

# Copy the pre-built React frontend static assets from Stage 1
COPY --from=frontend-builder /app/frontend/build ./backend/frontend_build

# ── Environment Variables ────────────────────────────────────────────────────
# Runtime
ENV ENVIRONMENT=production
ENV FORCE_HTTPS=true
ENV LOG_FORMAT=json
ENV PORT=8000

# Auth credentials
ENV JWT_SECRET="triad-realty-super-secure-production-jwt-token-secret-2026-key"
ENV DEVELOPER_EMAIL=developer@triad.ae
ENV DEVELOPER_PASSWORD="Dev@Triad2024!"
ENV OWNER_EMAIL=owner@triad.ae
ENV OWNER_PASSWORD="Own@Triad2024!"
ENV STAFF_EMAIL=normal@triad.ae
ENV STAFF_PASSWORD="Staff@Triad2024!"

# Database
ENV MONGO_URI="mongodb+srv://king8637g4ff_db_user:Triad123456@triad-cluster.zfjnhni.mongodb.net/triad_realty?retryWrites=true&w=majority&appName=triad-cluster"
ENV DB_NAME=triad_realty

# Hosts & CORS
ENV ALLOWED_HOSTS=webtriad-9.onrender.com,*.onrender.com,localhost,127.0.0.1
ENV CORS_ORIGINS=https://webtriad-9.onrender.com

# Cloudinary — persistent image storage
ENV CLOUDINARY_CLOUD_NAME=""
ENV CLOUDINARY_API_KEY=""
ENV CLOUDINARY_API_SECRET=""

# Optional
ENV REELLY_API_BASE=https://search-listings-production.up.railway.app/v1
ENV REELLY_API_KEY=
ENV DEFAULT_ORG_ID=default-org
ENV TARGET_PROJECT_COUNT=100
# ────────────────────────────────────────────────────────────────────────────

# Expose the default FastAPI port
EXPOSE 8000

# Set working directory to backend folder to run server
WORKDIR /app/backend

# Run FastAPI app
CMD ["sh", "-c", "uvicorn server:app --host 0.0.0.0 --port ${PORT:-8000}"]
