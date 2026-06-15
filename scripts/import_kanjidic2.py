from __future__ import annotations

import argparse
import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from xml.etree import ElementTree


def text(element: ElementTree.Element | None, child_name: str) -> str | None:
    if element is None:
        return None
    child = element.find(child_name)
    if child is None or child.text is None:
        return None
    value = child.text.strip()
    return value or None


def int_text(element: ElementTree.Element | None, child_name: str) -> int | None:
    value = text(element, child_name)
    return int(value) if value and value.isdigit() else None


def find_attr_text(element: ElementTree.Element | None, child_name: str, attr: str, value: str) -> str | None:
    if element is None:
        return None
    for child in element.findall(child_name):
        if child.attrib.get(attr) == value and child.text:
            return child.text.strip()
    return None


def require_tables(conn: sqlite3.Connection) -> None:
    existing = {
        row[0]
        for row in conn.execute("SELECT name FROM sqlite_master WHERE type = 'table'")
    }
    missing = {"kanji"} - existing
    if missing:
        raise SystemExit(
            "Missing database tables. Start the API once so migrations create the schema before importing."
        )


def import_kanjidic2(xml_path: Path, db_path: Path) -> int:
    now = datetime.now(timezone.utc).isoformat()
    conn = sqlite3.connect(db_path)
    conn.execute("PRAGMA foreign_keys = ON")
    require_tables(conn)

    tree = ElementTree.parse(xml_path)
    root = tree.getroot()
    count = 0

    with conn:
        for character in root.findall("character"):
            literal = text(character, "literal")
            if not literal:
                continue

            codepoint = character.find("codepoint")
            radical = character.find("radical")
            misc = character.find("misc")
            reading_meaning = character.find("reading_meaning")
            rmgroup = reading_meaning.find("rmgroup") if reading_meaning is not None else None

            on_readings: list[str] = []
            kun_readings: list[str] = []
            meanings: list[str] = []
            nanori: list[str] = []

            if rmgroup is not None:
                for reading in rmgroup.findall("reading"):
                    value = (reading.text or "").strip()
                    if not value:
                        continue
                    if reading.attrib.get("r_type") == "ja_on":
                        on_readings.append(value)
                    elif reading.attrib.get("r_type") == "ja_kun":
                        kun_readings.append(value)

                for meaning in rmgroup.findall("meaning"):
                    value = (meaning.text or "").strip()
                    if value and meaning.attrib.get("m_lang") in (None, "en"):
                        meanings.append(value)

            if reading_meaning is not None:
                nanori = [
                    item.text.strip()
                    for item in reading_meaning.findall("nanori")
                    if item.text and item.text.strip()
                ]

            conn.execute(
                """
                INSERT INTO kanji (
                  literal, unicode_codepoint, classical_radical, stroke_count, grade,
                  frequency_rank, jlpt_level, on_readings_json, kun_readings_json,
                  nanori_readings_json, meanings_json, updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(literal) DO UPDATE SET
                  unicode_codepoint = excluded.unicode_codepoint,
                  classical_radical = excluded.classical_radical,
                  stroke_count = excluded.stroke_count,
                  grade = excluded.grade,
                  frequency_rank = excluded.frequency_rank,
                  jlpt_level = excluded.jlpt_level,
                  on_readings_json = excluded.on_readings_json,
                  kun_readings_json = excluded.kun_readings_json,
                  nanori_readings_json = excluded.nanori_readings_json,
                  meanings_json = excluded.meanings_json,
                  updated_at = excluded.updated_at
                """,
                (
                    literal,
                    find_attr_text(codepoint, "cp_value", "cp_type", "ucs"),
                    int(find_attr_text(radical, "rad_value", "rad_type", "classical") or 0) or None,
                    int_text(misc, "stroke_count"),
                    int_text(misc, "grade"),
                    int_text(misc, "freq"),
                    int_text(misc, "jlpt"),
                    json.dumps(on_readings, ensure_ascii=False),
                    json.dumps(kun_readings, ensure_ascii=False),
                    json.dumps(nanori, ensure_ascii=False),
                    json.dumps(meanings, ensure_ascii=False),
                    now,
                ),
            )
            count += 1

    conn.close()
    return count


def main() -> None:
    parser = argparse.ArgumentParser(description="Import KANJIDIC2 XML into the local SQLite kanji table.")
    parser.add_argument("xml_path", type=Path, help="Path to kanjidic2.xml")
    parser.add_argument("--db", type=Path, default=Path("data/local/app.sqlite"), help="SQLite DB path")
    args = parser.parse_args()

    count = import_kanjidic2(args.xml_path, args.db)
    print(f"Imported {count} kanji into {args.db}")


if __name__ == "__main__":
    main()
