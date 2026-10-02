"""Extract translatable strings and build locale/ar (.po + compiled .mo) without needing GNU gettext.

Usage: python tools/i18n_build.py
Add/change Arabic text in tools/ar_translations.py, then re-run.
"""
import re
import sys
from pathlib import Path

import polib

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(Path(__file__).parent))
from ar_translations import AR  # noqa: E402

STR = r'"((?:[^"\\]|\\.)*)"'
PATTERNS = [re.compile(r'{%\s*trans\s+' + STR), re.compile(r'\b_\(\s*' + STR + r'\s*\)')]


def collect():
    found = {}
    files = list((ROOT / "core").rglob("*.html")) + list((ROOT / "core").rglob("*.py"))
    for f in sorted(files):
        if "migrations" in f.parts or "translation.py" in f.name:
            continue
        text = f.read_text(encoding="utf-8")
        for pat in PATTERNS:
            for m in pat.finditer(text):
                line = text[: m.start()].count("\n") + 1
                found.setdefault(m.group(1).replace('\\"', '"'), []).append(f"{f.relative_to(ROOT)}:{line}")
    return found


def main():
    found = collect()
    po = polib.POFile()
    po.metadata = {
        "Project-Id-Version": "SiaNexis", "Language": "ar", "MIME-Version": "1.0",
        "Content-Type": "text/plain; charset=UTF-8", "Content-Transfer-Encoding": "8bit",
        "Plural-Forms": "nplurals=6; plural=(n==0 ? 0 : n==1 ? 1 : n==2 ? 2 : n%100>=3 && n%100<=10 ? 3 : n%100>=11 ? 4 : 5);",
    }
    missing = []
    for msgid, where in sorted(found.items()):
        tr = AR.get(msgid, "")
        if not tr:
            missing.append(msgid)
        po.append(polib.POEntry(msgid=msgid, msgstr=tr, occurrences=[(w.split(":")[0], w.split(":")[1]) for w in where[:3]]))
    out = ROOT / "locale" / "ar" / "LC_MESSAGES"
    out.mkdir(parents=True, exist_ok=True)
    po.save(str(out / "django.po"))
    po.save_as_mofile(str(out / "django.mo"))
    unused = [k for k in AR if k not in found]
    print(f"{len(found)} strings, {len(found) - len(missing)} translated")
    for m in missing:
        print("MISSING:", m)
    for u in unused:
        print("unused:", u)


if __name__ == "__main__":
    main()
