# 通过 CF 代理完整跑一遍淘宝扫码登录，定位「未获取到登录凭证」是代理侧还是设备侧
# 用法：python scripts/qr_cf_test.py   （生成 qr_test.png 后用手机淘宝扫码确认）
# 注：Cloudflare 会拦 Python urllib 指纹（error 1010），故用 curl 子进程发请求
import json
import os
import re
import subprocess
import sys
import time
import urllib.parse

PROXY = 'https://goodsapp.de5.net/taobao-page'
QR_ORIGIN = 'https://qrlogin.taobao.com'
LOGIN_ORIGIN = 'https://login.taobao.com'
JAR = {}
HDR_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'qr_cf_headers.txt')
BODY_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'qr_cf_body.txt')
QR_PNG = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'qr_test.png')
JAR_JSON = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'qr_test_jar.json')


def call(method, origin, path, *, referer='', accept='*/*', body=None, origin_hdr=''):
    url = f'{PROXY}{path}'
    cmd = ['curl', '-s', '-X', method, url,
           '-H', f'x-taobao-origin: {origin}',
           '--max-time', '25',
           '-D', HDR_FILE, '-o', BODY_FILE, '-w', '%{http_code}']
    if referer:
        cmd += ['-H', f'x-referer-forward: {urllib.parse.quote(referer, safe="")}']
    if accept:
        cmd += ['-H', f'x-accept-forward: {urllib.parse.quote(accept, safe="")}']
    if origin_hdr:
        cmd += ['-H', f'x-origin-forward: {urllib.parse.quote(origin_hdr, safe="")}']
    if JAR:
        cmd += ['-H', f'x-cookie-forward: {urllib.parse.quote("; ".join(f"{k}={v}" for k, v in JAR.items()), safe="")}']
    if body is not None:
        cmd += ['-H', 'content-type: application/x-www-form-urlencoded', '--data', body]

    proc = subprocess.run(cmd, capture_output=True, text=True, encoding='utf-8', errors='replace')
    status = int((proc.stdout or '0').strip() or 0)
    try:
        with open(BODY_FILE, encoding='utf-8', errors='replace') as f:
            raw = f.read()
    except OSError:
        raw = ''
    sc = []
    try:
        with open(HDR_FILE, encoding='utf-8', errors='replace') as f:
            for line in f:
                if line.lower().startswith('x-upstream-set-cookie-json:'):
                    try:
                        sc = json.loads(line.split(':', 1)[1].strip())
                    except Exception:
                        pass
    except OSError:
        pass
    for line in sc:
        kv = line.split(';', 1)[0]
        name, _, value = kv.partition('=')
        JAR[name.strip()] = value.strip()
    return status, raw, sc


def parse_jsonp(text):
    # 兼容 jsonp1({...}) 与 (function(){jsonp1({...});})(); 两种包裹：
    # 先定位回调名，再平衡大括号取其后的 JSON 对象
    m = re.search(r'jsonp\d*\(', text)
    cb = m.start() if m else -1
    start = text.find('{', cb) if cb >= 0 else text.find('{')
    if start < 0:
        raise ValueError('no json object: ' + text[:120])
    depth = 0
    in_str = False
    quote = ''
    i = start
    while i < len(text):
        ch = text[i]
        if in_str:
            if ch == '\\':
                i += 2
                continue
            if ch == quote:
                in_str = False
        elif ch in '"\'':
            in_str = True
            quote = ch
        elif ch == '{':
            depth += 1
        elif ch == '}':
            depth -= 1
            if depth == 0:
                return json.loads(text[start:i + 1])
        i += 1
    raise ValueError('unbalanced braces: ' + text[:120])


def main():
    ts = str(int(time.time() * 1000))
    data = None
    for attempt in range(5):
        status, body, sc = call('GET', QR_ORIGIN,
            f'/qrcodelogin/generateQRCode4Login.do?adUrl=&adImage=&adText=&viewFd4PC='
            f'&viewFd4Mobile=&from=tb&appkey=00000000&umid_token=&_ksTS={ts}_1&callback=jsonp1',
            referer=f'{LOGIN_ORIGIN}/member/login.jhtml')
        print(f'[generate] try={attempt + 1} status={status} set-cookie={len(sc)} body[:120]={body[:120]!r}', flush=True)
        if status == 200 and 'lgToken' in body:
            data = parse_jsonp(body)
            break
        if status != 200:
            time.sleep(2)
            continue
        # status=200 但没有 lgToken：显示真实失败原因
        print(f'[generate] 未成功：{body[:160]!r}', flush=True)
        time.sleep(2)
    if not data:
        print('❌ generate 连续失败：CF 出口被拦')
        return 1
    print(f'[generate] jar={list(JAR)}', flush=True)
    lg_token = data['lgToken']
    qr_img = 'https:' + data['url']
    png = subprocess.run(['curl', '-s', '--max-time', '20', qr_img], capture_output=True).stdout
    if not png.startswith(b'\x89PNG'):
        print(f'❌ 二维码图下载失败（{len(png)} 字节），重跑即可')
        return 1
    with open(QR_PNG, 'wb') as f:
        f.write(png)
    print(f'[qr] lgToken={lg_token[:8]}… 图片已存 {QR_PNG}，请用手机淘宝扫码确认', flush=True)

    shell_url = ''
    deadline = time.time() + 200
    while time.time() < deadline:
        ts = str(int(time.time() * 1000))
        status, body, _ = call('GET', QR_ORIGIN,
            f'/qrcodelogin/qrcodeLoginCheck.do?lgToken={urllib.parse.quote(lg_token)}'
            f'&defaulturl={urllib.parse.quote("https://www.taobao.com/")}&_ksTS={ts}_2&callback=jsonp2',
            referer=f'{LOGIN_ORIGIN}/member/login.jhtml')
        try:
            data = parse_jsonp(body)
            code = str(data.get('code'))
        except Exception:
            code = f'parse-fail {body[:80]!r}'
        print(f'[poll] {code}', flush=True)
        if code == '10006':
            shell_url = data.get('url', '')
            if not shell_url:
                print(f'❌ 10006 但缺 url：{body[:300]}')
                return 1
            break
        if code == '400':
            print('二维码过期')
            return 1
        time.sleep(1.5)

    if not shell_url:
        print('超时未确认')
        return 1
    if shell_url.startswith('//'):
        shell_url = 'https:' + shell_url
    parsed = urllib.parse.urlparse(shell_url)
    status, body, sc = call('GET', LOGIN_ORIGIN, parsed.path + ('?' + parsed.query if parsed.query else ''),
        referer=f'{LOGIN_ORIGIN}/member/login.jhtml',
        accept='text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8')
    print(f'[shell] status={status} set-cookie={len(sc)} len={len(body)}', flush=True)
    m = re.search(r'window\.viewData\s*=\s*(\{.*?\});', body, re.S)
    if not m:
        print('❌ 壳页缺少 viewData：' + body[:200])
        return 1
    form = json.loads(m.group(1))['loginFormData']
    params = urllib.parse.urlencode(form)

    status, body, sc = call('POST', LOGIN_ORIGIN, '/newlogin/token/loginByIm.do?_bx-v=2.5.37',
        referer=shell_url, accept='application/json, text/plain, */*', body=params,
        origin_hdr=LOGIN_ORIGIN)
    print(f'[newlogin] status={status} set-cookie={len(sc)}', flush=True)
    print(f'[newlogin] keys: {[l.split("=")[0].split(";")[0].strip() for l in sc]}', flush=True)
    print(f'[newlogin] body: {body[:300]}', flush=True)
    print(f'[jar] {len(JAR)} 条，unb={"unb" in JAR} _m_h5_tk={"_m_h5_tk" in JAR}', flush=True)
    print('结论：' + ('✅ 登录 Cookie 完整，问题在设备侧' if 'unb' in JAR else '❌ 代理侧就没拿到登录 Cookie'))
    with open(JAR_JSON, 'w', encoding='utf-8') as f:
        json.dump(JAR, f, ensure_ascii=False, indent=1)
    print('完整 jar 已存 qr_test_jar.json')
    return 0


if __name__ == '__main__':
    sys.exit(main())
