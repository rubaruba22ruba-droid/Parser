"""
Дочистка вырезанных подарков: убирает тёмный ореол / чёрный фон, который остался от скриншота маркета.
Только по списку — у многих подарков тёмные части настоящие (очки, шляпа, кот), их трогать нельзя.
Запуск:  python3 tools/gift_cleanup.py            (перезаписывает webapp/images/gifts/<id>.webp)
"""
import os
import numpy as np
from PIL import Image, ImageFilter

ROOT = os.path.join(os.path.dirname(__file__), '..')

# id: (порог яркости, порог насыщенности, затравки) — затравка 'out' = заливка от прозрачного края,
# (x, y) = заливка от точки (дырка в середине, как у венка), (x0, y0, x1, y1) = весь фон в рамке (за ниткой варежек)
FIX = {
    'astral-shards': (150, .5, ['out']),
    'winter-wreaths': (70, .35, [(150, 150)]),
    'snow-mittens': (60, .6, ['out', (95, 175, 268, 320)]),
}


def point(shape, xy):
    m = np.zeros(shape, bool); m[xy[1], xy[0]] = True; return m


def flood(region, seed):
    cur = seed & region
    while True:
        grow = cur.copy()
        grow[1:] |= cur[:-1]; grow[:-1] |= cur[1:]; grow[:, 1:] |= cur[:, :-1]; grow[:, :-1] |= cur[:, 1:]
        grow &= region
        if (grow == cur).all(): return cur
        cur = grow


def clean(path, lum_max, sat_max, seeds):
    im = Image.open(path).convert('RGBA'); a = np.array(im).astype(np.float32)
    rgb, al = a[..., :3], a[..., 3]
    mx, mn = rgb.max(-1), rgb.min(-1)
    lum = rgb @ np.array([.299, .587, .114], np.float32)
    sat = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1), 0)
    bg = (al < 24) | ((lum < lum_max) & (sat < sat_max))           # «фоноподобные» пиксели
    kill = np.zeros_like(bg)
    for s in seeds:   # заливка по «фоноподобным» пикселям от затравки
        if len(s) == 4: x0, y0, x1, y1 = s; box = np.zeros_like(bg); box[y0:y1, x0:x1] = True; kill |= bg & box
        else: kill |= flood(bg, (al < 24) if s == 'out' else point(bg.shape, s))
    keep = (~kill).astype(np.float32) * (al / 255)
    # мягкий край: чуть сжимаем и размываем маску, чтобы не было ступенек и тёмной каймы
    m = Image.fromarray((keep * 255).astype('uint8')).filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(.9))
    out = a.copy(); out[..., 3] = np.minimum(al, np.array(m, np.float32))
    Image.fromarray(out.astype('uint8'), 'RGBA').save(path, quality=92, method=6)


if __name__ == '__main__':
    for gid, (L, S, seeds) in FIX.items():
        clean(os.path.join(ROOT, 'webapp/images/gifts', gid + '.webp'), L, S, seeds)
        print('clean', gid)
