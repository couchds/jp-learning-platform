#!/usr/bin/env python3
"""Local Japanese OCR service.

The service intentionally supports only local OCR engines. Cloud Vision and
other hosted backends are left out of this rebuild phase.
"""

from __future__ import annotations

import importlib.util
import io
import os
import sys
import threading
from dataclasses import dataclass
from typing import Any

from flask import Flask, jsonify, request
from flask_cors import CORS
from PIL import Image


def env_float(name: str, default: float) -> float:
    try:
        return float(os.environ.get(name, str(default)))
    except ValueError:
        print(f"Ignoring invalid {name}; using {default}", file=sys.stderr)
        return default


OCR_BACKEND = os.environ.get("OCR_BACKEND", "auto")
EASYOCR_GPU = os.environ.get("OCR_EASYOCR_GPU", "false").lower() in {"1", "true", "yes"}
EASYOCR_MIN_CONFIDENCE = env_float("OCR_EASYOCR_MIN_CONFIDENCE", 0.05)
ALLOWED_ORIGINS = {
    origin.strip()
    for origin in os.environ.get(
        "LOCAL_ALLOWED_ORIGINS",
        "http://127.0.0.1:5173,http://localhost:5173,http://127.0.0.1:4173,http://localhost:4173",
    ).split(",")
    if origin.strip()
}

app = Flask(__name__)
CORS(app, origins=list(ALLOWED_ORIGINS))

_manga_ocr: Any | None = None
_easyocr_reader: Any | None = None
_tokenizer: Any | None = None
_model_load_lock = threading.Lock()
_warmup_lock = threading.Lock()
_warmup_backend: str | None = None
_warmup_started = False
_warmup_error: str | None = None


@app.before_request
def reject_untrusted_origins():
    origin = request.headers.get("Origin")
    if origin and origin not in ALLOWED_ORIGINS:
        return jsonify({"success": False, "error": "Origin is not allowed for this local service"}), 403

    return None


@dataclass
class Token:
    text: str
    features: dict[str, Any]


@dataclass
class OcrDetection:
    text: str
    bbox: dict[str, Any]
    confidence: float | None = None


def get_manga_ocr() -> Any:
    global _manga_ocr
    if _manga_ocr is None:
        with _model_load_lock:
            if _manga_ocr is not None:
                return _manga_ocr
            try:
                from manga_ocr import MangaOcr
            except ImportError as exc:
                raise RuntimeError("manga-ocr is not installed. Install it with: pip install manga-ocr") from exc

            print("Loading manga-ocr model...", file=sys.stderr)
            _manga_ocr = MangaOcr()
    return _manga_ocr


def get_easyocr_reader() -> Any:
    global _easyocr_reader
    if _easyocr_reader is None:
        with _model_load_lock:
            if _easyocr_reader is not None:
                return _easyocr_reader
            try:
                import easyocr
            except ImportError as exc:
                raise RuntimeError("easyocr is not installed. Install it with: pip install easyocr") from exc

            print(f"Loading EasyOCR reader (gpu={EASYOCR_GPU})...", file=sys.stderr)
            _easyocr_reader = easyocr.Reader(["ja"], gpu=EASYOCR_GPU)
    return _easyocr_reader


def get_tokenizer() -> Any | None:
    global _tokenizer
    if _tokenizer is not None:
        return _tokenizer

    try:
        import fugashi
    except ImportError:
        print("fugashi is not installed; OCR tokenization will be character-oriented.", file=sys.stderr)
        return None

    _tokenizer = fugashi.Tagger()
    return _tokenizer


def is_kanji(char: str) -> bool:
    return 0x4E00 <= ord(char) <= 0x9FFF


def is_hiragana(char: str) -> bool:
    return 0x3040 <= ord(char) <= 0x309F


def is_katakana(char: str) -> bool:
    return 0x30A0 <= ord(char) <= 0x30FF


def classify_text(text: str, features: dict[str, Any]) -> str:
    if len(text) == 1 and is_kanji(text):
        return "kanji"
    if all(is_hiragana(char) or char.isspace() for char in text):
        return "hiragana"
    if all(is_katakana(char) or char.isspace() for char in text):
        return "katakana"
    if any(is_kanji(char) for char in text):
        return "vocabulary"
    if features.get("pos1") in {"名詞", "動詞", "形容詞", "副詞"}:
        return "vocabulary"
    return "unknown"


def tokenize(raw_text: str) -> list[Token]:
    tagger = get_tokenizer()
    punctuation = {"、", "。", "！", "？", "…", "!", "?", ".", ","}

    if tagger is None:
        return [Token(char, {}) for char in raw_text if char.strip() and char not in punctuation]

    tokens: list[Token] = []
    for word in tagger(raw_text):
        surface = word.surface
        if not surface or surface.strip() in punctuation:
            continue

        feature = getattr(word, "feature", None)
        tokens.append(
            Token(
                surface,
                {
                    "pos1": getattr(feature, "pos1", None),
                    "pos2": getattr(feature, "pos2", None),
                    "lemma": getattr(feature, "lemma", surface),
                },
            )
        )

    return tokens


def extract_elements(raw_text: str, detections: list[OcrDetection] | None = None) -> list[dict[str, Any]]:
    if detections:
        return extract_boxed_elements(raw_text, detections)

    elements = [
        {
            "text": token.text,
            "element_type": classify_text(token.text, token.features),
            "features": token.features,
        }
        for token in tokenize(raw_text)
    ]

    known_kanji = {item["text"] for item in elements if item["element_type"] == "kanji"}
    for char in sorted({char for char in raw_text if is_kanji(char)}):
        if char not in known_kanji:
            elements.append({"text": char, "element_type": "kanji", "features": {}})

    return elements


def extract_boxed_elements(raw_text: str, detections: list[OcrDetection]) -> list[dict[str, Any]]:
    elements: list[dict[str, Any]] = []

    for detection_index, detection in enumerate(detections):
        cursor = 0
        for token in tokenize(detection.text):
            token_start = detection.text.find(token.text, cursor)
            if token_start < 0:
                token_start = cursor
            token_end = min(token_start + len(token.text), len(detection.text))
            cursor = token_end

            elements.append(
                {
                    "text": token.text,
                    "element_type": classify_text(token.text, token.features),
                    "features": token.features,
                    "bbox": slice_bbox(detection.bbox, token_start, token_end, len(detection.text)),
                    "bbox_source": "estimated_line_slice",
                    "confidence": detection.confidence,
                    "detection_index": detection_index,
                }
            )

        for index, char in enumerate(detection.text):
            if is_kanji(char):
                elements.append(
                    {
                        "text": char,
                        "element_type": "kanji",
                        "features": {},
                        "bbox": slice_bbox(detection.bbox, index, index + 1, len(detection.text)),
                        "bbox_source": "estimated_line_slice",
                        "confidence": detection.confidence,
                        "detection_index": detection_index,
                    }
                )

    if elements:
        return elements

    return extract_elements(raw_text)


def slice_bbox(bbox: dict[str, Any], start: int, end: int, total: int) -> dict[str, Any]:
    if total <= 0:
        return bbox

    x = float(bbox["x"])
    y = float(bbox["y"])
    width = float(bbox["width"])
    height = float(bbox["height"])
    start_ratio = max(min(start / total, 1), 0)
    end_ratio = max(min(end / total, 1), start_ratio)
    sliced = {
        "x": x + width * start_ratio,
        "y": y,
        "width": width * (end_ratio - start_ratio),
        "height": height,
    }
    sliced["points"] = [
        {"x": sliced["x"], "y": y},
        {"x": sliced["x"] + sliced["width"], "y": y},
        {"x": sliced["x"] + sliced["width"], "y": y + height},
        {"x": sliced["x"], "y": y + height},
    ]
    return sliced


def bbox_from_points(points: Any) -> dict[str, Any]:
    normalized = [{"x": float(point[0]), "y": float(point[1])} for point in points]
    xs = [point["x"] for point in normalized]
    ys = [point["y"] for point in normalized]
    min_x = min(xs)
    min_y = min(ys)
    max_x = max(xs)
    max_y = max(ys)
    return {
        "x": min_x,
        "y": min_y,
        "width": max_x - min_x,
        "height": max_y - min_y,
        "points": normalized,
    }


def run_manga_ocr(image: Image.Image) -> tuple[str, list[OcrDetection]]:
    return str(get_manga_ocr()(image)), []


def run_easyocr(image: Image.Image) -> tuple[str, list[OcrDetection]]:
    import numpy as np

    results = get_easyocr_reader().readtext(np.array(image))
    detections = []
    for bbox, text, confidence in results:
        confidence_value = float(confidence)
        if not str(text).strip() or confidence_value < EASYOCR_MIN_CONFIDENCE:
            continue
        detections.append(OcrDetection(text=str(text), bbox=bbox_from_points(bbox), confidence=confidence_value))

    return "\n".join(detection.text for detection in detections), detections


@app.get("/health")
def health():
    active_backend = resolve_backend(OCR_BACKEND)
    warm_backend_async(active_backend)
    available, reason = backend_availability(active_backend)
    warmup_error = backend_warmup_error(active_backend)
    model_loaded = backend_model_loaded(active_backend)
    ready = available and warmup_error is None and model_loaded
    status_code = 200 if ready else 503
    status = "ok" if ready else "warming" if available and warmup_error is None else "unavailable"
    return (
        jsonify(
            {
                "status": status,
                "service": "ocr",
                "backend": OCR_BACKEND,
                "active_backend": active_backend,
                "backend_available": available,
                "model_loaded": model_loaded,
                "boxes_available": active_backend == "easyocr" and warmup_error is None,
                "easyocr_min_confidence": EASYOCR_MIN_CONFIDENCE,
                "reason": warmup_error or reason or (None if ready else "OCR model is warming up."),
                "local_only": True,
                "supported_backends": ["auto", "manga-ocr", "easyocr"],
            }
        ),
        status_code,
    )


def backend_availability(backend: str) -> tuple[bool, str | None]:
    if backend == "auto":
        return backend_availability(resolve_backend(backend))

    module_name = {"manga-ocr": "manga_ocr", "easyocr": "easyocr"}.get(backend)
    if module_name is None:
        return False, f"Unsupported OCR_BACKEND: {backend}"

    if importlib.util.find_spec(module_name) is None:
        return False, f"Python module is not installed: {module_name}"

    return True, None


def resolve_backend(backend: str) -> str:
    if backend != "auto":
        return backend

    if sys.platform == "win32" and importlib.util.find_spec("manga_ocr") is not None:
        return "manga-ocr"

    if importlib.util.find_spec("easyocr") is not None:
        return "easyocr"

    return "manga-ocr"


def backend_model_loaded(backend: str) -> bool:
    if backend == "easyocr":
        return _easyocr_reader is not None
    if backend == "manga-ocr":
        return _manga_ocr is not None
    return False


def backend_warmup_error(backend: str) -> str | None:
    if _warmup_backend != backend:
        return None
    return _warmup_error


def warm_backend_async(backend: str) -> None:
    global _warmup_backend, _warmup_error, _warmup_started

    if backend_model_loaded(backend):
        return

    with _warmup_lock:
        if _warmup_started and _warmup_backend == backend:
            return
        _warmup_backend = backend
        _warmup_error = None
        _warmup_started = True

    threading.Thread(target=warm_backend, args=(backend,), daemon=True).start()


def warm_backend(backend: str) -> None:
    global _warmup_error

    try:
        if backend == "easyocr":
            get_easyocr_reader()
        elif backend == "manga-ocr":
            get_manga_ocr()
    except Exception as exc:
        _warmup_error = str(exc)


@app.post("/ocr")
def ocr():
    if "image" not in request.files:
        return jsonify({"success": False, "error": "No image file provided"}), 400

    upload = request.files["image"]
    if upload.filename == "":
        return jsonify({"success": False, "error": "Empty filename"}), 400

    try:
        image = Image.open(io.BytesIO(upload.read())).convert("RGB")
        active_backend = resolve_backend(OCR_BACKEND)
        if active_backend == "easyocr":
            raw_text, detections = run_easyocr(image)
        elif active_backend == "manga-ocr":
            raw_text, detections = run_manga_ocr(image)
        else:
            return jsonify({"success": False, "error": f"Unsupported OCR_BACKEND: {active_backend}"}), 400

        elements = extract_elements(raw_text, detections)
        return jsonify(
            {
                "success": True,
                "raw_text": raw_text,
                "elements": elements,
                "total_elements": len(elements),
                "backend": OCR_BACKEND,
                "active_backend": active_backend,
                "boxes_available": bool(detections),
                "easyocr_min_confidence": EASYOCR_MIN_CONFIDENCE if active_backend == "easyocr" else None,
                "image_width": image.width,
                "image_height": image.height,
            }
        )
    except Exception as exc:
        print(f"OCR error: {exc}", file=sys.stderr)
        return jsonify({"success": False, "error": str(exc)}), 500


if __name__ == "__main__":
    port = int(os.environ.get("OCR_PORT", "5100"))
    host = os.environ.get("OCR_HOST", "127.0.0.1")
    debug = os.environ.get("FLASK_DEBUG", "false").lower() == "true"
    print(f"Starting local OCR service at http://{host}:{port} ({OCR_BACKEND} -> {resolve_backend(OCR_BACKEND)})")
    warm_backend_async(resolve_backend(OCR_BACKEND))
    app.run(host=host, port=port, debug=debug)
