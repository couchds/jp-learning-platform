# Local KanjiDraw Recognition Service

Flask service for recognizing hand-drawn kanji stroke paths from the web app.

## Setup

```bash
cd services/recognize
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python app.py
```

Default URL: `http://127.0.0.1:5000`.
