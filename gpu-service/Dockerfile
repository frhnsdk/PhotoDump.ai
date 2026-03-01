# ── PhotoDump GPU Service (NVIDIA CUDA) ──────────────────────────────────────
# Deploy to any machine with an NVIDIA GPU:
#   1. Install nvidia-container-toolkit on the host
#   2. docker compose up -d --build
#
# 100% LOCAL — model weights are downloaded at build time and baked into
# the image. No internet access needed at runtime.
# Uses NVIDIA CUDA for GPU-accelerated face recognition.


FROM nvidia/cuda:12.2.2-cudnn8-runtime-ubuntu22.04

# Set timezone non-interactively to avoid geo prompt
ENV DEBIAN_FRONTEND=noninteractive
ENV TZ=Etc/UTC
RUN apt-get update && \
    apt-get install -y --no-install-recommends tzdata && \
    ln -fs /usr/share/zoneinfo/Etc/UTC /etc/localtime && \
    dpkg-reconfigure --frontend noninteractive tzdata && \
    apt-get install -y --no-install-recommends \
        software-properties-common && \
    add-apt-repository ppa:deadsnakes/ppa && \
    apt-get update && apt-get install -y --no-install-recommends \
        python3.12 python3.12-venv python3.12-dev \
        libgl1 libglib2.0-0 && \
    update-alternatives --install /usr/bin/python3 python3 /usr/bin/python3.12 1 && \
    update-alternatives --install /usr/bin/python python /usr/bin/python3.12 1 && \
    python3.12 -m ensurepip --upgrade && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Use a venv to avoid conflicts with system packages
RUN python -m venv /app/venv
ENV PATH="/app/venv/bin:$PATH"

COPY requirements.txt .
RUN pip install --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

COPY main.py .

# ── Pre-download model weights at build time ────────────────────────────────
# This bakes the weights into the image so the container works fully offline.
ENV DEEPFACE_HOME=/app/models
RUN python -c "\
import os, numpy as np; \
os.environ['DEEPFACE_HOME']='/app/models'; \
from deepface import DeepFace; \
img = np.zeros((160,160,3), dtype=np.uint8); \
DeepFace.represent(img, model_name='Facenet512', detector_backend='retinaface', enforce_detection=False); \
print('Models downloaded OK')"

# Persistent volume for any runtime cache (optional, models already in image)
VOLUME ["/app/models"]

EXPOSE 5050

ENV PYTHONUNBUFFERED=1 \
    DEEPFACE_HOME=/app/models \
    DEEPFACE_MODEL=Facenet512 \
    DEEPFACE_DETECTOR=retinaface \
    SIMILARITY_THRESHOLD=0.35 \
    TF_CPP_MIN_LOG_LEVEL=2 \
    DO_NOT_TRACK=1 \
    HF_HUB_OFFLINE=1 \
    TRANSFORMERS_OFFLINE=1 \
    NVIDIA_VISIBLE_DEVICES=all \
    NVIDIA_DRIVER_CAPABILITIES=compute,utility

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "5050"]
