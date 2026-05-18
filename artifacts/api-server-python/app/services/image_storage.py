"""
Image Storage Service.

Stores AI-generated images either locally (default) or in Replit Object Storage
when PRIVATE_OBJECT_DIR is set.

Extension points:
  - S3/GCS: implement an S3StorageBackend class and swap it in.
  - CDN: wrap upload with a CDN invalidation call.
  - Image optimization: run Pillow resize/compress before storing.
"""
import os
import uuid
import mimetypes
from pathlib import Path
from typing import Optional

from app.config import settings

LOCAL_UPLOAD_DIR = Path(__file__).parent.parent.parent / "uploads"


def _has_object_storage() -> bool:
    return bool(settings.private_object_dir)


def _ensure_local_dir() -> None:
    LOCAL_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


def upload_image_bytes(data: bytes, content_type: str = "image/png") -> str:
    """
    Store image bytes. Returns normalized object path: /objects/uploads/<uuid>
    The object path is stored in the DB; use storage_path_to_url() for the API URL.
    """
    object_id = str(uuid.uuid4())

    if _has_object_storage():
        # Replit Object Storage (GCS bucket)
        try:
            from google.cloud import storage as gcs  # type: ignore
            full_path = f"{settings.private_object_dir}/uploads/{object_id}"
            parts = full_path.lstrip("/").split("/", 1)
            bucket_name, object_name = parts[0], parts[1] if len(parts) > 1 else object_id
            client = gcs.Client()
            bucket = client.bucket(bucket_name)
            blob = bucket.blob(object_name)
            blob.upload_from_string(data, content_type=content_type)
        except Exception:
            # Fallback to local if GCS unavailable
            _save_local(object_id, data, content_type)
    else:
        _save_local(object_id, data, content_type)

    return f"/objects/uploads/{object_id}"


def _save_local(object_id: str, data: bytes, content_type: str) -> None:
    _ensure_local_dir()
    ext = "jpg" if "jpeg" in content_type else "png"
    file_path = LOCAL_UPLOAD_DIR / f"{object_id}.{ext}"
    file_path.write_bytes(data)
    # Store content-type alongside file
    (LOCAL_UPLOAD_DIR / f"{object_id}.{ext}.meta").write_text(content_type)


def get_stored_image(object_path: str) -> Optional[tuple[bytes, str]]:
    """
    Retrieve stored image. Returns (bytes, content_type) or None.

    object_path format: /objects/uploads/<uuid>
    """
    UUID_RE = r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$"
    import re

    if _has_object_storage():
        try:
            from google.cloud import storage as gcs  # type: ignore
            entity_id = object_path.lstrip("/objects/")
            full_path = f"{settings.private_object_dir}/{entity_id}"
            parts = full_path.lstrip("/").split("/", 1)
            bucket_name, object_name = parts[0], parts[1]
            client = gcs.Client()
            bucket = client.bucket(bucket_name)
            blob = bucket.blob(object_name)
            if not blob.exists():
                return None
            data = blob.download_as_bytes()
            content_type = blob.content_type or "image/png"
            return data, content_type
        except Exception:
            pass

    # Local fallback
    object_id = object_path.replace("/objects/uploads/", "").strip("/")
    if not re.match(UUID_RE, object_id, re.IGNORECASE):
        return None

    for ext in ["png", "jpg"]:
        file_path = LOCAL_UPLOAD_DIR / f"{object_id}.{ext}"
        if file_path.exists():
            data = file_path.read_bytes()
            meta_path = LOCAL_UPLOAD_DIR / f"{object_id}.{ext}.meta"
            content_type = meta_path.read_text().strip() if meta_path.exists() else (
                "image/png" if ext == "png" else "image/jpeg"
            )
            return data, content_type

    return None


def storage_path_to_url(object_path: str) -> str:
    """Convert internal object path to public API URL."""
    return f"/api/storage/images{object_path}"
