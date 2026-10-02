"""Export the Arabic translations used by the Django site to web/src/i18n/ar.json (English text -> Arabic).

Run from the repository root:  python web/tools/export_i18n.py
The JavaScript app uses the same English sentences as keys, so every Arabic string written for the Django
site keeps working unchanged.
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "tools"))
sys.path.insert(0, str(ROOT))

from ar_translations import AR, PLURALS  # noqa: E402
from core import admin_labels as AL  # noqa: E402

out = dict(AR)
out.update({en: ar for en, ar in AL.FIELDS.values()})
out.update(AL.HELP)
out.update(AL.ADMIN)
for singular, plural, singular_ar, plural_ar in AL.MODELS.values():
    out[singular], out[plural] = singular_ar, plural_ar

data = {"strings": dict(sorted(out.items())), "plurals": PLURALS}
dest = ROOT / "web" / "src" / "i18n" / "ar.json"
dest.write_text(json.dumps(data, ensure_ascii=False, indent=0), encoding="utf-8")
print(f"{len(out)} strings -> {dest.relative_to(ROOT)}")
