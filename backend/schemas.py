from pydantic import BaseModel, EmailStr, field_validator
from typing import Optional
from datetime import datetime


# ── Auth ────────────────────────────────────────────────────────────────────

class UserCreate(BaseModel):
    username: str
    email: EmailStr
    password: str

    @field_validator("username")
    @classmethod
    def username_alphanumeric(cls, v: str) -> str:
        v = v.strip()
        if len(v) < 3:
            raise ValueError("Username must be at least 3 characters")
        if len(v) > 50:
            raise ValueError("Username must be at most 50 characters")
        return v

    @field_validator("password")
    @classmethod
    def password_length(cls, v: str) -> str:
        if len(v) < 6:
            raise ValueError("Password must be at least 6 characters")
        return v


class UserLogin(BaseModel):
    username: str
    password: str


class UserOut(BaseModel):
    id: int
    username: str
    email: str
    created_at: datetime

    model_config = {"from_attributes": True}


class Token(BaseModel):
    access_token: str
    token_type: str
    user: UserOut


# ── Dumps ───────────────────────────────────────────────────────────────────

class DumpCreate(BaseModel):
    name: str
    description: Optional[str] = None
    password: str
    duration_days: Optional[int] = None  # None = unlimited
    background_color: Optional[str] = "#0d0f14"

    @field_validator("name")
    @classmethod
    def name_valid(cls, v: str) -> str:
        v = v.strip()
        if len(v) < 3:
            raise ValueError("Dump name must be at least 3 characters")
        if len(v) > 100:
            raise ValueError("Dump name must be at most 100 characters")
        import re
        if not re.match(r"^[a-zA-Z0-9_\-\s]+$", v):
            raise ValueError("Dump name may only contain letters, numbers, spaces, hyphens, and underscores")
        return v

    @field_validator("password")
    @classmethod
    def password_length(cls, v: str) -> str:
        if len(v) < 4:
            raise ValueError("Dump password must be at least 4 characters")
        return v

    @field_validator("background_color")
    @classmethod
    def background_color_valid(cls, v: str) -> str:
        import re
        if not re.match(r"^#[0-9a-fA-F]{6}$", v):
            raise ValueError("Background color must be a valid hex color code (e.g., #ffffff)")
        return v


class DumpAccess(BaseModel):
    name: str
    password: str


class DumpOut(BaseModel):
    id: int
    name: str
    description: Optional[str]
    duration_days: Optional[int]
    background_color: str
    created_at: datetime
    expires_at: Optional[datetime]
    photo_count: int = 0
    total_size: int = 0
    owner_username: str = ""

    model_config = {"from_attributes": True}


# ── Photos ──────────────────────────────────────────────────────────────────

class PhotoOut(BaseModel):
    id: int
    dump_id: int
    uploader_name: Optional[str]
    original_name: str
    file_size: int
    is_contributor: bool
    is_approved: bool
    uploaded_at: datetime

    model_config = {"from_attributes": True}
