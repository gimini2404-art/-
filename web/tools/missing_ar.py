"""List English UI strings used in t('…') calls that have no Arabic translation in src/i18n/ar.json (writes tools/missing_ar.json)."""
import glob, json, re
ar = json.load(open('src/i18n/ar.json'))['strings']
keys = set()
for f in glob.glob('src/**/*.js', recursive=True):
    s = open(f).read()
    for m in re.finditer(r"\bt\(\s*(?:'((?:[^'\\]|\\.)*)'|\"((?:[^\"\\]|\\.)*)\"|`([^`$]*)`)", s):
        k = m.group(1) or m.group(2) or m.group(3)
        if k:
            keys.add(k.replace("\\'", "'"))
missing = sorted(k for k in keys if k not in ar)
json.dump(missing, open('tools/missing_ar.json', 'w'), ensure_ascii=False, indent=1)
print(len(keys), 'strings,', len(missing), 'missing')
