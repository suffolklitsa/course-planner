import re
import subprocess
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class BuildSiteTest(unittest.TestCase):
    def test_index_links_carry_a_version(self):
        subprocess.run([sys.executable, str(ROOT / "scripts" / "build_site.py")], check=True, capture_output=True)
        html = (ROOT / "dist" / "index.html").read_text(encoding="utf-8")
        for name in ["tokens.css", "styles.css", "week.css", "print.css", "app.js"]:
            self.assertRegex(html, re.escape(name) + r"\?v=[0-9a-f]{10}\"", name)
        self.assertNotRegex(html, r'(href|src)="[a-z]+\.(css|js)"')


if __name__ == "__main__":
    unittest.main()
