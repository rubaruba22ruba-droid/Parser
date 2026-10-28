// Алмазная зона апгрейда: маленький сектор внизу колеса. Стрелка встала в него — выпадает NFT
// в diamondMin…diamondMax раз дороже цели (по умолчанию 1.5–4×). RTP апгрейда не меняется:
// часть шанса победы (diamondShare) переносится в алмаз, а размер алмаза считается так,
// чтобы средняя выдача осталась ставка × upgradeFactor.
//   зелёная зона: [0, c)        — цель
//   алмаз:        [d0, d0 + d)  — подарок из пула; какой именно — по положению броска внутри алмаза
// Та же формула — в webapp/js/upgrade.js (DDZones), чтобы колесо показывало зоны до прокрутки.

export function upgradeZones(stake, target, gifts, s) {
  const cN = stake / target * s.upgradeFactor;
  const share = Math.max(0, Math.min(0.9, Number(s.diamondShare) || 0));
  const lo = target * (s.diamondMin || 1.5), hi = target * (s.diamondMax || 4);
  const pool = share > 0 ? gifts.filter(g => g.kind !== 'regular' && g.value >= lo && g.value <= hi)
    .sort((a, b) => a.value - b.value || (a.id < b.id ? -1 : 1)) : [];
  if (!pool.length) return { c: Math.min(s.upgradeMaxChance, cN), d: 0, d0: 0, pool: [] };
  // шанс подарка в пуле ∝ 1/цена — дешёвые чаще; средняя цена = гармоническое среднее
  const inv = pool.reduce((a, g) => a + 1 / g.value, 0), mean = pool.length / inv;
  const c = Math.min(s.upgradeMaxChance, (1 - share) * cN);
  const d = Math.min(0.2, share * cN * target / mean);
  const d0 = Math.max(c + 0.01, 0.5 - d / 2);   // по центру низа колеса, но не внутри зелёной зоны
  return { c, d, d0, pool: pool.map(g => ({ ...g, p: 1 / g.value / inv })) };
}

// u ∈ [0,1) — положение броска внутри алмаза; идём по пулу от дешёвого к дорогому и копим шансы
export function pickDiamond(pool, u) {
  let a = 0;
  for (const g of pool) { a += g.p; if (u < a) return g; }
  return pool[pool.length - 1];
}
