"""
gpu_client.py — HTTP client for the GPU face-recognition microservice.
Talks to the GPU service over LAN (or localhost in single-server mode).
If the GPU service is unreachable, all calls return graceful fallbacks
so the main app continues to work (face search just becomes unavailable).
"""

import os
import logging
from typing import Optional
import httpx

logger = logging.getLogger("gpu_client")

GPU_SERVICE_URL = os.getenv("GPU_SERVICE_URL", "").rstrip("/")
GPU_TIMEOUT = float(os.getenv("GPU_TIMEOUT", "120"))  # seconds


def is_configured() -> bool:
    """Return True if GPU_SERVICE_URL is set (not empty)."""
    return bool(GPU_SERVICE_URL)


async def health_check() -> dict:
    """
    Check if the GPU service is reachable.
    Returns {"available": True/False, ...}
    """
    if not is_configured():
        return {"available": False, "reason": "GPU_SERVICE_URL not configured"}
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            r = await client.get(f"{GPU_SERVICE_URL}/health")
            r.raise_for_status()
            data = r.json()
            data["available"] = True
            return data
    except Exception as e:
        logger.warning(f"GPU health check failed: {e}")
        return {"available": False, "reason": str(e)}


async def extract_embeddings(photo_bytes: bytes, filename: str = "photo.jpg") -> Optional[list]:
    """
    Send a photo to the GPU service and get face embeddings back.
    Returns a list of dicts: [{embedding, bbox_x, bbox_y, bbox_w, bbox_h}, ...]
    Returns None if GPU service is unavailable.
    """
    if not is_configured():
        return None
    try:
        async with httpx.AsyncClient(timeout=GPU_TIMEOUT) as client:
            files = {"file": (filename, photo_bytes, "image/jpeg")}
            r = await client.post(f"{GPU_SERVICE_URL}/extract-embeddings", files=files)
            r.raise_for_status()
            data = r.json()
            return data.get("faces", [])
    except Exception as e:
        logger.warning(f"GPU extract_embeddings failed: {e}")
        return None


async def find_matches(
    probe_embedding: list,
    candidate_embeddings: list,
    threshold: Optional[float] = None
) -> Optional[list]:
    """
    Given a probe face embedding and candidate embeddings,
    returns list of matching indices with distances.
    Returns None if GPU service is unavailable.
    """
    if not is_configured():
        return None
    try:
        body = {
            "probe_embedding": probe_embedding,
            "candidate_embeddings": candidate_embeddings,
        }
        if threshold is not None:
            body["threshold"] = threshold
        async with httpx.AsyncClient(timeout=30) as client:
            r = await client.post(f"{GPU_SERVICE_URL}/find-matches", json=body)
            r.raise_for_status()
            data = r.json()
            return data.get("matches", [])
    except Exception as e:
        logger.warning(f"GPU find_matches failed: {e}")
        return None
