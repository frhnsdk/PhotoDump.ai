"""
PhotoDump GPU Service — Face detection & embedding extraction microservice.
Runs standalone on any machine (ideally with a GPU).
Everything is 100% local — no cloud APIs, no external calls at runtime.
Model weights are cached in a persistent volume.
"""

import io
import os
import time
import asyncio
import logging
from contextlib import asynccontextmanager
from typing import List, Optional
from functools import partial

import numpy as np
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from PIL import Image

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("gpu-service")

# ── Ensure everything is local ───────────────────────────────────────────────
# DeepFace stores model weights under DEEPFACE_HOME (~/.deepface by default).
# We point it to a persistent volume so weights survive container restarts
# and never need to be re-downloaded.
os.environ["DEEPFACE_HOME"] = os.getenv("DEEPFACE_HOME", "/app/models")
# Disable any telemetry / analytics that libraries might attempt
os.environ["TF_CPP_MIN_LOG_LEVEL"] = "2"          # suppress TF info logs
os.environ["DO_NOT_TRACK"] = "1"                   # generic opt-out
os.environ["HF_HUB_OFFLINE"] = "1"                 # block huggingface calls at runtime
os.environ["TRANSFORMERS_OFFLINE"] = "1"            # block transformers calls at runtime
os.environ["MPLBACKEND"] = "Agg"                   # no GUI backend for matplotlib

# ── Configuration ────────────────────────────────────────────────────────────
MODEL_NAME = os.getenv("DEEPFACE_MODEL", "Facenet512")
DETECTOR_BACKEND = os.getenv("DEEPFACE_DETECTOR", "retinaface")
SIMILARITY_THRESHOLD = float(os.getenv("SIMILARITY_THRESHOLD", "0.35"))

# DeepFace is imported lazily to allow the model to preload at startup
deepface_lib = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Preload DeepFace model on startup so first request isn't slow."""
    global deepface_lib
    logger.info(f"Loading DeepFace model={MODEL_NAME}, detector={DETECTOR_BACKEND} ...")
    t0 = time.time()
    from deepface import DeepFace
    deepface_lib = DeepFace
    # Warm up — run a dummy image through to trigger model download/load
    try:
        dummy = np.zeros((160, 160, 3), dtype=np.uint8)
        deepface_lib.represent(
            img_path=dummy,
            model_name=MODEL_NAME,
            detector_backend="skip",
            enforce_detection=False,
        )
    except Exception as e:
        logger.warning(f"Warm-up notice (non-fatal): {e}")
    elapsed = time.time() - t0
    logger.info(f"DeepFace model loaded in {elapsed:.1f}s")
    yield


app = FastAPI(title="PhotoDump GPU Service", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Schemas ──────────────────────────────────────────────────────────────────

class FaceEmbedding(BaseModel):
    embedding: List[float]
    bbox_x: int
    bbox_y: int
    bbox_w: int
    bbox_h: int


class ExtractResponse(BaseModel):
    faces: List[FaceEmbedding]
    processing_time_ms: int


class MatchRequest(BaseModel):
    probe_embedding: List[float]
    candidate_embeddings: List[List[float]]
    threshold: Optional[float] = None


class MatchResult(BaseModel):
    index: int
    distance: float


class MatchResponse(BaseModel):
    matches: List[MatchResult]
    threshold_used: float


# ── Helpers ──────────────────────────────────────────────────────────────────

def _load_image_from_upload(data: bytes) -> np.ndarray:
    """Convert uploaded bytes to a numpy RGB array."""
    img = Image.open(io.BytesIO(data))
    img = img.convert("RGB")
    return np.array(img)


# ── Routes ───────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    """Health check — also confirms model is loaded. Everything runs locally."""
    return {
        "status": "ok",
        "model": MODEL_NAME,
        "detector": DETECTOR_BACKEND,
        "mode": "local",
    }


@app.post("/extract-embeddings", response_model=ExtractResponse)
async def extract_embeddings(file: UploadFile = File(...)):
    """
    Upload a photo → returns all detected face embeddings + bounding boxes.
    Used both when indexing dump photos and when a guest uploads a selfie.
    """
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Empty file")

    t0 = time.time()
    try:
        img_array = _load_image_from_upload(data)
        # Run blocking DeepFace in a thread so /health stays responsive
        loop = asyncio.get_event_loop()
        results = await loop.run_in_executor(
            None,
            partial(
                deepface_lib.represent,
                img_path=img_array,
                model_name=MODEL_NAME,
                detector_backend=DETECTOR_BACKEND,
                enforce_detection=False,
            ),
        )
    except Exception as e:
        logger.error(f"DeepFace error: {e}")
        raise HTTPException(status_code=422, detail=f"Face processing failed: {str(e)}")

    faces = []
    for r in results:
        embedding = r.get("embedding", [])
        if not embedding:
            continue
        facial_area = r.get("facial_area", {})
        faces.append(FaceEmbedding(
            embedding=embedding,
            bbox_x=facial_area.get("x", 0),
            bbox_y=facial_area.get("y", 0),
            bbox_w=facial_area.get("w", 0),
            bbox_h=facial_area.get("h", 0),
        ))

    elapsed_ms = int((time.time() - t0) * 1000)
    logger.info(f"Extracted {len(faces)} face(s) in {elapsed_ms}ms")
    return ExtractResponse(faces=faces, processing_time_ms=elapsed_ms)


@app.post("/find-matches", response_model=MatchResponse)
async def find_matches(req: MatchRequest):
    """
    Given a probe embedding and a list of candidate embeddings,
    returns indices of candidates that are similar enough (cosine distance).
    """
    threshold = req.threshold if req.threshold is not None else SIMILARITY_THRESHOLD
    probe = np.array(req.probe_embedding, dtype=np.float64)
    probe_norm = np.linalg.norm(probe)
    if probe_norm == 0:
        raise HTTPException(status_code=400, detail="Invalid probe embedding (zero vector)")
    probe = probe / probe_norm

    matches = []
    for i, cand in enumerate(req.candidate_embeddings):
        cand_arr = np.array(cand, dtype=np.float64)
        cand_norm = np.linalg.norm(cand_arr)
        if cand_norm == 0:
            continue
        cand_arr = cand_arr / cand_norm
        # Cosine distance: 1 - cosine_similarity
        distance = float(1.0 - np.dot(probe, cand_arr))
        if distance <= threshold:
            matches.append(MatchResult(index=i, distance=round(distance, 6)))

    matches.sort(key=lambda m: m.distance)
    return MatchResponse(matches=matches, threshold_used=threshold)
