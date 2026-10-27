// Шансы кейсов. Модель «щедрый дроп»: подарки дороже цены кейса выпадают часто (~30–45% открытий),
// остальное — подарки дешевле; доля «плюсовых» подбирается так, чтобы средняя выдача = RTP × цена.
//   внутри «плюсовых»  вес ∝ (v/p)^-kUp   — чаще всего чуть дороже цены, джекпоты редко
//   внутри «минусовых» вес ∝ (v/p)^-kDown — тянет к более дешёвым, чтобы освободить место «плюсовым»
// Ручные шансы из админки (manual: {giftId: %}) имеют приоритет.
export const RARITY = r => r >= 10 ? 'legendary' : r >= 4 ? 'mythic' : r >= 2 ? 'purple' : r >= 1 ? 'epic' : r >= 0.6 ? 'rare' : r >= 0.3 ? 'common' : 'uncommon';

export function computeCase(def, giftById, { rtp = 0.7, kUp = 2.2, kDown = 0.8, maxHit = 0.6, manual = null } = {}) {
  const gifts = def.items.map(id => giftById.get(id)).filter(Boolean);
  const p = def.price || def.refValue || 1;
  let items;
  if (manual && Object.keys(manual).length) {
    const tot = gifts.reduce((s, g) => s + (Number(manual[g.id]) || 0), 0) || 1;
    items = gifts.map(g => ({ giftId: g.id, p: (Number(manual[g.id]) || 0) / tot }));
  } else if (def.free) {
    items = def.free.map(([id, pr]) => ({ giftId: id, p: pr }));
  } else {
    const up = gifts.filter(g => g.value >= p), down = gifts.filter(g => g.value < p);
    const norm = (arr, k) => { const w = arr.map(g => Math.pow(g.value / p, -k)); const t = w.reduce((a, b) => a + b, 0); return arr.map((g, i) => ({ g, w: w[i] / t })); };
    const U = norm(up, kUp), D = norm(down, kDown);
    const EU = U.reduce((s, x) => s + x.w * x.g.value, 0), ED = D.reduce((s, x) => s + x.w * x.g.value, 0);
    let a = up.length && down.length ? (rtp * p - ED) / (EU - ED) : up.length ? 1 : 0;
    a = Math.max(0.02, Math.min(maxHit, a));
    items = [...U.map(x => ({ giftId: x.g.id, p: x.w * a })), ...D.map(x => ({ giftId: x.g.id, p: x.w * (1 - a) }))];
    // если упёрлись в maxHit/минимум — добиваем RTP точно, сдвигая вес внутри «минусовых»
    const ev = () => items.reduce((s, it) => s + it.p * giftById.get(it.giftId).value, 0);
    for (let iter = 0; iter < 60 && Math.abs(ev() / p - rtp) > 1e-4 && down.length > 1; iter++) {
      const k = ev() / p > rtp ? 1.15 : 0.87, dn = items.filter(it => giftById.get(it.giftId).value < p);
      const mass = dn.reduce((s, it) => s + it.p, 0);
      dn.forEach(it => { it.p *= Math.pow(giftById.get(it.giftId).value / p, -(k > 1 ? 0.25 : -0.25)); });
      const m2 = dn.reduce((s, it) => s + it.p, 0); dn.forEach(it => { it.p *= mass / m2; });
    }
  }
  items = items.filter(it => it.p > 0).map(it => ({ ...it, rarity: def.free ? (giftById.get(it.giftId).kind === 'regular' ? 'uncommon' : 'legendary') : RARITY(giftById.get(it.giftId).value / p) }));
  items.sort((x, y) => giftById.get(y.giftId).value - giftById.get(x.giftId).value);
  const ev = items.reduce((s, it) => s + it.p * giftById.get(it.giftId).value, 0);
  const hit = items.filter(it => giftById.get(it.giftId).value >= p).reduce((s, it) => s + it.p, 0);
  return { ...def, items, rtp: def.free ? null : ev / p, hit: def.free ? null : hit };
}
