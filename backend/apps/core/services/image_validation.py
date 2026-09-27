"""Validate uploaded image bytes before they are stored."""
from __future__ import annotations

import struct
from dataclasses import dataclass
from io import BytesIO

from PIL import Image

# Pillow reports malformed input through several exception types; a PNG chunk
# with a bad checksum, for example, raises SyntaxError.
_MALFORMED_IMAGE_ERRORS = (
    OSError,
    SyntaxError,
    ValueError,
    EOFError,
    struct.error,
    Image.DecompressionBombError,
)


class InvalidImageError(ValueError):
    """Raised when uploaded bytes are not a readable image."""


@dataclass(frozen=True)
class ImageInfo:
    format: str
    width: int
    height: int


def inspect_image(payload: bytes) -> ImageInfo:
    """Verify that payload is a readable image and return its format and size."""
    try:
        with Image.open(BytesIO(payload)) as image:
            image.verify()
        with Image.open(BytesIO(payload)) as image:
            width, height = image.size
            return ImageInfo(format=(image.format or "").upper(), width=width, height=height)
    except _MALFORMED_IMAGE_ERRORS as exc:
        raise InvalidImageError("Unsupported image file") from exc
