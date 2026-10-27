"""
Обложки кейсов: тёмная карточка, цветные лучи, реальные 3D-подарки (герой + спутники) с тенью и свечением.
Запуск после build.mjs:  python3 tools/case_art.py      (нужен только Pillow)
"""
import json, math, os, random
from PIL import Image, ImageDraw, ImageFilter, ImageChops

ROOT = os.path.join(os.path.dirname(__file__), '..')
S = 512

def hexrgb(h): h = h.lstrip('#'); return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))

def rounded_mask(size, r):
    m = Image.new('L', (size, size), 0); ImageDraw.Draw(m).rounded_rectangle([0, 0, size - 1, size - 1], r, fill=255); return m

def radial(size, color, alpha, radius, center=(.5, .5)):
    """Мягкое круглое свечение."""
    g = Image.new('L', (size, size), 0); d = ImageDraw.Draw(g)
    cx, cy = center[0] * size, center[1] * size; R = radius * size
    for i in range(60, 0, -1):
        r = R * i / 60; d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=int(alpha * (1 - i / 60) ** 1.6))
    g = g.filter(ImageFilter.GaussianBlur(size * .02))
    layer = Image.new('RGBA', (size, size), color + (0,)); layer.putalpha(g); return layer

def rays(size, colors, n=18, seed=1):
    rnd = random.Random(seed); layer = Image.new('RGBA', (size, size), (0, 0, 0, 0)); d = ImageDraw.Draw(layer)
    cx = cy = size / 2; R = size * .9; off = rnd.random() * 360
    for i in range(n):
        a0 = math.radians(off + i * 360 / n); w = math.radians(rnd.uniform(4, 11))
        c = colors[i % len(colors)]; al = rnd.randint(60, 140)
        d.polygon([(cx, cy), (cx + R * math.cos(a0 - w), cy + R * math.sin(a0 - w)), (cx + R * math.cos(a0 + w), cy + R * math.sin(a0 + w))], fill=c + (al,))
    # затухание от центра к краям
    fade = Image.new('L', (size, size), 0); fd = ImageDraw.Draw(fade)
    for i in range(50, 0, -1):
        r = size * .62 * i / 50; fd.ellipse([cx - r, cy - r, cx + r, cy + r], fill=int(255 * (1 - i / 50) ** .9))
    a = ImageChops.multiply(layer.getchannel('A'), fade); layer.putalpha(a)
    return layer.filter(ImageFilter.GaussianBlur(3))

def sparkles(size, seed=2, n=14):
    rnd = random.Random(seed); layer = Image.new('RGBA', (size, size), (0, 0, 0, 0)); d = ImageDraw.Draw(layer)
    for _ in range(n):
        x, y = rnd.uniform(.06, .94) * size, rnd.uniform(.06, .94) * size; r = rnd.uniform(3, 9); a = rnd.randint(150, 255)
        d.polygon([(x, y - r * 2.2), (x + r * .35, y - r * .35), (x + r * 2.2, y), (x + r * .35, y + r * .35), (x, y + r * 2.2), (x - r * .35, y + r * .35), (x - r * 2.2, y), (x - r * .35, y - r * .35)], fill=(255, 255, 255, a))
    for _ in range(n * 2):
        x, y = rnd.uniform(0, 1) * size, rnd.uniform(0, 1) * size; r = rnd.uniform(1, 2.4)
        d.ellipse([x - r, y - r, x + r, y + r], fill=(255, 255, 255, rnd.randint(80, 200)))
    return layer

def place(canvas, icon, cx, cy, size, rot, glow):
    im = icon.resize((size, size), Image.LANCZOS).rotate(rot, Image.BICUBIC, expand=True)
    x, y = int(cx - im.width / 2), int(cy - im.height / 2); a = im.getchannel('A')
    gl = Image.new('RGBA', im.size, glow + (0,)); gl.putalpha(a.point(lambda v: int(v * .85)))
    pad = 40; big = Image.new('RGBA', (im.width + pad * 2, im.height + pad * 2), (0, 0, 0, 0))
    big.paste(gl, (pad, pad), gl); big = big.filter(ImageFilter.GaussianBlur(14)); canvas.alpha_composite(big, (x - pad, y - pad))
    sh = Image.new('RGBA', (im.width + pad * 2, im.height + pad * 2), (0, 0, 0, 0)); blk = Image.new('RGBA', im.size, (0, 0, 0, 0)); blk.putalpha(a.point(lambda v: int(v * .6)))
    sh.paste(blk, (pad, pad + 10), blk); sh = sh.filter(ImageFilter.GaussianBlur(9)); canvas.alpha_composite(sh, (x - pad, y - pad))
    canvas.alpha_composite(im, (x, y))

def compose(theme, hero, sats, seed):
    c1, c2, c3 = (hexrgb(c) for c in theme)
    base = Image.new('RGBA', (S, S)); d = ImageDraw.Draw(base)
    for y in range(S):   # фон в цвете кейса (не чёрный): сверху светлее, снизу глубже
        t = y / S; k = .78 - .38 * t; d.line([(0, y), (S, y)], fill=(int(c2[0] * k + 14), int(c2[1] * k + 14), int(c2[2] * k + 26), 255))
    base.alpha_composite(radial(S, c1, 235, .62, (.5, .46)))
    base.alpha_composite(rays(S, [c1, c3, (255, 255, 255), c3], seed=seed))
    base.alpha_composite(radial(S, c3, 160, .3, (.5, .5)))
    base.alpha_composite(sparkles(S, seed))
    pos = [(.22, .24, 150, -14), (.79, .25, 140, 13), (.2, .77, 140, 10), (.8, .76, 150, -11)]
    for icon, (x, y, sz, r) in zip(sats, pos): place(base, icon, x * S, y * S, sz, r, c3)
    place(base, hero, S * .5, S * .5, 300, 0, c1)
    # виньетка и рамка
    v = Image.new('L', (S, S), 0); vd = ImageDraw.Draw(v)
    for i in range(30): vd.rounded_rectangle([i, i, S - 1 - i, S - 1 - i], 48, outline=int(150 * (1 - i / 30) ** 2))
    dark = Image.new('RGBA', (S, S), (8, 9, 18, 0)); dark.putalpha(v); base.alpha_composite(dark)
    ImageDraw.Draw(base).rounded_rectangle([1, 1, S - 2, S - 2], 48, outline=(255, 255, 255, 40), width=2)
    base.putalpha(ImageChops.multiply(base.getchannel('A'), rounded_mask(S, 48)))
    return base

def main():
    data = json.load(open(os.path.join(ROOT, 'server/cases.json')))
    gifts = {g['id']: g for g in json.load(open(os.path.join(ROOT, 'server/gifts.json')))}
    os.makedirs(os.path.join(ROOT, 'webapp/images/cases'), exist_ok=True)
    for i, c in enumerate(data['cases']):
        load = lambda gid: Image.open(os.path.join(ROOT, 'webapp', gifts[gid]['image'])).convert('RGBA')
        art = compose(c['theme'], load(c['art'][0]), [load(g) for g in c['art'][1:5]], seed=i + 3)
        art.save(os.path.join(ROOT, 'webapp', c['image']), quality=90, method=6); print('case art', c['id'], c['name'])
    # баннер для приветствия бота 1280x640
    hero = data['cases'][-1]['art']
    b = compose(['#a855f7', '#4c1d95', '#f0abfc'], load(hero[0]), [load(g) for g in hero[1:5]], seed=99).resize((640, 640), Image.LANCZOS)
    ban = Image.new('RGB', (1280, 640), (14, 15, 28)); bd = ImageDraw.Draw(ban)
    for x in range(1280): t = x / 1280; bd.line([(x, 0), (x, 640)], fill=(int(14 + 60 * t), int(15 + 10 * t), int(28 + 90 * t)))
    ban.paste(b, (640, 0), b); bd = ImageDraw.Draw(ban)
    from PIL import ImageFont
    font = lambda sz: ImageFont.truetype('/usr/share/fonts/opentype/inter/Inter-Black.otf', sz)
    bd.text((70, 190), 'DRADE', font=font(118), fill=(255, 255, 255))
    grad = Image.new('RGB', (560, 130)); gd = ImageDraw.Draw(grad)
    for x in range(560): t = x / 560; gd.line([(x, 0), (x, 130)], fill=(255, int(210 - 120 * t), int(90 + 50 * t)))
    m = Image.new('L', (560, 130), 0); ImageDraw.Draw(m).text((0, 0), 'DROP', font=font(118), fill=255); ban.paste(grad, (70, 318), m)
    for k, line in enumerate(['NFT-подарки Telegram', 'бесплатные кейсы · апгрейдер']):   # в две строки — не залезает на картинку
        bd.text((74, 468 + k * 40), line, font=font(30), fill=(190, 196, 240))
    ban.save(os.path.join(ROOT, 'webapp/images/banner.jpg'), quality=88)

if __name__ == '__main__':
    main()
