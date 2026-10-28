"""
Обложки кейсов «взрыв подарков»: в центре самый дорогой подарок кейса, остальные разлетаются от него
со световыми шлейфами. Только настоящие 3D-картинки подарков — никаких нарисованных коробок и заглушек;
генерируются лишь свет, шлейфы, лучи и искры. Рисуем в 1024 и уменьшаем до 512.
Запуск после build.mjs:  python3 tools/case_burst.py
"""
import colorsys, json, math, os, random, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageChops

ROOT = os.path.join(os.path.dirname(__file__), '..')
W = 1024
BG = (25, 25, 27)


def rgb(h): h = h.lstrip('#'); return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def hue_shift(c, dh, sat=1.0, val=1.0):
    h, s, v = colorsys.rgb_to_hsv(*(x / 255 for x in c))
    r, g, b = colorsys.hsv_to_rgb((h + dh) % 1, min(1, s * sat), min(1, v * val))
    return int(r * 255), int(g * 255), int(b * 255)


def radial_layer(color, cx, cy, r, alpha, power=1.6):
    yy, xx = np.mgrid[0:W, 0:W]
    d = np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2) / r
    a = np.clip(1 - d, 0, 1) ** power * alpha
    arr = np.zeros((W, W, 4), 'uint8'); arr[..., :3] = color; arr[..., 3] = a.astype('uint8')
    return Image.fromarray(arr, 'RGBA')


def rays(colors, cx, cy, seed, n=16):
    rnd = random.Random(seed); layer = Image.new('RGBA', (W, W), (0, 0, 0, 0)); d = ImageDraw.Draw(layer)
    R = W * .9; off = rnd.random() * 360
    for i in range(n):
        a0 = math.radians(off + i * 360 / n + rnd.uniform(-6, 6)); w = math.radians(rnd.uniform(2.5, 7))
        c = colors[i % len(colors)]
        d.polygon([(cx, cy), (cx + R * math.cos(a0 - w), cy + R * math.sin(a0 - w)), (cx + R * math.cos(a0 + w), cy + R * math.sin(a0 + w))], fill=c + (rnd.randint(40, 95),))
    fade = radial_layer((0, 0, 0), cx, cy, W * .62, 255, .9).getchannel('A')
    layer.putalpha(ImageChops.multiply(layer.getchannel('A'), fade))
    return layer.filter(ImageFilter.GaussianBlur(5))


def trail(canvas, x0, y0, x1, y1, width, color, core=(255, 255, 255)):
    """Световой шлейф от (x1,y1) (подарок) к (x0,y0) (центр): широкий у подарка, сходит на нет к центру."""
    ang = math.atan2(y1 - y0, x1 - x0); nx, ny = -math.sin(ang), math.cos(ang)
    vivid = hue_shift(color, 0, 1.35, 1.25); light = tuple(min(255, int(v * .55 + 255 * .45)) for v in vivid)
    for layer_w, col, alpha, blur in ((width * 1.15, vivid, 255, 30), (width * .7, vivid, 255, 16), (width * .36, light, 245, 9), (width * .12, core, 235, 4)):
        m = Image.new('L', (W, W), 0); d = ImageDraw.Draw(m)
        steps = 24
        for k in range(steps):                        # набор сужающихся сегментов с убывающей яркостью
            t0, t1 = k / steps, (k + 1) / steps
            wa, wb = layer_w * (1 - t0) ** 1.4, layer_w * (1 - t1) ** 1.4
            ax, ay = x1 + (x0 - x1) * t0, y1 + (y0 - y1) * t0; bx, by = x1 + (x0 - x1) * t1, y1 + (y0 - y1) * t1
            d.polygon([(ax + nx * wa / 2, ay + ny * wa / 2), (bx + nx * wb / 2, by + ny * wb / 2), (bx - nx * wb / 2, by - ny * wb / 2), (ax - nx * wa / 2, ay - ny * wa / 2)],
                      fill=int(alpha * (1 - t0) ** .9))
        m = m.filter(ImageFilter.GaussianBlur(blur))
        lay = Image.new('RGBA', (W, W), col + (0,)); lay.putalpha(m); canvas.alpha_composite(lay)


def item(icon, size, rot):
    return icon.resize((size, size), Image.LANCZOS).rotate(rot, Image.BICUBIC, expand=True)


def smear(canvas, im, x, y, dx, dy, n=7):
    """Размытие движения: полупрозрачные копии подарка, сдвинутые к центру."""
    for k in range(n, 0, -1):
        c = im.copy(); c.putalpha(im.getchannel('A').point(lambda v, k=k: int(v * .16 * (1 - k / (n + 1)))))
        canvas.alpha_composite(c, (int(x + dx * k), int(y + dy * k)))


def drop_shadow(canvas, im, x, y, blur=16, op=.55):
    sh = Image.new('RGBA', (W, W), (0, 0, 0, 0)); blk = Image.new('RGBA', im.size, (0, 0, 0, 255))
    blk.putalpha(im.getchannel('A').point(lambda v: int(v * op))); sh.alpha_composite(blk, (x + 8, y + 22))
    canvas.alpha_composite(sh.filter(ImageFilter.GaussianBlur(blur)))


def sparkles(canvas, seed, n=12):
    rnd = random.Random(seed); d = ImageDraw.Draw(canvas)
    for _ in range(n):
        x, y = rnd.uniform(60, W - 60), rnd.uniform(60, W - 60); r = rnd.uniform(5, 14); a = rnd.randint(170, 255)
        d.polygon([(x, y - r * 2.6), (x + r * .3, y - r * .3), (x + r * 2.6, y), (x + r * .3, y + r * .3), (x, y + r * 2.6), (x - r * .3, y + r * .3), (x - r * 2.6, y), (x - r * .3, y - r * .3)], fill=(255, 255, 255, a))
    for _ in range(n * 3):
        x, y = rnd.uniform(0, W), rnd.uniform(0, W); r = rnd.uniform(1.5, 3.5)
        d.ellipse([x - r, y - r, x + r, y + r], fill=(255, 255, 255, rnd.randint(70, 190)))


# места спутников: (x, y, размер, поворот) — четыре угла и верх
SPOTS = [(.2, .21, 290, 14), (.8, .2, 280, -14), (.19, .8, 290, -10), (.81, .79, 290, 12), (.5, .09, 200, 0)]


def render(case, gifts_by_id, seed=0):
    c1, c2, c3 = (rgb(x) for x in case['theme'])
    palette = [c1, hue_shift(c1, .12, 1.1), hue_shift(c1, -.14, 1.1), c3, hue_shift(c1, .5, .9)]
    ids = [g for g in case['art'] if g in gifts_by_id]
    if len(ids) < 5:   # мало разных картинок — добираем из состава кейса
        more = sorted((g for g in case['items'] if g in gifts_by_id and g not in ids), key=lambda g: -gifts_by_id[g]['value'])
        ids += more[:5 - len(ids)]
    load = lambda gid: Image.open(os.path.join(ROOT, 'webapp', gifts_by_id[gid]['image'])).convert('RGBA')
    icons = [load(g) for g in ids[:5]]
    cx = cy = W / 2
    can = Image.new('RGBA', (W, W), BG + (255,))
    can.alpha_composite(radial_layer(c2, cx, cy, W * .75, 255, 1.1))
    can.alpha_composite(radial_layer(c1, cx, cy, W * .55, 150, 1.8))
    can.alpha_composite(rays([c1, c3, (255, 255, 255)], cx, cy, seed + 7))
    sats = icons[1:]
    for k, ic in enumerate(sats[:len(SPOTS)]):
        fx, fy, size, rot = SPOTS[k]; x1, y1 = fx * W, fy * W
        col = palette[k % len(palette)]
        tx, ty = cx + (x1 - cx) * .05, cy + (y1 - cy) * .05     # шлейф тянется почти до центра
        trail(can, tx, ty, x1, y1, size * .78, col)
        im = item(ic, size, rot); x, y = int(x1 - im.width / 2), int(y1 - im.height / 2)
        dx, dy = (cx - x1) * .022, (cy - y1) * .022
        smear(can, im, x, y, dx, dy)
        drop_shadow(can, im, x, y)
        can.alpha_composite(im, (x, y))
    # герой: белая вспышка + свечение, крупно по центру
    can.alpha_composite(radial_layer((255, 255, 255), cx, cy, 300, 120, 2.2))
    can.alpha_composite(radial_layer(c3, cx, cy, 380, 150, 1.8))
    hero = item(icons[0], 470, 0); hx, hy = int(cx - hero.width / 2), int(cy - hero.height / 2)
    drop_shadow(can, hero, hx, hy, 22, .6)
    can.alpha_composite(hero, (hx, hy))
    sparkles(can, seed + 3)
    # мягкая виньетка по краям — карточка переходит в фон
    v = radial_layer((0, 0, 0), cx, cy, W * .78, 255, .7).getchannel('A').point(lambda a: 255 - a)
    dark = Image.new('RGBA', (W, W), BG + (0,)); dark.putalpha(v.point(lambda a: int(a * .85))); can.alpha_composite(dark)
    return can.convert('RGB').resize((512, 512), Image.LANCZOS)


def main():
    data = json.load(open(os.path.join(ROOT, 'server/cases.json')))
    gifts = {g['id']: g for g in json.load(open(os.path.join(ROOT, 'server/gifts.json')))}
    os.makedirs(os.path.join(ROOT, 'webapp/images/cases'), exist_ok=True)
    only = set(sys.argv[1:])   # python3 tools/case_burst.py case19 case20 — перерисовать только эти
    for i, case in enumerate(data['cases']):
        if only and case['id'] not in only: continue
        render(case, gifts, seed=i).save(os.path.join(ROOT, 'webapp', case['image']), quality=90, method=6)
        print('burst', case['id'], case['name'])


if __name__ == '__main__':
    main()
