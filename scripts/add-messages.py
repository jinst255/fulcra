"""Adds UI strings to public/_locales/en/messages.json.

Usage: python3 scripts/add-messages.py 'dotted.key=Text with {placeholders}' ...
Keys use dots like the blueprint; {app} and other {names} become Chrome placeholders.
Existing keys are replaced. Remember to list new keys in docs/blueprint.md section 19.8.
"""
import collections, json, re, sys

PATH = 'public/_locales/en/messages.json'
data = json.load(open(PATH), object_pairs_hook=collections.OrderedDict)
for arg in sys.argv[1:]:
    key, text = arg.split('=', 1)
    names = []
    def sub(m):
        if m.group(1) not in names:
            names.append(m.group(1))
        return '$' + m.group(1).upper() + '$'
    entry = {'message': re.sub(r'\{([a-zA-Z0-9]+)\}', sub, text.replace('$', '$$'))}
    if names:
        entry['placeholders'] = {n: {'content': '$%d' % (i + 1)} for i, n in enumerate(names)}
    data[key.replace('.', '_')] = entry
json.dump(data, open(PATH, 'w'), indent=2, ensure_ascii=False)
open(PATH, 'a').write('\n')
