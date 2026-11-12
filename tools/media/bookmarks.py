import os, sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from media_kit import *  # noqa: E402,F403

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'bookmarks', 'media')
os.makedirs(OUT, exist_ok=True)
APPS2 = ['Bookmarks', 'Documents', 'Tasks', 'Chat', 'Meet']

# the grid of cards
b = sidebar('Bookmarks', APPS2) + text(228, 44, 'Bookmarks', 24, weight=600) + button(770, 22, 158, '+ New bookmark')
b += f'<rect x="228" y="62" width="300" height="32" rx="9" fill="{PANEL}" stroke="{LINE}"/>' + text(242, 83, 'Search title, address, note, tags', 12, DIM)
x = 546
for label, on in [('★ Favourites', False), ('rust  3', True), ('ops  2', False), ('docs  2', False)]:
    w = 24 + len(label) * 7
    b += f'<rect x="{x}" y="66" width="{w}" height="24" rx="12" fill="{"#e8eaf6" if on else PANEL}" stroke="{ACC if on else LINE}"/>' + text(x + w / 2, 82, label, 11, INK, 600, 'middle')
    x += w + 8
cards = [('Rust book', 'doc.rust-lang.org', 'The reference for learning the language.', ['rust', 'docs'], '#4db6ac', True),
         ('Grafana', 'grafana.example.org', 'Production dashboards, ask Anna for access.', ['ops'], '#e57373', True),
         ('Crates', 'crates.io', 'Find a library before writing one.', ['rust'], '#f2a93b', False),
         ('Runbook', 'wiki.example.org', 'What to do when the pager rings.', ['ops', 'docs'], '#7b8fd1', False)]
for i, (title, host, note, tags, col, fav) in enumerate(cards):
    cx, cy = 228 + (i % 2) * 358, 110 + (i // 2) * 200
    b += card(cx, cy, 342, 184) + avatar(cx + 34, cy + 36, title[0], col, 20) + text(cx + 64, cy + 32, title, 15, weight=600) + text(cx + 64, cy + 50, host, 12, DIM)
    b += text(cx + 318, cy + 40, '★' if fav else '☆', 20, INK, anchor='middle')
    b += text(cx + 16, cy + 84, note, 13, INK)
    tx = cx + 16
    for t in tags:
        w = 20 + len(t) * 7
        b += f'<rect x="{tx}" y="{cy + 100}" width="{w}" height="20" rx="10" fill="none" stroke="{LINE}"/>' + text(tx + w / 2, cy + 114, t, 11, DIM, anchor='middle')
        tx += w + 6
    bx = cx + 16
    for j, (lab, w) in enumerate([('Open', 62), ('Copy link', 86), ('Edit', 56), ('Share…', 72)]):
        b += button(bx, cy + 138, w, lab, j == 0)
        bx += w + 8
write(os.path.join(OUT, 'list.svg'), 'Bookmarks: a grid of cards with search, tags and favourites', b)

# the form of a bookmark
b = sidebar('Bookmarks', APPS2) + text(228, 44, 'Bookmarks', 24, weight=600)
b += '<rect x="200" y="0" width="760" height="540" fill="#1f2430" opacity="0.35"/>'
b += card(300, 70, 560, 400) + text(324, 108, 'New bookmark', 18, weight=600)
fields = [('Address', 'https://doc.rust-lang.org/book/', 124), ('Title', 'Rust book', 190)]
for lab, val, yy in fields:
    b += text(324, yy, lab, 12, DIM, 600) + f'<rect x="324" y="{yy + 8}" width="512" height="36" rx="9" fill="{PANEL}" stroke="{LINE}"/>' + text(338, yy + 31, val, 14)
b += text(324, 256, 'Note', 12, DIM, 600) + f'<rect x="324" y="264" width="512" height="70" rx="9" fill="{PANEL}" stroke="{LINE}"/>' + text(338, 288, 'The reference for learning the language.', 14)
b += text(324, 358, 'Tags', 12, DIM, 600) + f'<rect x="324" y="366" width="512" height="38" rx="9" fill="{PANEL}" stroke="{LINE}"/>'
tx = 338
for t in ['rust', 'docs']:
    w = 36 + len(t) * 7
    b += f'<rect x="{tx}" y="374" width="{w}" height="22" rx="11" fill="#e8eaf6" stroke="#c5cae9"/>' + text(tx + 10, 389, t + '  ×', 12, ACC, 600)
    tx += w + 8
b += f'<rect x="324" y="420" width="16" height="16" rx="4" fill="{ACC}"/>' + text(348, 433, 'Favourite', 14)
b += button(620, 424, 100, 'Cancel', False) + button(732, 424, 104, 'Save', True)
write(os.path.join(OUT, 'edit.svg'), 'Bookmarks: the form of a bookmark with its address, note and tags', b)
print('ok')
