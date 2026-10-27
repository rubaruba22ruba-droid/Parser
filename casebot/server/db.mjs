import { DatabaseSync } from 'node:sqlite';
import { cfg } from './config.mjs';
export const db = new DatabaseSync(cfg.dbPath);
db.exec(`
PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY, username TEXT, name TEXT, photo_url TEXT, balance INTEGER NOT NULL DEFAULT 0,
  referred_by INTEGER, ref_spent INTEGER NOT NULL DEFAULT 0, banned INTEGER NOT NULL DEFAULT 0, used_ref_promo INTEGER NOT NULL DEFAULT 0, created INTEGER, last_seen INTEGER);
CREATE TABLE IF NOT EXISTS inventory(id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, gift_id TEXT, name TEXT, value INTEGER, image TEXT, rarity TEXT,
  case_id TEXT, state TEXT NOT NULL DEFAULT 'owned', created INTEGER);
CREATE INDEX IF NOT EXISTS inv_user ON inventory(user_id, state);
CREATE TABLE IF NOT EXISTS opens(id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, case_id TEXT, price INTEGER, gift_id TEXT, value INTEGER, created INTEGER);
CREATE TABLE IF NOT EXISTS deposits(id INTEGER PRIMARY KEY AUTOINCREMENT, ref TEXT UNIQUE, kind TEXT, user_id INTEGER, stars INTEGER, ton REAL, created INTEGER);
CREATE INDEX IF NOT EXISTS dep_user ON deposits(user_id, created);
CREATE TABLE IF NOT EXISTS intents(id TEXT PRIMARY KEY, user_id INTEGER, amount_nano TEXT, amount_ton REAL, comment TEXT, status TEXT DEFAULT 'pending', credited INTEGER DEFAULT 0, created INTEGER);
CREATE TABLE IF NOT EXISTS withdrawals(id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, inv_id INTEGER, state TEXT DEFAULT 'pending', created INTEGER, updated INTEGER);
CREATE TABLE IF NOT EXISTS free_opens(user_id INTEGER, case_id TEXT, opened_at INTEGER, PRIMARY KEY(user_id, case_id));
CREATE TABLE IF NOT EXISTS daily_shares(user_id INTEGER, day TEXT, n INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(user_id, day));
CREATE TABLE IF NOT EXISTS ref_promos(code TEXT PRIMARY KEY, user_id INTEGER UNIQUE, uses INTEGER NOT NULL DEFAULT 0);
`);
export const q = (sql, ...a) => db.prepare(sql).all(...a);
export const one = (sql, ...a) => db.prepare(sql).get(...a);
export const run = (sql, ...a) => db.prepare(sql).run(...a);
export const tx = fn => { db.exec('BEGIN IMMEDIATE'); try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; } };
