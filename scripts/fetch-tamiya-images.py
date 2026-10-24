#!/usr/bin/env python3
"""
田宫官方商品图：下载、缩放、压缩
---------------------------------------------------------------------------
田宫模型中国旗舰店的商品图会先被服务端转成 AVIF 再发。而本机 sharp 用的
libvips 没有编 AVIF 解码器（报「heif: Invalid input」），Node 那条管线处理不了。

所以这一步用 Pillow 做：它带 AVIF 解码器，转成 480px 的 WebP，
与库里其它厂商的图片是同一种格式与尺寸。

输出：
    public/gundam/<id>.webp        压缩后的本地图片
    src/data/gundam.images.json    id → 本地路径（合并脚本靠它挂到条目上）

用法：
    python scripts/fetch-tamiya-images.py [--limit N] [--concurrency N] [--delay MS]
"""
import argparse
import io
import json
import os
import sys
import threading
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FACTS = os.path.join(ROOT, "src", "data", "models.kits.tamiya.json")
OUT_DIR = os.path.join(ROOT, "public", "gundam")
MANIFEST = os.path.join(ROOT, "src", "data", "gundam.images.json")

TARGET_WIDTH = 480
QUALITY = 78
UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)


def load_facts():
    with open(FACTS, "r", encoding="utf-8") as fh:
        return [r for r in json.load(fh) if r.get("imageUrl")]


def load_manifest():
    if not os.path.exists(MANIFEST):
        return {}
    with open(MANIFEST, "r", encoding="utf-8") as fh:
        return json.load(fh)


def fetch(url, timeout=30):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Referer": "https://tamiya.cn/"})
    with urllib.request.urlopen(req, timeout=timeout) as res:
        return res.read()


def handle(record, delay):
    """下载一张图并写成 WebP。返回 (id, path, source, error)。"""
    kit_id = record["id"]
    url = record["imageUrl"]
    dest = os.path.join(OUT_DIR, kit_id + ".webp")
    if os.path.exists(dest) and os.path.getsize(dest) > 0:
        return kit_id, "/gundam/" + kit_id + ".webp", url, None
    try:
        raw = fetch(url)
        with Image.open(io.BytesIO(raw)) as im:
            im = im.convert("RGB")
            if im.width > TARGET_WIDTH:
                height = round(im.height * TARGET_WIDTH / im.width)
                im = im.resize((TARGET_WIDTH, height), Image.LANCZOS)
            buf = io.BytesIO()
            im.save(buf, "WEBP", quality=QUALITY)
        with open(dest, "wb") as fh:
            fh.write(buf.getvalue())
        return kit_id, "/gundam/" + kit_id + ".webp", url, None
    except Exception as exc:  # noqa: BLE001 - 单张失败不影响其余
        return kit_id, None, url, str(exc)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=10**9)
    ap.add_argument("--concurrency", type=int, default=3)
    ap.add_argument("--delay", type=float, default=1.2, help="每张图之间的间隔（秒）")
    args = ap.parse_args()

    records = load_facts()[: args.limit]
    os.makedirs(OUT_DIR, exist_ok=True)
    manifest = load_manifest()

    lock = threading.Lock()
    state = {"done": 0, "ok": 0, "fail": 0, "skip": 0}

    def run(record):
        kit_id, path, source, error = handle(record, args.delay)
        with lock:
            state["done"] += 1
            if path:
                state["ok"] += 1
                manifest[kit_id] = {"path": path, "source": source}
            else:
                state["fail"] += 1
                manifest[kit_id] = {"path": None, "source": source, "error": error}
            n = state["done"]
            if n % 50 == 0 or n == len(records):
                print(
                    "  %d/%d  成功 %d  失败 %d"
                    % (n, len(records), state["ok"], state["fail"]),
                    flush=True,
                )
        time.sleep(args.delay)

    with ThreadPoolExecutor(max_workers=args.concurrency) as pool:
        list(pool.map(run, records))

    with open(MANIFEST, "w", encoding="utf-8") as fh:
        json.dump(dict(sorted(manifest.items())), fh, ensure_ascii=False, indent=2)
        fh.write("\n")

    print("处理 %d 条：成功 %d，失败 %d" % (len(records), state["ok"], state["fail"]))
    return 0 if state["fail"] == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
