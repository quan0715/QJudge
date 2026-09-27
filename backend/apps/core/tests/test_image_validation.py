"""Tests for inspecting uploaded image bytes."""

from io import BytesIO

import pytest
from PIL import Image

from apps.core.services import InvalidImageError, inspect_image


def _png(size=(4, 3)) -> bytes:
    buffer = BytesIO()
    Image.new("RGB", size, color=(255, 0, 0)).save(buffer, format="PNG")
    return buffer.getvalue()


def _png_with_bad_idat_checksum() -> bytes:
    data = bytearray(_png())
    data[data.index(b"IDAT") + 4] ^= 0xFF
    return bytes(data)


def test_inspect_image_reports_format_and_size():
    info = inspect_image(_png())

    assert (info.format, info.width, info.height) == ("PNG", 4, 3)


@pytest.mark.parametrize(
    "payload",
    [_png_with_bad_idat_checksum(), _png()[:16], b"not an image"],
    ids=["bad-idat-checksum", "truncated", "not-an-image"],
)
def test_inspect_image_rejects_malformed_bytes(payload):
    with pytest.raises(InvalidImageError):
        inspect_image(payload)


def test_inspect_image_rejects_decompression_bombs(monkeypatch):
    monkeypatch.setattr(Image, "MAX_IMAGE_PIXELS", 1)

    with pytest.raises(InvalidImageError):
        inspect_image(_png())
