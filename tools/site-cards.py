#!/usr/bin/env python3
"""Rebuilds the plugin cards of the Mosaikit site (`plugins/index.html`) from this repository.

    python tools/site-cards.py <path of the clone of mosaikit.github.io>

For every plugin folder: `plugin.toml` (name, version, description, permissions, screenshots), `media/` (the pictures of the
carousel; the alt texts come from `tools/screenshot-captions.json`, written by `tools/screenshots.py`) and `CARD.md` (the text of the card: one paragraph that says what the plugin is for and what it does, then `Uses:` and
a bullet list of the typical cases). A plugin without `CARD.md` falls back to its manifest description. Language plugins show the
flag of the language (`assets/flags/<code>.svg` of the site) instead of a thumbnail.

New plugins are added to GROUPS below. Writes the page, copies the pictures and appends the CSS the cards need once.
"""
import html, json, os, re, shutil, sys, tomllib

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.dirname(HERE)
SITE = sys.argv[1] if len(sys.argv) > 1 else sys.exit(__doc__)
_CAPS = os.path.join(HERE, 'screenshot-captions.json')
CAPTIONS = json.load(open(_CAPS, encoding='utf-8')) if os.path.exists(_CAPS) else {}

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
    uses = list(c[1]) if c else []
    items = []
    dest = os.path.join(SITE, 'assets', 'plugins', d)
    for i, s in enumerate(m.get('screenshots', [])):
        os.makedirs(dest, exist_ok=True)
        shutil.copyfile(os.path.join(SRC, d, 'media', s), os.path.join(dest, s))
        # alt text: tools/screenshot-captions.json (real screenshots), else the aria-label of an SVG illustration
        alt = CAPTIONS.get(d, {}).get(s)
        if not alt and s.endswith('.svg'):
            m = re.search(r'aria-label="([^"]*)"', open(os.path.join(dest, s), encoding='utf-8').read())
            alt = html.unescape(m.group(1)) if m else None
        items.append({'src': f'/assets/plugins/{d}/{s}', 'alt': alt or f'{name}, image {i + 1}'})
    perms = m.get('permissions', {})
    bits = [b for b, on in (('real-time', perms.get('realtime')), ('camera and microphone', perms.get('media'))) if on]
    chips = '<p class="chips">' + ''.join(f'<span class="chip">{b}</span>' for b in bits) + '</p>' if bits else ''
    # the card keeps the first sentence; the full text and the uses open in the dialog
    short = re.split(r'(?<=[.!?])\s', text, maxsplit=1)[0]
    data = html.escape(json.dumps({'name': name, 'version': str(m['version']), 'text': text, 'uses': uses, 'chips': bits, 'shots': items}), quote=True)
    thumb = ''
    if items:
        thumb = (f'<button type="button" class="thumb" data-view="{data}" aria-label="Details and screenshots of {html.escape(name)}">'
                 f'<img src="{items[0]["src"]}" width="960" height="540" alt="" loading="lazy"><span class="count">{len(items)} images</span></button>')
    more = f'<button type="button" class="more" data-view="{data}">Details</button>'
    return (f'<article class="card plugin" id="{d}">{thumb}<h3>{html.escape(name)} <span class="badge">{html.escape(str(m["version"]))}</span></h3>'
            f'<p class="short">{html.escape(short)}</p>{chips}{more}</article>')


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

DIALOG = '''<dialog id="viewer" aria-labelledby="viewer-title">
  <div class="vhead"><h3 id="viewer-title"></h3><button type="button" class="vclose" aria-label="Close">×</button></div>
  <div class="vbody">
    <div class="vmedia">
      <div class="vstage"><button type="button" class="vprev" aria-label="Previous image">‹</button><img alt=""><button type="button" class="vnext" aria-label="Next image">›</button></div>
      <p class="vcount" aria-live="polite"></p>
      <div class="vthumbs"></div>
    </div>
    <div class="vtext"><p class="vdesc"></p><p class="uses-title">Typical uses</p><ul class="uses"></ul><p class="chips"></p></div>
  </div>
</dialog>
<script>
(function () {
  var dlg = document.getElementById('viewer');
  if (!dlg) return;
  var img = dlg.querySelector('.vstage img'), title = dlg.querySelector('#viewer-title'), count = dlg.querySelector('.vcount'), strip = dlg.querySelector('.vthumbs');
  var media = dlg.querySelector('.vmedia'), desc = dlg.querySelector('.vdesc'), uses = dlg.querySelector('.uses'), usesTitle = dlg.querySelector('.uses-title'), chips = dlg.querySelector('.vtext .chips');
  var shots = [], at = 0, opener = null;
  function show(i) {
    at = (i + shots.length) % shots.length;
    img.src = shots[at].src; img.alt = shots[at].alt;
    count.textContent = shots[at].alt + ' (' + (at + 1) + ' of ' + shots.length + ')';
    Array.prototype.forEach.call(strip.children, function (b, k) { b.setAttribute('aria-current', k === at ? 'true' : 'false'); });
    var multi = shots.length > 1;
    dlg.querySelector('.vprev').hidden = !multi; dlg.querySelector('.vnext').hidden = !multi; strip.hidden = !multi;
  }
  document.querySelectorAll('[data-view]').forEach(function (b) {
    b.addEventListener('click', function () {
      var d = JSON.parse(b.getAttribute('data-view'));
      shots = d.shots || []; title.textContent = d.name + ' ' + d.version; opener = b;
      desc.textContent = d.text;
      uses.replaceChildren(); (d.uses || []).forEach(function (u) { var li = document.createElement('li'); li.textContent = u; uses.appendChild(li); });
      usesTitle.hidden = uses.hidden = !(d.uses || []).length;
      chips.replaceChildren(); (d.chips || []).forEach(function (c) { var sp = document.createElement('span'); sp.className = 'chip'; sp.textContent = c; chips.appendChild(sp); });
      media.hidden = !shots.length; dlg.classList.toggle('nomedia', !shots.length);
      strip.replaceChildren();
      shots.forEach(function (s, k) {
        var t = document.createElement('button'); t.type = 'button'; t.setAttribute('aria-label', 'Image ' + (k + 1));
        var im = document.createElement('img'); im.src = s.src; im.alt = ''; t.appendChild(im);
        t.addEventListener('click', function () { show(k); });
        strip.appendChild(t);
      });
      if (shots.length) show(0);
      dlg.showModal();
    });
  });
  dlg.querySelector('.vprev').addEventListener('click', function () { show(at - 1); });
  dlg.querySelector('.vnext').addEventListener('click', function () { show(at + 1); });
  dlg.querySelector('.vclose').addEventListener('click', function () { dlg.close(); });
  dlg.addEventListener('click', function (e) { if (e.target === dlg) dlg.close(); });
  dlg.addEventListener('keydown', function (e) {
    if (!shots.length) return;
    if (e.key === 'ArrowLeft') show(at - 1);
    if (e.key === 'ArrowRight') show(at + 1);
  });
  dlg.addEventListener('close', function () { if (opener) opener.focus(); });
})();
</script>
'''
s2 = open(path, encoding='utf-8').read()
i = s2.index('<dialog id="viewer"')
j = s2.index('</body>')
open(path, 'w', encoding='utf-8').write(s2[:i] + DIALOG + s2[j:])

css = '''
/* compact cards: the first sentence only, the rest opens in the dialog */
.card.plugin .short { margin: 0 0 10px; font-size: .95rem; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
.card.plugin .chips { margin: 0 0 10px; }
.card.plugin .more { margin-top: auto; align-self: flex-start; padding: 6px 14px; border: 1px solid var(--line); border-radius: 99px; background: var(--bg); color: var(--link); font: inherit; font-size: .9rem; font-weight: 600; cursor: pointer; }
.card.plugin .more:hover { border-color: var(--link); }
.card.plugin .more:focus-visible { outline: 2px solid var(--link); outline-offset: 2px; }
#viewer { width: min(1100px, 94vw); }
#viewer .vbody { display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr); gap: 22px; align-items: start; overflow: auto; max-height: calc(94vh - 90px); }
#viewer.nomedia { width: min(640px, 94vw); }
#viewer.nomedia .vbody { grid-template-columns: 1fr; }
#viewer .vdesc { margin: 0 0 6px; }
#viewer .uses-title { margin: 14px 0 4px; font-size: .78rem; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--muted); }
#viewer .uses { margin: 0 0 12px; padding-left: 1.15em; color: var(--muted); }
#viewer .uses li { margin: 3px 0; }
@media (max-width: 760px) { #viewer .vbody { grid-template-columns: 1fr; } }
'''
cp = os.path.join(SITE, 'assets', 'site.css')
c = open(cp, encoding='utf-8').read()
if '.card.plugin .short' not in c:
    open(cp, 'a', encoding='utf-8').write(css)
home = os.path.join(SITE, 'index.html')
h = open(home, encoding='utf-8').read()
h = re.sub(r'<strong>\d+ plugins</strong>', f'<strong>{total} plugins</strong>', h)
open(home, 'w', encoding='utf-8').write(h)
print('cards', total)
