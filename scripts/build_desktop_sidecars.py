#!/usr/bin/env python3
"""Build platform-native Python workers for the Yomunami desktop app."""

from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
DESKTOP_ROOT = REPO_ROOT / "apps" / "desktop"


@dataclass(frozen=True)
class SidecarSpec:
    service_id: str
    executable_name: str
    service_root: Path
    entrypoint: str
    collect_all: tuple[str, ...] = ()
    hidden_imports: tuple[str, ...] = ()
    windowed_on_windows: bool = False

    @property
    def source(self) -> Path:
        return self.service_root / self.entrypoint

    @property
    def requirements(self) -> Path:
        return self.service_root / "requirements.txt"


SIDECARS = {
    "ocr": SidecarSpec(
        service_id="ocr",
        executable_name="yomunami-ocr",
        service_root=REPO_ROOT / "services" / "ocr",
        entrypoint="app.py",
        collect_all=("manga_ocr", "easyocr", "fugashi", "unidic_lite"),
    ),
    "recognition": SidecarSpec(
        service_id="recognition",
        executable_name="yomunami-recognize",
        service_root=REPO_ROOT / "services" / "recognize",
        entrypoint="app.py",
        collect_all=("kanjidraw",),
    ),
}


def build_command(spec: SidecarSpec, output: Path, work_root: Path, python: str = sys.executable) -> list[str]:
    command = [
        python,
        "-m",
        "PyInstaller",
        "--noconfirm",
        "--clean",
        "--onefile",
        "--name",
        spec.executable_name,
        "--distpath",
        str(output),
        "--workpath",
        str(work_root / spec.service_id),
        "--specpath",
        str(work_root / "specs"),
        "--paths",
        str(spec.service_root),
    ]
    if spec.windowed_on_windows and sys.platform == "win32":
        command.append("--noconsole")
    for package in spec.collect_all:
        command.extend(("--collect-all", package))
    for module in spec.hidden_imports:
        command.extend(("--hidden-import", module))
    command.append(str(spec.source))
    return command


def run(command: list[str]) -> None:
    print("+", " ".join(command), flush=True)
    subprocess.run(command, cwd=REPO_ROOT, check=True)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--service", action="append", choices=sorted(SIDECARS), help="Build only this service (repeatable).")
    parser.add_argument("--output", type=Path, default=DESKTOP_ROOT / "sidecars")
    parser.add_argument("--skip-dependencies", action="store_true", help="Use an already prepared Python environment.")
    args = parser.parse_args()

    selected = [SIDECARS[name] for name in (args.service or SIDECARS)]
    missing = [str(spec.source.relative_to(REPO_ROOT)) for spec in selected if not spec.source.is_file()]
    if missing:
        parser.error(f"missing sidecar source: {', '.join(missing)}")

    output = args.output.resolve()
    work_root = DESKTOP_ROOT / ".sidecar-build"
    output.mkdir(parents=True, exist_ok=True)
    if work_root.exists():
        shutil.rmtree(work_root)
    work_root.mkdir(parents=True)

    if not args.skip_dependencies:
        run([sys.executable, "-m", "pip", "install", "--disable-pip-version-check", "pyinstaller>=6.19,<7"])
        for spec in selected:
            run([sys.executable, "-m", "pip", "install", "--disable-pip-version-check", "-r", str(spec.requirements)])

    for spec in selected:
        run(build_command(spec, output, work_root))

    expected = [output / f"{spec.executable_name}{'.exe' if sys.platform == 'win32' else ''}" for spec in selected]
    absent = [str(path) for path in expected if not path.is_file()]
    if absent:
        raise RuntimeError(f"PyInstaller completed without expected sidecars: {', '.join(absent)}")
    print(f"Built {len(expected)} sidecars in {output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
