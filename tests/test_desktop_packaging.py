from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from scripts.build_desktop_sidecars import SIDECARS, build_command


class DesktopPackagingTests(unittest.TestCase):
    def test_all_managed_services_have_unique_binary_names(self) -> None:
        self.assertEqual(set(SIDECARS), {"ocr", "recognition", "overlay"})
        names = [spec.executable_name for spec in SIDECARS.values()]
        self.assertEqual(len(names), len(set(names)))

    def test_pyinstaller_commands_are_isolated_and_one_file(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            for spec in SIDECARS.values():
                with self.subTest(service=spec.service_id):
                    command = build_command(spec, root / "out", root / "work", python="python")
                    self.assertIn("--onefile", command)
                    self.assertIn(spec.executable_name, command)
                    self.assertEqual(command[-1], str(spec.source))
                    self.assertIn(str(spec.service_root), command)


if __name__ == "__main__":
    unittest.main()
