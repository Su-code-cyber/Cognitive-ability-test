"""Consistent necessary redaction of withdrawn image data in textual AI records."""
import base64
import binascii
import hashlib
import re

IMAGE_URL = re.compile(r"data:image/[\w+.-]+;base64,([A-Za-z0-9+/=]+)")


def image_hash(match):
    try:
        return hashlib.sha256(base64.b64decode(match.group(1), validate=True)).hexdigest()
    except (ValueError, binascii.Error):
        return None


def redact_images(text, blocked_hashes, replacement):
    return IMAGE_URL.sub(lambda match: replacement if image_hash(match) in blocked_hashes else match.group(0), text)


def contains_withdrawn_image(text, blocked_hashes):
    return any(image_hash(match) in blocked_hashes for match in IMAGE_URL.finditer(text))
