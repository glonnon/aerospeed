import struct
import zlib
import os

ORANGE = (252, 82, 0, 255)
WHITE = (255, 255, 255, 255)


def png_chunk(typ, data):
    return (
        struct.pack(">I", len(data))
        + typ
        + data
        + struct.pack(">I", zlib.crc32(typ + data) & 0xFFFFFFFF)
    )


def write_png(path, w, h, rgba):
    raw = b"".join(b"\x00" + rgba[y * w * 4 : (y + 1) * w * 4] for y in range(h))
    ihdr = struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0)
    png = b"\x89PNG\r\n\x1a\n" + png_chunk(b"IHDR", ihdr)
    png += png_chunk(b"IDAT", zlib.compress(raw, 9))
    png += png_chunk(b"IEND", b"")
    with open(path, "wb") as f:
        f.write(png)


def in_circle(x, y, cx, cy, r):
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r


def in_rrect(x, y, cx, cy, half, rad):
    dx = abs(x - cx)
    dy = abs(y - cy)
    if dx > half or dy > half:
        return False
    ix = max(dx - (half - rad), 0)
    iy = max(dy - (half - rad), 0)
    return ix * ix + iy * iy <= rad * rad


def render(size, ss=4):
    S = size * ss
    px = bytearray(S * S * 4)

    def put(x, y, color):
        i = (y * S + x) * 4
        px[i : i + 4] = bytes(color)

    margin = S // 24
    cx = cy = S / 2
    r = S / 2 - margin

    side_half = S * 0.18
    corner = S * 0.045
    off = S * 0.09
    ring = S * 0.022

    sq1 = (cx - off, cy - off)
    sq2 = (cx + off, cy + off)

    for y in range(S):
        for x in range(S):
            fx, fy = x + 0.5, y + 0.5
            color = (0, 0, 0, 0)
            if in_circle(fx, fy, cx, cy, r):
                color = ORANGE
            if in_rrect(fx, fy, sq1[0], sq1[1], side_half, corner):
                color = WHITE
            elif in_rrect(fx, fy, sq2[0], sq2[1], side_half, corner) and not in_rrect(
                fx, fy, sq2[0], sq2[1], side_half - ring, corner - ring * 0.8
            ):
                color = WHITE
            put(x, y, color)

    out = bytearray(size * size * 4)
    for y in range(size):
        for x in range(size):
            rs = gs = bs = as_ = 0
            for sy in range(ss):
                for sx in range(ss):
                    i = ((y * ss + sy) * S + (x * ss + sx)) * 4
                    rs += px[i]
                    gs += px[i + 1]
                    bs += px[i + 2]
                    as_ += px[i + 3]
            n = ss * ss
            j = (y * size + x) * 4
            out[j : j + 4] = bytes((round(rs / n), round(gs / n), round(bs / n), round(as_ / n)))
    return bytes(out)


def main():
    here = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "icons")
    os.makedirs(here, exist_ok=True)
    for size in (16, 48, 128):
        write_png(os.path.join(here, f"icon{size}.png"), size, size, render(size))
        print(f"icons/icon{size}.png written")


if __name__ == "__main__":
    main()
