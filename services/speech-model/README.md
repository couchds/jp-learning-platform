# Local Speech Model Service

Local keyword-spotting model for pronunciation practice. This carries forward the CNN-based speech model from the source app and adapts it to the new SQLite/local-upload layout.

## Setup

```bash
cd services/speech-model
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python api.py
```

Default URL: `http://127.0.0.1:5200`.

## Workflow

1. Record reference pronunciations through the API/web app.
2. `POST /export-data` to create `data/training/manifest.csv` and copy audio into `data/training/audio/`.
3. `POST /train` to train either the `full` or `lightweight` CNN.
4. `POST /predict` with an audio upload to get top keyword predictions.

Trained model files under `models/` and exported audio under `data/` are ignored by git.
