import json
import os
import sys


def fail(message: str, code: int = 1) -> int:
    print(message, file=sys.stderr)
    return code


def main() -> int:
    history_file = os.environ.get('HISTORY_FILE', '').strip()
    rollback_version = os.environ.get('ROLLBACK_VERSION', '').strip()
    version = os.environ.get('VERSION', '').strip()
    url = os.environ.get('URL', '').strip()
    hashv = os.environ.get('HASH', '').strip()
    min_native = os.environ.get('INPUT_MIN_NATIVE', '').strip()
    notes = os.environ.get('INPUT_NOTES', '').strip()
    published_at = os.environ.get('PUBLISHED_AT', '').strip()
    channel = os.environ.get('CHANNEL', '').strip()
    bundle_name = os.environ.get('BUNDLE_NAME', '').strip()
    mode = os.environ.get('MODE', '').strip()

    if not history_file:
        return fail('HISTORY_FILE 为空，无法生成 manifest。')

    try:
        with open(history_file, 'r', encoding='utf-8') as f:
            data = json.load(f)
        items = data if isinstance(data, list) else []
    except Exception:
        items = []

    if rollback_version:
        target = next((x for x in items if str(x.get('version', '')).strip() == rollback_version), None)
        if not target:
            return fail(f'回档版本不在最近历史中: {rollback_version}', 2)

        version = str(target.get('version', '')).strip()
        url = str(target.get('url', '')).strip()
        hashv = str(target.get('hash', '')).strip()
        min_native = '' if target.get('minNativeVersion') is None else str(target.get('minNativeVersion')).strip()
        notes = '' if target.get('notes') is None else str(target.get('notes')).strip()
        published_at = str(target.get('publishedAt', '')).strip()
        mode = 'rollback'
        bundle_name = '(existing)'

    if not version or not url or not hashv:
        return fail('manifest 必需字段缺失（version/url/hash）', 3)

    manifest = {
        'version': version,
        'url': url,
        'hash': hashv,
        'minNativeVersion': (min_native or None),
        'notes': (notes or None),
        'publishedAt': published_at,
    }

    manifest_path = os.path.join(os.path.dirname(history_file), 'manifest.json')
    with open(manifest_path, 'w', encoding='utf-8') as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)

    entry = {
        'version': version,
        'url': url,
        'hash': hashv,
        'minNativeVersion': (min_native or None),
        'notes': (notes or None),
        'publishedAt': published_at,
    }

    items = [x for x in items if str(x.get('version', '')).strip() != version]
    items.insert(0, entry)
    items = items[:3]

    with open(history_file, 'w', encoding='utf-8') as f:
        json.dump(items, f, ensure_ascii=False, indent=2)

    print(f'mode={mode}')
    print(f'channel={channel}')
    print(f'version={version}')
    print(f'bundle={bundle_name}')
    print(f'url={url}')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
