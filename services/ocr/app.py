#!/usr/bin/env python3
"""Local Japanese OCR service.

The service intentionally supports only local OCR engines. Cloud Vision and
other hosted backends are left out of this rebuild phase.
"""

from __future__ import annotations

import io
import importlib.util
import os
import sys
from dataclasses import dataclass
from typing import Any

from flask import Flask, jsonify, request
from flask_cors import CORS
from PIL import Image


OCR_BACKEND = os.environ.get("OCR_BACKEND", "manga-ocr")
EASYOCR_GPU = os.environ.get("OCR_EASYOCR_GPU", "false").lower() in {"1", "true", "yes"}
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


def get_manga_ocr() -> Any:
    global _manga_ocr
    if _manga_ocr is None:
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


def extract_elements(raw_text: str) -> list[dict[str, Any]]:
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


def run_manga_ocr(image: Image.Image) -> str:
    return str(get_manga_ocr()(image))


def run_easyocr(image: Image.Image) -> str:
    import numpy as np

    results = get_easyocr_reader().readtext(np.array(image))
    return "".join(text for _bbox, text, _confidence in results)


@app.get("/health")
def health():
    available, reason = backend_availability(OCR_BACKEND)
    status_code = 200 if available else 503
    return (
        jsonify(
            {
                "status": "ok" if available else "unavailable",
                "service": "ocr",
                "backend": OCR_BACKEND,
                "backend_available": available,
                "reason": reason,
                "local_only": True,
                "supported_backends": ["manga-ocr", "easyocr"],
            }
        ),
        status_code,
    )


def backend_availability(backend: str) -> tuple[bool, str | None]:
    module_name = {"manga-ocr": "manga_ocr", "easyocr": "easyocr"}.get(backend)
    if module_name is None:
        return False, f"Unsupported OCR_BACKEND: {backend}"

    if importlib.util.find_spec(module_name) is None:
        return False, f"Python module is not installed: {module_name}"

    return True, None


@app.post("/ocr")
def ocr():
    if "image" not in request.files:
        return jsonify({"success": False, "error": "No image file provided"}), 400

    upload = request.files["image"]
    if upload.filename == "":
        return jsonify({"success": False, "error": "Empty filename"}), 400

    try:
        image = Image.open(io.BytesIO(upload.read())).convert("RGB")
        if OCR_BACKEND == "easyocr":
            raw_text = run_easyocr(image)
        elif OCR_BACKEND == "manga-ocr":
            raw_text = run_manga_ocr(image)
        else:
            return jsonify({"success": False, "error": f"Unsupported OCR_BACKEND: {OCR_BACKEND}"}), 400

        elements = extract_elements(raw_text)
        return jsonify(
            {
                "success": True,
                "raw_text": raw_text,
                "elements": elements,
                "total_elements": len(elements),
                "backend": OCR_BACKEND,
            }
        )
    except Exception as exc:
        print(f"OCR error: {exc}", file=sys.stderr)
        return jsonify({"success": False, "error": str(exc)}), 500


if __name__ == "__main__":
    port = int(os.environ.get("OCR_PORT", "5100"))
    host = os.environ.get("OCR_HOST", "127.0.0.1")
    debug = os.environ.get("FLASK_DEBUG", "false").lower() == "true"
    print(f"Starting local OCR service at http://{host}:{port} ({OCR_BACKEND})")
    app.run(host=host, port=port, debug=debug)
