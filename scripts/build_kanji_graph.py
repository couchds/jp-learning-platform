from __future__ import annotations

import argparse
import itertools
import json
import re
import sqlite3
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path


STOPWORDS = {
    "a",
    "an",
    "and",
    "be",
    "by",
    "for",
    "in",
    "of",
    "on",
    "or",
    "the",
    "to",
    "with",
}


@dataclass(frozen=True)
class KanjiNode:
    literal: str
    radical: int | None
    strokes: int | None
    frequency: int | None
    on_readings: tuple[str, ...]
    kun_readings: tuple[str, ...]
    meanings: tuple[str, ...]


def read_json(value: str | None) -> list[str]:
    if not value:
        return []
    try:
        decoded = json.loads(value)
    except json.JSONDecodeError:
        return []
    return [str(item) for item in decoded if str(item).strip()]


def meaning_tokens(meanings: tuple[str, ...]) -> set[str]:
    tokens: set[str] = set()
    for meaning in meanings:
        for token in re.findall(r"[a-zA-Z]{3,}", meaning.lower()):
            if token not in STOPWORDS:
                tokens.add(token)
    return tokens


def load_nodes(conn: sqlite3.Connection, limit: int | None) -> list[KanjiNode]:
    sql = """
      SELECT literal, classical_radical, stroke_count, frequency_rank,
             on_readings_json, kun_readings_json, meanings_json
      FROM kanji
      ORDER BY COALESCE(frequency_rank, 999999), literal
    """
    if limit is not None:
        sql += " LIMIT ?"
        rows = conn.execute(sql, (limit,)).fetchall()
    else:
        rows = conn.execute(sql).fetchall()

    return [
        KanjiNode(
            literal=row[0],
            radical=row[1],
            strokes=row[2],
            frequency=row[3],
            on_readings=tuple(read_json(row[4])),
            kun_readings=tuple(read_json(row[5])),
            meanings=tuple(read_json(row[6])),
        )
        for row in rows
    ]


def pair_key(left: str, right: str) -> tuple[str, str]:
    return (left, right) if left < right else (right, left)


def add_reason(
    candidates: dict[tuple[str, str], dict[str, object]],
    left: str,
    right: str,
    reason_type: str,
    detail: str,
    score: float,
) -> None:
    if left == right:
        return
    key = pair_key(left, right)
    item = candidates.setdefault(key, {"score": 0.0, "reasons": []})
    item["score"] = float(item["score"]) + score
    item["reasons"].append({"type": reason_type, "detail": detail, "score": score})


def add_group_edges(
    candidates: dict[tuple[str, str], dict[str, object]],
    groups: dict[str, list[str]],
    reason_type: str,
    score: float,
    max_group_size: int,
) -> None:
    for value, literals in groups.items():
        unique_literals = sorted(set(literals))
        if len(unique_literals) < 2 or len(unique_literals) > max_group_size:
            continue
        for left, right in itertools.combinations(unique_literals, 2):
            add_reason(candidates, left, right, reason_type, value, score)


def build_graph(conn: sqlite3.Connection, limit: int | None, max_edges: int, max_group_size: int) -> int:
    nodes = load_nodes(conn, limit)
    candidates: dict[tuple[str, str], dict[str, object]] = {}

    radical_groups: dict[str, list[str]] = defaultdict(list)
    on_groups: dict[str, list[str]] = defaultdict(list)
    kun_groups: dict[str, list[str]] = defaultdict(list)
    meaning_groups: dict[str, list[str]] = defaultdict(list)
    stroke_groups: dict[str, list[str]] = defaultdict(list)

    for node in nodes:
        if node.radical is not None:
            radical_groups[str(node.radical)].append(node.literal)
        if node.strokes is not None:
            stroke_groups[str(node.strokes)].append(node.literal)
        for reading in node.on_readings:
            on_groups[reading].append(node.literal)
        for reading in node.kun_readings:
            kun_groups[reading].append(node.literal)
        for token in meaning_tokens(node.meanings):
            meaning_groups[token].append(node.literal)

    add_group_edges(candidates, radical_groups, "common_radical", 35.0, max_group_size)
    add_group_edges(candidates, on_groups, "shared_on_reading", 30.0, max_group_size)
    add_group_edges(candidates, kun_groups, "shared_kun_reading", 24.0, max_group_size)
    add_group_edges(candidates, meaning_groups, "shared_meaning", 20.0, max_group_size)
    add_group_edges(candidates, stroke_groups, "same_stroke_count", 8.0, max_group_size)

    by_source: dict[str, list[tuple[str, float, list[dict[str, object]]]]] = defaultdict(list)
    for (left, right), data in candidates.items():
        score = round(float(data["score"]), 2)
        reasons = sorted(data["reasons"], key=lambda item: float(item["score"]), reverse=True)
        by_source[left].append((right, score, reasons))
        by_source[right].append((left, score, reasons))

    now = datetime.now(timezone.utc).isoformat()
    inserted = 0
    with conn:
        conn.execute("DELETE FROM kanji_relations WHERE relation_type = 'similarity'")
        for source, edges in by_source.items():
            for target, score, reasons in sorted(edges, key=lambda edge: (-edge[1], edge[0]))[:max_edges]:
                conn.execute(
                    """
                    INSERT INTO kanji_relations
                      (source_literal, target_literal, relation_type, score, reasons_json, updated_at)
                    VALUES (?, ?, 'similarity', ?, ?, ?)
                    ON CONFLICT(source_literal, target_literal, relation_type) DO UPDATE SET
                      score = excluded.score,
                      reasons_json = excluded.reasons_json,
                      updated_at = excluded.updated_at
                    """,
                    (source, target, score, json.dumps(reasons, ensure_ascii=False), now),
                )
                inserted += 1

    return inserted


def main() -> None:
    parser = argparse.ArgumentParser(description="Build derived kanji similarity graph edges in SQLite.")
    parser.add_argument("--db", type=Path, default=Path("data/local/app.sqlite"), help="SQLite DB path")
    parser.add_argument("--limit", type=int, default=3000, help="Max kanji to use, ordered by frequency")
    parser.add_argument("--max-edges", type=int, default=24, help="Max outgoing edges per kanji")
    parser.add_argument("--max-group-size", type=int, default=240, help="Skip feature groups larger than this")
    args = parser.parse_args()

    conn = sqlite3.connect(args.db)
    conn.execute("PRAGMA foreign_keys = ON")
    inserted = build_graph(conn, args.limit, args.max_edges, args.max_group_size)
    conn.close()
    print(f"Built {inserted} kanji similarity edges in {args.db}")


if __name__ == "__main__":
    main()
