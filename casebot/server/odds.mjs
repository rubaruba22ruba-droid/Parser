// Шансы кейсов. Модель «сочный дроп»:
//   • доля открытий дороже цены кейса = hit (по умолчанию 60%);
//   • проигрышный дроп: вес ∝ (v/p)^kDown, мусор (< 25% цены) — не больше junkCap;
//   • из них крупные (x1.5 и дороже) — доля tail; внутри «плюсовых» вес ∝ (v/p)^-kUp;
//   • kDown подбирается так, чтобы средняя выдача = RTP × цена (больше RTP — проигрыш ближе к цене кейса);
//   • один подарок — не больше maxItem открытий, чтобы не падало одно и то же.
// Если с такими подарками цель недостижима, сначала двигаем долю крупных, потом снимаем лимит, потом долю «в плюс».
// Ручные шансы из админки (manual: {giftId: %}) имеют приоритет.
export const RARITY = r => r >= 10 ? 'legendary' : r >= 4 ? 'mythic' : r >= 2 ? 'purple' : r >= 1 ? 'epic' : r >= 0.6 ? 'rare' : r >= 0.3 ? 'common' : 'uncommon';
const JUNK = 0.25;

const norm = w => { const t = w.reduce((s, x) => s + x, 0) || 1; return w.map(x => x / t); };
// доли внутри группы, ни одна не больше cap (лишнее раздаём остальным пропорционально)
function capShares(w, cap) {
  if (cap * w.length <= 1) return w.map(() => 1 / w.length);
  w = norm(w); const fixed = new Set();
  for (let it = 0; it < w.length; it++) {
    const over = w.findIndex((x, i) => !fixed.has(i) && x > cap + 1e-12); if (over < 0) break;
    w.forEach((x, i) => { if (!fixed.has(i) && x > cap) { w[i] = cap; fixed.add(i); } });
    const restMass = 1 - fixed.size * cap, free = w.reduce((s, x, i) => s + (fixed.has(i) ? 0 : x), 0) || 1;
    w = w.map((x, i) => fixed.has(i) ? x : x * restMass / free);
  }
  return w;
}
function build(up, down, p, a, kUp, kDown, junkCap, maxItem) {
  const wu = capShares(up.map(g => Math.pow(g.value / p, -kUp)), maxItem / Math.max(1e-9, a));
  let wd = norm(down.map(g => Math.pow(g.value / p, kDown)));
  const isJunk = down.map(g => g.value < p * JUNK), cap = Math.min(1, junkCap / Math.max(1e-9, 1 - a));
  for (let r = 0; r < 4; r++) {                    // лимит на один подарок, потом лимит на мусор (пара проходов)
    wd = capShares(wd, maxItem / Math.max(1e-9, 1 - a));
    const junk = wd.reduce((s, w, i) => s + (isJunk[i] ? w : 0), 0);
    if (junk > cap && junk < 1) wd = wd.map((w, i) => isJunk[i] ? w * cap / junk : w * (1 - cap) / (1 - junk));
  }
  return [...up.map((g, i) => ({ g, p: wu[i] * a })), ...down.map((g, i) => ({ g, p: wd[i] * (1 - a) }))];
}
const rtpOf = (items, p) => items.reduce((s, x) => s + x.p * x.g.value, 0) / p;
// корень монотонной функции f на [lo, hi] (f убывает или возрастает — неважно)
function bisect(f, lo, hi, target) {
  const inc = f(hi) > f(lo);
  for (let i = 0; i < 80; i++) { const m = (lo + hi) / 2; if ((f(m) < target) === inc) lo = m; else hi = m; }
  return (lo + hi) / 2;
}

export function computeCase(def, giftById, { rtp = 0.94, hit = 0.6, tail = 0.1, kDown = 1.5, junkCap = 0.04, maxItem = 0.2, manual = null } = {}) {
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
    let a = !down.length ? 1 : !up.length ? 0 : hit, kD = kDown, cap = maxItem, kU = 3;
    const KU_LO = 0.05, KU_HI = 30, KD_LO = -4, KD_HI = 8;
    const make = (a, kU, kD) => build(up, down, p, a, kU, kD, junkCap, cap);
    const at = (a, kU, kD) => rtpOf(make(a, kU, kD), p);
    const tailOf = kU => make(a, kU, kD).reduce((s, x) => s + (x.g.value >= p * 1.5 ? x.p : 0), 0);
    if (up.length && down.length) {
      let done = false;
      for (const c of [maxItem, maxItem * 1.5, maxItem * 2, 1]) {
        cap = Math.min(1, c); kD = kDown;
        // 1) крупные выигрыши (x1.5 и выше) — доля tail
        kU = tailOf(KU_LO) <= tail ? KU_LO : tailOf(KU_HI) >= tail ? KU_HI : bisect(tailOf, KU_LO, KU_HI, tail);
        // 2) проигрыш подбираем под RTP
        if (at(a, kU, KD_LO) <= rtp && at(a, kU, KD_HI) >= rtp) { kD = bisect(k => at(a, kU, k), KD_LO, KD_HI, rtp); done = true; break; }
        if (at(a, kU, KD_LO) > rtp) {                   // слишком щедро даже с дешёвым проигрышем — меньше крупных
          kD = KD_LO;
          if (at(a, KU_HI, kD) <= rtp) { kU = bisect(k => at(a, k, kD), kU, KU_HI, rtp); done = true; break; }
          continue;                                      // не выходит с этим лимитом на один подарок — ослабляем
        }
        kD = KD_HI;                                      // не дотягиваем даже с проигрышем у цены — больше крупных
        if (at(a, KU_LO, kD) >= rtp) kU = bisect(k => at(a, k, kD), KU_LO, kU, rtp);
        else { kU = KU_LO; a = at(0.95, kU, kD) >= rtp ? bisect(x => at(x, kU, kD), a, 0.95, rtp) : 0.95; }
        done = true; break;
      }
      if (!done) { kD = KD_LO; kU = KU_HI; a = bisect(x => at(x, KU_HI, kD), 0.02, a, rtp); }   // меньше «в плюс»
    }
    items = make(a, kU, kD).map(x => ({ giftId: x.g.id, p: x.p }));
  }
  items = items.filter(it => it.p > 0).map(it => ({ ...it, rarity: def.free ? (giftById.get(it.giftId).kind === 'regular' ? 'uncommon' : 'legendary') : RARITY(giftById.get(it.giftId).value / p) }));
  items.sort((x, y) => giftById.get(y.giftId).value - giftById.get(x.giftId).value);
  const ev = items.reduce((s, it) => s + it.p * giftById.get(it.giftId).value, 0);
  const hitP = items.filter(it => giftById.get(it.giftId).value >= p).reduce((s, it) => s + it.p, 0);
  return { ...def, items, rtp: def.free ? null : ev / p, hit: def.free ? null : hitP };
}
