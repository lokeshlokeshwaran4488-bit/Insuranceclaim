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


def validate_file(file: UploadFile) -> None:
    """Validate file type and MIME type."""
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


async def save_upload_file(
    file: UploadFile,
    claim_id: str,
    category: str,
) -> tuple[str, int, str]:
    """
    Save an uploaded file to the uploads directory.
    Returns: (file_path, file_size, safe_filename)
    """
    validate_file(file)

    # Create directory
    upload_dir = Path(settings.UPLOAD_DIR) / "claims" / claim_id
    upload_dir.mkdir(parents=True, exist_ok=True)

    # Generate safe filename
    ext = Path(file.filename).suffix.lower()
    safe_name = f"{uuid.uuid4()}{ext}"
    file_path = upload_dir / safe_name

    # Read and validate size
    content = await file.read()
    if len(content) > settings.max_file_size_bytes:
        raise HTTPException(
            status_code=400,
            detail=f"File size exceeds {settings.MAX_FILE_SIZE_MB}MB limit",
        )

    # Write file
    with open(file_path, "wb") as f:
        f.write(content)

    logger.info(f"Saved upload: {file_path} ({len(content)} bytes)")
    return str(file_path), len(content), safe_name


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
