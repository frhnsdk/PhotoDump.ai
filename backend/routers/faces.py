"""
faces.py — Face recognition endpoints.
- GPU health check (so frontend knows if face search is available)
- Upload selfie → search for matching faces in a dump
- Index faces for a dump (owner can trigger manually)
"""

import os
import logging
from typing import Optional, List

from fastapi import (
    APIRouter, Depends, HTTPException, UploadFile, File,
    Header, Query,
)
from sqlalchemy.orm import Session

from database import get_db
import models
import schemas
import auth_utils
import gpu_client
from routers.dumps import get_dump_or_403
from routers.photos import dump_upload_dir

logger = logging.getLogger("faces")

router = APIRouter(prefix="/api", tags=["faces"])


# ── GPU Status ───────────────────────────────────────────────────────────────

@router.get("/gpu/status", response_model=schemas.GpuStatus)
async def gpu_status():
    """Check if the GPU face-recognition service is available."""
    result = await gpu_client.health_check()
    return schemas.GpuStatus(
        available=result.get("available", False),
        reason=result.get("reason"),
        model=result.get("model"),
        detector=result.get("detector"),
        mode=result.get("mode"),
    )


# ── Index faces for a dump ───────────────────────────────────────────────────

@router.post("/dumps/{dump_name}/index-faces")
async def index_faces(
    dump_name: str,
    dump_token: Optional[str] = Header(None, alias="X-Dump-Token"),
    current_user: Optional[models.User] = Depends(auth_utils.get_current_user),
    db: Session = Depends(get_db),
):
    """
    Index all photos in a dump that don't have face embeddings yet.
    Can be triggered by the owner or automatically after upload.
    """
    dump = get_dump_or_403(dump_name, dump_token, current_user, db)

    # Check GPU is available
    health = await gpu_client.health_check()
    if not health.get("available"):
        raise HTTPException(status_code=503, detail="GPU server is not up right now")

    # Find photos without embeddings
    already_indexed = (
        db.query(models.FaceEmbedding.photo_id)
        .filter(models.FaceEmbedding.dump_id == dump.id)
        .distinct()
        .subquery()
    )
    photos_to_index = (
        db.query(models.Photo)
        .filter(
            models.Photo.dump_id == dump.id,
            models.Photo.is_approved == True,
            ~models.Photo.id.in_(db.query(already_indexed.c.photo_id)),
        )
        .all()
    )

    indexed_count = 0
    face_count = 0
    for photo in photos_to_index:
        file_path = os.path.join(dump_upload_dir(dump.id), photo.filename)
        if not os.path.exists(file_path):
            continue


        with open(file_path, "rb") as f:
            photo_bytes = f.read()

        faces = await gpu_client.extract_embeddings(photo_bytes, photo.filename)
        if faces is None:
            logger.warning(f"GPU call failed for photo {photo.id}, skipping rest")
            break

        for face in faces:
            emb = models.FaceEmbedding(
                photo_id=photo.id,
                dump_id=dump.id,
                embedding=face["embedding"],
                bbox_x=face.get("bbox_x", 0),
                bbox_y=face.get("bbox_y", 0),
                bbox_w=face.get("bbox_w", 0),
                bbox_h=face.get("bbox_h", 0),
            )
            db.add(emb)
            face_count += 1
        indexed_count += 1

    db.commit()
    return {
        "message": f"Indexed {indexed_count} photos, found {face_count} faces",
        "photos_indexed": indexed_count,
        "faces_found": face_count,
    }


# ── Find my photos (selfie search) ──────────────────────────────────────────

@router.post("/dumps/{dump_name}/find-my-photos", response_model=List[schemas.FaceSearchResult])
async def find_my_photos(
    dump_name: str,
    file: UploadFile = File(...),
    threshold: Optional[float] = Query(None, ge=0.0, le=1.0),
    dump_token: Optional[str] = Header(None, alias="X-Dump-Token"),
    current_user: Optional[models.User] = Depends(auth_utils.get_current_user),
    db: Session = Depends(get_db),
):
    """
    Upload a selfie → find all photos in the dump that contain your face.
    """
    dump = get_dump_or_403(dump_name, dump_token, current_user, db)

    # Check GPU availability
    health = await gpu_client.health_check()
    if not health.get("available"):
        raise HTTPException(status_code=503, detail="GPU server is not up right now")

    # Extract face from the selfie
    selfie_data = await file.read()
    if not selfie_data:
        raise HTTPException(status_code=400, detail="Empty file")

    selfie_faces = await gpu_client.extract_embeddings(selfie_data, file.filename or "selfie.jpg")
    if selfie_faces is None:
        raise HTTPException(status_code=503, detail="GPU server is not up right now")
    if not selfie_faces:
        raise HTTPException(status_code=422, detail="No face detected in your photo. Please upload a clear photo of your face.")

    # Use the first (largest / most prominent) face in the selfie
    probe_embedding = selfie_faces[0]["embedding"]

    # Get all face embeddings for this dump
    all_embeddings = (
        db.query(models.FaceEmbedding)
        .filter(models.FaceEmbedding.dump_id == dump.id)
        .all()
    )

    if not all_embeddings:
        # No faces indexed yet — try indexing first
        raise HTTPException(
            status_code=404,
            detail="No faces have been indexed in this dump yet. The owner needs to index photos first."
        )

    # Build candidate list
    candidate_embeddings = [emb.embedding for emb in all_embeddings]

    # Find matches via GPU service
    matches = await gpu_client.find_matches(probe_embedding, candidate_embeddings, threshold)
    if matches is None:
        raise HTTPException(status_code=503, detail="GPU server is not up right now")

    # Map match indices back to photos
    results = []
    seen_photo_ids = set()
    for match in matches:
        idx = match["index"]
        if idx >= len(all_embeddings):
            continue
        face_emb = all_embeddings[idx]
        # Deduplicate by photo — only show each photo once (best match)
        if face_emb.photo_id in seen_photo_ids:
            continue
        seen_photo_ids.add(face_emb.photo_id)

        photo = db.query(models.Photo).filter(
            models.Photo.id == face_emb.photo_id,
            models.Photo.is_approved == True,
        ).first()
        if not photo:
            continue

        results.append(schemas.FaceSearchResult(
            photo_id=photo.id,
            original_name=photo.original_name,
            distance=match["distance"],
            bbox_x=face_emb.bbox_x,
            bbox_y=face_emb.bbox_y,
            bbox_w=face_emb.bbox_w,
            bbox_h=face_emb.bbox_h,
        ))

    return results
