import json
import os
import re
import sys


def main() -> int:
    if len(sys.argv) != 3:
        print("Usage: next_bundle_daily_seq.py <history_file> <date_tag>", file=sys.stderr)
        return 1

    history_file = sys.argv[1].strip()
    date_tag = sys.argv[2].strip()
    pattern = re.compile(rf"^{re.escape(date_tag)}\.(\d+)$")

    items = []
    if history_file and os.path.exists(history_file):
        try:
            with open(history_file, "r", encoding="utf-8") as f:
                payload = json.load(f)
            if isinstance(payload, list):
                items = payload
        except Exception:
            items = []

    max_seq = 0
    for item in items:
        version = str((item or {}).get("version", "")).strip()
        match = pattern.match(version)
        if match:
            max_seq = max(max_seq, int(match.group(1)))

    print(max_seq + 1)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
