#!/usr/bin/env python3
"""Local KanjiDraw handwriting recognition service."""

from __future__ import annotations

import os
import sys
from typing import Any

from flask import Flask, jsonify, request
from flask_cors import CORS

try:
    import kanjidraw

    KANJIDRAW_AVAILABLE = True
except ImportError as exc:
    kanjidraw = None
    KANJIDRAW_AVAILABLE = False
    print(f"KanjiDraw unavailable: {exc}", file=sys.stderr)


app = Flask(__name__)
CORS(app)


def convert_paths_to_strokes(paths: list[Any]) -> list[list[float]]:
    strokes: list[list[float]] = []

    for path in paths:
        if not isinstance(path, dict):
            continue

        points: list[tuple[float, float]] = []
        for point in path.get("paths", []):
            if not isinstance(point, dict) or "x" not in point or "y" not in point:
                continue
            try:
                points.append((float(point["x"]), float(point["y"])))
            except (TypeError, ValueError):
                continue

        if len(points) < 2:
            continue

        x1, y1 = points[0]
        x2, y2 = points[-1]
        distance = ((x2 - x1) ** 2 + (y2 - y1) ** 2) ** 0.5
        if distance > 5:
            strokes.append([x1, y1, x2, y2])

    return strokes


@app.get("/health")
def health():
    return jsonify({"status": "ok", "kanjidraw_available": KANJIDRAW_AVAILABLE})


@app.get("/info")
def info():
    payload: dict[str, Any] = {
        "service": "KanjiDraw Recognition Service",
        "version": "0.1.0",
        "kanjidraw_available": KANJIDRAW_AVAILABLE,
        "local_only": True,
    }

    if KANJIDRAW_AVAILABLE and kanjidraw is not None:
        try:
            payload["stroke_buckets"] = len(kanjidraw.kanji_data())
        except Exception as exc:
            payload["warning"] = str(exc)

    return jsonify(payload)


@app.post("/recognize")
def recognize():
    if not KANJIDRAW_AVAILABLE or kanjidraw is None:
        return (
            jsonify(
                {
                    "success": False,
                    "error": "KanjiDraw is not available. Install with: pip install kanjidraw",
                }
            ),
            503,
        )

    data = request.get_json(silent=True) or {}
    paths = data.get("paths", [])
    limit = min(int(data.get("limit", 10)), 25)

    if not isinstance(paths, list) or not paths:
        return jsonify({"success": False, "error": "No stroke path data provided"}), 400

    strokes = convert_paths_to_strokes(paths)
    if not strokes:
        return jsonify({"success": False, "error": "Could not parse stroke data"}), 400

    try:
        matches = list(kanjidraw.fuzzy_matches(strokes))[:limit]
        return jsonify(
            {
                "success": True,
                "stroke_count": len(strokes),
                "results": [
                    {"kanji": kanji, "score": float(score) / 100.0}
                    for score, kanji in matches
                ],
            }
        )
    except Exception as exc:
        print(f"Recognition error: {exc}", file=sys.stderr)
        return jsonify({"success": False, "error": str(exc)}), 500


if __name__ == "__main__":
    port = int(os.environ.get("RECOGNITION_SERVICE_PORT", "5000"))
    host = os.environ.get("RECOGNITION_SERVICE_HOST", "127.0.0.1")
    debug = os.environ.get("FLASK_DEBUG", "false").lower() == "true"
    print(f"Starting local recognition service at http://{host}:{port}")
    app.run(host=host, port=port, debug=debug)
