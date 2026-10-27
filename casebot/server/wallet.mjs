// Баланс в ⭐, депозиты, реферальные начисления.
import { one, run, q, tx } from './db.mjs';
import { cfg } from './config.mjs';

export const getUser = id => one('SELECT * FROM users WHERE id=?', id);

// Зачисляет депозит ровно один раз (ref уникален: хэш транзакции TON или charge_id Stars).
export function addDeposit({ ref, kind, userId, stars, ton }) {
  return tx(() => {
    const r = run('INSERT OR IGNORE INTO deposits(ref,kind,user_id,stars,ton,created) VALUES(?,?,?,?,?,?)', ref, kind, userId, stars, ton, Date.now());
    if (!r.changes) return 0;
    run('UPDATE users SET balance=balance+? WHERE id=?', stars, userId);
    const u = getUser(userId);
    if (u?.referred_by && kind !== 'admin') {
      const bonus = Math.floor(stars * cfg.referralPercent / 100);
      if (bonus > 0) run('UPDATE users SET balance=balance+? WHERE id=?', bonus, u.referred_by);
    }
    return stars;
  });
}

// Сколько TON (в эквиваленте) пользователь пополнил за окно вывода.
export function depositedTon(userId, days = cfg.withdrawWindowDays) {
  const since = Date.now() - days * 86400000;
  return one("SELECT COALESCE(SUM(ton),0) s FROM deposits WHERE user_id=? AND created>=? AND kind!='admin'", userId, since).s;
}
export const depositedStars = (userId, hours) => one("SELECT COALESCE(SUM(stars),0) s FROM deposits WHERE user_id=? AND created>=? AND kind!='admin'", userId, Date.now() - hours * 3600000).s;
export const referralStats = userId => {
  const count = one('SELECT COUNT(*) c FROM users WHERE referred_by=?', userId).c, spent = getUser(userId)?.ref_spent || 0;
  return { count, spent, available: Math.max(0, count - spent) };
};
