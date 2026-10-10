"""Hopdock placeholder artwork (stdlib only): app icon + DMG background."""
import math
import struct
import zlib

BG_TOP = (23, 27, 38)
BG_BOT = (13, 17, 23)
ACCENT = (76, 141, 255)
GREEN = (63, 178, 127)
WHITE = (230, 233, 239)


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def save_png(path, w, h, pixels):
    def chunk(t, d):
        c = t + d
        return struct.pack('>I', len(d)) + c + struct.pack('>I', zlib.crc32(c) & 0xFFFFFFFF)

    raw = b''
    for y in range(h):
        raw += b'\x00' + bytes(pixels[y])
    ihdr = struct.pack('>IIBBBBB', w, h, 8, 6, 0, 0, 0)
    open(path, 'wb').write(
        b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', ihdr) + chunk(b'IDAT', zlib.compress(raw)) + chunk(b'IEND', b'')
    )
    print('wrote', path)


def rounded_mask(x, y, w, h, r):
    cx = min(max(x, r), w - r)
    cy = min(max(y, r), h - r)
    dx, dy = x - cx, y - cy
    return dx * dx + dy * dy <= r * r


def circle_dist(x, y, cx, cy):
    return math.hypot(x - cx, y - cy)


def make_icon(path, size=1024):
    px = []
    r = size * 0.22
    for y in range(size):
        row = bytearray()
        for x in range(size):
            if not rounded_mask(x + 0.5, y + 0.5, size, size, r):
                row += bytes((0, 0, 0, 0))
                continue
            t = y / size
            c = lerp(BG_TOP, BG_BOT, t)
            # soft top glow
            glow = max(0.0, 1.0 - (y / (size * 0.55))) ** 2 * 0.25
            c = tuple(min(255, int(v + 255 * glow * 0.12)) for v in c)
            # orbit rings
            cx = cy = size / 2
            d1 = abs(circle_dist(x, y, cx, cy) - size * 0.30)
            d2 = abs(circle_dist(x, y, cx - size * 0.06, cy + size * 0.05) - size * 0.19)
            if d1 < size * 0.012:
                c = lerp(c, ACCENT, 0.9)
            if d2 < size * 0.014:
                c = lerp(c, GREEN, 0.9)
            # core dot
            if circle_dist(x, y, cx, cy) < size * 0.055:
                c = lerp(c, WHITE, 0.95)
            row += bytes((c[0], c[1], c[2], 255))
        px.append(bytes(row))
    save_png(path, size, size, px)


def make_dmg_bg(path, w=1080, h=760):
    px = []
    for y in range(h):
        row = bytearray()
        t = y / h
        for x in range(w):
            c = lerp(BG_TOP, BG_BOT, t)
            # radial glow top-center
            g = max(0.0, 1.0 - math.hypot(x - w / 2, y - h * 0.28) / (w * 0.55)) ** 2
            c = tuple(min(255, int(v + g * 14)) for v in c)
            # dashed install arrow between icon slots (slots at 1/3 and 2/3 width)
            ay = h * 0.45
            if abs(y - ay) < 7 and w * 0.42 < x < w * 0.58 and int(x / 18) % 2 == 0:
                c = lerp(c, ACCENT, 0.55)
            row += bytes((c[0], c[1], c[2], 255))
        px.append(bytes(row))
    # arrow head
    ax, ay = int(w * 0.58), int(h * 0.45)
    for y in range(h):
        row = bytearray(px[y])
        for x in range(w):
            if ax <= x <= ax + 46 and abs(y - ay) <= (46 - (x - ax)) * 0.55:
                i = x * 4
                c = lerp((row[i], row[i + 1], row[i + 2]), ACCENT, 0.8)
                row[i], row[i + 1], row[i + 2] = int(c[0]), int(c[1]), int(c[2])
        px[y] = bytes(row)
    save_png(path, w, h, px)


if __name__ == '__main__':
    make_icon('apps/desktop/build/icon.png')
    make_dmg_bg('apps/desktop/build/dmg-background.png')
