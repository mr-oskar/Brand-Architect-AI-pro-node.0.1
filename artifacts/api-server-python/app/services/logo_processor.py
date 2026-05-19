"""
Logo processing — generate black/white/grayscale variants and extract dominant colors.
Uses Pillow (already installed). No external dependencies needed.
"""
import base64
import io
import math
from typing import Optional

from PIL import Image


def data_url_to_image(data_url: str) -> Image.Image:
    """Convert a base64 data URL to a Pillow Image."""
    base64_data = data_url.split(",", 1)[-1]
    image_bytes = base64.b64decode(base64_data)
    return Image.open(io.BytesIO(image_bytes)).convert("RGBA")


def image_to_png_bytes(img: Image.Image) -> bytes:
    """Convert a Pillow Image to PNG bytes."""
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def generate_logo_variants(img: Image.Image) -> dict[str, bytes]:
    """
    Generate black, white, and grayscale variants of a logo image.
    Preserves alpha channel (transparency).
    Returns {black, white, grayscale} as PNG bytes.
    """
    img = img.convert("RGBA")
    r_data, g_data, b_data, a_data = img.split()

    # Black variant — keep alpha, set RGB to 0
    black = Image.new("RGBA", img.size, (0, 0, 0, 0))
    black.putalpha(a_data)

    # White variant — keep alpha, set RGB to 255
    white = Image.new("RGBA", img.size, (255, 255, 255, 0))
    white.putalpha(a_data)

    # Grayscale variant — luminosity-weighted gray, keep alpha
    gray_img = img.convert("LA").convert("RGBA")

    return {
        "black": image_to_png_bytes(black),
        "white": image_to_png_bytes(white),
        "grayscale": image_to_png_bytes(gray_img),
    }


def extract_logo_colors(img: Image.Image, num_colors: int = 6) -> list[str]:
    """
    Extract dominant colors from a logo, ignoring transparent and near-white/black pixels.
    Returns a list of hex color strings.
    """
    img = img.convert("RGBA").resize((80, 80), Image.LANCZOS)
    pixels = list(img.getdata())

    buckets: dict[str, dict] = {}
    for r, g, b, a in pixels:
        if a < 128:
            continue
        lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255
        if lum < 0.05 or lum > 0.97:
            continue

        # Quantize to buckets of 24
        rb = round(r / 24) * 24
        gb = round(g / 24) * 24
        bb = round(b / 24) * 24
        key = f"{rb},{gb},{bb}"
        if key not in buckets:
            buckets[key] = {"r": rb, "g": gb, "b": bb, "count": 0}
        buckets[key]["count"] += 1

    sorted_buckets = sorted(buckets.values(), key=lambda x: x["count"], reverse=True)
    selected: list[str] = []

    for bucket in sorted_buckets:
        if len(selected) >= num_colors:
            break
        hex_color = _to_hex(bucket["r"], bucket["g"], bucket["b"])
        if not any(_color_dist(hex_color, c) < 50 for c in selected):
            selected.append(hex_color)

    return selected


def _to_hex(r: int, g: int, b: int) -> str:
    return f"#{min(r, 255):02x}{min(g, 255):02x}{min(b, 255):02x}"


def _color_dist(h1: str, h2: str) -> float:
    def parse(h: str):
        n = int(h.lstrip("#"), 16)
        return (n >> 16) & 255, (n >> 8) & 255, n & 255

    r1, g1, b1 = parse(h1)
    r2, g2, b2 = parse(h2)
    return math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2)
