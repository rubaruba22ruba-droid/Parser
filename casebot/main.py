# Drade Drop: запуск на хостинге «для Python-ботов» (h1cloud и подобные).
# Хостинг запускает этот файл как обычного Python-бота, а он:
#   1) скачивает Node.js 22, если его нет (один раз, ~1 минута);
#   2) если в .env нет WEBAPP_URL — поднимает https-ссылку для мини-аппа через Cloudflare (бесплатно, без регистрации);
#   3) запускает бота + мини-апп (index.js) и перезапускает их, если что-то упало.
# Ничего ставить не нужно: pip install не требуется.
import os, re, sys, time, signal, shutil, platform, tarfile, threading, subprocess, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
NODE_VERSION = 'v22.22.0'
NODE_MIRRORS = [m for m in os.environ.get('NODE_MIRRORS', '').split(',') if m] or ['https://nodejs.org/dist', 'https://npmmirror.com/mirrors/node']
PORT = os.environ.get('PORT') or os.environ.get('SERVER_PORT') or '8080'


def log(*a):
    print('[drade]', *a, flush=True)


def read_env_file():
    out = {}
    try:
        with open(os.path.join(HERE, '.env'), encoding='utf-8') as f:
            for line in f:
                m = re.match(r'\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$', line)
                if m and not line.lstrip().startswith('#'):
                    out[m.group(1)] = m.group(2).strip('"\'')
    except OSError:
        pass
    return out


def arch():
    m = platform.machine().lower()
    return 'arm64' if m in ('aarch64', 'arm64') else 'x64'


def node_ok(path):
    try:
        v = subprocess.run([path, '-v'], capture_output=True, text=True, timeout=20).stdout.strip().lstrip('v').split('.')
        return int(v[0]) > 22 or (int(v[0]) == 22 and int(v[1]) >= 5)
    except Exception:
        return False


def ensure_node():
    local = os.path.join(HERE, '.node', 'bin', 'node')
    for p in (os.environ.get('NODE_BIN'), shutil.which('node'), local):
        if p and os.path.exists(p) and node_ok(p):
            return p
    name = f'node-{NODE_VERSION}-linux-{arch()}'
    for mirror in NODE_MIRRORS:
        url = f'{mirror}/{NODE_VERSION}/{name}.tar.gz'
        log('скачиваю Node.js', NODE_VERSION, '—', url)
        try:
            tmp = os.path.join(HERE, '.node-tmp')
            shutil.rmtree(tmp, ignore_errors=True)
            os.makedirs(os.path.join(tmp, 'bin'))
            with urllib.request.urlopen(url, timeout=120) as resp, tarfile.open(fileobj=resp, mode='r|gz') as tar:
                for member in tar:          # берём только сам node, без npm — меньше места на диске
                    if member.name == f'{name}/bin/node':
                        with tar.extractfile(member) as src, open(os.path.join(tmp, 'bin', 'node'), 'wb') as dst:
                            shutil.copyfileobj(src, dst)
                        break
            os.chmod(os.path.join(tmp, 'bin', 'node'), 0o755)
            shutil.rmtree(os.path.join(HERE, '.node'), ignore_errors=True)
            os.rename(tmp, os.path.join(HERE, '.node'))
            if node_ok(local):
                log('Node.js готов')
                return local
        except Exception as e:
            log('не получилось:', e)
    log('Node.js скачать не удалось. Проверь, что у хостинга есть доступ в интернет.')
    sys.exit(1)


def ensure_cloudflared():
    p = os.environ.get('CLOUDFLARED_BIN') or shutil.which('cloudflared') or os.path.join(HERE, '.node', 'cloudflared')
    if os.path.exists(p):
        return p
    url = f'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-{"arm64" if arch() == "arm64" else "amd64"}'
    log('скачиваю cloudflared для https-ссылки —', url)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with urllib.request.urlopen(url, timeout=120) as resp, open(p + '.tmp', 'wb') as f:
        shutil.copyfileobj(resp, f)
    os.chmod(p + '.tmp', 0o755)
    os.rename(p + '.tmp', p)
    return p


def start_tunnel():
    """Бесплатная https-ссылка Cloudflare на локальный порт. Ссылка меняется при каждом перезапуске —
    бот сам обновляет кнопку «Играть» в меню и в закреплённых сообщениях."""
    cf = ensure_cloudflared()
    proc = subprocess.Popen([cf, 'tunnel', '--no-autoupdate', '--url', f'http://127.0.0.1:{PORT}'],
                            stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1)
    found, url = threading.Event(), [None]

    def reader():
        for line in proc.stdout:
            m = re.search(r'https://[a-z0-9-]+\.trycloudflare\.com', line)
            if m and not found.is_set():
                url[0] = m.group(0); found.set()
            elif ' ERR ' in line and 'trycloudflare' not in line:
                log('cloudflared:', line.strip()[:200])
    threading.Thread(target=reader, daemon=True).start()
    if not found.wait(90):
        proc.kill()
        raise RuntimeError('cloudflared не выдал ссылку за 90 секунд')
    return proc, url[0]


children = []


def stop_children(*_):
    for p in children:
        if p and p.poll() is None:
            p.terminate()
    for p in children:
        try:
            p and p.wait(10)
        except Exception:
            p.kill()


def on_signal(*_):
    stop_children(); sys.exit(0)


signal.signal(signal.SIGTERM, on_signal)
signal.signal(signal.SIGINT, on_signal)


def main():
    node = ensure_node()
    while True:
        env_file = read_env_file()
        url = os.environ.get('WEBAPP_URL') or env_file.get('WEBAPP_URL') or ''
        tunnel = None
        if not url:
            try:
                tunnel, url = start_tunnel()
            except Exception as e:
                log('https-ссылку поднять не удалось:', e, '— бот запустится без кнопки «Играть»')
        if url:
            log('мини-апп:', url)
        env = dict(os.environ, PORT=PORT, WEBAPP_URL=url)
        app = subprocess.Popen([node, '--no-warnings', 'index.js'], cwd=HERE, env=env)
        children[:] = [app, tunnel]
        while app.poll() is None and (tunnel is None or tunnel.poll() is None):
            time.sleep(2)
        log('процесс остановился — перезапуск через 5 секунд')
        stop_children()
        time.sleep(5)


if __name__ == '__main__':
    main()
