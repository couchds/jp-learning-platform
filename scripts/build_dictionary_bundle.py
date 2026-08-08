from __future__ import annotations

import argparse
import gzip
import json
import shutil
import sqlite3
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from xml.etree import ElementTree


REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SOURCE_DIR = REPO_ROOT / "data" / "dictionary-source"
DEFAULT_OUTPUT = REPO_ROOT / "apps" / "desktop" / "dictionaries" / "kakomu-dictionary.sqlite"
JMDICT_URL = "https://www.edrdg.org/pub/Nihongo/JMdict_e.gz"
KANJIDIC_URL = "https://www.edrdg.org/kanjidic/kanjidic2.xml.gz"
BUNDLE_VERSION = "2026.08"


SCHEMA = """
PRAGMA foreign_keys = ON;
CREATE TABLE metadata (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE word_entries (
  entry_id INTEGER PRIMARY KEY,
  reading TEXT,
  meanings_json TEXT NOT NULL,
  common INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE word_forms (
  form TEXT NOT NULL,
  entry_id INTEGER NOT NULL REFERENCES word_entries(entry_id) ON DELETE CASCADE,
  form_kind TEXT NOT NULL,
  common INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (form, entry_id, form_kind)
) WITHOUT ROWID;
CREATE INDEX idx_word_forms_lookup ON word_forms(form, common DESC, entry_id);
CREATE TABLE kanji_entries (
  literal TEXT PRIMARY KEY,
  readings_json TEXT NOT NULL,
  meanings_json TEXT NOT NULL
) WITHOUT ROWID;
"""


def child_text(element: ElementTree.Element, name: str) -> str | None:
    child = element.find(name)
    if child is None or child.text is None:
        return None
    value = child.text.strip()
    return value or None


def child_values(element: ElementTree.Element, name: str) -> list[str]:
    return [
        child.text.strip()
        for child in element.findall(name)
        if child.text and child.text.strip()
    ]


def unique(values: list[str]) -> list[str]:
    return list(dict.fromkeys(values))


def download(url: str, destination: Path) -> None:
    if destination.exists():
        return
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = destination.with_suffix(destination.suffix + ".download")
    print(f"Downloading {url}")
    try:
        with urllib.request.urlopen(url, timeout=120) as response, temporary.open("wb") as output:
            shutil.copyfileobj(response, output)
        temporary.replace(destination)
    finally:
        temporary.unlink(missing_ok=True)


def open_xml(path: Path):
    return gzip.open(path, "rb") if path.suffix == ".gz" else path.open("rb")


def import_jmdict(conn: sqlite3.Connection, source: Path) -> tuple[int, int]:
    entry_count = 0
    form_count = 0
    with open_xml(source) as handle:
        context = ElementTree.iterparse(handle, events=("start", "end"))
        root: ElementTree.Element | None = None
        for event, element in context:
            if event == "start" and root is None:
                root = element
                continue
            if event != "end" or element.tag != "entry":
                continue

            sequence = child_text(element, "ent_seq")
            kanji_elements = element.findall("k_ele")
            reading_elements = element.findall("r_ele")
            kanji_forms = unique([value for item in kanji_elements if (value := child_text(item, "keb"))])
            readings = unique([value for item in reading_elements if (value := child_text(item, "reb"))])
            glosses = unique([
                gloss.text.strip()
                for sense in element.findall("sense")
                for gloss in sense.findall("gloss")
                if gloss.text and gloss.text.strip() and gloss.attrib.get("{http://www.w3.org/XML/1998/namespace}lang", "eng") == "eng"
            ])

            if sequence and sequence.isdigit() and glosses and (kanji_forms or readings):
                common = int(any(child_values(item, "ke_pri") for item in kanji_elements) or any(child_values(item, "re_pri") for item in reading_elements))
                entry_id = int(sequence)
                conn.execute(
                    "INSERT INTO word_entries (entry_id, reading, meanings_json, common) VALUES (?, ?, ?, ?)",
                    (entry_id, readings[0] if readings else None, json.dumps(glosses[:8], ensure_ascii=False), common),
                )
                for form, kind in [(value, "kanji") for value in kanji_forms] + [(value, "reading") for value in readings]:
                    conn.execute(
                        "INSERT OR IGNORE INTO word_forms (form, entry_id, form_kind, common) VALUES (?, ?, ?, ?)",
                        (form, entry_id, kind, common),
                    )
                    form_count += 1
                entry_count += 1
                if entry_count % 25_000 == 0:
                    print(f"Indexed {entry_count} JMdict entries")

            element.clear()
            if root is not None:
                root.clear()

    return entry_count, form_count


def import_kanjidic(conn: sqlite3.Connection, source: Path) -> int:
    count = 0
    with open_xml(source) as handle:
        tree = ElementTree.parse(handle)
    for character in tree.getroot().findall("character"):
        literal = child_text(character, "literal")
        group = character.find("./reading_meaning/rmgroup")
        if not literal or group is None:
            continue
        readings = unique([
            item.text.strip()
            for item in group.findall("reading")
            if item.text and item.text.strip() and item.attrib.get("r_type") in {"ja_on", "ja_kun"}
        ])
        meanings = unique([
            item.text.strip()
            for item in group.findall("meaning")
            if item.text and item.text.strip() and item.attrib.get("m_lang", "en") == "en"
        ])
        if not meanings:
            continue
        conn.execute(
            "INSERT INTO kanji_entries (literal, readings_json, meanings_json) VALUES (?, ?, ?)",
            (literal, json.dumps(readings, ensure_ascii=False), json.dumps(meanings[:8], ensure_ascii=False)),
        )
        count += 1
    return count


def build_bundle(jmdict: Path, kanjidic: Path, output: Path) -> dict[str, int]:
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = output.with_suffix(".building.sqlite")
    temporary.unlink(missing_ok=True)
    conn = sqlite3.connect(temporary)
    try:
        conn.executescript("PRAGMA journal_mode = OFF; PRAGMA synchronous = OFF; PRAGMA temp_store = MEMORY;" + SCHEMA)
        with conn:
            word_count, form_count = import_jmdict(conn, jmdict)
            kanji_count = import_kanjidic(conn, kanjidic)
            metadata = {
                "bundle_version": BUNDLE_VERSION,
                "built_at": datetime.now(timezone.utc).isoformat(),
                "jmdict_source": JMDICT_URL,
                "kanjidic_source": KANJIDIC_URL,
                "word_count": str(word_count),
                "form_count": str(form_count),
                "kanji_count": str(kanji_count),
            }
            conn.executemany("INSERT INTO metadata (key, value) VALUES (?, ?)", metadata.items())
        conn.execute("ANALYZE")
        conn.execute("VACUUM")
    finally:
        conn.close()
    temporary.replace(output)
    return {"words": word_count, "forms": form_count, "kanji": kanji_count}


def main() -> None:
    parser = argparse.ArgumentParser(description="Build Kakomu's compact offline JMdict/KANJIDIC lookup database.")
    parser.add_argument("--source-dir", type=Path, default=DEFAULT_SOURCE_DIR)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--rebuild", action="store_true")
    args = parser.parse_args()

    if args.output.exists() and not args.rebuild:
        print(f"Dictionary bundle already exists at {args.output}")
        return

    jmdict = args.source_dir / "JMdict_e.gz"
    kanjidic = args.source_dir / "kanjidic2.xml.gz"
    download(JMDICT_URL, jmdict)
    download(KANJIDIC_URL, kanjidic)
    counts = build_bundle(jmdict, kanjidic, args.output)
    print(f"Built {args.output} with {counts['words']} words, {counts['forms']} forms, and {counts['kanji']} kanji")


if __name__ == "__main__":
    main()
