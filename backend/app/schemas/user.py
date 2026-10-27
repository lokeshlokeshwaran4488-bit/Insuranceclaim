from pydantic import BaseModel, EmailStr, field_validator
from typing import Optional
from datetime import datetime

ALLOWED_ROLES = {"CUSTOMER", "CLAIM_OFFICER", "ADMIN"}


class UserBase(BaseModel):
    full_name: str
    email: EmailStr
    phone: Optional[str] = None
    role: str = "CUSTOMER"

    @field_validator("role")
    @classmethod
    def valid_role(cls, v: str) -> str:
        if v not in ALLOWED_ROLES:
            raise ValueError(f"Role must be one of: {', '.join(ALLOWED_ROLES)}")
        return v


class UserCreate(UserBase):
    password: str


class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    profile_picture_url: Optional[str] = None


class UserAdminUpdate(UserUpdate):
    is_active: Optional[bool] = None
    role: Optional[str] = None

    @field_validator("role")
    @classmethod
    def valid_role(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in ALLOWED_ROLES:
            raise ValueError(f"Role must be one of: {', '.join(ALLOWED_ROLES)}")
        return v


class UserOut(BaseModel):
    id: str
    full_name: str
    email: str
    phone: Optional[str]
    role: str
    is_active: bool
    address: Optional[str]
    profile_picture_url: Optional[str]
    created_at: datetime
    updated_at: datetime
    total_claims: Optional[int] = 0

    model_config = {"from_attributes": True}


class UserListResponse(BaseModel):
    users: list[UserOut]
    total: int
    page: int
    page_size: int
