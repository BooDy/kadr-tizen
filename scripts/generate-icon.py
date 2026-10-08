#!/usr/bin/env python3
"""
Generate Samsung Smart TV Launcher Icon and copy Kadr brand assets.
"""

import os
import shutil
from pathlib import Path
from PIL import Image

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent
SOURCE_LOGO = Path("/home/boody/work/personal/kadr/assets/kadr-logo.png")

PUBLIC_DIR = PROJECT_ROOT / "public"
SRC_ASSETS_DIR = PROJECT_ROOT / "src" / "assets"

PUBLIC_LOGO = PUBLIC_DIR / "kadr-logo.png"
SRC_LOGO = SRC_ASSETS_DIR / "kadr-logo.png"
ICON_PATH = PUBLIC_DIR / "icon.png"

def main():
    PUBLIC_DIR.mkdir(parents=True, exist_ok=True)
    SRC_ASSETS_DIR.mkdir(parents=True, exist_ok=True)

    src = SOURCE_LOGO
    if not src.exists():
        if PUBLIC_LOGO.exists():
            src = PUBLIC_LOGO
        else:
            raise FileNotFoundError(f"Source logo not found at {SOURCE_LOGO} or {PUBLIC_LOGO}")

    # Copy official logo
    print(f"Copying logo from {src} to {PUBLIC_LOGO}")
    shutil.copyfile(src, PUBLIC_LOGO)
    print(f"Copying logo from {src} to {SRC_LOGO}")
    shutil.copyfile(src, SRC_LOGO)

    # Generate 512x512 TV launcher icon with #2A0A0A background and safe padding
    icon_size = (512, 512)
    bg_color = (42, 10, 10, 255)  # #2A0A0A RGBA
    max_logo_size = 384  # ~15% padding on each side (64px)

    bg = Image.new("RGBA", icon_size, bg_color)
    logo = Image.open(src).convert("RGBA")

    # Scale logo preserving aspect ratio
    orig_w, orig_h = logo.size
    ratio = min(max_logo_size / orig_w, max_logo_size / orig_h)
    new_w = round(orig_w * ratio)
    new_h = round(orig_h * ratio)

    resample_filter = getattr(Image, "Resampling", Image).LANCZOS
    logo_resized = logo.resize((new_w, new_h), resample=resample_filter)

    offset_x = (icon_size[0] - new_w) // 2
    offset_y = (icon_size[1] - new_h) // 2

    # Composite logo onto background using alpha channel
    bg.paste(logo_resized, (offset_x, offset_y), logo_resized)

    print(f"Saving launcher icon to {ICON_PATH}")
    bg.save(ICON_PATH, format="PNG")
    print("Done!")

if __name__ == "__main__":
    main()
