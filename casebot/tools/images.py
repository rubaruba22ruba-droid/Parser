"""
Готовит реальные 3D-иконки подарков из скриншотов: вырезка -> апскейл x4 (Real-ESRGAN, CPU через ncnn)
-> удаление фона (однотонного или градиентного) -> прозрачный WebP 320x320.

Зависимости (Python 3.11/3.12):  pip install realesrgan-ncnn-py ncnn scipy pillow numpy
Запуск:  python tools/images.py <папка_со_скринами> <папка_вывода>
Скрины: tggifts.com (1..5, 9.jpg) и RubUP (10, 11.jpg) — координаты ниже.
"""
import os, sys, json
import importlib.util
import numpy as np, ncnn
from PIL import Image
from scipy import ndimage as ndi

# веса Real-ESRGAN лежат внутри пакета realesrgan-ncnn-py (сам пакет не импортируем — ему нужен Vulkan)
MODELS = os.path.join(list(importlib.util.find_spec('realesrgan_ncnn_py').submodule_search_locations)[0], 'models')
_net = None
def upscale(img):
    global _net
    if _net is None:
        _net = ncnn.Net(); _net.opt.use_vulkan_compute = False; _net.opt.num_threads = os.cpu_count() or 4
        _net.load_param(f'{MODELS}/realesrgan-x4plus.param'); _net.load_model(f'{MODELS}/realesrgan-x4plus.bin')
    a = np.asarray(img.convert('RGB')); h, w = a.shape[:2]
    m = ncnn.Mat.from_pixels(a.tobytes(), ncnn.Mat.PixelType.PIXEL_RGB, w, h); m.substract_mean_normalize([], [1/255.] * 3)
    ex = _net.create_extractor(); ex.input('data', m); _, out = ex.extract('output')
    return Image.fromarray(np.clip(np.array(out).transpose(1, 2, 0) * 255, 0, 255).astype('uint8'))

def fit_bg(a, mask):
    """Квадратичная поверхность фона по пикселям mask (для градиентных карточек)."""
    h, w = a.shape[:2]; yy, xx = np.mgrid[0:h, 0:w]; x = xx / w - .5; y = yy / h - .5
    A = np.stack([np.ones_like(x), x, y, x * x, y * y, x * y], -1)
    bg = np.empty_like(a)
    for c in range(3):
        coef, *_ = np.linalg.lstsq(A[mask], a[..., c][mask], rcond=None); bg[..., c] = A @ coef
    return bg

def cutout(img, t0=16, t1=52, close=0):
    a = np.asarray(img).astype(float); h, w = a.shape[:2]
    band = np.zeros((h, w), bool); k = max(4, int(min(h, w) * .07)); band[:k] = band[-k:] = True; band[:, :k] = band[:, -k:] = True
    bg = fit_bg(a, band)
    for _ in range(2):  # уточняем фон по пикселям, которые на него похожи
        d = np.linalg.norm(a - bg, axis=2); bg = fit_bg(a, d < t0)
    d = np.linalg.norm(a - bg, axis=2)
    al = np.clip((d - t0) / (t1 - t0), 0, 1)
    m = al > .5
    lab, n = ndi.label(m)
    if n:
        sizes = ndi.sum(m, lab, range(1, n + 1)); keep = np.zeros(n + 1, bool); objs = ndi.find_objects(lab)
        for i, s in enumerate(sizes, 1):
            sl = objs[i - 1]; hh, ww = sl[0].stop - sl[0].start, sl[1].stop - sl[1].start
            edge = sl[0].start == 0 or sl[0].stop == h          # блики карточки у верхнего/нижнего края
            if s >= max(sizes) * .015 and not (hh < h * .05 and ww > w * .5) and not (edge and s < max(sizes) * .2): keep[i] = True
        m = keep[lab]
    if close: m = ndi.binary_closing(m, iterations=close)   # склеиваем тёмные куски объекта (кепка, кот)
    solid = ndi.binary_erosion(ndi.binary_fill_holes(m), iterations=3)
    near = ndi.binary_dilation(m, iterations=6)
    al = np.where(solid, 1.0, al * near)
    al3 = np.maximum(al, .03)[..., None]
    col = np.clip((a - bg * (1 - al3)) / al3, 0, 255)
    out = Image.fromarray(np.dstack([col, al * 255]).astype('uint8'), 'RGBA')
    bb = out.getchannel('A').point(lambda v: 255 if v > 24 else 0).getbbox()
    return out.crop(bb)

def finish(rgba, size=320, pad=.06):
    s = max(rgba.size); S = int(s * (1 + 2 * pad)); c = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    c.paste(rgba, ((S - rgba.width) // 2, (S - rgba.height) // 2)); return c.resize((size, size), Image.LANCZOS)

# --- источники: tggifts (иконки в колонке x 62..160, строки по y) ---
TG_RUNS = {1: [(422, 486), (569, 624)],
 2: [(413, 462), (551, 609), (695, 751), (832, 898), (976, 1038), (1122, 1180), (1263, 1322), (1403, 1466), (1547, 1596), (1687, 1751)],
 3: [(377, 437), (519, 579), (667, 722), (804, 865), (965, 1023), (1098, 1142), (1232, 1276), (1378, 1430), (1521, 1570), (1659, 1717)],
 4: [(406, 452), (525, 584), (647, 708), (775, 831), (899, 960), (1024, 1086), (1177, 1228), (1312, 1367), (1461, 1500), (1591, 1656), (1734, 1798)],
 5: [(330, 394), (455, 517), (606, 652), (748, 799), (886, 945), (1028, 1088), (1166, 1231), (1312, 1360), (1453, 1510), (1596, 1656), (1738, 1798)],
 9: [(346, 385), (476, 541), (619, 683), (765, 821), (906, 966), (1055, 1104), (1190, 1251), (1332, 1393), (1490, 1555), (1616, 1678), (1767, 1811)]}
TG = {'witch-hats': (1, 0), 'xmas-stockings': (1, 1), 'signet-rings': (2, 0), 'skull-flowers': (2, 1), 'spiced-wines': (2, 2), 'spy-agarics': (2, 3),
 'trapped-hearts': (2, 4), 'valentine-boxes': (2, 5), 'vice-creams': (2, 6), 'victory-medals': (2, 7), 'vintage-cigars': (2, 8),
 'mirage-lamps': (3, 0), 'perfume-bottles': (3, 1), 'pet-snakes': (3, 2), 'plush-pepes': (3, 3), 'precious-peaches': (3, 4), 'santa-hats': (3, 5),
 'scared-cats': (3, 6), 'sharp-tongues': (3, 7), 'pool-floats': (4, 0), 'snake-boxes': (4, 1), 'tama-gadgets': (4, 2), 'timeless-books': (4, 3),
 'whip-cupcakes': (4, 4), 'algorithm-cups': (4, 5), 'artisan-bricks': (4, 6), 'berry-boxes': (4, 7), 'durov-s-caps': (4, 8), 'eternal-roses': (4, 9),
 'evil-eyes': (4, 10), 'hypno-lollipops': (5, 1), 'jelly-bunnies': (5, 2), 'kissed-frogs': (5, 3), 'lush-bouquets': (5, 4), 'mad-pumpkins': (5, 5),
 'magic-potions': (5, 6), 'mighty-arms': (5, 7), 'mini-oscars': (5, 8), 'fresh-socks': (9, 3), 'gem-signets': (9, 4), 'genie-lamps': (9, 5),
 'ginger-cookies': (9, 6), 'hex-pots': (9, 7), 'homemade-cakes': (9, 8)}
# --- источники: RubUP (сетка 3 колонки) ---
RUB_COLS = [(38, 310), (326, 597), (613, 884)]
RUB_ROWS = {10: [568, 897, 1226, 1555], 11: [571, 900, 1229, 1558]}
RUB = {'sky-stilettos': (10, 0, 1), 'joyful-bundles': (10, 0, 2), 'party-sparklers': (10, 1, 0), 'mood-packs': (10, 1, 1), 'instant-ramens': (10, 1, 2),
 'top-hats': (11, 0, 1), 'spring-baskets': (11, 0, 2), 'mousse-cakes': (11, 1, 0), 'big-years': (11, 1, 1), 'jacks-in-the-box': (11, 1, 2),
 'diamond-100': (10, 2, 1), 'trophy-100': (11, 2, 1), 'cake-50': (11, 2, 2), 'gift-25': (11, 3, 0), 'bear-15': (11, 3, 1), 'heart-15': (11, 3, 2)}

def main(src, out, only=None):
    os.makedirs(out, exist_ok=True); shots = {}
    def shot(n):
        if n not in shots: shots[n] = Image.open(os.path.join(src, f'{n}.jpg')).convert('RGB')
        return shots[n]
    for gid, (n, i) in TG.items():
        if only and gid not in only: continue
        s, e = TG_RUNS[n][i]; crop = shot(n).crop((60, s - 10, 162, e + 10))
        finish(cutout(upscale(crop), 6, 22, close=5)).save(f'{out}/{gid}.webp', quality=90, method=6); print('tg ', gid)
    for gid, (n, r, c) in RUB.items():
        if only and gid not in only: continue
        l, rr = RUB_COLS[c]; t = RUB_ROWS[n][r]; crop = shot(n).crop((l + 14, t + 6, rr - 14, t + 176))
        finish(cutout(upscale(crop), 20, 60)).save(f'{out}/{gid}.webp', quality=90, method=6); print('rub', gid)

if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2], set(sys.argv[3:]) or None)
