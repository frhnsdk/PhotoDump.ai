from sqlalchemy import (
    Column, Integer, String, Boolean, DateTime, ForeignKey, Text, BigInteger, JSON
)
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
from database import Base


def utcnow():
    return datetime.now(timezone.utc).replace(tzinfo=None)


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, index=True, nullable=False)
    email = Column(String(255), unique=True, index=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    created_at = Column(DateTime, default=utcnow)

    dumps = relationship("Dump", back_populates="owner", foreign_keys="Dump.owner_id")
    photos = relationship("Photo", back_populates="uploader")


class Dump(Base):
    __tablename__ = "dumps"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), unique=True, index=True, nullable=False)
    description = Column(Text, nullable=True)
    password_hash = Column(String(255), nullable=False)
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    duration_days = Column(Integer, nullable=True)  # NULL = unlimited
    background_color = Column(String(7), default="#0d0f14")  # Hex color code
    created_at = Column(DateTime, default=utcnow)
    expires_at = Column(DateTime, nullable=True)
    is_deleted = Column(Boolean, default=False)

    owner = relationship("User", back_populates="dumps", foreign_keys=[owner_id])
    photos = relationship("Photo", back_populates="dump", cascade="all, delete-orphan")


class Photo(Base):
    __tablename__ = "photos"

    id = Column(Integer, primary_key=True, index=True)
    dump_id = Column(Integer, ForeignKey("dumps.id"), nullable=False)
    uploader_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    uploader_name = Column(String(100), nullable=True)
    filename = Column(String(255), nullable=False)
    original_name = Column(String(255), nullable=False)
    file_size = Column(BigInteger, default=0)
    is_contributor = Column(Boolean, default=False)  # uploaded by contributor
    is_approved = Column(Boolean, default=True)       # owner approval for contributor
    uploaded_at = Column(DateTime, default=utcnow)

    dump = relationship("Dump", back_populates="photos")
    uploader = relationship("User", back_populates="photos")
    face_embeddings = relationship("FaceEmbedding", back_populates="photo", cascade="all, delete-orphan")


class FaceEmbedding(Base):
    __tablename__ = "face_embeddings"

    id = Column(Integer, primary_key=True, index=True)
    photo_id = Column(Integer, ForeignKey("photos.id", ondelete="CASCADE"), nullable=False, index=True)
    dump_id = Column(Integer, ForeignKey("dumps.id", ondelete="CASCADE"), nullable=False, index=True)
    embedding = Column(JSON, nullable=False)         # list of 512 floats
    bbox_x = Column(Integer, default=0)
    bbox_y = Column(Integer, default=0)
    bbox_w = Column(Integer, default=0)
    bbox_h = Column(Integer, default=0)
    created_at = Column(DateTime, default=utcnow)

    photo = relationship("Photo", back_populates="face_embeddings")
    dump = relationship("Dump")
