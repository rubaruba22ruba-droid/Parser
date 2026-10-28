// Честная игра (provably fair): каждый результат = HMAC-SHA256(server_seed, `${client_seed}:${nonce}`).
// Игрок заранее видит sha256(server_seed) и может сменить client_seed; после смены пары сервер раскрывает
// старый server_seed, и любой бросок можно пересчитать самому. Подкрутить исход задним числом нельзя.
import { createHash, createHmac, randomBytes } from 'node:crypto';
import { one, run } from './db.mjs';

const sha256 = s => createHash('sha256').update(s).digest('hex');
const newSeed = () => randomBytes(32).toString('hex');

function state(userId) {
  let r = one('SELECT * FROM fair WHERE user_id=?', userId);
  if (!r) {
    run('INSERT INTO fair(user_id,server_seed,client_seed,nonce,created) VALUES(?,?,?,0,?)', userId, newSeed(), randomBytes(8).toString('hex'), Date.now());
    r = one('SELECT * FROM fair WHERE user_id=?', userId);
  }
  return r;
}

// числа из [0,1): x — первые 52 бита HMAC, y — следующие 52 (апгрейд: появилось ли золото). Так же считает проверка в мини-аппе
const hmacHex = (serverSeed, clientSeed, nonce) => createHmac('sha256', serverSeed).update(`${clientSeed}:${nonce}`).digest('hex');
export const rollFrom = (serverSeed, clientSeed, nonce) => parseInt(hmacHex(serverSeed, clientSeed, nonce).slice(0, 13), 16) / 2 ** 52;
export const roll2From = (serverSeed, clientSeed, nonce) => { const h = hmacHex(serverSeed, clientSeed, nonce); return [parseInt(h.slice(0, 13), 16) / 2 ** 52, parseInt(h.slice(13, 26), 16) / 2 ** 52]; };

// следующий бросок игрока (вызывать внутри транзакции вместе с записью результата)
export function nextRoll(userId) {
  const s = state(userId), nonce = s.nonce + 1;
  run('UPDATE fair SET nonce=? WHERE user_id=?', nonce, userId);
  const [x, y] = roll2From(s.server_seed, s.client_seed, nonce);
  return { x, y, nonce, serverSeedHash: sha256(s.server_seed), clientSeed: s.client_seed };
}

export function publicState(userId) {
  const s = state(userId);
  return { serverSeedHash: sha256(s.server_seed), clientSeed: s.client_seed, nonce: s.nonce };
}

// новая пара сидов; старый server_seed раскрывается для проверки прошлых бросков
export function rotate(userId, clientSeed) {
  const s = state(userId), cs = String(clientSeed || '').trim().slice(0, 64) || randomBytes(8).toString('hex');
  run('UPDATE fair SET server_seed=?, client_seed=?, nonce=0, created=? WHERE user_id=?', newSeed(), cs, Date.now(), userId);
  return { revealed: { serverSeed: s.server_seed, serverSeedHash: sha256(s.server_seed), clientSeed: s.client_seed, nonce: s.nonce }, current: publicState(userId) };
}
