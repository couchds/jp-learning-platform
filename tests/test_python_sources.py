from __future__ import annotations

import ast
import unittest
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]


class PythonSourceTests(unittest.TestCase):
    def test_tracked_python_sources_parse(self) -> None:
        roots = [
            REPO_ROOT / "scripts",
            REPO_ROOT / "services" / "recognize",
        ]
        sources = [
            path
            for root in roots
            for path in root.rglob("*.py")
            if ".venv" not in path.parts
        ]

        self.assertGreater(len(sources), 0)
        for source in sources:
            with self.subTest(source=source.relative_to(REPO_ROOT)):
                ast.parse(source.read_text(encoding="utf-8"), filename=str(source))


if __name__ == "__main__":
    unittest.main()
