import os
import uuid
import zipfile
import io
from typing import Optional, List

from fastapi import (
    APIRouter, Depends, HTTPException, UploadFile, File,
    Form, Header, BackgroundTasks
)
from fastapi.responses import FileResponse, StreamingResponse
from sqlalchemy.orm import Session

from database import get_db
import models
import schemas
import auth_utils
import gpu_client
from routers.dumps import get_dump_or_403, decode_dump_token

try:
    from PIL import Image
    PILLOW_AVAILABLE = True
except ImportError:
    PILLOW_AVAILABLE = False

router = APIRouter(prefix="/api/dumps", tags=["photos"])

DATA_DIR = os.getenv("DATA_DIR", "/app/data")
UPLOAD_DIR = os.path.join(DATA_DIR, "uploads")
THUMB_DIR = os.path.join(DATA_DIR, "thumbs")
os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(THUMB_DIR, exist_ok=True)

ALLOWED_TYPES = {
    "image/jpeg", "image/png", "image/gif", "image/webp",
    "image/bmp", "image/tiff", "image/heic", "image/heif",
}
MAX_FILE_SIZE = 50 * 1024 * 1024  # 50 MB per photo


def dump_upload_dir(dump_id: int) -> str:
    path = os.path.join(UPLOAD_DIR, str(dump_id))
    os.makedirs(path, exist_ok=True)
    return path


def dump_thumb_dir(dump_id: int) -> str:
    path = os.path.join(THUMB_DIR, str(dump_id))
    os.makedirs(path, exist_ok=True)
    return path


def make_thumbnail(src_path: str, thumb_path: str):
    if not PILLOW_AVAILABLE:
        return
    try:
        with Image.open(src_path) as img:
            # Resize to max width 600, preserving aspect ratio for Pinterest layout
            max_width = 600
            if img.width > max_width:
                ratio = max_width / img.width
                new_size = (max_width, int(img.height * ratio))
                img = img.resize(new_size, Image.LANCZOS)
            img = img.convert("RGB")
            img.save(thumb_path, "JPEG", quality=80)
    except Exception:
        pass


def resolve_dump(
    dump_name: str,
    dump_token: Optional[str],
    current_user: Optional[models.User],
    db: Session,
) -> models.Dump:
    return get_dump_or_403(dump_name, dump_token, current_user, db)


# ── Background face indexing ─────────────────────────────────────────────────

import asyncio
import logging

_face_logger = logging.getLogger("face_indexing")


async def _index_photos_batch(photos: list, dump_id: int):
    """Background task: index photos one at a time to avoid overwhelming the GPU."""
    if not gpu_client.is_configured():
        return
    for photo in photos:
        await _index_photo_faces(photo.id, dump_id,
            os.path.join(dump_upload_dir(dump_id), photo.filename), photo.filename)


async def _index_photo_faces(photo_id: int, dump_id: int, file_path: str, filename: str):
    """Send a single photo to GPU service for face extraction."""
    if not gpu_client.is_configured():
        return
    try:
        with open(file_path, "rb") as f:
            photo_bytes = f.read()
        faces = await gpu_client.extract_embeddings(photo_bytes, filename)
        if faces is None or not faces:
            return
        from database import SessionLocal
        db = SessionLocal()
        try:
            for face in faces:
                emb = models.FaceEmbedding(
                    photo_id=photo_id,
                    dump_id=dump_id,
                    embedding=face["embedding"],
                    bbox_x=face.get("bbox_x", 0),
                    bbox_y=face.get("bbox_y", 0),
                    bbox_w=face.get("bbox_w", 0),
                    bbox_h=face.get("bbox_h", 0),
                )
                db.add(emb)
            db.commit()
            _face_logger.info(f"Indexed {len(faces)} face(s) for photo {photo_id}")
        finally:
            db.close()
    except Exception as e:
        _face_logger.warning(f"Face indexing failed for photo {photo_id}: {e}")


# ── Upload photos ────────────────────────────────────────────────────────────

@router.post("/{dump_name}/photos", response_model=List[schemas.PhotoOut])
async def upload_photos(
    dump_name: str,
    files: List[UploadFile] = File(...),
    uploader_name: Optional[str] = Form(None),
    is_contributor: bool = Form(False),
    dump_token: Optional[str] = Header(None, alias="X-Dump-Token"),
    current_user: Optional[models.User] = Depends(auth_utils.get_current_user),
    db: Session = Depends(get_db),
):
    dump = resolve_dump(dump_name, dump_token, current_user, db)

    # Contributor uploads are pending approval; owner uploads are auto-approved
    is_owner = current_user and dump.owner_id == current_user.id
    auto_approve = is_owner or not is_contributor

    saved = []
    for file in files:
        content_type = file.content_type or ""
        base_ct = content_type.split(";")[0].strip()
        if base_ct not in ALLOWED_TYPES and not file.filename.lower().endswith(
            (".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".tiff", ".heic", ".heif")
        ):
            continue  # skip non-images silently

        data = await file.read()
        if len(data) > MAX_FILE_SIZE:
            continue

        ext = os.path.splitext(file.filename)[1] or ".jpg"
        uid = uuid.uuid4().hex
        stored_name = f"{uid}{ext}"
        file_path = os.path.join(dump_upload_dir(dump.id), stored_name)

        with open(file_path, "wb") as f:
            f.write(data)

        # Generate thumbnail
        thumb_path = os.path.join(dump_thumb_dir(dump.id), f"{uid}.jpg")
        make_thumbnail(file_path, thumb_path)

        uploader_display = uploader_name
        if current_user and not uploader_name:
            uploader_display = current_user.username

        photo = models.Photo(
            dump_id=dump.id,
            uploader_id=current_user.id if current_user else None,
            uploader_name=uploader_display,
            filename=stored_name,
            original_name=file.filename,
            file_size=len(data),
            is_contributor=is_contributor and not is_owner,
            is_approved=auto_approve,
        )
        db.add(photo)
        saved.append(photo)

    db.commit()
    for p in saved:
        db.refresh(p)

    # Trigger background face indexing sequentially (avoids overwhelming GPU)
    approved = [p for p in saved if p.is_approved]
    if approved:
        asyncio.create_task(_index_photos_batch(approved, dump.id))

    return saved


# ── List photos ──────────────────────────────────────────────────────────────

@router.get("/{dump_name}/photos", response_model=List[schemas.PhotoOut])
def list_photos(
    dump_name: str,
    include_pending: bool = False,
    dump_token: Optional[str] = Header(None, alias="X-Dump-Token"),
    current_user: Optional[models.User] = Depends(auth_utils.get_current_user),
    db: Session = Depends(get_db),
):
    dump = resolve_dump(dump_name, dump_token, current_user, db)
    is_owner = current_user and dump.owner_id == current_user.id

    query = db.query(models.Photo).filter(models.Photo.dump_id == dump.id)

    if include_pending and is_owner:
        pass  # owner sees all
    else:
        query = query.filter(models.Photo.is_approved == True)

    return query.order_by(models.Photo.uploaded_at.asc()).all()


# ── Serve photo file ─────────────────────────────────────────────────────────

@router.get("/{dump_name}/photos/{photo_id}/file")
def serve_photo(
    dump_name: str,
    photo_id: int,
    dump_token: Optional[str] = Header(None, alias="X-Dump-Token"),
    current_user: Optional[models.User] = Depends(auth_utils.get_current_user),
    db: Session = Depends(get_db),
):
    dump = resolve_dump(dump_name, dump_token, current_user, db)
    photo = db.query(models.Photo).filter(
        models.Photo.id == photo_id,
        models.Photo.dump_id == dump.id,
    ).first()
    if not photo:
        raise HTTPException(status_code=404, detail="Photo not found")

    # Non-owners cannot see unapproved contributor photos
    is_owner = current_user and dump.owner_id == current_user.id
    if not photo.is_approved and not is_owner:
        raise HTTPException(status_code=403, detail="Photo pending approval")

    file_path = os.path.join(dump_upload_dir(dump.id), photo.filename)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found on disk")

    return FileResponse(
        file_path,
        filename=photo.original_name,
        headers={"Cache-Control": "public, max-age=86400"},
    )


# ── Serve thumbnail ──────────────────────────────────────────────────────────

@router.get("/{dump_name}/photos/{photo_id}/thumb")
def serve_thumb(
    dump_name: str,
    photo_id: int,
    dump_token: Optional[str] = Header(None, alias="X-Dump-Token"),
    current_user: Optional[models.User] = Depends(auth_utils.get_current_user),
    db: Session = Depends(get_db),
):
    dump = resolve_dump(dump_name, dump_token, current_user, db)
    is_owner = current_user and dump.owner_id == current_user.id

    query = db.query(models.Photo).filter(
        models.Photo.id == photo_id,
        models.Photo.dump_id == dump.id,
    )
    # Non-owners can only see approved photo thumbnails
    if not is_owner:
        query = query.filter(models.Photo.is_approved == True)
    photo = query.first()
    if not photo:
        raise HTTPException(status_code=404, detail="Photo not found")

    uid = os.path.splitext(photo.filename)[0]
    thumb_path = os.path.join(dump_thumb_dir(dump.id), f"{uid}.jpg")
    if os.path.exists(thumb_path):
        return FileResponse(thumb_path, headers={"Cache-Control": "public, max-age=86400"})

    # Fallback to original
    file_path = os.path.join(dump_upload_dir(dump.id), photo.filename)
    if os.path.exists(file_path):
        return FileResponse(file_path, headers={"Cache-Control": "public, max-age=86400"})

    raise HTTPException(status_code=404, detail="File not found")


# ── Download single ──────────────────────────────────────────────────────────

@router.get("/{dump_name}/photos/{photo_id}/download")
def download_photo(
    dump_name: str,
    photo_id: int,
    dump_token: Optional[str] = Header(None, alias="X-Dump-Token"),
    current_user: Optional[models.User] = Depends(auth_utils.get_current_user),
    db: Session = Depends(get_db),
):
    dump = resolve_dump(dump_name, dump_token, current_user, db)
    photo = db.query(models.Photo).filter(
        models.Photo.id == photo_id,
        models.Photo.dump_id == dump.id,
        models.Photo.is_approved == True,
    ).first()
    if not photo:
        raise HTTPException(status_code=404, detail="Photo not found")

    file_path = os.path.join(dump_upload_dir(dump.id), photo.filename)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found on disk")

    return FileResponse(
        file_path,
        filename=photo.original_name,
        headers={"Content-Disposition": f'attachment; filename="{photo.original_name}"'},
    )


# ── Download all as ZIP ──────────────────────────────────────────────────────

@router.get("/{dump_name}/download-all")
def download_all(
    dump_name: str,
    ids: Optional[str] = None,  # comma-separated photo IDs, or all if None
    dump_token: Optional[str] = Header(None, alias="X-Dump-Token"),
    current_user: Optional[models.User] = Depends(auth_utils.get_current_user),
    db: Session = Depends(get_db),
):
    dump = resolve_dump(dump_name, dump_token, current_user, db)

    query = db.query(models.Photo).filter(
        models.Photo.dump_id == dump.id,
        models.Photo.is_approved == True,
    )
    if ids:
        id_list = [int(x) for x in ids.split(",") if x.strip().isdigit()]
        query = query.filter(models.Photo.id.in_(id_list))

    photos = query.all()
    if not photos:
        raise HTTPException(status_code=404, detail="No photos found")

    def zip_generator():
        buf = io.BytesIO()
        seen_names: dict[str, int] = {}
        with zipfile.ZipFile(buf, mode="w", compression=zipfile.ZIP_DEFLATED, allowZip64=True) as zf:
            for photo in photos:
                file_path = os.path.join(dump_upload_dir(dump.id), photo.filename)
                if not os.path.exists(file_path):
                    continue
                name = photo.original_name
                if name in seen_names:
                    seen_names[name] += 1
                    base, ext = os.path.splitext(name)
                    name = f"{base}_{seen_names[name]}{ext}"
                else:
                    seen_names[name] = 0
                zf.write(file_path, arcname=name)
        buf.seek(0)
        yield buf.read()

    return StreamingResponse(
        zip_generator(),
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{dump_name}.zip"'},
    )


# ── Delete photo ─────────────────────────────────────────────────────────────

@router.delete("/{dump_name}/photos/{photo_id}")
def delete_photo(
    dump_name: str,
    photo_id: int,
    current_user: models.User = Depends(auth_utils.require_user),
    db: Session = Depends(get_db),
):
    dump = db.query(models.Dump).filter(
        models.Dump.name == dump_name,
        models.Dump.is_deleted == False,
    ).first()
    if not dump:
        raise HTTPException(status_code=404, detail="Dump not found")
    if dump.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not the dump owner")

    photo = db.query(models.Photo).filter(
        models.Photo.id == photo_id,
        models.Photo.dump_id == dump.id,
    ).first()
    if not photo:
        raise HTTPException(status_code=404, detail="Photo not found")

    # Delete files from disk
    file_path = os.path.join(dump_upload_dir(dump.id), photo.filename)
    uid = os.path.splitext(photo.filename)[0]
    thumb_path = os.path.join(dump_thumb_dir(dump.id), f"{uid}.jpg")
    for p in [file_path, thumb_path]:
        if os.path.exists(p):
            os.remove(p)

    db.delete(photo)
    db.commit()
    return {"message": "Photo deleted"}


# ── Approve / reject contributor photo ──────────────────────────────────────

@router.patch("/{dump_name}/photos/{photo_id}/approve")
def approve_photo(
    dump_name: str,
    photo_id: int,
    approved: bool = True,
    current_user: models.User = Depends(auth_utils.require_user),
    db: Session = Depends(get_db),
):
    dump = db.query(models.Dump).filter(
        models.Dump.name == dump_name,
        models.Dump.is_deleted == False,
    ).first()
    if not dump:
        raise HTTPException(status_code=404, detail="Dump not found")
    if dump.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not the dump owner")

    photo = db.query(models.Photo).filter(
        models.Photo.id == photo_id,
        models.Photo.dump_id == dump.id,
    ).first()
    if not photo:
        raise HTTPException(status_code=404, detail="Photo not found")

    if not approved:
        # Delete rejected
        file_path = os.path.join(dump_upload_dir(dump.id), photo.filename)
        uid = os.path.splitext(photo.filename)[0]
        thumb_path = os.path.join(dump_thumb_dir(dump.id), f"{uid}.jpg")
        for p in [file_path, thumb_path]:
            if os.path.exists(p):
                os.remove(p)
        db.delete(photo)
    else:
        photo.is_approved = True

    db.commit()
    return {"message": "Photo approved" if approved else "Photo rejected"}
