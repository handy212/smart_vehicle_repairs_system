"""Protected media URL helpers (presigned S3 or authenticated download API)."""
from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from django.conf import settings

if TYPE_CHECKING:
    from django.db.models.fields.files import FieldFile
    from rest_framework.request import Request

logger = logging.getLogger(__name__)


def get_protected_file_url(
    file_field: FieldFile | None,
    *,
    request: Request | None = None,
    download_path: str | None = None,
    expires_in: int | None = None,
) -> str | None:
    """
    Return a URL suitable for client access without public bucket ACLs.

    - S3: short-lived presigned GET URL
    - Local: authenticated API download path (never raw /media/ for private docs)
    """
    if not file_field or not getattr(file_field, 'name', None):
        return None

    expires = expires_in or getattr(settings, 'AWS_PRESIGNED_URL_EXPIRY', 3600)

    if getattr(settings, 'USE_S3', False):
        try:
            return _presigned_s3_url(file_field.name, expires)
        except Exception:
            logger.exception('Failed to generate presigned URL for %s', file_field.name)
            return None

    if request and download_path:
        return request.build_absolute_uri(download_path)

    # Dev fallback: direct media URL when explicitly served by Django
    if getattr(settings, 'SERVE_MEDIA', False) or settings.DEBUG:
        return file_field.url

    if request and download_path:
        return request.build_absolute_uri(download_path)
    return None


def _presigned_s3_url(object_key: str, expires_in: int) -> str:
    import boto3
    from botocore.config import Config

    client = boto3.client(
        's3',
        region_name=getattr(settings, 'AWS_S3_REGION_NAME', 'us-east-1'),
        aws_access_key_id=getattr(settings, 'AWS_ACCESS_KEY_ID', None),
        aws_secret_access_key=getattr(settings, 'AWS_SECRET_ACCESS_KEY', None),
        config=Config(signature_version='s3v4'),
    )
    return client.generate_presigned_url(
        'get_object',
        Params={
            'Bucket': settings.AWS_STORAGE_BUCKET_NAME,
            'Key': object_key,
        },
        ExpiresIn=expires_in,
    )
