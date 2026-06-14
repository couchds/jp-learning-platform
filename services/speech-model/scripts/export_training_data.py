#!/usr/bin/env python3
"""Export local pronunciation recordings into speech-model training data."""

from __future__ import annotations

import argparse
import os
import shutil
import sqlite3
from pathlib import Path

import pandas as pd


SERVICE_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = SERVICE_ROOT.parents[1]


def default_db_path() -> Path:
    return Path(os.environ.get("DATABASE_PATH", REPO_ROOT / "data/local/app.sqlite"))


def default_upload_dir() -> Path:
    return Path(os.environ.get("UPLOAD_DIR", REPO_ROOT / "uploads"))


def export_data(
    db_path: Path,
    upload_dir: Path,
    output_dir: Path,
    reference_only: bool = True,
) -> None:
    if not db_path.exists():
        raise FileNotFoundError(f"Database not found: {db_path}")

    data_dir = SERVICE_ROOT / output_dir
    audio_dir = data_dir / "audio"
    audio_dir.mkdir(parents=True, exist_ok=True)

    connection = sqlite3.connect(db_path)
    connection.row_factory = sqlite3.Row

    where = "WHERE pr.is_reference = 1" if reference_only else ""
    rows = connection.execute(
        f"""
        SELECT
          pr.id,
          pr.audio_path,
          pr.is_reference,
          pr.duration_ms,
          pr.created_at,
          pr.word,
          GROUP_CONCAT(ek.kanji) AS kanji_forms,
          GROUP_CONCAT(er.reading) AS readings
        FROM pronunciation_recordings pr
        LEFT JOIN dictionary_entries de ON de.id = pr.entry_id
        LEFT JOIN entry_kanji ek ON ek.entry_id = de.id
        LEFT JOIN entry_readings er ON er.entry_id = de.id
        {where}
        GROUP BY pr.id
        ORDER BY pr.created_at
        """
    ).fetchall()

    manifest: list[dict[str, object]] = []
    for row in rows:
        source = upload_dir / row["audio_path"]
        if not source.exists():
            print(f"Skipping missing audio file: {source}")
            continue

        kanji = first_csv_value(row["kanji_forms"])
        reading = first_csv_value(row["readings"])
        label = row["word"] or reading or kanji
        if not label:
            print(f"Skipping recording without label: {row['id']}")
            continue

        destination_name = f"{int(row['id']):05d}_{safe_name(str(label))}{source.suffix}"
        destination = audio_dir / destination_name
        shutil.copy2(source, destination)

        manifest.append(
            {
                "recording_id": row["id"],
                "filename": destination_name,
                "kanji": kanji,
                "reading": reading,
                "label": label,
                "duration_ms": row["duration_ms"],
                "is_reference": bool(row["is_reference"]),
                "created_at": row["created_at"],
            }
        )

    connection.close()

    if not manifest:
        print("No eligible recordings found.")
        return

    frame = pd.DataFrame(manifest)
    manifest_path = data_dir / "manifest.csv"
    frame.to_csv(manifest_path, index=False)

    print(f"Exported {len(frame)} recordings")
    print(f"Audio files: {audio_dir}")
    print(f"Manifest: {manifest_path}")
    print(f"Unique labels: {frame['label'].nunique()}")


def first_csv_value(value: str | None) -> str:
    if not value:
        return ""
    return value.split(",")[0]


def safe_name(value: str) -> str:
    keep = []
    for char in value:
        if char.isalnum() or char in {"-", "_"}:
            keep.append(char)
    return "".join(keep)[:80] or "recording"


def main() -> None:
    parser = argparse.ArgumentParser(description="Export local speech training data")
    parser.add_argument("--all", action="store_true", help="Export all recordings, not just references")
    parser.add_argument("--database", type=Path, default=default_db_path())
    parser.add_argument("--uploads", type=Path, default=default_upload_dir())
    parser.add_argument("--output", type=Path, default=Path("data/training"))
    args = parser.parse_args()

    export_data(
        db_path=args.database,
        upload_dir=args.uploads,
        output_dir=args.output,
        reference_only=not args.all,
    )


if __name__ == "__main__":
    main()
