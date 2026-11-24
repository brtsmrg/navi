"""Starts the home voice: the server, a secure Cloudflare tunnel to it, and a page with a QR code to connect your phone."""
import base64, hashlib, json, os, re, subprocess, sys, threading, time, urllib.request, webbrowser
from pathlib import Path

HERE = Path(__file__).resolve().parent
PORT = int(os.environ.get('NAVI_PORT', '8808'))
EXE = HERE / 'cloudflared.exe'
NAVI = 'https://brtsmrg.github.io/navi/'


def say(*a):
    print(*a, flush=True)


def ensure_cloudflared():
    if EXE.exists() and EXE.stat().st_size > 10_000_000:
        return
    say('Downloading the secure tunnel program (cloudflared, about 40 MB) ...')
    rel = json.load(urllib.request.urlopen(urllib.request.Request('https://api.github.com/repos/cloudflare/cloudflared/releases/latest', headers={'User-Agent': 'navi-voice'}), timeout=30))
    asset = next(a for a in rel['assets'] if a['name'] == 'cloudflared-windows-amd64.exe')
    data = urllib.request.urlopen(asset['browser_download_url'], timeout=300).read()
    want = (asset.get('digest') or '').replace('sha256:', '')
    got = hashlib.sha256(data).hexdigest()
    if want and want != got:
        raise SystemExit('The downloaded tunnel program did not match its published checksum. Stopped for safety.')
    if len(data) < 10_000_000:
        raise SystemExit('The tunnel program download looks incomplete.')
    EXE.write_bytes(data)
    say('Tunnel program ready (checksum ' + (got[:12] if want else 'not published, size checked only') + ').')


def start_tunnel():
    p = subprocess.Popen([str(EXE), 'tunnel', '--url', f'http://127.0.0.1:{PORT}', '--no-autoupdate'], stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1)
    found = {}

    def pump():
        for line in p.stdout:
            m = re.search(r'https://[a-z0-9-]+\.trycloudflare\.com', line)
            if m and 'url' not in found:
                found['url'] = m.group(0)
    threading.Thread(target=pump, daemon=True).start()
    for _ in range(120):
        if 'url' in found:
            return p, found['url']
        if p.poll() is not None:
            break
        time.sleep(0.5)
    p.terminate()
    raise SystemExit('The secure tunnel did not start. Check the internet connection and run again.')


def connect_page(url, token):
    link = NAVI + '#home=' + base64.urlsafe_b64encode(json.dumps({'u': url, 't': token}).encode()).decode().rstrip('=')
    try:
        import qrcode

        img = qrcode.make(link)
        import io

        b = io.BytesIO()
        img.save(b, format='PNG')
        qr = '<img alt="QR code" width="320" height="320" src="data:image/png;base64,' + base64.b64encode(b.getvalue()).decode() + '">'
    except Exception as e:  # noqa: BLE001
        qr = f'<p>(QR code unavailable: {e})</p>'
    html = f'''<!doctype html><meta charset="utf-8"><title>Navi home voice</title>
<body style="font-family:system-ui;background:#000;color:#fff;max-width:560px;margin:40px auto;padding:0 16px">
<h1>Navi home voice is running</h1>
<p>On your phone, scan this code with the camera and open the link. Navi will fill in the home voice settings by itself.</p>
{qr}
<p>Or open this link on the phone:<br><a style="color:#7fd" href="{link}">{link[:60]}...</a></p>
<p>Keep the black window open while you prepare roads in Navi. It can be closed when you are done. Each start makes a new link.</p></body>'''
    f = HERE / 'connect.html'
    f.write_text(html, encoding='utf-8')
    webbrowser.open(f.as_uri())
    (HERE / 'last-link.txt').write_text(link)


def main():
    ensure_cloudflared()
    import server

    token = server.TOKEN
    tun, url = start_tunnel()
    say('Tunnel:', url)
    connect_page(url, token)
    say('Starting the voice. The first start downloads the voice model (about 3 GB) and can take several minutes.')
    try:
        threading.Thread(target=server.load_model, daemon=True).start()  # the web part answers at once; speech waits for the model
        import uvicorn

        uvicorn.run(server.make_app(), host='127.0.0.1', port=PORT, log_level='warning')
    finally:
        tun.terminate()


if __name__ == '__main__':
    main()
