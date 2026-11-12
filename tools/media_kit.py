"""Small drawing helpers for the illustrations of a plugin (`<plugin>/media/*.svg`, 960x540, the look of the shell).

Used by `tools/media/<plugin>.py`; run those from the root of the repository. Real screenshots replace the illustrations
when a running installation is at hand: the card of the site takes any image listed in `screenshots` of the manifest.
"""
import html

APPS = ['Notes', 'Documents', 'Tasks', 'Chat', 'Meet']
COLS = ['#7b8fd1', '#e57373', '#4db6ac', '#f2a93b']
INK, DIM, LINE, PANEL, BG, ACC = '#1f2430', '#6b7280', '#dfe2e8', '#ffffff', '#f4f5f7', '#3f51b5'


def page(label, body):
    head = ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 540" role="img" aria-label="%s" '
            'font-family="Segoe UI, Roboto, Helvetica, Arial, sans-serif">\n<rect width="960" height="540" fill="%s"/>\n') % (html.escape(label), BG)
    return head + body + '\n</svg>\n'


def write(path, label, body):
    open(path, 'w', encoding='utf-8', newline='\n').write(page(label, body))


def sidebar(active, apps=APPS):
    s = f'<rect x="0" y="0" width="200" height="540" fill="{PANEL}" stroke="{LINE}"/><rect x="16" y="16" width="28" height="28" rx="8" fill="{ACC}"/>'
    y = 74
    for n in apps:
        if n == active:
            s += (f'<rect x="10" y="{y-8}" width="180" height="32" rx="8" fill="#e8eaf6"/><rect x="22" y="{y}" width="16" height="16" rx="4" fill="{ACC}"/>'
                  f'<text x="48" y="{y+13}" font-size="14" fill="{ACC}" font-weight="600">{html.escape(n)}</text>')
        else:
            s += f'<rect x="22" y="{y}" width="16" height="16" rx="4" fill="#b9bfcc"/><text x="48" y="{y+13}" font-size="14" fill="{INK}">{html.escape(n)}</text>'
        y += 38
    s += (f'<line x1="0" y1="476" x2="200" y2="476" stroke="{LINE}"/><circle cx="30" cy="508" r="14" fill="#7b8fd1"/>'
          '<text x="30" y="512" font-size="11" fill="#fff" font-weight="600" text-anchor="middle">GM</text>'
          f'<text x="52" y="504" font-size="12" fill="{INK}" font-weight="600">Giulia Marini</text><text x="52" y="519" font-size="11" fill="{DIM}">Acme srl</text>')
    return s


def text(x, y, txt, size=14, fill=INK, weight=None, anchor=None):
    a = f' font-weight="{weight}"' if weight else ''
    b = f' text-anchor="{anchor}"' if anchor else ''
    return f'<text x="{x}" y="{y}" font-size="{size}" fill="{fill}"{a}{b}>{html.escape(txt)}</text>'


def avatar(x, y, initials, color, r=16):
    return f'<circle cx="{x}" cy="{y}" r="{r}" fill="{color}"/><text x="{x}" y="{y+4}" font-size="11" fill="#fff" font-weight="600" text-anchor="middle">{initials}</text>'


def button(x, y, w, label, primary=True, color=None):
    if primary:
        return f'<rect x="{x}" y="{y}" width="{w}" height="34" rx="9" fill="{ACC}"/>' + text(x + w / 2, y + 22, label, 13, '#ffffff', 600, 'middle')
    return f'<rect x="{x}" y="{y}" width="{w}" height="34" rx="9" fill="{PANEL}" stroke="#c5cae9"/>' + text(x + w / 2, y + 22, label, 12, color or ACC, 600, 'middle')


def card(x, y, w, h, radius=14):
    return f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{radius}" fill="{PANEL}" stroke="{LINE}"/>'


def chip(x, y, label, color, w=None):
    w = w or 14 + len(label) * 7
    return f'<rect x="{x}" y="{y}" width="{w}" height="20" rx="10" fill="none" stroke="{color}"/>' + text(x + w / 2, y + 14, label, 11, color, 700, 'middle')
