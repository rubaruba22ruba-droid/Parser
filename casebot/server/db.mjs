import { DatabaseSync } from 'node:sqlite';
import { cfg } from './config.mjs';
export const db = new DatabaseSync(cfg.dbPath);
db.exec(`
PRAGMA journal_mode=WAL;
CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY, username TEXT, name TEXT, balance REAL NOT NULL DEFAULT 0, created INTEGER);
CREATE TABLE IF NOT EXISTS inventory(id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, gift_id TEXT, value REAL, case_id TEXT, state TEXT DEFAULT 'owned', created INTEGER);
CREATE TABLE IF NOT EXISTS opens(id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, case_id TEXT, price REAL, gift_id TEXT, value REAL, roll REAL, created INTEGER);
CREATE TABLE IF NOT EXISTS deposits(tx_hash TEXT PRIMARY KEY, user_id INTEGER, amount REAL, created INTEGER);
CREATE TABLE IF NOT EXISTS withdrawals(id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, inv_id INTEGER, state TEXT DEFAULT 'pending', created INTEGER);
CREATE TABLE IF NOT EXISTS kv(k TEXT PRIMARY KEY, v TEXT);
`);
export const q = (sql, ...a) => db.prepare(sql).all(...a);
export const one = (sql, ...a) => db.prepare(sql).get(...a);
export const run = (sql, ...a) => db.prepare(sql).run(...a);
export const tx = fn => { db.exec('BEGIN IMMEDIATE'); try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; } };
