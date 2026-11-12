import os, sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from media_kit import *  # noqa: E402,F403

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'snippets', 'media')
os.makedirs(OUT, exist_ok=True)
APPS2 = ['Snippets', 'Documents', 'Tasks', 'Chat', 'Meet']
MONO = 'Consolas, Menlo, monospace'
CODE_BG = '#eef0f5'


def mono(x, y, txt, size=13, fill=INK):
    return f'<text x="{x}" y="{y}" font-size="{size}" fill="{fill}" font-family="{MONO}" xml:space="preserve">{html.escape(txt)}</text>'


def tag(x, y, label):
    w = 16 + len(label) * 7
    return f'<rect x="{x}" y="{y}" width="{w}" height="20" rx="10" fill="#e8eaf6" stroke="#c5cae9"/>' + text(x + w / 2, y + 14, label, 11, ACC, 600, 'middle'), w


ITEMS = [('Deploy to staging', 'shell', 'kubectl apply -f app.yaml'),
         ('Top customers by revenue', 'sql', 'SELECT name, SUM(total) FROM orders'),
         ('Polite reply to a complaint', 'text', 'Dear customer, thank you for telling us'),
         ('Retry with backoff', 'python', 'for i in range(5): sleep(2 ** i)'),
         ('CI settings', 'json', '{ "retries": 3, "timeout": 30 }')]

# the list: search, filters, tags and the snippets
b = sidebar('Snippets', APPS2) + text(228, 44, 'Snippets', 24, weight=600) + button(780, 22, 140, '+ New snippet')
b += card(228, 70, 330, 450) + f'<rect x="244" y="86" width="298" height="30" rx="8" fill="{BG}" stroke="{LINE}"/>' + text(256, 106, 'Search title, content and tags', 12, DIM)
b += f'<rect x="244" y="124" width="298" height="30" rx="8" fill="{BG}" stroke="{LINE}"/>' + text(256, 144, 'All kinds', 12, DIM)
x = 244
for i, (name, n) in enumerate([('ops', 3), ('sql', 2), ('mail', 1), ('python', 1)]):
    s, w = tag(x, 164, f'{name}  {n}')
    b += s
    x += w + 6
y = 198
for i, (title, kind, line) in enumerate(ITEMS):
    if i == 0:
        b += f'<rect x="238" y="{y - 6}" width="310" height="58" rx="9" fill="#e8eaf6" stroke="#c5cae9"/>'
    b += text(252, y + 14, title, 14, weight=600) + chip(548 - 16 - (14 + len(kind) * 7), y, kind, DIM)
    b += mono(252, y + 36, line, 11, DIM)
    y += 64
b += card(578, 70, 350, 450) + text(753, 300, 'Select a snippet to see it here.', 14, DIM, anchor='middle')
write(os.path.join(OUT, 'list.svg'), 'Snippets: the list with search, kind and tags', b)

# one snippet with the code block and the Copy button
b = sidebar('Snippets', APPS2) + text(228, 44, 'Snippets', 24, weight=600) + button(780, 22, 140, '+ New snippet')
b += card(228, 70, 330, 450) + f'<rect x="244" y="86" width="298" height="30" rx="8" fill="{BG}" stroke="{LINE}"/>' + text(256, 106, 'Search title, content and tags', 12, DIM)
y = 150
for i, (title, kind, line) in enumerate(ITEMS):
    if i == 1:
        b += f'<rect x="238" y="{y - 6}" width="310" height="58" rx="9" fill="#e8eaf6" stroke="#c5cae9"/>'
    b += text(252, y + 14, title, 14, weight=600) + chip(548 - 16 - (14 + len(kind) * 7), y, kind, DIM)
    b += mono(252, y + 36, line, 11, DIM)
    y += 64
b += card(578, 70, 350, 450) + text(600, 108, 'Top customers by revenue', 18, weight=600)
b += chip(600, 122, 'sql', DIM)
x = 650
for t in ['report', 'finance']:
    s, w = tag(x, 122, t)
    b += s
    x += w + 6
b += button(600, 156, 130, 'Copy', True) + button(742, 156, 70, 'Edit', False) + button(822, 156, 90, 'Share...', False)
b += f'<rect x="600" y="206" width="306" height="190" rx="10" fill="{CODE_BG}" stroke="{LINE}"/>'
code = ['SELECT c.name,', '       SUM(o.total) AS revenue', 'FROM orders o', 'JOIN customers c', '  ON c.id = o.customer_id', 'GROUP BY c.name', 'ORDER BY revenue DESC', 'LIMIT 10;']
for i, line in enumerate(code):
    b += mono(616, 232 + i * 21, line, 12)
b += text(600, 420, 'by Giulia Marini · 8 lines', 12, DIM)
write(os.path.join(OUT, 'detail.svg'), 'Snippets: one snippet with its code and the Copy button', b)
print('ok')
