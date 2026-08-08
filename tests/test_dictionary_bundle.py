from __future__ import annotations

import sqlite3
import tempfile
import unittest
from pathlib import Path

from scripts.build_dictionary_bundle import build_bundle


JMDICT = """<?xml version="1.0" encoding="UTF-8"?>
<JMdict>
  <entry>
    <ent_seq>1001</ent_seq>
    <k_ele><keb>\u6e96\u5099</keb><ke_pri>ichi1</ke_pri></k_ele>
    <r_ele><reb>\u3058\u3085\u3093\u3073</reb><re_pri>ichi1</re_pri></r_ele>
    <sense><gloss>preparation</gloss><gloss>arrangements</gloss></sense>
  </entry>
  <entry>
    <ent_seq>1002</ent_seq>
    <k_ele><keb>\u66ab\u304f</keb></k_ele>
    <r_ele><reb>\u3057\u3070\u3089\u304f</reb></r_ele>
    <sense><gloss>for a while</gloss></sense>
  </entry>
</JMdict>
"""

KANJIDIC = """<?xml version="1.0" encoding="UTF-8"?>
<kanjidic2><character><literal>\u6e96</literal><reading_meaning><rmgroup>
  <reading r_type="ja_on">\u30b8\u30e5\u30f3</reading><meaning>semi-</meaning><meaning>correspond to</meaning>
</rmgroup></reading_meaning></character></kanjidic2>
"""


class DictionaryBundleTests(unittest.TestCase):
    def test_builds_exact_word_reading_and_kanji_indexes(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            jmdict = root / "JMdict.xml"
            kanjidic = root / "kanjidic2.xml"
            output = root / "dictionary.sqlite"
            jmdict.write_text(JMDICT, encoding="utf-8")
            kanjidic.write_text(KANJIDIC, encoding="utf-8")

            counts = build_bundle(jmdict, kanjidic, output)

            self.assertEqual(counts, {"words": 2, "forms": 4, "kanji": 1})
            conn = sqlite3.connect(output)
            word = conn.execute(
                "SELECT w.reading, w.meanings_json FROM word_forms f JOIN word_entries w USING(entry_id) WHERE f.form = ?",
                ("\u6e96\u5099",),
            ).fetchone()
            reading_match = conn.execute(
                "SELECT COUNT(*) FROM word_forms WHERE form = ?",
                ("\u3057\u3070\u3089\u304f",),
            ).fetchone()[0]
            kanji = conn.execute(
                "SELECT meanings_json FROM kanji_entries WHERE literal = ?",
                ("\u6e96",),
            ).fetchone()
            conn.close()

            self.assertEqual(word, ("\u3058\u3085\u3093\u3073", '["preparation", "arrangements"]'))
            self.assertEqual(reading_match, 1)
            self.assertEqual(kanji, ('["semi-", "correspond to"]',))


if __name__ == "__main__":
    unittest.main()
