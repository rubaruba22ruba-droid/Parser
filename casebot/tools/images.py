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

def fit_bg(a, mask, order=3):
    """Полиномиальная поверхность фона по пикселям mask (градиентные карточки, блики)."""
    h, w = a.shape[:2]; yy, xx = np.mgrid[0:h, 0:w]; x = xx / w - .5; y = yy / h - .5
    terms = [np.ones_like(x)] + [x ** i * y ** j for i in range(order + 1) for j in range(order + 1 - i) if i + j > 0]
    A = np.stack(terms, -1); bg = np.empty_like(a)
    for c in range(3):
        coef, *_ = np.linalg.lstsq(A[mask], a[..., c][mask], rcond=None); bg[..., c] = A @ coef
    return bg

def cutout(img, tight=9, soft=46, order=1, glow=False):
    """Фон — только то, что связано с краем кропа и совпадает с цветом фона (с допуском tight).
    Всё внутри подарка остаётся целым (тёмные детали не выедаются); край сглаживается по полосе в 4 px.
    glow=True — свечение вокруг предмета делается полупрозрачным (а не тёмной подложкой)."""
    a = np.asarray(img).astype(float); h, w = a.shape[:2]
    band = np.zeros((h, w), bool); k = max(4, int(min(h, w) * .06)); band[:k] = band[-k:] = True; band[:, :k] = band[:, -k:] = True
    bg = fit_bg(a, band, order)
    for _ in range(2):
        d = np.linalg.norm(a - bg, axis=2); bg = fit_bg(a, d < tight * 1.5, order)
    d = np.linalg.norm(a - bg, axis=2)
    lab, _ = ndi.label(d < tight)
    border = np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]])); border = border[border > 0]
    outside = np.isin(lab, border)
    obj = ~outside
    lab2, n = ndi.label(obj)
    if n:
        sizes = ndi.sum(obj, lab2, range(1, n + 1)); objs = ndi.find_objects(lab2); keep = np.zeros(n + 1, bool)
        for i, sz in enumerate(sizes, 1):
            sl = objs[i - 1]; hh, ww = sl[0].stop - sl[0].start, sl[1].stop - sl[1].start
            line = hh < h * .05 and ww > w * .5                      # разделительная линия таблицы
            edge_glare = (sl[0].start == 0 or sl[0].stop == h) and sz < max(sizes) * .2   # блик карточки у края
            if sz >= max(sizes) * .01 and not line and not edge_glare: keep[i] = True
        obj = keep[lab2]
    obj = ndi.binary_fill_holes(obj)
    edge = obj & ndi.binary_dilation(~obj, iterations=4)
    al = np.where(obj, 1.0, 0.0)
    al = np.where(edge, np.clip((d - tight) / (soft - tight), 0, 1), al)
    if glow:   # свечение: прозрачность по яркости над фоном, тело (яркое ядро) — непрозрачное
        core = ndi.binary_fill_holes(ndi.binary_opening(d > 95, iterations=3)) & obj
        al = np.where(obj & ~core, np.clip((d - tight) / 120, 0, 1) ** 1.3, al)
    al = ndi.gaussian_filter(al, .6) * obj
    al3 = np.maximum(al, .04)[..., None]
    col = np.clip((a - bg * (1 - al3)) / al3, 0, 255)
    out = Image.fromarray(np.dstack([col, al * 255]).astype('uint8'), 'RGBA')
    return out.crop(out.getchannel('A').point(lambda v: 255 if v > 20 else 0).getbbox())

def finish(rgba, size=320, pad=.06):
    s = max(rgba.size); S = int(s * (1 + 2 * pad)); c = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    c.paste(rgba, ((S - rgba.width) // 2, (S - rgba.height) // 2)); return c.resize((size, size), Image.LANCZOS)

# индивидуальные настройки: у Magic Potions вокруг флакона зелёное свечение — делаем его прозрачным, а не тёмным диском
OVR = {'magic-potions': dict(glow=True), 'eternal-candles': dict(glow=True), 'ion-gems': dict(glow=True), 'love-candles': dict(glow=True)}

# --- источники: tggifts (иконки в колонке x 62..160, строки по y) ---
TG_RUNS = {1: [(422, 486), (569, 624)],
 2: [(413, 462), (551, 609), (695, 751), (832, 898), (976, 1038), (1122, 1180), (1263, 1322), (1403, 1466), (1547, 1596), (1687, 1751)],
 3: [(377, 437), (519, 579), (667, 722), (804, 865), (965, 1023), (1098, 1142), (1232, 1276), (1378, 1430), (1521, 1570), (1659, 1717)],
 4: [(406, 452), (525, 584), (647, 708), (775, 831), (899, 960), (1024, 1086), (1177, 1228), (1312, 1367), (1461, 1500), (1591, 1656), (1734, 1798)],
 5: [(330, 394), (455, 517), (606, 652), (748, 799), (886, 945), (1028, 1088), (1166, 1231), (1312, 1360), (1453, 1510), (1596, 1656), (1738, 1798)],
 21: [(400, 460), (522, 586), (650, 711), (798, 824), (901, 962), (1030, 1086), (1153, 1216), (1278, 1341), (1405, 1467), (1532, 1594), (1657, 1719)],
 22: [(389, 451), (526, 573), (643, 702), (768, 829), (893, 955), (1020, 1082), (1143, 1207), (1275, 1331), (1397, 1459), (1525, 1581), (1670, 1721)],
 23: [(391, 442), (511, 574), (641, 695), (763, 824), (890, 949), (1020, 1067), (1142, 1202), (1267, 1331), (1395, 1455), (1526, 1577), (1647, 1705)],
 24: [(366, 425), (492, 549), (619, 676), (746, 801), (875, 923), (1010, 1057), (1120, 1185), (1248, 1308), (1373, 1434), (1507, 1555), (1629, 1683), (1753, 1812)],
 9: [(346, 385), (476, 541), (619, 683), (765, 821), (906, 966), (1055, 1104), (1190, 1251), (1332, 1393), (1490, 1555), (1616, 1678), (1767, 1811)]}
TG = {'witch-hats': (1, 0), 'xmas-stockings': (1, 1), 'signet-rings': (2, 0), 'skull-flowers': (2, 1), 'spiced-wines': (2, 2), 'spy-agarics': (2, 3),
 'trapped-hearts': (2, 4), 'valentine-boxes': (2, 5), 'vice-creams': (2, 6), 'victory-medals': (2, 7), 'vintage-cigars': (2, 8),
 'mirage-lamps': (3, 0), 'perfume-bottles': (3, 1), 'pet-snakes': (3, 2), 'plush-pepes': (3, 3), 'precious-peaches': (3, 4), 'santa-hats': (3, 5),
 'scared-cats': (3, 6), 'sharp-tongues': (3, 7), 'pool-floats': (4, 0), 'snake-boxes': (4, 1), 'tama-gadgets': (4, 2), 'timeless-books': (4, 3),
 'whip-cupcakes': (4, 4), 'algorithm-cups': (4, 5), 'artisan-bricks': (4, 6), 'berry-boxes': (4, 7), 'durov-s-caps': (4, 8), 'eternal-roses': (4, 9),
 'evil-eyes': (4, 10), 'hypno-lollipops': (5, 1), 'jelly-bunnies': (5, 2), 'kissed-frogs': (5, 3), 'lush-bouquets': (5, 4), 'mad-pumpkins': (5, 5),
 'magic-potions': (5, 6), 'mighty-arms': (5, 7), 'mini-oscars': (5, 8), 'fresh-socks': (9, 3), 'gem-signets': (9, 4), 'genie-lamps': (9, 5),
 'ginger-cookies': (9, 6), 'hex-pots': (9, 7), 'homemade-cakes': (9, 8),
 'intelligence-cups': (21, 0), 'heart-lockets': (21, 1), 'resistance-dogs': (21, 2), 'durov-s-glasses': (21, 3), 'heroic-helmets': (21, 4), 'nail-bracelets': (21, 5),
 'astral-shards': (21, 6), 'loot-bags': (21, 7), 'westside-signs': (21, 8), 'ion-gems': (21, 9), 'swiss-watches': (21, 10),
 'low-riders': (22, 1), 'neko-helmets': (22, 2), 'bonded-rings': (22, 3), 'voodoo-dolls': (22, 4), 'toy-bears': (22, 5), 'diamond-rings': (22, 6),
 'electric-skulls': (22, 7), 'rare-birds': (22, 8), 'bling-binkies': (22, 9), 'khabib-s-papakhas': (22, 10),
 'cupid-charms': (23, 1), 'sky-stilettos': (23, 2), 'ionic-dryers': (23, 3), 'ufc-strikes': (23, 4), 'snoop-cigars': (23, 5), 'love-potions': (23, 6),
 'crystal-balls': (23, 7), 'flying-brooms': (23, 8), 'record-players': (23, 9), 'jingle-bells': (23, 10),
 'love-candles': (24, 1), 'sakura-flowers': (24, 2), 'sleigh-bells': (24, 3), 'top-hats': (24, 4), 'hanging-stars': (24, 5), 'joyful-bundles': (24, 6),
 'snow-mittens': (24, 7), 'bunny-muffins': (24, 8), 'fine-pens': (24, 9), 'input-keys': (24, 10), 'jolly-chimps': (24, 11)}
# --- источники: RubUP (сетка 3 колонки) ---
RUB_COLS = [(38, 310), (326, 597), (613, 884)]
RUB_ROWS = {10: [568, 897, 1226, 1555], 11: [571, 900, 1229, 1558]}
RUB = {'party-sparklers': (10, 1, 0), 'mood-packs': (10, 1, 1), 'instant-ramens': (10, 1, 2),
 'spring-baskets': (11, 0, 2), 'mousse-cakes': (11, 1, 0), 'big-years': (11, 1, 1), 'jacks-in-the-box': (11, 1, 2),
 'diamond-100': (10, 2, 1), 'trophy-100': (11, 2, 1), 'cake-50': (11, 2, 2), 'gift-25': (11, 3, 0), 'bear-15': (11, 3, 1), 'heart-15': (11, 3, 2)}

# --- источник №1: экран «Купить подарок» в Telegram (крупные рендеры, фон карточки #1c1c1e) ---
MKT_COLS = [(38, 304), (328, 595), (619, 885)]
MKT = {  # скрин: [ряды сверху вниз по полностью видимым карточкам], None — пропустить
 25: [['snow-globes', 'eternal-candles', 'khabib-s-papakhas'], ['hanging-stars', 'mad-pumpkins', 'jingle-bells'],
      ['top-hats', 'valentine-boxes', 'sky-stilettos'], ['sleigh-bells', 'cupid-charms', 'crystal-balls']],
 26: [['love-candles', 'toy-bears', 'ionic-dryers'], ['record-players', 'trapped-hearts', 'resistance-dogs'],
      ['skull-flowers', 'signet-rings', 'rare-birds'], ['vintage-cigars', None, 'voodoo-dolls']],   # Flying Brooms — с tggifts (в маркете с линиями движения)
 27: [['precious-peaches', 'algorithm-cups', 'intelligence-cups'], ['heart-lockets', 'plush-pepes', None]],
 28: [['artisan-bricks', 'mini-oscars', 'westside-signs'], ['ion-gems', 'magic-potions', 'durov-s-caps'],
      ['astral-shards', 'scared-cats', 'nail-bracelets'], ['mighty-arms', 'durov-s-glasses', 'heroic-helmets']],
 29: [['swiss-watches', 'low-riders', 'sharp-tongues'], ['neko-helmets', 'bling-binkies', 'electric-skulls'],
      ['bonded-rings', 'gem-signets', 'perfume-bottles'], ['genie-lamps', 'kissed-frogs', 'loot-bags']],
 47: [['ice-creams', 'liberty-figures', None], ['snoop-doggs', None, 'lol-pops']],
 48: [['swag-bags', None, 'lunar-snakes'], [None, 'candy-canes', 'clover-pins']],
 49: [['jester-hats', 'cookie-hearts', 'b-day-candles'], ['spring-baskets', None, None], ['light-swords', None, None], [None, None, 'desk-calendars']],
 50: [[None, 'surge-boards', 'holiday-drinks'], [None, None, None], ['easter-eggs', None, None], [None, None, 'money-pots']],
 51: [['bow-ties', 'star-notepads', None], ['winter-wreaths', None, None]],
 58: [[None, 'moon-pendants', 'stellar-rockets']],
}
# верх первых рядов, которые частично под шапкой/уведомлением (автопоиск их не видит)
MKT_TOPS = {58: [294], 48: [299, 684, 1069, 1454], 49: [312, 697, 1082, 1466], 50: [291, 675, 1060, 1445], 51: [284, 664, 1049, 1434]}
CARD_BG = (28, 28, 30)

def mkt_card_tops(img):
    a = np.asarray(img).astype(int); col = a[:, 60, :].sum(axis=1) > 60
    tops = [y for y in range(1, a.shape[0]) if col[y] and not col[y - 1]]
    return [t for t in tops if t >= 330 and t + 262 <= a.shape[0]]   # только целиком видимые, не под шапкой

def small(img, k=.62):
    """Крупные кропы маркета уменьшаем перед апскейлом x4: итог 320px не теряет чёткости, а считается в ~2.5 раза быстрее."""
    return img.resize((round(img.width * k), round(img.height * k)), Image.LANCZOS)

def mkt_crop(img, L, T, R):
    """Карточка без ленты «маркет» (диагональ в правом верхнем углу) и без плашки цены."""
    a = np.array(img.crop((L + 6, T + 6, R - 6, T + 260))).astype(np.uint8)
    h, w = a.shape[:2]; yy, xx = np.mgrid[0:h, 0:w]
    x_from_right = (xx + L + 6) - R; y_from_top = yy + 6
    wv = x_from_right - y_from_top
    ribbon = (wv >= -128) & (wv <= -53) & (y_from_top <= 130) & (x_from_right <= 0)
    a[ribbon] = CARD_BG
    return Image.fromarray(a)

def main(src, out, only=None):
    os.makedirs(out, exist_ok=True); shots = {}
    def shot(n):
        if n not in shots: shots[n] = Image.open(os.path.join(src, f'{n}.jpg')).convert('RGB')
        return shots[n]
    mkt_ids = {g for rows in MKT.values() for r in rows for g in r if g}
    for gid, (n, i) in TG.items():
        if only and gid not in only: continue
        if gid in mkt_ids and os.path.exists(os.path.join(src, '25.jpg')): continue   # будет из маркета
        s, e = TG_RUNS[n][i]; crop = shot(n).crop((60, s - 10, 162, e + 10))
        finish(cutout(upscale(crop), **OVR.get(gid, {}))).save(f'{out}/{gid}.webp', quality=90, method=6); print('tg ', gid)
    for gid, (n, r, c) in RUB.items():
        if only and gid not in only: continue
        l, rr = RUB_COLS[c]; t = RUB_ROWS[n][r]; crop = shot(n).crop((l + 14, t + 12, rr - 14, t + 176))
        finish(cutout(upscale(crop), tight=28, soft=70, order=3)).save(f'{out}/{gid}.webp', quality=90, method=6); print('rub', gid)
    for n, rows in MKT.items():          # маркет Telegram — лучшее качество, перезаписывает остальные
        if not os.path.exists(os.path.join(src, f'{n}.jpg')): continue
        img = shot(n); tops = MKT_TOPS.get(n) or mkt_card_tops(img)
        for top, names in zip(tops, rows):
            for (L, R), gid in zip(MKT_COLS, names):
                if not gid or (only and gid not in only): continue
                finish(cutout(upscale(small(mkt_crop(img, L, top, R))), **{**dict(tight=9, soft=46), **OVR.get(gid, {})})).save(f'{out}/{gid}.webp', quality=90, method=6); print('mkt', gid)

if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2], set(sys.argv[3:]) or None)
