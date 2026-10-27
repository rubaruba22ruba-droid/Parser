// Точка входа для любого хостинга: «node index.js» или «npm start».
// Нужен Node.js 22.5+ (встроенная база SQLite). На 22.5–22.12 сам перезапускается с флагом --experimental-sqlite.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 22 || (major === 22 && minor < 5)) {
  console.error(`Нужен Node.js 22.5 или новее, а у вас ${process.version}. Выберите Node 22 (или новее) в настройках хостинга.`);
  process.exit(1);
}
let sqliteOk = true;
try { await import('node:sqlite'); } catch { sqliteOk = false; }
if (!sqliteOk && !process.execArgv.includes('--experimental-sqlite')) {
  const child = spawn(process.execPath, ['--experimental-sqlite', '--no-warnings', fileURLToPath(import.meta.url)], { stdio: 'inherit' });
  for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => child.kill(sig));
  child.on('exit', code => process.exit(code ?? 0));
} else {
  process.removeAllListeners('warning');
  await import('./server/main.mjs');
}
