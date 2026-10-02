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
sys.path.insert(0, str(ROOT))
from ar_translations import AR, PLURALS  # noqa: E402
from core import admin_labels as AL  # noqa: E402

# CMS strings (field labels, help texts, model names, sections) live in core/admin_labels.py
AR.update({en: ar for en, ar in AL.FIELDS.values()})
AR.update(AL.HELP)
AR.update(AL.ADMIN)
for _en_s, _en_p, _ar_s, _ar_p in AL.MODELS.values():
    AR[_en_s], AR[_en_p] = _ar_s, _ar_p
EXTRA = set(AR) - set()  # everything above is always included

STR = r'"((?:[^"\\]|\\.)*)"'
STR1 = r"'((?:[^'\\]|\\.)*)'"
PATTERNS = [re.compile(r'{%\s*(?:trans|translate)\s+' + STR), re.compile(r"{%\s*(?:trans|translate)\s+" + STR1),
            re.compile(r'\b_\(\s*' + STR + r'\s*\)'), re.compile(r"\b_\(\s*" + STR1 + r"\s*\)")]


def collect():
    found = {}
    files = list((ROOT / "core").rglob("*.html")) + list((ROOT / "core").rglob("*.py")) + list((ROOT / "templates").rglob("*.html"))
    for f in sorted(files):
        if "migrations" in f.parts or f.name in ("translation.py", "admin_labels.py"):
            continue
        text = f.read_text(encoding="utf-8")
        for pat in PATTERNS:
            for m in pat.finditer(text):
                line = text[: m.start()].count("\n") + 1
                found.setdefault(m.group(1).replace('\\"', '"'), []).append(f"{f.relative_to(ROOT)}:{line}")
    return found


BLOCK = re.compile(r"{%\s*blocktrans\b[^%]*%}(.*?){%\s*endblocktrans\s*%}", re.S)


def _fmt(text):
    return re.sub(r"{{\s*(\w+)\s*}}", r"%(\1)s", " ".join(text.split()))


def collect_blocks():
    """{% blocktrans %} (with optional {% plural %}) -> {singular: plural_or_None}"""
    found = {}
    for f in sorted((ROOT / "core").rglob("*.html")):
        for m in BLOCK.finditer(f.read_text(encoding="utf-8")):
            parts = re.split(r"{%\s*plural\s*%}", m.group(1))
            found[_fmt(parts[0])] = _fmt(parts[1]) if len(parts) > 1 else None
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
    for msgid in AR:  # make sure label catalogs are always emitted even if not found in code
        found.setdefault(msgid, ["core/admin_labels.py:1"])
    for msgid, where in sorted(found.items()):
        tr = AR.get(msgid, "")
        if not tr:
            missing.append(msgid)
        po.append(polib.POEntry(msgid=msgid, msgstr=tr, occurrences=[(w.split(":")[0], w.split(":")[1]) for w in where[:3]]))
    for singular, plural in sorted(collect_blocks().items()):
        if plural:
            forms = PLURALS.get(singular)
            if not forms:
                missing.append(singular)
            po.append(polib.POEntry(msgid=singular, msgid_plural=plural, msgstr_plural=dict(enumerate(forms or [""] * 6))))
        else:
            tr = AR.get(singular, "")
            if not tr:
                missing.append(singular)
            po.append(polib.POEntry(msgid=singular, msgstr=tr))
            found[singular] = []
        if plural:
            found[singular] = []
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
