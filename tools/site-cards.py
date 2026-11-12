#!/usr/bin/env python3
"""Rebuilds the plugin cards of the Mosaikit site (`plugins/index.html`) from this repository.

    python tools/site-cards.py <path of the clone of mosaikit.github.io>

For every plugin folder: `plugin.toml` (name, version, description, permissions, screenshots), `media/` (the pictures of the
carousel) and `CARD.md` (the text of the card: one paragraph that says what the plugin is for and what it does, then `Uses:` and
a bullet list of the typical cases). A plugin without `CARD.md` falls back to its manifest description. Language plugins show the
flag of the language (`assets/flags/<code>.svg` of the site) instead of a thumbnail.

New plugins are added to GROUPS below. Writes the page, copies the pictures and appends the CSS the cards need once.
"""
import html, json, os, re, shutil, sys, tomllib

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.dirname(HERE)
SITE = sys.argv[1] if len(sys.argv) > 1 else sys.exit(__doc__)

GROUPS = [
    ('Applications', None, ['files', 'notes', 'tasks', 'contacts', 'chat', 'meet', 'announcements', 'bookmarks', 'snippets', 'polls', 'surveys', 'approvals', 'dashboard', 'forms', 'projects', 'calendar', 'whiteboard', 'maps', 'static-site']),
    ('Extensions', 'Small additions to an application.', ['note-review']),
    ('Layouts', 'How the interface is arranged: pick one per tenant.', ['layout-project', 'layout-suite', 'layout-tabs', 'layout-workspace']),
    ('Languages', 'The interface in your language, with right-to-left support for Arabic. The Administrator installs the language and each person chooses it.',
     ['lang-es', 'lang-pt', 'lang-fr', 'lang-nl', 'lang-ar', 'lang-zh', 'lang-ru']),
]
LANG_NAMES = {'es': 'Spanish', 'pt': 'Portuguese', 'fr': 'French', 'nl': 'Dutch', 'ar': 'Arabic', 'zh': 'Chinese', 'ru': 'Russian'}


def read_card(d):
    """(paragraph, [uses]) of CARD.md, or None."""
    p = os.path.join(SRC, d, 'CARD.md')
    if not os.path.isfile(p):
        return None
    text = open(p, encoding='utf-8').read().split('\n')
    paragraph, uses, mode = [], [], 'p'
    for line in text[1:]:
        if line.strip().lower().startswith('uses'):
            mode = 'u'
        elif mode == 'u' and line.startswith('- '):
            uses.append(line[2:].strip())
        elif mode == 'p' and line.strip():
            paragraph.append(line.strip())
    return ' '.join(paragraph), uses


def card(d):
    with open(os.path.join(SRC, d, 'plugin.toml'), 'rb') as f:
        m = tomllib.load(f)
    version = html.escape(str(m['version']))
    if m.get('kind') == 'language':
        code = m['language']['code']
        name = LANG_NAMES.get(code, m['name'])
        desc = m.get('description', '').rstrip('.')
        return (f'<article class="card plugin lang" id="{d}"><img class="flag" src="/assets/flags/{code}.svg" width="60" height="40" alt="Flag for {name}">'
                f'<div><h3>{name} <span class="badge">{version}</span></h3>'
                f'<p class="native" lang="{code}">{html.escape(m["language"]["name"])}</p><p>{html.escape(desc)}.</p></div></article>')
    name = m['name']
    c = read_card(d)
    text = c[0] if c else m.get('description', '').rstrip('.') + '.'
    uses = ''
    if c and c[1]:
        uses = '<p class="uses-title">Typical uses</p><ul class="uses">' + ''.join(f'<li>{html.escape(u)}</li>' for u in c[1]) + '</ul>'
    items = []
    dest = os.path.join(SITE, 'assets', 'plugins', d)
    for i, s in enumerate(m.get('screenshots', [])):
        os.makedirs(dest, exist_ok=True)
        shutil.copyfile(os.path.join(SRC, d, 'media', s), os.path.join(dest, s))
        alt = re.search(r'aria-label="([^"]*)"', open(os.path.join(dest, s), encoding='utf-8').read())
        items.append({'src': f'/assets/plugins/{d}/{s}', 'alt': html.unescape(alt.group(1)) if alt else f'{name}, image {i + 1}'})
    perms = m.get('permissions', {})
    bits = [b for b, on in (('real-time', perms.get('realtime')), ('camera and microphone', perms.get('media'))) if on]
    chips = '<p class="chips">' + ''.join(f'<span class="chip">{b}</span>' for b in bits) + '</p>' if bits else ''
    thumb = ''
    if items:
        data = html.escape(json.dumps({'name': name, 'shots': items}), quote=True)
        thumb = (f'<button type="button" class="thumb" data-view="{data}" aria-label="View screenshots of {html.escape(name)}">'
                 f'<img src="{items[0]["src"]}" width="960" height="540" alt="" loading="lazy"><span class="count">{len(items)} images</span></button>')
    return (f'<article class="card plugin" id="{d}">{thumb}<h3>{html.escape(name)} <span class="badge">{version}</span></h3>'
            f'<p>{html.escape(text)}</p>{uses}{chips}</article>')


body = ''
for title, intro, ids in GROUPS:
    body += f'<h3 class="group">{title}</h3>'
    if intro:
        body += f'<p>{intro}</p>'
    body += '<div class="grid plugins%s">' % (' langs' if title == 'Languages' else '') + ''.join(card(i) for i in ids if os.path.isdir(os.path.join(SRC, i))) + '</div>\n  '

total = sum(1 for g in GROUPS for i in g[2] if os.path.isdir(os.path.join(SRC, i)))
path = os.path.join(SITE, 'plugins', 'index.html')
s = open(path, encoding='utf-8').read()
start = s.index('<h3 class="group">Applications</h3>')
end = s.index('<p style="margin-top:32px">To write your own')
s = s[:start] + body + s[end:]
s = re.sub(r'today: \d+ plugins\.', f'today: {total} plugins.', s)
open(path, 'w', encoding='utf-8').write(s)

css = '''
.card.plugin > p { font-size: .95rem; }
.card.plugin .uses-title { margin: 12px 0 4px; font-size: .78rem; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--muted); }
.card.plugin .uses { margin: 0; padding-left: 1.15em; color: var(--muted); font-size: .92rem; }
.card.plugin .uses li { margin: 2px 0; }
'''
cp = os.path.join(SITE, 'assets', 'site.css')
c = open(cp, encoding='utf-8').read()
if '.uses-title' not in c:
    open(cp, 'a', encoding='utf-8').write(css)
home = os.path.join(SITE, 'index.html')
h = open(home, encoding='utf-8').read()
h = re.sub(r'<strong>\d+ plugins</strong>', f'<strong>{total} plugins</strong>', h)
open(home, 'w', encoding='utf-8').write(h)
print('cards', total)
