import os
import uuid
import mimetypes
from pathlib import Path
from fastapi import UploadFile, HTTPException, status

from app.core.config import settings
from app.core.logging_config import get_logger

logger = get_logger(__name__)

# MIME type to extension mapping for validation
ALLOWED_MIME_TYPES = {
    "application/pdf": "pdf",
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
}


import hashlib

MAGIC_BYTE_SIGNATURES = {
    "pdf": [b"%PDF"],
    "jpg": [b"\xff\xd8\xff"],
    "jpeg": [b"\xff\xd8\xff"],
    "png": [b"\x89PNG\r\n\x1a\n"],
}


def validate_file_content(content: bytes, ext: str) -> None:
    """Validate magic bytes against expected file signatures."""
    if not content:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    signatures = MAGIC_BYTE_SIGNATURES.get(ext.lower())
    if signatures:
        if not any(content.startswith(sig) for sig in signatures):
            raise HTTPException(
                status_code=400,
                detail=f"File content does not match the declared extension '.{ext}'. Executable or malformed uploads are prohibited.",
            )


def validate_file(file: UploadFile) -> str:
    """Validate file type, MIME type, and return normalized extension."""
    if not file.filename:
        raise HTTPException(status_code=400, detail="File name is required")

    ext = Path(file.filename).suffix.lower().lstrip(".")
    if ext not in settings.allowed_extensions_list:
        raise HTTPException(
            status_code=400,
            detail=f"File type '{ext}' not allowed. Allowed: {', '.join(settings.allowed_extensions_list)}",
        )

    if file.content_type and file.content_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"MIME type '{file.content_type}' not allowed",
        )
    return ext


async def save_upload_file(
    file: UploadFile,
    claim_id: str,
    category: str,
) -> tuple[str, int, str, str]:
    """
    Save an uploaded file to the uploads directory.
    Validates magic bytes, enforces path traversal security, and calculates SHA-256 hash.
    Returns: (file_path, file_size, safe_filename, content_hash)
    """
    ext = validate_file(file)

    # Read and validate size
    content = await file.read()
    if len(content) > settings.max_file_size_bytes:
        raise HTTPException(
            status_code=400,
            detail=f"File size exceeds {settings.MAX_FILE_SIZE_MB}MB limit",
        )

    # Validate file magic bytes
    validate_file_content(content, ext)

    # Compute SHA-256 hash
    content_hash = hashlib.sha256(content).hexdigest()

    # Create directory with path traversal protection
    base_upload_dir = Path(settings.UPLOAD_DIR).resolve()
    # Sanitize claim_id to alphanumeric/dash only
    safe_claim_dir = "".join(c for c in claim_id if c.isalnum() or c in "-_")
    upload_dir = (base_upload_dir / "claims" / safe_claim_dir).resolve()

    # Ensure upload directory is strictly inside base upload directory
    if not str(upload_dir).startswith(str(base_upload_dir)):
        raise HTTPException(status_code=400, detail="Invalid path traversal attempt in claim identifier.")

    upload_dir.mkdir(parents=True, exist_ok=True)

    # Generate safe random UUID filename
    safe_name = f"{uuid.uuid4()}.{ext}"
    file_path = upload_dir / safe_name

    # Write file
    with open(file_path, "wb") as f:
        f.write(content)

    logger.info(f"Saved upload: {file_path} ({len(content)} bytes, sha256={content_hash[:8]}...)")
    return str(file_path), len(content), safe_name, content_hash


def delete_upload_file(file_path: str) -> bool:
    """Delete an uploaded file from disk."""
    try:
        path = Path(file_path)
        if path.exists():
            path.unlink()
            return True
    except Exception as e:
        logger.error(f"Failed to delete file {file_path}: {e}")
    return False
