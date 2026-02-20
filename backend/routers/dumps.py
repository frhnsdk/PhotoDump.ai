from fastapi import APIRouter, Depends, HTTPException, Header
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import datetime, timedelta, timezone
from typing import Optional
from jose import JWTError, jwt
from database import get_db
import models
import schemas
import auth_utils
import os

router = APIRouter(prefix="/api/dumps", tags=["dumps"])

SECRET_KEY = auth_utils.SECRET_KEY
ALGORITHM = auth_utils.ALGORITHM


# ── Dump access token helpers ────────────────────────────────────────────────

def create_dump_token(dump_id: int) -> str:
    """Create a short-lived token that proves the holder knows the dump password."""
    data = {"dump_id": dump_id, "exp": datetime.now(timezone.utc) + timedelta(hours=24)}
    return jwt.encode(data, SECRET_KEY, algorithm=ALGORITHM)


def decode_dump_token(token: str) -> Optional[int]:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return int(payload["dump_id"])
    except (JWTError, KeyError, TypeError):
        return None


def get_dump_or_403(
    dump_name: str,
    dump_token: Optional[str],
    current_user: Optional[models.User],
    db: Session,
) -> models.Dump:
    dump = db.query(models.Dump).filter(
        models.Dump.name == dump_name,
        models.Dump.is_deleted == False,
    ).first()
    if not dump:
        raise HTTPException(status_code=404, detail="Dump not found")

    # Owner always has access
    if current_user and dump.owner_id == current_user.id:
        return dump

    # Check dump token
    if dump_token:
        tid = decode_dump_token(dump_token)
        if tid == dump.id:
            return dump

    raise HTTPException(status_code=403, detail="Invalid or missing dump access token")


def dump_summary(dump: models.Dump, db: Session) -> dict:
    approved_photos = [p for p in dump.photos if p.is_approved]
    total_size = sum(p.file_size for p in approved_photos)
    return {
        "id": dump.id,
        "name": dump.name,
        "description": dump.description,
        "duration_days": dump.duration_days,
        "background_color": dump.background_color,
        "created_at": dump.created_at,
        "expires_at": dump.expires_at,
        "photo_count": len(approved_photos),
        "total_size": total_size,
        "owner_username": dump.owner.username if dump.owner else "",
    }


# ── Routes ──────────────────────────────────────────────────────────────────

@router.post("/", response_model=schemas.DumpOut)
def create_dump(
    payload: schemas.DumpCreate,
    current_user: models.User = Depends(auth_utils.require_user),
    db: Session = Depends(get_db),
):
    # Only block if an active (non-deleted) dump already uses this name
    if db.query(models.Dump).filter(
        models.Dump.name == payload.name,
        models.Dump.is_deleted == False,
    ).first():
        raise HTTPException(status_code=400, detail="Dump name already taken")

    expires_at = None
    if payload.duration_days:
        expires_at = datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(days=payload.duration_days)

    dump = models.Dump(
        name=payload.name,
        description=payload.description,
        password_hash=auth_utils.hash_password(payload.password),
        owner_id=current_user.id,
        duration_days=payload.duration_days,
        background_color=payload.background_color,
        expires_at=expires_at,
    )
    db.add(dump)
    db.commit()
    db.refresh(dump)
    return dump_summary(dump, db)


@router.get("/", response_model=list[schemas.DumpOut])
def list_my_dumps(
    current_user: models.User = Depends(auth_utils.require_user),
    db: Session = Depends(get_db),
):
    dumps = db.query(models.Dump).filter(
        models.Dump.owner_id == current_user.id,
        models.Dump.is_deleted == False,
    ).order_by(models.Dump.created_at.desc()).all()
    return [dump_summary(d, db) for d in dumps]


@router.post("/access")
def access_dump(
    payload: schemas.DumpAccess,
    db: Session = Depends(get_db),
):
    dump = db.query(models.Dump).filter(
        models.Dump.name == payload.name,
        models.Dump.is_deleted == False,
    ).first()
    if not dump:
        raise HTTPException(status_code=404, detail="Dump not found")
    if not auth_utils.verify_password(payload.password, dump.password_hash):
        raise HTTPException(status_code=401, detail="Wrong password")
    if dump.expires_at and dump.expires_at < datetime.now(timezone.utc).replace(tzinfo=None):
        raise HTTPException(status_code=410, detail="This dump has expired and been deleted")

    token = create_dump_token(dump.id)
    summary = dump_summary(dump, db)
    summary["dump_token"] = token
    return summary


@router.get("/{dump_name}", response_model=schemas.DumpOut)
def get_dump(
    dump_name: str,
    dump_token: Optional[str] = Header(None, alias="X-Dump-Token"),
    current_user: Optional[models.User] = Depends(auth_utils.get_current_user),
    db: Session = Depends(get_db),
):
    dump = get_dump_or_403(dump_name, dump_token, current_user, db)
    return dump_summary(dump, db)


@router.patch("/{dump_name}", response_model=schemas.DumpOut)
def update_dump(
    dump_name: str,
    payload: dict,
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

    # Update only provided fields
    if "description" in payload:
        dump.description = payload["description"]
    if "background_color" in payload:
        import re
        if re.match(r'^#[0-9a-fA-F]{6}$', payload["background_color"]):
            dump.background_color = payload["background_color"]

    db.commit()
    db.refresh(dump)
    return dump_summary(dump, db)


@router.delete("/{dump_name}")
def delete_dump(
    dump_name: str,
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

    # Rename to free up the name for reuse (soft-delete preserves record)
    dump.name = f"_deleted_{dump.id}_{dump.name}"
    dump.is_deleted = True
    db.commit()
    return {"message": "Dump deleted"}
