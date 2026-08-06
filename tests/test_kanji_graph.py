from __future__ import annotations

import importlib.util
import sys
import unittest
from pathlib import Path


MODULE_PATH = Path(__file__).resolve().parents[1] / "scripts" / "build_kanji_graph.py"
SPEC = importlib.util.spec_from_file_location("build_kanji_graph", MODULE_PATH)
assert SPEC and SPEC.loader
graph = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = graph
SPEC.loader.exec_module(graph)


class KanjiGraphLogicTests(unittest.TestCase):
    def test_meaning_tokens_normalize_and_remove_stopwords(self) -> None:
        self.assertEqual(graph.meaning_tokens(("The bright SUN", "sun light")), {"bright", "sun", "light"})

    def test_group_edges_are_unique_and_skip_oversized_groups(self) -> None:
        candidates: dict[tuple[str, str], dict[str, object]] = {}
        graph.add_group_edges(candidates, {"sun": ["日", "明", "日"]}, "meaning", 20.0, 3)
        self.assertEqual(list(candidates), [("日", "明")])
        self.assertEqual(candidates[("日", "明")]["score"], 20.0)
        graph.add_group_edges(candidates, {"large": ["一", "二", "三", "四"]}, "meaning", 20.0, 3)
        self.assertEqual(len(candidates), 1)


if __name__ == "__main__":
    unittest.main()
