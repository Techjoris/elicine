#!/usr/bin/env python3
"""Génère tous les assets de marque Éliciné depuis le logo officiel.

Source : `logo officiel cine ai.png` (carré arrondi noir, É blanc, play rouge),
posé sur fond blanc. Le script rend les coins transparents (baignade depuis les
bords, jamais depuis l'intérieur où le É est blanc), puis décline :

  public/logo-mark.png              emblème utilisé dans l'interface
  public/icon-192.png, icon-512.png emblème à coins transparents (PWA "any")
  public/pwa-*.png                  carré plein noir, emblème en zone sûre (maskable)
  public/apple-touch-icon*.png      carré plein noir (iOS arrondit lui-même)
  public/favicon.ico + favicon-*.png
  public/favicon.svg, icon.svg, logo.svg   SVG autonome embarquant le PNG
  public/icons/icon-512x512.png     repli utilisé par les e-mails
  android/app/src/main/res/mipmap-* icônes de l'application Android

Usage (interpréteur fourni par l'environnement de travail) :
  python scripts/build-brand-assets.py
"""

from __future__ import annotations

import base64
import io
import os
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "logo officiel cine ai.png"
PUBLIC = ROOT / "public"
ANDROID = ROOT / "android" / "app" / "src" / "main" / "res"
BACKGROUND = (10, 10, 12, 255)  # #0a0a0c, la couleur du manifeste


def cut_out_background(image: Image.Image) -> Image.Image:
    """Rend transparent le fond blanc extérieur, sans toucher au É intérieur."""
    rgba = image.convert("RGBA")
    width, height = rgba.size
    for corner in ((1, 1), (width - 2, 1), (1, height - 2), (width - 2, height - 2)):
        if rgba.getpixel(corner)[:3] == (0, 0, 0):
            continue
        ImageDraw.floodfill(rgba, corner, (0, 0, 0, 0), thresh=70)
    return rgba


def emblem(mark: Image.Image, size: int, *, fill: tuple[int, int, int, int] | None = None,
           scale: float = 1.0) -> Image.Image:
    """Emblème carré ; `fill` pose un fond plein (maskable, iOS), `scale` l'inset."""
    canvas = Image.new("RGBA", (size, size), fill or (0, 0, 0, 0))
    inner = max(1, round(size * scale))
    resized = mark.resize((inner, inner), Image.LANCZOS)
    offset = (size - inner) // 2
    canvas.alpha_composite(resized, (offset, offset))
    return canvas


def save(image: Image.Image, path: Path, *, quantize: bool = True) -> None:
    """Écrit le PNG. Le logo n'a que quelques aplats : une palette de 128 couleurs
    sans tramage divise le poids par dix sans différence visible."""
    path.parent.mkdir(parents=True, exist_ok=True)
    written = image
    if quantize and image.mode == "RGBA":
        written = image.quantize(colors=128, method=Image.FASTOCTREE, dither=Image.NONE).convert("RGBA")
    written.save(path, optimize=True)
    print(f"  {path.relative_to(ROOT)}  {image.size[0]}x{image.size[1]}  "
          f"{path.stat().st_size // 1024} Ko")


def svg_wrapper(png: bytes, size: int) -> str:
    data = base64.b64encode(png).decode("ascii")
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{size}" height="{size}" '
        f'viewBox="0 0 {size} {size}">\n'
        f'  <image width="{size}" height="{size}" href="data:image/png;base64,{data}" />\n'
        "</svg>\n"
    )


def main() -> None:
    if not SOURCE.exists():
        raise SystemExit(f"logo officiel introuvable : {SOURCE}")

    print("découpe du fond blanc")
    mark = cut_out_background(Image.open(SOURCE))

    print("assets web")
    # L'emblème d'interface n'est jamais affiché au-delà de ~80 px : 256 px
    # couvrent les écrans 3x pour un poids négligeable.
    save(emblem(mark, 256), PUBLIC / "logo-mark.png")
    save(emblem(mark, 192), PUBLIC / "icon-192.png")
    save(emblem(mark, 512), PUBLIC / "icon-512.png")
    # Maskable : carré plein, emblème réduit dans la zone sûre (80 %).
    save(emblem(mark, 192, fill=BACKGROUND, scale=0.78), PUBLIC / "pwa-192x192.png")
    save(emblem(mark, 512, fill=BACKGROUND, scale=0.78), PUBLIC / "pwa-512x512.png")
    # iOS arrondit lui-même : carré plein, sans transparence.
    save(emblem(mark, 180, fill=BACKGROUND, scale=0.86), PUBLIC / "apple-touch-icon.png")
    save(emblem(mark, 180, fill=BACKGROUND, scale=0.86), PUBLIC / "apple-touch-icon-precomposed.png")
    for size in (16, 32, 48):
        save(emblem(mark, size), PUBLIC / f"favicon-{size}.png")
    save(emblem(mark, 512), PUBLIC / "icons" / "icon-512x512.png")

    print("favicon.ico (16, 32, 48, 64)")
    ico = emblem(mark, 256).quantize(colors=128, method=Image.FASTOCTREE, dither=Image.NONE).convert("RGBA")
    ico.save(PUBLIC / "favicon.ico", format="ICO",
             sizes=[(16, 16), (32, 32), (48, 48), (64, 64)])
    print("  public/favicon.ico")

    print("svg autonomes")
    buffer = io.BytesIO()
    emblem(mark, 256).save(buffer, format="PNG", optimize=True)
    wrapper = svg_wrapper(buffer.getvalue(), 256)
    for name in ("favicon.svg", "icon.svg", "logo.svg"):
        (PUBLIC / name).write_text(wrapper, encoding="utf-8")
        print(f"  public/{name}")

    print("icônes Android")
    densities = {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}
    for density, size in densities.items():
        folder = ANDROID / f"mipmap-{density}"
        if not folder.exists():
            continue
        save(emblem(mark, size, fill=BACKGROUND, scale=0.9), folder / "ic_launcher.png")
        mask = Image.new("L", (size * 4, size * 4), 0)
        ImageDraw.Draw(mask).ellipse((0, 0, size * 4 - 1, size * 4 - 1), fill=255)
        round_icon = emblem(mark, size * 4, fill=BACKGROUND, scale=0.9)
        round_icon.putalpha(mask.resize((size * 4, size * 4)).resize((size * 4, size * 4)))
        save(round_icon.resize((size, size), Image.LANCZOS), folder / "ic_launcher_round.png")
        # Calque avant-plan adaptatif : 108dp, emblème dans la zone sûre (72dp).
        foreground = emblem(mark, round(size * 108 / 48), scale=0.62)
        save(foreground, folder / "ic_launcher_foreground.png")

    print("terminé")


if __name__ == "__main__":
    os.chdir(ROOT)
    main()
