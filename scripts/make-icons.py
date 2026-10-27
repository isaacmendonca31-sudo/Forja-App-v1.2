"""Gera os ícones PNG do PWA (requer Pillow). Uso: python3 scripts/make-icons.py"""
from PIL import Image, ImageDraw

ACCENT = (255, 107, 26, 255)
DARK = (14, 15, 18, 255)

def draw(size, maskable):
    s = size * 4  # supersampling para bordas suaves
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if maskable:
        d.rectangle([0, 0, s, s], fill=ACCENT)      # sangria total (o SO aplica a máscara)
        scale, off = 0.56, 0.22                      # letra dentro da "zona segura" de 80%
    else:
        d.rounded_rectangle([0, 0, s - 1, s - 1], radius=int(s * 0.22), fill=ACCENT)
        scale, off = 0.64, 0.18
    # Letra "F" definida no grid 512 do icon.svg
    pts = [(160,112),(368,112),(368,179),(234,179),(234,233),(336,233),(336,300),(234,300),(234,400),(160,400)]
    # normaliza a caixa (160..368 x 112..400) → escala/offset
    minx, maxx, miny, maxy = 160, 368, 112, 400
    w, h = maxx - minx, maxy - miny
    k = (s * scale) / max(w, h)
    ox = s * off + ((s * scale) - w * k) / 2 + s * (0.64 - scale) / 2 * 0
    oy = s * off + ((s * scale) - h * k) / 2
    poly = [(ox + (x - minx) * k, oy + (y - miny) * k) for x, y in pts]
    d.polygon(poly, fill=DARK)
    return img.resize((size, size), Image.LANCZOS)

draw(192, False).save("icons/icon-192.png")
draw(512, False).save("icons/icon-512.png")
draw(512, True).save("icons/icon-maskable-512.png")
print("ok")
