#!/usr/bin/env python3
"""Flask API for local speech model training and prediction."""

from __future__ import annotations

import os
import subprocess
import sys
import tempfile
import threading
from datetime import datetime
from pathlib import Path
from typing import Any

from flask import Flask, jsonify, request
from flask_cors import CORS

SERVICE_ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(SERVICE_ROOT / "src"))

from predict import KeywordPredictor  # noqa: E402


app = Flask(__name__)
CORS(app)

TRAINING_STATUS: dict[str, Any] = {
    "is_training": False,
    "status": "idle",
    "progress": 0,
    "message": "",
    "started_at": None,
    "completed_at": None,
    "accuracy": None,
    "error": None,
}

MODEL_INFO: dict[str, Any] = {
    "is_trained": False,
    "model_path": None,
    "num_classes": 0,
    "class_names": [],
    "trained_at": None,
    "accuracy": None,
}

PREDICTOR: KeywordPredictor | None = None


def default_model_path() -> Path:
    return Path(os.environ.get("SPEECH_MODEL_PATH", SERVICE_ROOT / "models/keyword_spotting/best_model.pt"))


def load_model_if_exists() -> None:
    global PREDICTOR

    model_path = default_model_path()
    if not model_path.exists():
        return

    try:
        print(f"Loading speech model from {model_path}", file=sys.stderr)
        PREDICTOR = KeywordPredictor(str(model_path))
        MODEL_INFO.update(
            {
                "is_trained": True,
                "model_path": str(model_path),
                "num_classes": len(PREDICTOR.idx_to_label),
                "class_names": [
                    PREDICTOR.idx_to_label[str(i)]
                    for i in range(len(PREDICTOR.idx_to_label))
                ],
                "trained_at": datetime.fromtimestamp(model_path.stat().st_mtime).isoformat(),
            }
        )
    except Exception as exc:
        print(f"Could not load speech model: {exc}", file=sys.stderr)


@app.get("/health")
def health():
    return jsonify(
        {
            "status": "ok",
            "model_loaded": PREDICTOR is not None,
            "is_training": TRAINING_STATUS["is_training"],
            "local_only": True,
        }
    )


@app.get("/info")
def info():
    return jsonify({"model": MODEL_INFO, "training": TRAINING_STATUS})


@app.post("/export-data")
def export_data():
    try:
        args = [sys.executable, "scripts/export_training_data.py"]
        if request.json and request.json.get("include_all"):
            args.append("--all")

        result = subprocess.run(
            args,
            cwd=SERVICE_ROOT,
            capture_output=True,
            text=True,
            timeout=120,
            check=False,
        )

        if result.returncode != 0:
            return (
                jsonify(
                    {
                        "success": False,
                        "error": "Export failed",
                        "stdout": result.stdout,
                        "stderr": result.stderr,
                    }
                ),
                500,
            )

        audio_dir = SERVICE_ROOT / "data/training/audio"
        num_files = len(list(audio_dir.glob("*"))) if audio_dir.exists() else 0
        return jsonify(
            {
                "success": True,
                "num_recordings": num_files,
                "stdout": result.stdout,
            }
        )
    except Exception as exc:
        return jsonify({"success": False, "error": str(exc)}), 500


@app.post("/train")
def train():
    if TRAINING_STATUS["is_training"]:
        return jsonify({"success": False, "error": "Training already in progress"}), 400

    data = request.get_json(silent=True) or {}
    epochs = int(data.get("epochs", 50))
    batch_size = int(data.get("batch_size", 32))
    model_type = data.get("model", "full")
    augment = bool(data.get("augment", True))
    val_split = float(data.get("val_split", 0.2))

    TRAINING_STATUS.update(
        {
            "is_training": True,
            "status": "starting",
            "progress": 0,
            "message": "Initializing training...",
            "started_at": datetime.now().isoformat(),
            "completed_at": None,
            "accuracy": None,
            "error": None,
        }
    )

    thread = threading.Thread(
        target=run_training,
        args=(epochs, batch_size, model_type, augment, val_split),
        daemon=True,
    )
    thread.start()

    return jsonify(
        {
            "success": True,
            "message": "Training started",
            "parameters": {
                "epochs": epochs,
                "batch_size": batch_size,
                "model": model_type,
                "augment": augment,
                "val_split": val_split,
            },
        }
    )


def run_training(epochs: int, batch_size: int, model_type: str, augment: bool, val_split: float) -> None:
    try:
        TRAINING_STATUS.update({"status": "training", "message": "Training model..."})
        command = [
            sys.executable,
            "src/train.py",
            "--epochs",
            str(epochs),
            "--batch-size",
            str(batch_size),
            "--model",
            model_type,
            "--val-split",
            str(val_split),
        ]

        if augment:
            command.append("--augment")

        process = subprocess.Popen(
            command,
            cwd=SERVICE_ROOT,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
        )

        assert process.stdout is not None
        for line in process.stdout:
            print(line, end="", file=sys.stderr)
            update_training_progress(line, epochs)

        process.wait()
        if process.returncode != 0:
            raise RuntimeError(f"Training process failed with code {process.returncode}")

        TRAINING_STATUS.update(
            {
                "status": "completed",
                "progress": 100,
                "message": "Training completed successfully",
                "completed_at": datetime.now().isoformat(),
            }
        )
        load_model_if_exists()
    except Exception as exc:
        TRAINING_STATUS.update(
            {
                "status": "failed",
                "error": str(exc),
                "message": f"Training failed: {exc}",
            }
        )
        print(f"Training error: {exc}", file=sys.stderr)
    finally:
        TRAINING_STATUS["is_training"] = False


def update_training_progress(line: str, epochs: int) -> None:
    if line.startswith("Epoch "):
        try:
            current = int(line.split()[1].split("/")[0])
            TRAINING_STATUS["progress"] = int((current / epochs) * 100)
            TRAINING_STATUS["message"] = f"Epoch {current}/{epochs}"
        except (IndexError, ValueError):
            return

    if "Best validation accuracy" in line:
        try:
            TRAINING_STATUS["accuracy"] = float(line.split(":")[-1].strip().rstrip("%"))
        except ValueError:
            return


@app.post("/predict")
def predict():
    if PREDICTOR is None:
        return jsonify({"success": False, "error": "No trained model available"}), 503

    if "audio" not in request.files:
        return jsonify({"success": False, "error": "No audio file provided"}), 400

    audio = request.files["audio"]
    if audio.filename == "":
        return jsonify({"success": False, "error": "No audio file selected"}), 400

    suffix = Path(audio.filename).suffix or ".webm"
    top_k = int(request.form.get("top_k", 5))

    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp_file:
        audio.save(temp_file.name)
        temp_path = temp_file.name

    try:
        results = PREDICTOR.predict(temp_path, top_k=top_k)
        return jsonify(
            {
                "success": True,
                "predictions": [
                    {"word": word, "confidence": float(confidence)}
                    for word, confidence in results
                ],
            }
        )
    except Exception as exc:
        return jsonify({"success": False, "error": str(exc)}), 500
    finally:
        try:
            os.unlink(temp_path)
        except OSError:
            pass


if __name__ == "__main__":
    load_model_if_exists()
    port = int(os.environ.get("SPEECH_MODEL_PORT", "5200"))
    host = os.environ.get("SPEECH_MODEL_HOST", "127.0.0.1")
    debug = os.environ.get("FLASK_DEBUG", "false").lower() == "true"
    print(f"Starting speech model service at http://{host}:{port}")
    app.run(host=host, port=port, debug=debug)
