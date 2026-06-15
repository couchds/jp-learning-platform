from __future__ import annotations

import argparse
import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from xml.etree import ElementTree


def child_text(element: ElementTree.Element, child_name: str) -> str | None:
    child = element.find(child_name)
    if child is None or child.text is None:
        return None
    value = child.text.strip()
    return value or None


def child_values(element: ElementTree.Element, child_name: str) -> list[str]:
    return [
        child.text.strip()
        for child in element.findall(child_name)
        if child.text and child.text.strip()
    ]


def require_tables(conn: sqlite3.Connection) -> None:
    existing = {
        row[0]
        for row in conn.execute("SELECT name FROM sqlite_master WHERE type = 'table'")
    }
    required = {
        "dictionary_entries",
        "entry_kanji",
        "entry_readings",
        "entry_senses",
        "sense_glosses",
    }
    missing = required - existing
    if missing:
        raise SystemExit(
            "Missing database tables. Start the API once so migrations create the schema before importing."
        )


def upsert_entry(conn: sqlite3.Connection, entry: ElementTree.Element, now: str) -> bool:
    sequence_text = child_text(entry, "ent_seq")
    if not sequence_text or not sequence_text.isdigit():
        return False

    sequence = int(sequence_text)
    conn.execute(
        """
        INSERT INTO dictionary_entries (entry_id, updated_at)
        VALUES (?, ?)
        ON CONFLICT(entry_id) DO UPDATE SET updated_at = excluded.updated_at
        """,
        (sequence, now),
    )
    entry_id = conn.execute(
        "SELECT id FROM dictionary_entries WHERE entry_id = ?",
        (sequence,),
    ).fetchone()[0]

    conn.execute("DELETE FROM entry_kanji WHERE entry_id = ?", (entry_id,))
    conn.execute("DELETE FROM entry_readings WHERE entry_id = ?", (entry_id,))
    conn.execute("DELETE FROM entry_senses WHERE entry_id = ?", (entry_id,))

    for index, kanji_element in enumerate(entry.findall("k_ele")):
        kanji = child_text(kanji_element, "keb")
        if not kanji:
            continue
        priority_tags = child_values(kanji_element, "ke_pri")
        conn.execute(
            """
            INSERT INTO entry_kanji
              (entry_id, kanji, is_common, priority_tags_json, info_json, kanji_order)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                entry_id,
                kanji,
                1 if priority_tags else 0,
                json.dumps(priority_tags, ensure_ascii=False),
                json.dumps(child_values(kanji_element, "ke_inf"), ensure_ascii=False),
                index,
            ),
        )

    for index, reading_element in enumerate(entry.findall("r_ele")):
        reading = child_text(reading_element, "reb")
        if not reading:
            continue
        priority_tags = child_values(reading_element, "re_pri")
        conn.execute(
            """
            INSERT INTO entry_readings
              (entry_id, reading, is_common, priority_tags_json, info_json, reading_order)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                entry_id,
                reading,
                1 if priority_tags else 0,
                json.dumps(priority_tags, ensure_ascii=False),
                json.dumps(child_values(reading_element, "re_inf"), ensure_ascii=False),
                index,
            ),
        )

    for sense_index, sense in enumerate(entry.findall("sense")):
        cursor = conn.execute(
            """
            INSERT INTO entry_senses
              (entry_id, sense_order, parts_of_speech_json, fields_json, misc_json, dialects_json)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                entry_id,
                sense_index,
                json.dumps(child_values(sense, "pos"), ensure_ascii=False),
                json.dumps(child_values(sense, "field"), ensure_ascii=False),
                json.dumps(child_values(sense, "misc"), ensure_ascii=False),
                json.dumps(child_values(sense, "dial"), ensure_ascii=False),
            ),
        )
        sense_id = cursor.lastrowid

        for gloss_index, gloss in enumerate(sense.findall("gloss")):
            value = (gloss.text or "").strip()
            if not value:
                continue
            conn.execute(
                """
                INSERT INTO sense_glosses (sense_id, gloss, gloss_type, gloss_order)
                VALUES (?, ?, ?, ?)
                """,
                (sense_id, value, gloss.attrib.get("g_type"), gloss_index),
            )

    return True


def import_jmdict(xml_path: Path, db_path: Path, limit: int | None) -> int:
    now = datetime.now(timezone.utc).isoformat()
    conn = sqlite3.connect(db_path)
    conn.execute("PRAGMA foreign_keys = ON")
    require_tables(conn)

    count = 0
    context = ElementTree.iterparse(xml_path, events=("start", "end"))
    root: ElementTree.Element | None = None

    with conn:
        for event, element in context:
            if event == "start" and root is None:
                root = element
                continue

            if event != "end" or element.tag != "entry":
                continue

            if upsert_entry(conn, element, now):
                count += 1
                if count % 10000 == 0:
                    print(f"Imported {count} entries...")

            element.clear()
            if root is not None:
                root.clear()

            if limit is not None and count >= limit:
                break

    conn.close()
    return count


def main() -> None:
    parser = argparse.ArgumentParser(description="Import JMdict XML into the local SQLite dictionary tables.")
    parser.add_argument("xml_path", type=Path, help="Path to JMdict/JMdict_e XML")
    parser.add_argument("--db", type=Path, default=Path("data/local/app.sqlite"), help="SQLite DB path")
    parser.add_argument("--limit", type=int, default=None, help="Optional entry limit for smoke tests")
    args = parser.parse_args()

    count = import_jmdict(args.xml_path, args.db, args.limit)
    print(f"Imported {count} dictionary entries into {args.db}")


if __name__ == "__main__":
    main()
