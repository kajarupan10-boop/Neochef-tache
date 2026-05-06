#!/usr/bin/env python3
"""
Génère 3 jeux d'icônes différenciés pour les 3 apps NeoChef.

Chaque app a :
- Une couleur primaire distincte
- Une lettre stylisée (T, M, E) sur fond coloré dégradé
- icon.png (1024x1024) pour iOS App Store
- adaptive-icon.png (1024x1024) pour Android
- favicon.png (256x256)
- splash background color cohérent
"""
from PIL import Image, ImageDraw, ImageFont, ImageFilter
from pathlib import Path

# Configuration : couleurs (primary, secondary, accent gradient end)
APPS = {
    "neochef-taches": {
        "letter": "T",
        "label": "Tâches",
        "primary": "#2C5F2D",
        "primary_dark": "#1F4220",
        "accent": "#7BB37C",
        "secondary": "#EAE6CA",
    },
    "neochef-menu": {
        "letter": "M",
        "label": "Menu",
        "primary": "#C97B2A",
        "primary_dark": "#8E561D",
        "accent": "#F0A857",
        "secondary": "#FAF3E5",
    },
    "neochef-events": {
        "letter": "E",
        "label": "Events",
        "primary": "#6B4CA3",
        "primary_dark": "#4A3373",
        "accent": "#A085D1",
        "secondary": "#F0EBF7",
    },
}

APPS_ROOT = Path("/app/apps")

def hex_to_rgb(hx: str) -> tuple[int, int, int]:
    h = hx.lstrip("#")
    return tuple(int(h[i:i+2], 16) for i in (0, 2, 4))

def make_gradient(size: int, top_color: str, bottom_color: str) -> Image.Image:
    """Génère un dégradé vertical."""
    img = Image.new("RGB", (size, size), top_color)
    draw = ImageDraw.Draw(img)
    top = hex_to_rgb(top_color)
    bot = hex_to_rgb(bottom_color)
    for y in range(size):
        t = y / (size - 1)
        r = int(top[0] * (1 - t) + bot[0] * t)
        g = int(top[1] * (1 - t) + bot[1] * t)
        b = int(top[2] * (1 - t) + bot[2] * t)
        draw.line([(0, y), (size, y)], fill=(r, g, b))
    return img

def find_font(size: int) -> ImageFont.FreeTypeFont:
    """Trouve une police gras disponible."""
    candidates = [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
        "/usr/share/fonts/truetype/freefont/FreeSansBold.ttf",
    ]
    for f in candidates:
        if Path(f).exists():
            return ImageFont.truetype(f, size)
    return ImageFont.load_default()

def make_icon(letter: str, primary: str, primary_dark: str, accent: str,
              size: int = 1024) -> Image.Image:
    """Crée une icône carrée avec dégradé + lettre stylisée centrée + accent ring."""
    # Dégradé du haut (accent clair) vers le bas (primary dark)
    img = make_gradient(size, accent, primary_dark)
    draw = ImageDraw.Draw(img, "RGBA")

    # Cercle de fond translucide pour faire ressortir la lettre
    margin = int(size * 0.18)
    circle_color = (*hex_to_rgb(primary), 200)
    draw.ellipse(
        [(margin, margin), (size - margin, size - margin)],
        fill=circle_color,
        outline=(255, 255, 255, 60),
        width=int(size * 0.012),
    )

    # Lettre centrée - blanc
    font_size = int(size * 0.52)
    font = find_font(font_size)
    bbox = draw.textbbox((0, 0), letter, font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    tx = (size - tw) // 2 - bbox[0]
    ty = (size - th) // 2 - bbox[1] - int(size * 0.02)

    # Ombre légère
    shadow = Image.new("RGBA", img.size, (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow)
    sd.text((tx + 6, ty + 6), letter, fill=(0, 0, 0, 80), font=font)
    shadow = shadow.filter(ImageFilter.GaussianBlur(8))
    img = Image.alpha_composite(img.convert("RGBA"), shadow)

    draw = ImageDraw.Draw(img)
    draw.text((tx, ty), letter, fill=(255, 255, 255, 255), font=font)

    return img.convert("RGB")

def main():
    for app_dir, cfg in APPS.items():
        out_dir = APPS_ROOT / app_dir / "assets" / "images"
        out_dir.mkdir(parents=True, exist_ok=True)

        # Icône principale 1024x1024 (App Store iOS + Android adaptive)
        icon_1024 = make_icon(cfg["letter"], cfg["primary"], cfg["primary_dark"], cfg["accent"])
        icon_1024.save(out_dir / "icon.png", "PNG")
        icon_1024.save(out_dir / "app-icon-1024.png", "PNG")
        icon_1024.save(out_dir / "adaptive-icon.png", "PNG")
        icon_1024.save(out_dir / "neochef_logo.png", "PNG")
        icon_1024.save(out_dir / "neochef_logo_new.png", "PNG")
        icon_1024.save(out_dir / "logo.png", "PNG")
        icon_1024.save(out_dir / "app-image.png", "PNG")

        # Apple touch icon 180x180
        ati = icon_1024.resize((180, 180), Image.LANCZOS)
        ati.save(out_dir / "apple-touch-icon.png", "PNG")
        ati.save(out_dir / "apple-touch-icon-180x180.png", "PNG")

        # Favicon 256x256
        fav = icon_1024.resize((256, 256), Image.LANCZOS)
        fav.save(out_dir / "favicon.png", "PNG")

        # Partial logo (réutilise logo)
        icon_1024.resize((512, 512), Image.LANCZOS).save(
            out_dir / "partial-react-logo.png", "PNG"
        )

        print(f"[ok] {app_dir}: icônes générées ({cfg['letter']}, {cfg['primary']})")

if __name__ == "__main__":
    main()
