from __future__ import annotations

import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path


KANJI = [
    ("日", "65E5", 72, 4, 1, 1, 5, ["ニチ", "ジツ"], ["ひ", "か"], ["day", "sun", "Japan"]),
    ("月", "6708", 74, 4, 1, 23, 5, ["ゲツ", "ガツ"], ["つき"], ["month", "moon"]),
    ("火", "706B", 86, 4, 1, 574, 5, ["カ"], ["ひ", "ほ"], ["fire"]),
    ("水", "6C34", 85, 4, 1, 223, 5, ["スイ"], ["みず"], ["water"]),
    ("木", "6728", 75, 4, 1, 317, 5, ["モク", "ボク"], ["き", "こ"], ["tree", "wood"]),
    ("本", "672C", 75, 5, 1, 10, 5, ["ホン"], ["もと"], ["book", "origin", "main"]),
    ("人", "4EBA", 9, 2, 1, 5, 5, ["ジン", "ニン"], ["ひと"], ["person"]),
    ("学", "5B66", 39, 8, 1, 63, 5, ["ガク"], ["まな.ぶ"], ["study", "learning"]),
]

WORDS = [
    (9000001, ["日本"], ["にほん", "にっぽん"], ["Japan"], ["noun"]),
    (9000002, ["学生"], ["がくせい"], ["student"], ["noun"]),
    (9000003, ["今日"], ["きょう"], ["today"], ["noun", "adverbial noun"]),
    (9000004, ["水曜日"], ["すいようび"], ["Wednesday"], ["noun"]),
    (9000005, ["本"], ["ほん"], ["book"], ["noun"]),
]

SENTENCES = [
    ("starter-1", "今日は日本語を勉強します。", "Today I will study Japanese.", ["今", "日", "本", "語", "勉", "強"]),
    ("starter-2", "学生は本を読みます。", "The student reads a book.", ["学", "生", "本", "読"]),
    ("starter-3", "水曜日に友だちと会います。", "I will meet a friend on Wednesday.", ["水", "曜", "日", "友", "会"]),
]

RELATIONS = [
    ("日", "月", 63, [{"type": "shared_theme", "detail": "calendar and sky terms", "score": 30}, {"type": "same_stroke_count", "detail": "4", "score": 8}]),
    ("日", "本", 54, [{"type": "shared_word_family", "detail": "日本", "score": 34}, {"type": "shared_jlpt", "detail": "JLPT 5", "score": 20}]),
    ("月", "水", 45, [{"type": "shared_theme", "detail": "weekday names", "score": 25}, {"type": "same_stroke_count", "detail": "4", "score": 8}]),
    ("火", "水", 44, [{"type": "shared_theme", "detail": "elemental opposites", "score": 28}, {"type": "same_stroke_count", "detail": "4", "score": 8}]),
    ("木", "本", 48, [{"type": "visual_component", "detail": "本 builds from 木-like form", "score": 30}, {"type": "common_radical", "detail": "75", "score": 18}]),
    ("人", "学", 34, [{"type": "study_theme", "detail": "people and learning vocabulary", "score": 24}]),
]


def dumps(value: object) -> str:
    return json.dumps(value, ensure_ascii=False)


def insert_kanji(conn: sqlite3.Connection, now: str) -> None:
    for item in KANJI:
        literal, codepoint, radical, strokes, grade, frequency, jlpt, on, kun, meanings = item
        conn.execute(
            """
            INSERT INTO kanji (
              literal, unicode_codepoint, classical_radical, stroke_count, grade,
              frequency_rank, jlpt_level, on_readings_json, kun_readings_json,
              nanori_readings_json, meanings_json, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '[]', ?, ?)
            ON CONFLICT(literal) DO UPDATE SET
              unicode_codepoint = excluded.unicode_codepoint,
              classical_radical = excluded.classical_radical,
              stroke_count = excluded.stroke_count,
              grade = excluded.grade,
              frequency_rank = excluded.frequency_rank,
              jlpt_level = excluded.jlpt_level,
              on_readings_json = excluded.on_readings_json,
              kun_readings_json = excluded.kun_readings_json,
              meanings_json = excluded.meanings_json,
              updated_at = excluded.updated_at
            """,
            (literal, codepoint, radical, strokes, grade, frequency, jlpt, dumps(on), dumps(kun), dumps(meanings), now),
        )


def insert_words(conn: sqlite3.Connection, now: str) -> None:
    for sequence, kanji_forms, readings, glosses, parts in WORDS:
        conn.execute(
            """
            INSERT INTO dictionary_entries (entry_id, updated_at)
            VALUES (?, ?)
            ON CONFLICT(entry_id) DO UPDATE SET updated_at = excluded.updated_at
            """,
            (sequence, now),
        )
        entry_id = conn.execute("SELECT id FROM dictionary_entries WHERE entry_id = ?", (sequence,)).fetchone()[0]
        conn.execute("DELETE FROM entry_kanji WHERE entry_id = ?", (entry_id,))
        conn.execute("DELETE FROM entry_readings WHERE entry_id = ?", (entry_id,))
        conn.execute("DELETE FROM entry_senses WHERE entry_id = ?", (entry_id,))

        for index, kanji in enumerate(kanji_forms):
            conn.execute(
                """
                INSERT INTO entry_kanji
                  (entry_id, kanji, is_common, priority_tags_json, info_json, kanji_order)
                VALUES (?, ?, 1, '["starter"]', '[]', ?)
                """,
                (entry_id, kanji, index),
            )
        for index, reading in enumerate(readings):
            conn.execute(
                """
                INSERT INTO entry_readings
                  (entry_id, reading, is_common, priority_tags_json, info_json, reading_order)
                VALUES (?, ?, 1, '["starter"]', '[]', ?)
                """,
                (entry_id, reading, index),
            )

        cursor = conn.execute(
            """
            INSERT INTO entry_senses
              (entry_id, sense_order, parts_of_speech_json, fields_json, misc_json, dialects_json)
            VALUES (?, 0, ?, '[]', '[]', '[]')
            """,
            (entry_id, dumps(parts)),
        )
        sense_id = cursor.lastrowid
        for index, gloss in enumerate(glosses):
            conn.execute(
                "INSERT INTO sense_glosses (sense_id, gloss, gloss_type, gloss_order) VALUES (?, ?, NULL, ?)",
                (sense_id, gloss, index),
            )


def insert_sentences(conn: sqlite3.Connection, now: str) -> None:
    for source_id, japanese, english, terms in SENTENCES:
        conn.execute(
            """
            INSERT INTO sentence_examples
              (source, source_id, japanese, english, metadata_json, updated_at)
            VALUES ('starter', ?, ?, ?, '{"level":"starter"}', ?)
            ON CONFLICT(source, source_id) DO UPDATE SET
              japanese = excluded.japanese,
              english = excluded.english,
              metadata_json = excluded.metadata_json,
              updated_at = excluded.updated_at
            """,
            (source_id, japanese, english, now),
        )
        sentence_id = conn.execute(
            "SELECT id FROM sentence_examples WHERE source = 'starter' AND source_id = ?",
            (source_id,),
        ).fetchone()[0]
        conn.execute("DELETE FROM sentence_example_terms WHERE sentence_id = ?", (sentence_id,))
        for index, term in enumerate(terms):
            conn.execute(
                """
                INSERT INTO sentence_example_terms
                  (sentence_id, term_text, term_type, term_order)
                VALUES (?, ?, 'kanji', ?)
                """,
                (sentence_id, term, index),
            )


def insert_relations(conn: sqlite3.Connection, now: str) -> None:
    for source, target, score, reasons in RELATIONS:
        for left, right in ((source, target), (target, source)):
            conn.execute(
                """
                INSERT INTO kanji_relations
                  (source_literal, target_literal, relation_type, score, reasons_json, updated_at)
                VALUES (?, ?, 'starter_similarity', ?, ?, ?)
                ON CONFLICT(source_literal, target_literal, relation_type) DO UPDATE SET
                  score = excluded.score,
                  reasons_json = excluded.reasons_json,
                  updated_at = excluded.updated_at
                """,
                (left, right, score, dumps(reasons), now),
            )


def main() -> None:
    db_path = Path("data/local/app.sqlite")
    conn = sqlite3.connect(db_path)
    conn.execute("PRAGMA foreign_keys = ON")
    now = datetime.now(timezone.utc).isoformat()
    with conn:
        insert_kanji(conn, now)
        insert_words(conn, now)
        insert_sentences(conn, now)
        insert_relations(conn, now)
    conn.close()
    print(f"Seeded starter Japanese data into {db_path}")


if __name__ == "__main__":
    main()
