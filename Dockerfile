# ── Builder stage ────────────────────────────────────────────────────────────
FROM python:3.12-slim AS builder

WORKDIR /app

# Install build deps for psycopg2
RUN apt-get update && apt-get install -y --no-install-recommends \
        gcc libpq-dev \
    && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt .
RUN pip install --upgrade pip && \
    pip install --prefix=/install --no-cache-dir -r requirements.txt


# ── Runtime stage ────────────────────────────────────────────────────────────
FROM python:3.12-slim

WORKDIR /app

# Runtime lib for psycopg2
RUN apt-get update && apt-get install -y --no-install-recommends \
        libpq5 \
    && rm -rf /var/lib/apt/lists/*

# Copy installed packages from builder
COPY --from=builder /install /usr/local

# Copy app code
COPY backend/ ./backend/
COPY frontend/ ./frontend/

WORKDIR /app/backend

# Data volume for uploaded photos / thumbnails
VOLUME ["/app/data"]

EXPOSE 8000

ENV PYTHONUNBUFFERED=1 \
    FRONTEND_DIR=/app/frontend \
    DATA_DIR=/app/data

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
