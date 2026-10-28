// Апгрейд: зоны колеса и золото «?».
//
// Колесо — всё везение внизу (бросок x = 0.5 — ровно 6 часов):
//  • зона цели шириной c по центру низа: [w0, w0 + c), w0 = 0.5 − c/2;
//  • золото появляется НЕ на каждой прокрутке, а с шансом q (diamondChance, по умолчанию 5.5%): тогда по центру низа
//    открывается золотая зона «?» шириной d (diamondZone, 5% круга): [d0, d0 + d), d0 = 0.5 − d/2.
//    Стрелка в ней — выпадает NFT в diamondMin…diamondMax раз дороже цели (1.5–4×), какой именно — по положению
//    стрелки внутри зоны: пул от дешёвого к дорогому, шанс каждого ∝ 1/цена.
//  • RTP апгрейда не меняется: зона цели чуть уже обычной ровно на стоимость золота, средняя выдача = ставка × upgradeFactor.
// Оба числа — x (куда встала стрелка) и y (появилось ли золото: y < q) — из одного честного HMAC.
// Та же логика — в webapp/js/diamond.js (DDZones), чтобы колесо показывало зону до прокрутки.

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const byValue = (a, b) => a.value - b.value || (a.id < b.id ? -1 : 1);

export function upgradeZones(stake, target, gifts, s) {
  const cN = stake / target * s.upgradeFactor, maxC = s.upgradeMaxChance;
  const d = clamp(Number(s.diamondZone ?? 0.05), 0, 0.3), q0 = clamp(Number(s.diamondChance ?? 0.055), 0, 1);
  const lo = target * (s.diamondMin || 1.5), hi = target * (s.diamondMax || 4);
  const pool = d > 0 && q0 > 0 ? gifts.filter(g => g.kind !== 'regular' && g.value >= lo && g.value <= hi).sort(byValue) : [];
  const Z = (c, d, q, pool) => ({ c, d, q, w0: 0.5 - c / 2, d0: 0.5 - d / 2, pool });
  if (!pool.length) return Z(Math.min(maxC, cN), 0, 0, []);
  const inv = pool.reduce((a, g) => a + 1 / g.value, 0), m = pool.length / inv / target;   // средний приз алмаза в целях
  const q = Math.min(q0, 0.5 * cN / (d * m));        // алмаз не забирает больше половины выдачи (на очень больших x)
  let c = cN - q * d * (m - 1);                      // обычный случай: алмаз внутри зоны цели
  if (c < d) c = (cN - q * d * m) / (1 - q);         // цель уже алмаза: в прокрутках с алмазом он перекрывает её целиком
  return Z(clamp(c, 0, maxC), d, q, pool.map(g => ({ ...g, p: 1 / g.value / inv })));
}

// исход: 'diamond' | 'win' | 'lose'; gold — появился ли алмаз на этой прокрутке
export function outcome(z, x, y) {
  const gold = z.d > 0 && y < z.q;
  if (gold && x >= z.d0 && x < z.d0 + z.d) return 'diamond';
  return x >= z.w0 && x < z.w0 + z.c ? 'win' : 'lose';
}

// u ∈ [0,1): идём по пулу (от дешёвого к дорогому) и копим шансы
export function pickPool(pool, u) {
  let a = 0;
  for (const g of pool) { a += g.p; if (u < a) return g; }
  return pool[pool.length - 1];
}
