from __future__ import annotations

import argparse
import csv
import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path


def is_kanji(char: str) -> bool:
    code = ord(char)
    return 0x4E00 <= code <= 0x9FFF


def kanji_terms(text: str) -> list[str]:
    seen: set[str] = set()
    terms: list[str] = []
    for char in text:
        if is_kanji(char) and char not in seen:
            seen.add(char)
            terms.append(char)
    return terms


def require_tables(conn: sqlite3.Connection) -> None:
    existing = {
        row[0]
        for row in conn.execute("SELECT name FROM sqlite_master WHERE type = 'table'")
    }
    missing = {"sentence_examples", "sentence_example_terms"} - existing
    if missing:
        raise SystemExit(
            "Missing sentence tables. Start the API once after updating so migrations create the schema."
        )


def row_value(row: dict[str, str], names: tuple[str, ...]) -> str | None:
    for name in names:
        value = row.get(name)
        if value and value.strip():
            return value.strip()
    return None


def import_sentences(path: Path, db_path: Path, source: str, delimiter: str, has_header: bool) -> int:
    now = datetime.now(timezone.utc).isoformat()
    conn = sqlite3.connect(db_path)
    conn.execute("PRAGMA foreign_keys = ON")
    require_tables(conn)
    imported = 0

    with path.open("r", encoding="utf-8-sig", newline="") as handle, conn:
        if has_header:
            reader = csv.DictReader(handle, delimiter=delimiter)
        else:
            reader = csv.DictReader(
                handle,
                delimiter=delimiter,
                fieldnames=["source_id", "japanese", "english", "reading"],
            )

        for row in reader:
            japanese = row_value(row, ("japanese", "jp", "sentence", "text"))
            if not japanese:
                continue

            source_id = row_value(row, ("source_id", "id", "sentence_id"))
            english = row_value(row, ("english", "en", "translation", "meaning"))
            reading = row_value(row, ("reading", "kana", "furigana"))
            metadata = {
                key: value
                for key, value in row.items()
                if value and key not in {"source_id", "id", "sentence_id", "japanese", "jp", "sentence", "text", "english", "en", "translation", "meaning", "reading", "kana", "furigana"}
            }

            conn.execute(
                """
                INSERT INTO sentence_examples
                  (source, source_id, japanese, reading, english, metadata_json, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(source, source_id) DO UPDATE SET
                  japanese = excluded.japanese,
                  reading = excluded.reading,
                  english = excluded.english,
                  metadata_json = excluded.metadata_json,
                  updated_at = excluded.updated_at
                """,
                (
                    source,
                    source_id,
                    japanese,
                    reading,
                    english,
                    json.dumps(metadata, ensure_ascii=False),
                    now,
                ),
            )
            sentence_id = conn.execute(
                """
                SELECT id
                FROM sentence_examples
                WHERE source = ? AND (
                  (source_id IS NULL AND ? IS NULL) OR source_id = ?
                )
                ORDER BY id DESC
                LIMIT 1
                """,
                (source, source_id, source_id),
            ).fetchone()[0]

            conn.execute("DELETE FROM sentence_example_terms WHERE sentence_id = ?", (sentence_id,))
            for index, term in enumerate(kanji_terms(japanese)):
                conn.execute(
                    """
                    INSERT INTO sentence_example_terms
                      (sentence_id, term_text, term_type, term_order)
                    VALUES (?, ?, 'kanji', ?)
                    """,
                    (sentence_id, term, index),
                )
            imported += 1

    conn.close()
    return imported


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Import local sentence examples from TSV/CSV into SQLite."
    )
    parser.add_argument("path", type=Path, help="TSV/CSV path with japanese and english columns")
    parser.add_argument("--db", type=Path, default=Path("data/local/app.sqlite"), help="SQLite DB path")
    parser.add_argument("--source", default="local-tsv", help="Sentence source label")
    parser.add_argument("--delimiter", default="\t", help="Column delimiter. Defaults to tab.")
    parser.add_argument("--no-header", action="store_true", help="Use source_id, japanese, english, reading column order")
    args = parser.parse_args()

    count = import_sentences(args.path, args.db, args.source, args.delimiter, not args.no_header)
    print(f"Imported {count} sentence examples into {args.db}")


if __name__ == "__main__":
    main()
