#!/usr/bin/env python3
"""Real screenshots of the official plugins, taken from a running Mosaikit.

What it does
    Seeds realistic example data (a fictitious studio, Northwind Studio, with seven fictitious people) through
    the REST API of a running installation, drives the apps with Playwright (Chrome, 1280x720, light theme,
    English), and writes two WebP pictures (each under 150 KB) per plugin into `<plugin>/media/`. It rewrites
    the `screenshots` list of every `plugin.toml`, removes the SVG illustrations it replaces, and writes the alt
    texts to `tools/screenshot-captions.json` (read by `tools/site-cards.py`).

Prerequisites
    - python 3, `pip install playwright pillow`, Google Chrome installed (Playwright channel `chrome`).
    - A FRESH installation with the plugins installed, on PostgreSQL (the Projects and Dashboard apps call other
      plugins, which needs PostgreSQL), with these properties in `mosaikit.toml`:
          url = "http://127.0.0.1:18220/mosaikit"     # app on 18220, plugin origin on 18221
          allow_private_fetch = true
          registry = "registry/index.json"           # packed by `cargo xtask plugin pack --out <dir>/registry`
          preinstall = true
          trusted_keys = ["<contents of registry/trusted_key.txt>"]
          admin_totp = false
          initial_tenant = "northwind"
          initial_password = "Shots-2026-pw"
          [database]  url = "postgres://.../an_empty_database"
      The first start creates the tenant `northwind` and its Tenant Manager `user`.
    - Once, after the first start and before this script, give the tenant and the manager their display names:
          update core.tenants set name='Northwind Studio' where slug='northwind';
          update core.users set display_name='Elena Novak', email='elena@northwind.example' where username='user';
    - The data is not idempotent: use a new database for every run.

Usage
    python tools/screenshots.py                       # everything, written into the plugin folders
    python tools/screenshots.py --only notes tasks    # some plugins (the steps depend on the order, see ORDER)
    python tools/screenshots.py --base http://127.0.0.1:18220/mosaikit --tenant northwind --password Shots-2026-pw
    python tools/screenshots.py --dry-run             # PNG files in a scratch folder, nothing in the repository

The Maps (GeoLibre and its tiles) and Meet (Jitsi) pages need the Internet.
"""
import argparse, datetime, io, json, os, pathlib, re, sys, tempfile, zipfile

from PIL import Image, ImageDraw, ImageFont
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
B = 'http://127.0.0.1:18220/mosaikit'
T = 'northwind'
PW = 'Shots-2026-pw'
SHOTS = {}  # plugin -> {file stem: PNG bytes}


class Who:
    """A signed-in person: a browser context whose cookies the API calls share."""

    def __init__(s, browser, user, pw=None):
        s.user = user
        s.page = None
        s.ctx = browser.new_context(viewport={'width': 1280, 'height': 720}, locale='en-US', color_scheme='light', permissions=['camera', 'microphone'])
        for attempt in range(4):
            r = s.ctx.request.post(B + '/api/auth/login', data={'tenant': T, 'username': user, 'password': pw or PW})
            if r.ok: break
            s.ctx.request.get(B + '/api/health')
        assert r.ok, r.text()
        j = r.json()
        s.csrf = j.get('csrf') or j['user'].get('csrf')

    def api(s, method, path, data=None):
        h = {'x-csrf-token': s.csrf}
        f = getattr(s.ctx.request, method)
        r = f(B + '/api/t/' + T + path, data=data, headers=h) if data is not None else f(B + '/api/t/' + T + path, headers=h)
        if not r.ok: raise RuntimeError(f'{method} {path} {r.status} {r.text()[:300]}')
        try: return r.json()
        except Exception: return None


def P(id): return 'com.mosaikit.' + id
def rc(w, plugin, res, values, parent=None):
    """Creates a row of a resource of the plugin."""
    d = {'values': values}
    if parent: d['parent'] = parent
    return w.api('post', f'/p/{P(plugin)}/r/{res}', d)
def call(w, plugin, name, args=None): return w.api('post', f'/p/{P(plugin)}/call/{name}', args or {})
def goto(w, plugin, hash='', wait=1800):
    pg = w.page if w.page else w.ctx.new_page(); w.page = pg
    url = f'{B}/#/t/{T}/p/{P(plugin)}' + hash
    same = pg.url == url
    pg.goto(url)
    if same: pg.reload()  # the same page again: start from its first state
    pg.wait_for_timeout(wait); return pg
def shot(pg, plugin, name):
    """Keeps a screenshot of the page: the plugin it belongs to and the name of the file (without extension)."""
    pg.wait_for_timeout(500)
    SHOTS.setdefault(plugin, {})[name] = pg.screenshot()
    print('shot', plugin, name)


TODAY = datetime.date.today()
def d(n): return (TODAY + datetime.timedelta(days=n)).isoformat()
def share(w, row, level='read', who='Everyone'):
    gid = [g['id'] for g in w.api('get', '/manage/groups') if g['name'] == who][0]
    w.api('put', f"/resources/{row['id']}/grants", {'principal_type': 'group', 'principal_id': gid, 'level': level})
def uid(w, u): return [m['user_id'] for m in w.api('get', '/manage/members') if m['username'] == u][0]
def fl(pg): return pg.frame_locator('iframe').first


PEOPLE = [('maya', 'Maya Chen'), ('luca', 'Luca Moretti'), ('priya', 'Priya Nair'), ('tom', 'Tom Becker'), ('sofia', 'Sofia Alvarez'), ('omar', 'Omar Haddad')]


def people(W):
    """The six colleagues of the manager, a group with everybody and the design team."""
    w = W['user']
    for u, n in PEOPLE:
        w.api('post', '/manage/members', {'username': u, 'display_name': n, 'email': f'{u}@northwind.example', 'password': PW, 'role': 'user'})
    ms = w.api('get', '/manage/members')
    g = w.api('post', '/manage/groups', {'name': 'Everyone'})['id']
    for m in ms: w.api('put', f"/manage/groups/{g}/members/{m['user_id']}", {})
    g2 = w.api('post', '/manage/groups', {'name': 'Design team'})['id']
    for m in ms:
        if m['username'] in ('maya', 'luca', 'priya'): w.api('put', f"/manage/groups/{g2}/members/{m['user_id']}", {})



def notes(W):
    w=W['user']
    for n,c in [('Personal','teal'),('Work','blue'),('Urgent','orange'),('Ideas','violet')]: rc(w,'notes','note_tags',{'name':n,'color':c})
    data=[('Q4 planning kickoff','**Agenda**\n\n- Review last quarter results\n- Agree the three goals\n- Assign owners\n\n- [x] Book the room\n- [ ] Send the invitation','Work','blue',True),
     ('Brand refresh ideas','Try a warmer palette, rounded icons and a shorter logo lockup. Ask Maya for the moodboard.','Ideas','violet',False),
     ('Call the printer','Quote for 500 flyers, delivery by **Friday**.','Urgent','orange',False),
     ('Reading list','- *The Design of Everyday Things*\n- *Sprint*\n- *Shape Up*','Personal','teal',False),
     ('Onboarding checklist','1. Accounts and badges\n2. Intro to the team\n3. First week goals','Work','green',False),
     ('Workshop notes','Participants liked the **live board**. Follow-ups: send the recap, share the photos.','Work','yellow',False),
     ('Gift ideas for Omar','A good notebook, a ceramic mug, a book on typography.','Personal','pink',False)]
    for t,b,tag,col,pin in data:
        rc(w,'notes','notes',{'title':t,'body':b,'tag':tag,'tags':json.dumps([tag]),'color':col,'pinned':pin})
    pg=goto(w,'notes'); shot(pg,'notes','list')





def notes2(W):
    w = W['user']; pg = goto(w, 'notes'); fl(pg).get_by_text('Q4 planning kickoff').first.click(); pg.wait_for_timeout(1200); shot(pg, 'notes', 'note')


def announcements(W):
    w = W['user']
    ds = [('Office closed on Friday', 'The office is closed this Friday for the building inspection. Please work from home and keep your laptop charged.', 'urgent', True, True, d(-1), d(3)),
          ('New expense policy', 'From 1 December every expense above 100 EUR needs a manager approval in the **Approvals** app. Read the short guide on the intranet.', 'important', True, False, d(-3), d(30)),
          ('Welcome Tom to the team', 'Tom Becker joins the design team as a product designer. Say hello at the Monday stand-up!', 'info', False, False, d(-2), d(14)),
          ('Quarterly all-hands', 'Join us on Thursday at 16:00 in the main room, or online with Meet. We will share the results and the plan for Q1.', 'info', False, False, d(0), d(10)),
          ('Fire drill next week', 'A short fire drill is planned on Wednesday morning. Follow the signs and meet at the car park.', 'important', False, False, d(0), d(8))]
    rows = []
    for t, b, l, ack, pin, fr, to in ds:
        r = rc(w, 'announcements', 'notices', {'title': t, 'body': b, 'level': l, 'needs_ack': ack, 'pinned': pin, 'starts_on': fr, 'ends_on': to}); share(w, r); rows.append(r)
    for u in ['maya', 'luca', 'priya', 'sofia']: call(W[u], 'announcements', 'notices.confirm', {'id': rows[0]['id']})
    for u in ['maya', 'omar']: call(W[u], 'announcements', 'notices.confirm', {'id': rows[1]['id']})
    pg = goto(w, 'announcements'); shot(pg, 'announcements', 'board')
    fl(pg).get_by_role('button', name=re.compile('Confirmed by')).first.click(); pg.wait_for_timeout(1200); shot(pg, 'announcements', 'notice')


def bookmarks(W):
    w = W['user']
    bs = [('Figma community', 'https://www.figma.com/community', 'Templates, plugins and design kits shared by designers.', ['design', 'tools'], True),
          ('MDN Web Docs', 'https://developer.mozilla.org', 'The reference for HTML, CSS and JavaScript.', ['dev', 'reference'], True),
          ('Material Design', 'https://m3.material.io', 'Guidelines and components for modern interfaces.', ['design', 'reference'], False),
          ('Excalidraw', 'https://excalidraw.com', 'Virtual whiteboard for quick sketches.', ['tools'], False),
          ('A List Apart', 'https://alistapart.com', 'Articles for people who make websites.', ['design', 'reading'], False),
          ('Can I use', 'https://caniuse.com', 'Browser support tables for web technologies.', ['dev', 'reference'], False),
          ('Coolors', 'https://coolors.co', 'Generate and explore colour palettes.', ['design', 'tools'], False),
          ('Smashing Magazine', 'https://www.smashingmagazine.com', 'Practical guides on design and front-end work.', ['reading', 'dev'], False)]
    for t, u, n, tg, f in bs: rc(w, 'bookmarks', 'bookmarks', {'title': t, 'url': u, 'note': n, 'tags': json.dumps(tg), 'favorite': f})
    pg = goto(w, 'bookmarks'); shot(pg, 'bookmarks', 'list')
    fl(pg).get_by_role('button', name=re.compile('Edit', re.I)).first.click(); pg.wait_for_timeout(1000); shot(pg, 'bookmarks', 'edit')


def snippets(W):
    w = W['user']
    ss = [('Release checklist', 'markdown', '- [ ] Update the changelog\n- [ ] Tag the release\n- [ ] Build the packages\n- [ ] Announce it in the channel', ['release', 'process']),
          ('Recent orders by customer', 'sql', "select c.name, count(o.id) as orders, sum(o.total) as revenue\nfrom customers c\njoin orders o on o.customer_id = c.id\nwhere o.created_at > now() - interval '30 days'\ngroup by c.name\norder by revenue desc\nlimit 20;", ['sql', 'reports']),
          ('Tail the service log', 'shell', 'journalctl -u northwind-api -f --since "10 min ago" | grep -i error', ['ops']),
          ('Debounce helper', 'javascript', 'export function debounce(fn, wait = 250) {\n  let timer\n  return (...args) => {\n    clearTimeout(timer)\n    timer = setTimeout(() => fn(...args), wait)\n  }\n}', ['js', 'utils']),
          ('Read a CSV file', 'python', 'import csv\n\nwith open("orders.csv", newline="") as f:\n    for row in csv.DictReader(f):\n        print(row["id"], row["total"])', ['python', 'utils']),
          ('Welcome email', 'text', 'Hi {name},\n\nWelcome to Northwind Studio! Your account is ready and your first project is waiting for you.\n\nBest regards,\nThe team', ['email']),
          ('API health response', 'json', '{\n  "status": "ok",\n  "version": "2.4.1",\n  "uptime": 86400\n}', ['api'])]
    for t, k, b, tg in ss: rc(w, 'snippets', 'snippets', {'title': t, 'kind': k, 'body': b, 'tags': json.dumps(tg)})
    pg = goto(w, 'snippets'); fl(pg).get_by_text('Release checklist').first.click(); pg.wait_for_timeout(800); shot(pg, 'snippets', 'list')
    fl(pg).get_by_text('Recent orders by customer').first.click(); pg.wait_for_timeout(800); shot(pg, 'snippets', 'detail')


def tasks(W):
    w = W['user']
    ts = [('Prepare the Q4 budget review', d(-2), 'high', False, 'Finance', 'budget,review', 'Collect the numbers from each team before the meeting.'),
          ('Send the invoice to Acme Corp', d(0), 'high', False, 'Finance', 'invoice', ''),
          ('Book the venue for the team day', d(0), 'medium', False, 'Events', 'events', 'Three options already shortlisted.'),
          ('Review the new onboarding flow', d(2), 'medium', False, 'Website', 'design,review', ''),
          ('Update the brand guidelines', d(4), 'low', False, 'Brand', 'brand', ''),
          ('Plan the user interviews', d(6), 'medium', False, 'Website', 'research', ''),
          ('Renew the domain names', d(15), 'low', False, 'Operations', 'ops', ''),
          ('Write the release notes', d(-1), 'medium', True, 'Website', 'docs', ''),
          ('Order new badges', d(-3), 'low', True, 'Operations', 'ops', '')]
    for t, due, pr, done, proj, lab, nt in ts:
        r = rc(w, 'tasks', 'tasks', {'title': t, 'due': due, 'priority': pr, 'done': done, 'project': proj, 'labels': lab, 'notes': nt})
        if t.startswith('Review the new'): share(w, r, 'write'),
    pg = goto(w, 'tasks'); shot(pg, 'tasks', 'list')
    fl(pg).get_by_text('Prepare the Q4 budget review').first.click(); pg.wait_for_timeout(1200); shot(pg, 'tasks', 'task')


def contacts(W):
    w = W['user']
    cs = [('Alice Johnson', 'alice.johnson@acme.example', '+1 555 0101', 'Customer', 'Acme Corp', 'Head of Procurement', ['vip', 'priority']),
          ('Bruno Costa', 'bruno@costa-supplies.example', '+351 21 555 0123', 'Supplier', 'Costa Supplies', 'Account Manager', ['paper']),
          ('Chloe Martin', 'chloe.martin@partner.example', '+33 1 55 55 01 10', 'Partner', 'Studio Martin', 'Creative Director', ['design']),
          ('Daniel Kim', 'daniel.kim@northwind.example', '+1 555 0144', 'Internal', 'Northwind Studio', 'Engineering Lead', ['team']),
          ('Emma Wilson', 'emma.wilson@globex.example', '+44 20 5550 0188', 'Customer', 'Globex', 'Marketing Manager', ['vip']),
          ('Farid Rahimi', 'farid@printworks.example', '+49 30 555 0166', 'Supplier', 'PrintWorks', 'Sales', ['print']),
          ('Grace Okafor', 'grace@okafor-legal.example', '+234 1 555 0102', 'Partner', 'Okafor Legal', 'Lawyer', ['legal']),
          ('Hugo Silva', 'hugo.silva@northwind.example', '+1 555 0155', 'Internal', 'Northwind Studio', 'Finance', ['team'])]
    for n, e, ph, co, org, job, tg in cs:
        rc(w, 'contacts', 'contacts', {'name': n, 'email': e, 'phone': ph, 'company': co, 'org': org, 'job_title': job, 'tags': ','.join(tg), 'address': '12 Market Street, Springfield', 'notes': 'Met at the spring trade fair. Prefers email, replies within a day.' if n.startswith('Alice') else ''})
    pg = goto(w, 'contacts'); shot(pg, 'contacts', 'book')
    fl(pg).get_by_text('Alice Johnson').first.click(); pg.wait_for_timeout(1200); shot(pg, 'contacts', 'contact')




OTHERS = ['maya', 'luca', 'priya', 'tom', 'sofia', 'omar']
NAMES = {'maya': 'Maya Chen', 'luca': 'Luca Moretti', 'priya': 'Priya Nair', 'tom': 'Tom Becker', 'sofia': 'Sofia Alvarez', 'omar': 'Omar Haddad'}


def person(W, u):
    return {'id': uid(W['user'], u), 'name': NAMES[u]}


def approvals(W):
    w = W['user']
    rs = [('Laptop for the new designer', 'A 14-inch laptop for Tom, starting on Monday. Quote attached to the ticket.', '1,450 EUR', 'any', ['maya', 'omar'], 'approved'),
          ('Conference trip to Lisbon', 'Three days at the Design Week, travel and hotel included.', '2,200 EUR', 'all', ['priya', 'luca'], 'partial'),
          ('Annual licence for the design tool', 'Renewal for 12 seats, 15% discount if signed this month.', '3,900 EUR', 'sequence', ['sofia', 'omar'], 'pending'),
          ('Team lunch after the launch', 'Lunch for 14 people on Friday.', '320 EUR', 'any', ['maya'], 'rejected')]
    for t, dt, am, mode, ap, st in rs:
        r = rc(w, 'approvals', 'requests', {'title': t, 'details': dt, 'amount': am, 'mode': mode, 'approvers': json.dumps([person(W, u) for u in ap])})
        share(w, r, 'read')
        if st == 'approved': call(W[ap[0]], 'approvals', 'requests.decide', {'id': r['id'], 'verdict': 'approved', 'comment': 'Approved, go ahead.'})
        if st == 'partial': call(W[ap[0]], 'approvals', 'requests.decide', {'id': r['id'], 'verdict': 'approved', 'comment': 'Fine for me.'})
        if st == 'rejected': call(W[ap[0]], 'approvals', 'requests.decide', {'id': r['id'], 'verdict': 'rejected', 'comment': 'Let us wait for the next budget.'})
    pg = goto(w, 'approvals'); fl(pg).get_by_role('button', name=re.compile('^All$')).first.click(); pg.wait_for_timeout(1200); shot(pg, 'approvals', 'requests')
    fl(pg).get_by_text('Conference trip to Lisbon').first.click(); pg.wait_for_timeout(1200); shot(pg, 'approvals', 'decision')


def calendar(W):
    w = W['user']
    # a Monday-based week of this month
    ev = [('Team stand-up', 1, '09:30', '09:45', 'blue', 'daily', 'Online', []),
          ('Design review', 2, '14:00', '15:00', 'purple', 'none', 'Room Aurora', ['maya', 'luca', 'priya']),
          ('Client workshop', 4, '10:00', '12:30', 'green', 'none', 'Main room', ['sofia', 'omar', 'tom']),
          ('Lunch with Acme', 6, '12:30', '14:00', 'orange', 'none', 'Café Central', []),
          ('Sprint planning', 8, '10:00', '11:00', 'blue', 'weekly', 'Online', ['maya', 'tom']),
          ('Quarterly all-hands', 10, '16:00', '17:00', 'red', 'none', 'Main room', ['maya', 'luca', 'priya', 'tom', 'sofia', 'omar']),
          ('Product demo', -3, '15:00', '16:00', 'green', 'none', 'Online', ['priya']),
          ('Dentist', -1, '08:30', '09:15', 'grey', 'none', '', [])]
    first = TODAY.replace(day=1)
    rows = {}
    for t, off, a, b, col, rep, loc, att in ev:
        day = TODAY + datetime.timedelta(days=off)
        v = {'title': t, 'starts_on': day.isoformat(), 'starts_time': a, 'ends_on': day.isoformat(), 'ends_time': b, 'color': col, 'repeat': rep, 'location': loc,
             'attendees': json.dumps([person(W, u) for u in att]), 'details': 'Agenda shared in the notes.' if att else ''}
        if rep == 'daily': v['repeat_until'] = d(20)
        if rep == 'weekly': v['repeat_until'] = d(60)
        r = rc(w, 'calendar', 'events', v); rows[t] = r
        for u in att: share(w, r, 'read')
    for u, a in [('maya', 'yes'), ('luca', 'yes'), ('priya', 'maybe'), ('tom', 'no'), ('sofia', 'yes')]:
        call(W[u], 'calendar', 'events.rsvp', {'id': rows['Quarterly all-hands']['id'], 'answer': a})
    for u, a in [('maya', 'yes'), ('luca', 'maybe'), ('priya', 'yes')]:
        call(W[u], 'calendar', 'events.rsvp', {'id': rows['Design review']['id'], 'answer': a})
    pg = goto(w, 'calendar'); shot(pg, 'calendar', 'month')
    fl(pg).get_by_text('Quarterly all-hands').first.click(); pg.wait_for_timeout(1500); shot(pg, 'calendar', 'invitation')


def forms(W):
    w = W['user']
    fs = [{'id': 'f1', 'label': 'Full name', 'kind': 'text', 'options': [], 'required': True, 'help': ''},
          {'id': 'f2', 'label': 'Email', 'kind': 'email', 'options': [], 'required': True, 'help': ''},
          {'id': 'f3', 'label': 'Session you would like to attend', 'kind': 'choice', 'options': ['Opening keynote', 'Design systems', 'Accessibility basics', 'Prototyping'], 'required': True, 'help': ''},
          {'id': 'f4', 'label': 'Dietary needs', 'kind': 'multi', 'options': ['Vegetarian', 'Vegan', 'Gluten free', 'None'], 'required': False, 'help': ''},
          {'id': 'f5', 'label': 'Number of guests', 'kind': 'number', 'options': [], 'required': False, 'help': 'Including yourself'}]
    f = rc(w, 'forms', 'forms', {'title': 'Design Day registration', 'intro': 'Register for the Northwind Design Day on 5 December.', 'fields': json.dumps(fs), 'open': True, 'thanks': 'Thank you, see you there!'})
    share(w, f, 'read')
    ans = [('maya', 'Maya Chen', 'Design systems', ['Vegetarian'], 2), ('luca', 'Luca Moretti', 'Opening keynote', ['None'], 1), ('priya', 'Priya Nair', 'Design systems', ['Vegan'], 1),
           ('tom', 'Tom Becker', 'Prototyping', ['None'], 3), ('sofia', 'Sofia Alvarez', 'Accessibility basics', ['Gluten free'], 2), ('omar', 'Omar Haddad', 'Design systems', ['None'], 1)]
    for u, n, s, di, g in ans:
        call(W[u], 'forms', 'forms.submit', {'id': f['id'], 'values': {'f1': n, 'f2': u + '@northwind.example', 'f3': s, 'f4': di, 'f5': g}})
    f2 = rc(w, 'forms', 'forms', {'title': 'Office feedback', 'intro': 'Tell us what to improve.', 'fields': json.dumps(fs[:3]), 'open': False})
    pg = goto(w, 'forms')
    fl(pg).get_by_text('Design Day registration').first.click(); pg.wait_for_timeout(1200)
    shot(pg, 'forms', 'form')
    try:
        fl(pg).get_by_role('tab', name=re.compile('Answers')).first.click()
    except Exception:
        fl(pg).get_by_text(re.compile('^Answers')).first.click()
    pg.wait_for_timeout(1500); shot(pg, 'forms', 'answers')


def polls(W):
    w = W['user']
    ps = [('Where should we hold the team day?', ['The lake', 'Mountain hike', 'City food tour', 'Bowling'], False, 'always'),
          ('Which days work for the workshop?', ['Tuesday', 'Wednesday', 'Thursday'], True, 'always'),
          ('Pick the name of the new product', ['Aurora', 'Beacon', 'Compass'], False, 'after_vote')]
    rows = []
    for q, o, m, res in ps:
        r = rc(w, 'polls', 'polls', {'question': q, 'options': json.dumps(o), 'multiple': m, 'results': res, 'closes_on': d(7), 'details': 'Vote before the end of next week.'}); share(w, r, 'read'); rows.append(r)
    votes = {0: [('maya', [0]), ('luca', [1]), ('priya', [0]), ('tom', [2]), ('sofia', [0]), ('omar', [1])], 1: [('maya', [0, 2]), ('luca', [1]), ('priya', [1, 2]), ('tom', [2])], 2: [('maya', [1]), ('luca', [0])]}
    for i, vs in votes.items():
        for u, c in vs: call(W[u], 'polls', 'polls.vote', {'id': rows[i]['id'], 'choices': c})
    call(w, 'polls', 'polls.vote', {'id': rows[0]['id'], 'choices': [0]})
    pg = goto(w, 'polls'); shot(pg, 'polls', 'poll')
    fl(pg).get_by_text('Where should we hold the team day?').first.click(); pg.wait_for_timeout(1500); shot(pg, 'polls', 'results')


def surveys(W):
    w = W['user']
    qs = [{'id': 'q1', 'text': 'Which port does HTTPS use by default?', 'kind': 'choice', 'options': ['80', '443', '8080', '22'], 'correct': [], 'points': 2, 'required': True},
          {'id': 'q2', 'text': 'Which of these are programming languages?', 'kind': 'multi', 'options': ['Rust', 'HTML', 'Python', 'CSS'], 'correct': [], 'points': 2, 'required': True},
          {'id': 'q3', 'text': 'How confident are you with the new tools?', 'kind': 'scale', 'options': [], 'correct': [], 'points': 0, 'required': False},
          {'id': 'q4', 'text': 'What should we improve in the next training?', 'kind': 'text', 'options': [], 'correct': [], 'points': 0, 'required': False}]
    s = rc(w, 'surveys', 'surveys', {'title': 'Security awareness quiz', 'intro': 'Five minutes, answer honestly.', 'questions': json.dumps(qs), 'quiz': True, 'pass_percent': '60'})
    call(w, 'surveys', 'surveys.set_key', {'id': s['id'], 'correct': {'q1': [1], 'q2': [0, 2]}})
    share(w, s, 'read')
    res = {'maya': ({'q1': 1, 'q2': [0, 2], 'q3': 4, 'q4': 'More hands-on labs'}), 'luca': {'q1': 1, 'q2': [0, 1], 'q3': 3, 'q4': 'Shorter sessions'}, 'priya': {'q1': 0, 'q2': [0, 2], 'q3': 5, 'q4': ''},
           'tom': {'q1': 1, 'q2': [0, 2], 'q3': 2, 'q4': 'Examples from real incidents'}, 'sofia': {'q1': 1, 'q2': [2], 'q3': 4, 'q4': ''}, 'omar': {'q1': 3, 'q2': [1, 3], 'q3': 3, 'q4': 'More time for questions'}}
    for u, a in res.items(): call(W[u], 'surveys', 'surveys.submit', {'id': s['id'], 'answers': a})
    pg = goto(w, 'surveys'); fl(pg).get_by_role('button', name='Answer').first.click(); pg.wait_for_timeout(1500); shot(pg, 'surveys', 'survey')
    pg = goto(w, 'surveys'); pg.reload(); pg.wait_for_timeout(2500); fl(pg).get_by_role('button', name='Results').first.click(); pg.wait_for_timeout(1500); shot(pg, 'surveys', 'results')


def projects(W):
    w = W['user']
    ms = [{'id': 'm1', 'name': 'Beta release', 'date': d(-10), 'done': True}, {'id': 'm2', 'name': 'Public launch', 'date': d(21), 'done': False}, {'id': 'm3', 'name': 'First customer review', 'date': d(40), 'done': False}]
    sp = [{'id': 's1', 'name': 'Sprint 1', 'start': d(-14), 'end': d(-1)}, {'id': 's2', 'name': 'Sprint 2', 'start': d(0), 'end': d(13)}, {'id': 's3', 'name': 'Sprint 3', 'start': d(14), 'end': d(27)}]
    p = rc(w, 'projects', 'projects', {'name': 'Website relaunch', 'description': 'New marketing site with a faster, cleaner design.', 'status': 'active', 'starts_on': d(-20), 'ends_on': d(45),
                                        'columns': json.dumps(['To do', 'Doing', 'Review', 'Done']), 'milestones': json.dumps(ms), 'sprints': json.dumps(sp)})
    rc(w, 'projects', 'projects', {'name': 'Mobile app prototype', 'description': 'Clickable prototype for the customer portal.', 'status': 'planned', 'starts_on': d(10), 'ends_on': d(70)})
    rc(w, 'projects', 'projects', {'name': 'Brand guidelines 2.0', 'description': 'Colours, type and tone of voice.', 'status': 'done', 'starts_on': d(-90), 'ends_on': d(-15)})
    share(w, p, 'write')
    cols = ['To do', 'Doing', 'Review', 'Done']
    tasks = [('Write the new home page copy', 1), ('Design the pricing page', 1), ('Set up analytics', 0), ('Migrate the blog posts', 0), ('Accessibility audit', 0), ('Build the contact form', 2), ('Choose the new typeface', 3), ('Collect customer logos', 3), ('Create the sitemap', 3)]
    for t, c in tasks:
        r = call(w, 'projects', 'projects.add_task', {'id': p['id'], 'title': t, 'column': cols[0]})
        tid = (r or {}).get('result', r or {}) if isinstance(r, dict) else r
        tid = tid.get('task') or tid.get('id') if isinstance(tid, dict) else tid
        if c: call(w, 'projects', 'projects.move', {'id': p['id'], 'task': tid, 'column': cols[c]})
    pg = goto(w, 'projects'); fl(pg).get_by_text('Website relaunch').first.click(); pg.wait_for_timeout(1500); shot(pg, 'projects', 'board')
    try:
        fl(pg).get_by_role('tab', name=re.compile('Plan|Milestones', re.I)).first.click()
    except Exception:
        fl(pg).get_by_text(re.compile('Plan|Milestones', re.I)).first.click()
    pg.wait_for_timeout(1200); shot(pg, 'projects', 'plan')





def chat(W):
    w = W['user']
    chans = {}
    for n, t in [('general', 'Everything about the studio'), ('design', 'Design critiques and inspiration'), ('launch-plan', 'Website relaunch, dates and owners'), ('random', 'Coffee, music and memes')]:
        c = rc(w, 'chat', 'channels', {'name': n, 'topic': t}); share(w, c, 'write'); chans[n] = c
    ids = {u: uid(w, u) for u in ['maya', 'luca', 'priya', 'tom', 'sofia', 'omar', 'user']}
    g = chans['launch-plan']['id']
    script = [('maya', 'Morning all! The new home page mockups are ready for review.'),
              ('luca', 'Great, I will look at them after the stand-up.'),
              ('priya', 'Can we move the launch to the 3rd? The copy is not final yet.'),
              ('user', 'The 3rd works for me. Tom, can you update the plan?'),
              ('tom', 'Done, the board shows the new date. Review column is almost empty now.'),
              ('sofia', 'I will test the contact form on mobile this afternoon.'),
              ('omar', 'Thanks everyone. Reminder: the all-hands is on Thursday at 16:00.')]
    rows = []
    for u, t in script:
        r = rc(W[u], 'chat', 'messages', {'text': t}, parent=g); rows.append(r)
    rc(W['maya'], 'chat', 'messages', {'text': 'Yes please, I will bring the moodboard too.', 'reply_to': rows[-1]['id']}, parent=g)
    # reactions are stored by the author of the message in the same field
    W['tom'].api('put', f"/p/com.mosaikit.chat/r/messages/{rows[3]['id']}", {'values': {'reactions': json.dumps({'👍': [ids['tom'], ids['maya'], ids['sofia']], '🎉': [ids['luca']]})}}) if False else None
    d2 = chans['design']['id']
    for u, t in [('priya', 'Sharing the new icon set, rounded corners and a 2px stroke.'), ('luca', 'Love it. The stroke weight feels consistent with the type.'), ('maya', 'Can we try it at 16px before we decide?'), ('priya', 'Sure, exporting a test sheet now.')]:
        rc(W[u], 'chat', 'messages', {'text': t}, parent=d2)
    pg = goto(w, 'chat'); fl(pg).get_by_text('design').first.click(); pg.wait_for_timeout(1500); shot(pg, 'chat', 'channels')
    fl(pg).get_by_text('launch-plan').first.click(); pg.wait_for_timeout(1800); shot(pg, 'chat', 'channel')


def dashboard(W):
    w = W['user']
    pg = goto(w, 'dashboard', wait=3500); shot(pg, 'dashboard', 'board')
    fl(pg).get_by_role('button', name=re.compile('Edit|Customi', re.I)).first.click(); pg.wait_for_timeout(1200); shot(pg, 'dashboard', 'edit')


def meet(W):
    w = W['user']
    for n, t in [('Daily stand-up', 'Every morning at 9:30'), ('Design review', 'Weekly critique'), ('Client calls', 'Calls with customers'), ('Coffee break', 'Informal chat')]:
        r = rc(w, 'meet', 'rooms', {'name': n, 'topic': t}); share(w, r, 'write')
    pg = goto(w, 'meet'); shot(pg, 'meet', 'rooms')
    fl(pg).get_by_role('button', name=re.compile('Join')).nth(2).click(); pg.wait_for_timeout(16000); shot(pg, 'meet', 'room')




FILES = 'com.mosaikit.files'
def up(w, name, data, parent=None, plugin=FILES):
    q = f'?name={name}' + (f'&parent={parent}' if parent else '')
    r = w.ctx.request.post(f'{B}/api/t/{T}/p/{plugin}/files/upload{q}', data=data, headers={'x-csrf-token': w.csrf, 'content-type': 'application/octet-stream'})
    if not r.ok: raise RuntimeError(r.text())
    return r.json()

def font(n):
    for f in ['C:/Windows/Fonts/segoeui.ttf', 'C:/Windows/Fonts/arial.ttf']:
        try: return ImageFont.truetype(f, n)
        except Exception: pass
    return ImageFont.load_default()

def banner(title, sub, c1, c2, size=(1200, 800)):
    im = Image.new('RGB', size, c1); dr = ImageDraw.Draw(im)
    for i in range(size[1]):
        t = i / size[1]; dr.line([(0, i), (size[0], i)], fill=tuple(int(c1[k] * (1 - t) + c2[k] * t) for k in range(3)))
    dr.ellipse([size[0] - 500, -150, size[0] + 100, 450], fill=tuple(min(255, v + 40) for v in c2))
    dr.rounded_rectangle([80, size[1] - 330, 700, size[1] - 110], 28, fill=(255, 255, 255))
    dr.text((120, size[1] - 300), title, fill=c1, font=font(56)); dr.text((120, size[1] - 210), sub, fill=(90, 90, 110), font=font(32))
    b = io.BytesIO(); im.save(b, 'PNG'); return b.getvalue()

def pdf(lines):
    def esc(s): return s.replace(chr(92), chr(92)*2).replace('(', chr(92)+'(').replace(')', chr(92)+')')
    y = 740; body = 'BT /F1 22 Tf 72 780 Td (%s) Tj ET\n' % esc(lines[0])
    for l in lines[1:]:
        body += 'BT /F1 13 Tf 72 %d Td (%s) Tj ET\n' % (y, esc(l)); y -= 22
    objs = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
            '<< /Length %d >>\nstream\n%sendstream' % (len(body), body), '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>']
    out = '%PDF-1.4\n'; offs = []
    for i, o in enumerate(objs): offs.append(len(out)); out += f'{i + 1} 0 obj\n{o}\nendobj\n'
    x = len(out); out += f'xref\n0 {len(objs) + 1}\n0000000000 65535 f \n' + ''.join('%010d 00000 n \n' % o for o in offs) + f'trailer\n<< /Size {len(objs) + 1} /Root 1 0 R >>\nstartxref\n{x}\n%%EOF'
    return out.encode('latin-1')

def files(W):
    w = W['user']
    brand = w.api('post', '/p/%s/files/folder' % FILES, {'name': 'Brand assets'})
    rep = w.api('post', '/p/%s/files/folder' % FILES, {'name': 'Reports'})
    w.api('post', '/p/%s/files/folder' % FILES, {'name': 'Contracts'})
    w.api('post', '/p/%s/files/folder' % FILES, {'name': 'Photos'})
    bid = brand.get('id'); rid = rep.get('id')
    up(w, 'Q3-report.pdf', pdf(['Northwind Studio: Q3 report', 'Revenue grew 12% against the previous quarter.', 'Three new customers signed in September.', 'Website relaunch is on track for December.', 'Next steps: hiring, brand refresh and the mobile prototype.']))
    up(w, 'Launch-plan.md', b'# Launch plan\n\n- Beta on the 2nd\n- Public launch on the 3rd\n- Review with customers on the 22nd\n')
    up(w, 'Budget-2027.csv', b'team,q1,q2,q3,q4\nDesign,42000,45000,47000,50000\nEngineering,88000,90000,95000,99000\nMarketing,30000,33000,31000,36000\n')
    up(w, 'Meeting-notes.txt', b'Design review, notes\n\nAgreed to test the icon set at 16px.\nNext review on Friday.\n')
    up(w, 'Brand-board.png', banner('Brand board', 'Colours, type and logo', (45, 52, 130), (118, 92, 220)), bid)
    up(w, 'Homepage-mockup.png', banner('Homepage mockup', 'Version 3, with the new hero', (14, 116, 144), (45, 190, 170)), bid)
    up(w, 'Team-offsite.png', banner('Team offsite', 'Lake house, September', (190, 80, 60), (245, 170, 80)))
    up(w, 'Q2-report.pdf', pdf(['Northwind Studio: Q2 report', 'Revenue grew 8%.']), rid)
    pg = goto(w, 'files', wait=2500); shot(pg, 'files', 'files')
    fl(pg).get_by_text('Team-offsite.png').first.click(); pg.wait_for_timeout(2500); shot(pg, 'files', 'preview')

def note_review(W):
    w = W['user']
    rows = w.api('get', '/p/com.mosaikit.notes/r/notes')
    rows = rows.get('rows', rows.get('items', rows)) if isinstance(rows, dict) else rows
    n = [r for r in rows if r['values'].get('title') == 'Q4 planning kickoff'][0]
    share(w, n, 'write')
    for u, c in [('maya', 'Agenda is clear, added owners.'), ('luca', 'Checked the dates against the calendar.'), ('user', 'Final read-through, all good.')]:
        print('review by', u); who = W[u]; pg = goto(who, 'notes'); fl(pg).get_by_text('Q4 planning kickoff').first.click(); pg.wait_for_timeout(1200)
        fl(pg).get_by_role('tab', name=re.compile('Review')).first.click(); pg.wait_for_timeout(1500)
        f2 = pg.frame(url=re.compile('note-review'))
        f2.get_by_placeholder(re.compile('.*')).first.fill(c) if False else None
        f2.locator('textarea, input[type=text]').first.fill(c)
        f2.get_by_role('button', name='Mark as reviewed').click(); pg.wait_for_timeout(1200)
        if u == 'luca':
            f2.get_by_role('button', name='Mark as not reviewed').click(); pg.wait_for_timeout(1200)
    w2 = W['user']; pg = goto(w2, 'notes'); fl(pg).get_by_text('Q4 planning kickoff').first.click(); pg.wait_for_timeout(1200)
    fl(pg).get_by_role('tab', name=re.compile('Review')).first.click(); pg.wait_for_timeout(1800); shot(pg, 'note-review', 'review')
    fl(pg).get_by_role('tab', name=re.compile('Detail')).first.click(); pg.wait_for_timeout(1000)
    pg.mouse.move(1000, 500); pg.mouse.wheel(0, 900); pg.wait_for_timeout(800); shot(pg, 'note-review', 'fields')




def page(title, h1, lead, c1, c2, items):
    cards = ''.join(f'<div class="card"><h3>{a}</h3><p>{b}</p></div>' for a, b in items)
    return f'''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{title}</title><link rel="stylesheet" href="style.css"></head>
<body><header><b>{title}</b><nav><a href="index.html">Home</a><a href="about.html">About</a><a href="index.html">Contact</a></nav></header>
<section class="hero"><h1>{h1}</h1><p>{lead}</p><a class="btn" href="about.html">Get started</a></section><main>{cards}</main><footer>Northwind Studio, fictitious example site</footer></body></html>'''

def css(c1, c2):
    return f'''body{{margin:0;font-family:Segoe UI,Arial,sans-serif;color:#1f2430;background:#f7f8fb}}
header{{display:flex;justify-content:space-between;align-items:center;padding:18px 48px;background:#fff;border-bottom:1px solid #e3e6ee}}
nav a{{margin-left:22px;color:#4a5068;text-decoration:none}}
.hero{{padding:70px 48px;background:linear-gradient(135deg,{c1},{c2});color:#fff}}
.hero h1{{font-size:44px;margin:0 0 12px}}.hero p{{font-size:19px;max-width:560px;opacity:.92}}
.btn{{display:inline-block;margin-top:18px;background:#fff;color:{c1};padding:12px 24px;border-radius:999px;font-weight:600;text-decoration:none}}
main{{display:grid;grid-template-columns:repeat(3,1fr);gap:20px;padding:40px 48px}}
.card{{background:#fff;border-radius:14px;padding:22px;box-shadow:0 2px 10px rgba(30,40,80,.08)}}.card h3{{margin:0 0 8px;color:{c1}}}.card p{{margin:0;color:#5a6075;line-height:1.5}}
footer{{padding:20px 48px;color:#8a90a5;font-size:13px}}'''

SITES = [('Northwind docs', 'Product documentation for the Northwind design kit.', 'docs', 'Northwind design kit', 'Guides, tokens and components for the whole studio.', '#2d3482', '#765cdc',
          [('Getting started', 'Install the kit and build your first screen in minutes.'), ('Components', 'Buttons, forms, tables and more, all accessible.'), ('Design tokens', 'Colours, spacing and type shared with code.')]),
         ('Spring campaign', 'Landing page of the spring promotion.', 'spring', 'Spring is here', 'Fresh ideas for your brand, with 20% off all design packages until May.', '#0e7490', '#2dbeaa',
          [('Brand starter', 'Logo, colours and a one-page guide.'), ('Website refresh', 'A new look for your home page.'), ('Social pack', 'Templates for a month of posts.')]),
         ('Team handbook', 'How we work at Northwind Studio.', 'handbook', 'Team handbook', 'Everything a new colleague needs in the first weeks.', '#b45309', '#f59e0b',
          [('Onboarding', 'Accounts, tools and who to ask.'), ('Ways of working', 'Stand-ups, reviews and retrospectives.'), ('Benefits', 'Time off, learning budget and wellbeing.')])]

def static_site(W):
    w = W['user']; tmp = pathlib.Path(tempfile.mkdtemp(prefix='ss-'))
    b = w.ctx.browser; shotctx = b.new_context(viewport={'width': 1200, 'height': 750})
    for name, desc, slug, h1, lead, c1, c2, items in SITES:
        d_ = tmp / slug; d_.mkdir()
        (d_ / 'index.html').write_text(page(name, h1, lead, c1, c2, items), encoding='utf-8')
        (d_ / 'about.html').write_text(page(name, 'About', lead, c1, c2, items), encoding='utf-8')
        (d_ / 'style.css').write_text(css(c1, c2), encoding='utf-8')
        z = tmp / f'{slug}.zip'
        with zipfile.ZipFile(z, 'w') as zf:
            for f in d_.iterdir(): zf.write(f, f.name)
        sp = shotctx.new_page(); sp.goto((d_ / 'index.html').as_uri()); sp.wait_for_timeout(300); sp.screenshot(path=str(tmp / f'{slug}.png')); sp.close()
        pg = goto(w, 'static-site', wait=1500); f = fl(pg)
        f.get_by_role('button', name=re.compile('New site')).first.click(); pg.wait_for_timeout(500)
        f.locator('#msks-name').fill(name); f.locator('textarea').first.fill(desc)
        f.locator('input[type=file]').first.set_input_files(str(z)); f.locator('#msks-thumb').set_input_files(str(tmp / f'{slug}.png'))
        f.get_by_role('button', name=re.compile('Save')).click(); pg.wait_for_timeout(2500)
    shotctx.close()
    pg = goto(w, 'static-site', wait=2500); pg.reload(); pg.wait_for_timeout(2500); shot(pg, 'static-site', 'sites')
    f = fl(pg)
    try: f.get_by_text('Northwind docs').first.click()
    except Exception: pass
    pg.wait_for_timeout(2500); shot(pg, 'static-site', 'site')


def whiteboard(W):
    w = W['user']; pg = goto(w, 'whiteboard'); f = fl(pg)
    f.get_by_role('button', name=re.compile('New')).first.click(); pg.wait_for_timeout(500)
    f.get_by_placeholder(re.compile('.')).first.fill('Sprint retrospective'); f.get_by_role('button', name=re.compile('Create|OK|Save', re.I)).last.click(); pg.wait_for_timeout(2500)
    SW = {'yellow': 577, 'orange': 603, 'red': 629, 'pink': 655, 'violet': 681, 'blue': 707, 'green': 733, 'grey': 759}
    TOOL = {'note': 344, 'rect': 380, 'ellipse': 416, 'text': 452, 'arrow': 488}

    def make(tool, color, x, y, x2, y2, text=''):
        pg.keyboard.press('Escape'); pg.mouse.click(SW[color], 76); pg.mouse.click(TOOL[tool], 76)
        pg.mouse.move(x, y); pg.mouse.down(); pg.mouse.move((x + x2) // 2, (y + y2) // 2); pg.mouse.move(x2, y2); pg.mouse.up(); pg.wait_for_timeout(250)
        if text: pg.keyboard.type(text); pg.wait_for_timeout(150); pg.keyboard.press('Escape'); pg.wait_for_timeout(150)
    for i, (head, col) in enumerate([('Went well', 'green'), ('To improve', 'orange'), ('Ideas', 'blue')]):
        x = 110 + i * 390
        make('text', col, x, 125, x + 300, 160, head)
    cols = [('green', ['Fast reviews', 'Clear goals', 'Great demo day']), ('orange', ['Too many meetings', 'Late feedback']), ('blue', ['Pair on tricky tasks', 'Weekly demo', 'Shared checklist'])]
    for i, (col, ns) in enumerate(cols):
        for j, t in enumerate(ns): make('note', col, 120 + i * 390 + (j % 2) * 175, 230 + (j // 2) * 160, 120 + i * 390 + (j % 2) * 175 + 160, (230 + (j // 2) * 160) + 125, t)
    pg.keyboard.press('Escape'); pg.mouse.click(700, 600)
    pg.wait_for_timeout(2500)
    shot(pg, 'whiteboard', 'board')
    fl(pg).get_by_role('button', name=re.compile('^$|Back|‹')).first.click() if False else pg.mouse.click(94, 76)
    pg.wait_for_timeout(2500); shot(pg, 'whiteboard', 'list')


def maps(W):
    import json as _j
    w = W['user']
    pts = [('Site A', 9.1895, 45.4642), ('Site B', 9.1990, 45.4690), ('Site C', 9.1760, 45.4720), ('Site D', 9.2050, 45.4580), ('Site E', 9.1850, 45.4560), ('Site F', 9.1700, 45.4620)]
    gj = {'type': 'FeatureCollection', 'features': [{'type': 'Feature', 'properties': {'name': n, 'status': 'surveyed'}, 'geometry': {'type': 'Point', 'coordinates': [x, y]}} for n, x, y in pts] +
          [{'type': 'Feature', 'properties': {'name': 'Survey area'}, 'geometry': {'type': 'Polygon', 'coordinates': [[[9.165, 45.455], [9.21, 45.455], [9.21, 45.475], [9.165, 45.475], [9.165, 45.455]]]}}]}
    p1 = pathlib.Path(tempfile.mkdtemp(prefix='maps-')) / 'survey-sites.geojson'; p1.write_text(_j.dumps(gj), encoding='utf-8')
    for nm, ds in [('Riverside survey', 'Survey sites and the area covered by the campaign.'), ('Warehouse locations', 'Depots and delivery zones.')]:
        pg = goto(w, 'maps'); f = fl(pg)
        f.get_by_role('button', name=re.compile('New map')).first.click(); pg.wait_for_timeout(1500)
        f.get_by_label('Name of the map').fill(nm); f.get_by_label('Description').fill(ds); pg.wait_for_timeout(20000)
        f.locator('input[type=file]').last.set_input_files(str(p1)); pg.wait_for_timeout(9000)
        if nm == 'Riverside survey':
            gl = [fr for fr in pg.frames if 'geolibre' in fr.url][0]
            try: gl.locator('button[title*="oom to"], button[aria-label*="oom to"]').first.click()
            except Exception as e: print('zoom', str(e)[:80])
            pg.wait_for_timeout(7000); pg.mouse.click(700, 700) if False else None
            f.locator('input').nth(1).blur() if False else None
            shot(pg, 'maps', 'map')
        pg.wait_for_timeout(3000)
        f.get_by_role('button', name=re.compile('List of maps')).first.click(); pg.wait_for_timeout(2000)
    pg.reload(); pg.wait_for_timeout(2500); shot(pg, 'maps', 'catalog')




def layouts(W):
    w = W['user']
    for lid, name in [('layout-project', 'project'), ('layout-suite', 'suite'), ('layout-tabs', 'tabs'), ('layout-workspace', 'workspace')]:
        w.api('put', '/manage/config', {'values': {'layout': 'com.mosaikit.' + lid}, 'customizable': {}})
        pg = w.page if getattr(w, 'page', None) else w.ctx.new_page(); w.page = pg
        pg.goto(f'{B}/#/t/{T}/p/com.mosaikit.dashboard'); pg.reload(); pg.wait_for_timeout(4000); shot(pg, lid, 'layout')
        goto(w, 'notes', wait=2500); pg = w.page; pg.reload(); pg.wait_for_timeout(2500); shot(pg, lid, 'layout-page')
    w.api('put', '/manage/config', {'values': {'layout': 'teams'}, 'customizable': {}})




# The steps in the order they run (later ones read the data of the earlier ones: the dashboard shows what the other
# apps hold, the layouts show the dashboard and the notes, the review is made on a note).
ORDER = ['notes', 'notes2', 'note_review', 'announcements', 'bookmarks', 'snippets', 'tasks', 'contacts', 'approvals', 'calendar', 'forms', 'polls',
         'surveys', 'projects', 'chat', 'meet', 'files', 'static_site', 'whiteboard', 'maps', 'dashboard', 'layouts']
# the plugin folders each step writes
PLUGINS = {'notes': ['notes'], 'notes2': ['notes'], 'note_review': ['note-review'], 'static_site': ['static-site'],
           'layouts': ['layout-project', 'layout-suite', 'layout-tabs', 'layout-workspace']}

# What the pictures show (alt text of the cards of the site). Keys: plugin folder, file stem.
CAPTIONS = {
    'announcements': {'board': 'Announcements: the board with urgent, important and information notices', 'notice': 'Announcements: the people who confirmed they read a notice'},
    'approvals': {'requests': 'Approvals: the list of requests with their state and approvers', 'decision': 'Approvals: one request, the approvers and what each decided'},
    'bookmarks': {'list': 'Bookmarks: cards with search, tags and favourites', 'edit': 'Bookmarks: the form of a bookmark with its address, note and tags'},
    'calendar': {'month': 'Calendar: the month with events, task due dates and today highlighted', 'invitation': 'Calendar: an event with its invitees and their answers'},
    'chat': {'channel': 'Chat: a channel with messages, replies and the list of channels', 'channels': 'Chat: another channel of the same team'},
    'contacts': {'book': 'Contacts: the address book as cards with tags', 'contact': 'Contacts: a contact with its details and notes'},
    'dashboard': {'board': 'Dashboard: a board with numbers and lists from the apps', 'edit': 'Dashboard: choosing and ordering the widgets of a board'},
    'files': {'files': 'Documents: folders and files', 'preview': 'Documents: preview of a picture, with sharing'},
    'forms': {'form': 'Forms: a registration form with text, email, choice and number fields', 'answers': 'Forms: the answers with the counts per option'},
    'layout-project': {'layout': 'Project layout: the dashboard of a tenant', 'layout-page': 'Project layout: a page of an app'},
    'layout-suite': {'layout': 'Suite layout: the dashboard of a tenant', 'layout-page': 'Suite layout: a page of an app'},
    'layout-tabs': {'layout': 'Tabs layout: the dashboard of a tenant', 'layout-page': 'Tabs layout: a page of an app'},
    'layout-workspace': {'layout': 'Workspace layout: the dashboard of a tenant', 'layout-page': 'Workspace layout: a page of an app'},
    'maps': {'catalog': 'Maps: the catalogue of maps', 'map': 'Maps: a map with a layer of points and an area'},
    'meet': {'rooms': 'Meet: the rooms as cards', 'room': 'Meet: a room open inside the page'},
    'note-review': {'review': 'Note review: the Review tab of a note with its history', 'fields': 'Note review: the Reviewed fields in the detail of a note'},
    'notes': {'list': 'Notes: notes as post-its', 'note': 'Notes: the panel of a note'},
    'polls': {'poll': 'Polls: the list of polls with their state and the number of voters', 'results': 'Polls: one poll with its results as bars'},
    'projects': {'board': 'Projects: the board of a project with its progress', 'plan': 'Projects: the milestones of a project with their dates'},
    'snippets': {'list': 'Snippets: the list with search, kind and tags', 'detail': 'Snippets: one snippet with its code and the Copy button'},
    'static-site': {'sites': 'Sites: the list of sites as cards', 'site': 'Sites: a published site shown inside the page'},
    'surveys': {'survey': 'Surveys: answering a quiz, one question per card with a progress bar', 'results': 'Surveys: results per question with a bar for each option'},
    'tasks': {'list': 'Tasks: the list grouped by due date', 'task': 'Tasks: the detail of a task'},
    'whiteboard': {'board': 'Whiteboard: a retrospective with sticky notes and headings', 'list': 'Whiteboard: the list of whiteboards as cards with a small picture of each'},
}
LIMIT = 150 * 1024


def encode(png):
    """WebP of a screenshot, under 150 KB (the quality goes down until it fits)."""
    im = Image.open(io.BytesIO(png)).convert('RGB')
    for q in (88, 82, 76, 70, 62, 54, 46):
        b = io.BytesIO(); im.save(b, 'WEBP', quality=q, method=6)
        if b.tell() <= LIMIT: return b.getvalue()
    raise RuntimeError('picture too big even at the lowest quality')


def write(dry):
    """Writes the pictures, the `screenshots` list of the manifests and the captions."""
    caps_file = ROOT / 'tools' / 'screenshot-captions.json'
    caps = json.loads(caps_file.read_text(encoding='utf-8')) if caps_file.exists() else {}
    for plugin, shots in SHOTS.items():
        folder = ROOT / plugin / 'media'
        if dry:
            folder = pathlib.Path(tempfile.gettempdir()) / 'mosaikit-shots' / plugin
        folder.mkdir(parents=True, exist_ok=True)
        stems = [s for s in CAPTIONS[plugin] if s in shots]
        for stem in stems:
            (folder / f'{stem}.webp').write_bytes(encode(shots[stem]))
            if dry: (folder / f'{stem}.png').write_bytes(shots[stem])
        if dry: continue
        manifest = ROOT / plugin / 'plugin.toml'
        text = manifest.read_text(encoding='utf-8')
        text = re.sub(r'(?m)^screenshots = \[.*\]$', 'screenshots = [' + ', '.join(f'"{s}.webp"' for s in stems) + ']', text, count=1)
        manifest.write_text(text, encoding='utf-8')
        for old in list(folder.glob('*.svg')) + [f for f in folder.glob('*.webp') if f.stem not in stems]:
            old.unlink()
        caps[plugin] = {f'{s}.webp': CAPTIONS[plugin][s] for s in stems}
    if not dry:
        caps_file.write_text(json.dumps(dict(sorted(caps.items())), indent=2, ensure_ascii=False) + '\n', encoding='utf-8')


def fake_camera():
    """A y4m video for the fake camera of Chrome (Meet shows it in the preview): a soft still picture instead of the test pattern."""
    w, h = 640, 360
    im = Image.new('RGB', (w, h)); dr = ImageDraw.Draw(im)
    for y in range(h):
        t = y / h; dr.line([(0, y), (w, y)], fill=(int(120 + 60 * t), int(150 + 40 * t), int(190 - 20 * t)))
    dr.rectangle([0, 270, w, h], fill=(86, 104, 140))
    dr.ellipse([270, 80, 370, 190], fill=(236, 200, 170)); dr.pieslice([240, 190, 400, 420], 180, 360, fill=(52, 64, 110))
    y, cb, cr = im.convert('YCbCr').split()
    chroma = lambda c: c.resize((w // 2, h // 2), Image.BILINEAR).tobytes()
    frame = b'FRAME' + chr(10).encode() + y.tobytes() + chroma(cb) + chroma(cr)
    path = pathlib.Path(tempfile.mkdtemp(prefix='cam-')) / 'camera.y4m'
    path.write_bytes(f'YUV4MPEG2 W{w} H{h} F10:1 Ip A1:1 C420jpeg'.encode() + chr(10).encode() + frame * 20)
    return str(path)


def main():
    global B, T, PW
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--base', default=B, help='address of the app, with the base path')
    ap.add_argument('--tenant', default=T)
    ap.add_argument('--password', default=PW, help='password of the Tenant Manager `user` (and of the people the script creates)')
    ap.add_argument('--only', nargs='*', help='steps to run (names in ORDER)')
    ap.add_argument('--dry-run', action='store_true', help='write PNG and WebP files to a scratch folder only')
    a = ap.parse_args()
    B, T, PW = a.base.rstrip('/'), a.tenant, a.password
    steps = [s for s in ORDER if not a.only or s in a.only]
    with sync_playwright() as p:
        browser = p.chromium.launch(channel='chrome', args=['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--use-file-for-fake-video-capture=' + fake_camera()])
        W = {'user': Who(browser, 'user')}
        if not a.only:
            people(W)
        for u, _ in PEOPLE: W[u] = Who(browser, u)
        for s in steps:
            print('==', s)
            globals()[s](W)
        browser.close()
    write(a.dry_run)


if __name__ == '__main__':
    main()
