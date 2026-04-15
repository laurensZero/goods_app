import json
import pathlib
import sys


def prune_channel(channel_dir: pathlib.Path) -> int:
    history_file = channel_dir / "versions.json"
    if not history_file.exists():
        return 0

    try:
        data = json.loads(history_file.read_text(encoding="utf-8"))
    except Exception:
        data = []

    keep_urls = {
        str(item.get("url", "")).strip()
        for item in data
        if isinstance(item, dict) and str(item.get("url", "")).strip()
    }

    removed = 0
    for bundle in channel_dir.glob("bundle-*.zip"):
        if bundle.name in keep_urls:
            continue
        bundle.unlink(missing_ok=True)
        removed += 1

    return removed


def main() -> int:
    pages_dir = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else "pages")
    if not pages_dir.exists() or not pages_dir.is_dir():
        return 0

    removed_total = 0
    for channel_dir in sorted(path for path in pages_dir.iterdir() if path.is_dir()):
        removed_total += prune_channel(channel_dir)

    print(f"Removed stale bundles: {removed_total}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
