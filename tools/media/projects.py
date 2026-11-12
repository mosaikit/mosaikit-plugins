import os, sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from media_kit import *  # noqa: E402,F403

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'projects', 'media')
os.makedirs(OUT, exist_ok=True)
APPS2 = ['Projects', 'Tasks', 'Documents', 'Chat', 'Meet']


def bar(x, y, w, pct, color=ACC):
    return (f'<rect x="{x}" y="{y}" width="{w}" height="8" rx="4" fill="#e3e6ee"/>'
            f'<rect x="{x}" y="{y}" width="{round(w * pct / 100)}" height="8" rx="4" fill="{color}"/>')


# the board of one project
b = sidebar('Projects', APPS2) + text(228, 44, 'Release 2.0', 24, weight=600) + chip(374, 28, 'ACTIVE', ACC)
b += bar(228, 62, 300, 58) + text(540, 70, '58% · 7 of 12 tasks done', 12, DIM)
b += text(228, 100, 'Board', 12, ACC, 600) + text(280, 100, 'Milestones', 12, DIM) + text(356, 100, 'Sprints', 12, DIM) + text(414, 100, 'Details', 12, DIM)
cols = [('To do', [('Write the changelog', 'Jun 12', 'HIGH', '#c62828'), ('Update screenshots', 'Jun 14', 'MEDIUM', DIM)]),
        ('Doing', [('Migrate the database', 'Jun 10', 'HIGH', '#c62828'), ('Review the API docs', 'Jun 11', 'LOW', DIM), ('Fix the login bug', 'Jun 9', 'MEDIUM', DIM)]),
        ('Done', [('Freeze the features', 'Jun 3', 'MEDIUM', DIM), ('Tag the beta', 'Jun 5', 'LOW', DIM)])]
for i, (name, cards) in enumerate(cols):
    x = 228 + i * 234
    b += f'<rect x="{x}" y="114" width="220" height="400" rx="12" fill="#eceef3" stroke="{LINE}"/>' + text(x + 14, 138, name, 13, weight=600) + text(x + 190, 138, str(len(cards)), 12, DIM)
    for j, (title, due, pr, col) in enumerate(cards):
        y = 152 + j * 100
        b += card(x + 10, y, 200, 90, 10) + text(x + 22, y + 24, title, 13, weight=600) + text(x + 22, y + 44, 'due ' + due, 11, DIM)
        b += chip(x + 22, y + 56, pr, col) + (text(x + 110, y + 70, '✓ Done', 11, '#2e7d32', 600) if name == 'Done' else '')
    b += f'<rect x="{x + 10}" y="470" width="200" height="30" rx="8" fill="{PANEL}" stroke="{LINE}"/>' + text(x + 22, 490, '+ Add a task', 12, DIM)
write(os.path.join(OUT, 'board.svg'), 'Projects: the board of a project with its progress', b)

# the plan: milestones and sprints
b = sidebar('Projects', APPS2) + text(228, 44, 'Release 2.0', 24, weight=600) + chip(374, 28, 'ACTIVE', ACC)
b += bar(228, 62, 300, 58) + text(540, 70, '58% · 7 of 12 tasks done', 12, DIM)
b += text(228, 100, 'Board', 12, DIM) + text(280, 100, 'Milestones', 12, ACC, 600) + text(356, 100, 'Sprints', 12, DIM) + text(414, 100, 'Details', 12, DIM)
b += card(228, 116, 330, 380) + text(248, 146, 'Milestones', 15, weight=600)
for i, (name, date, state) in enumerate([('Feature freeze', 'Jun 3', 'done'), ('Beta for customers', 'Jun 10', 'overdue'), ('Documentation ready', 'Jun 24', ''), ('Public launch', 'Jul 1', '')]):
    y = 176 + i * 70
    b += f'<rect x="248" y="{y}" width="18" height="18" rx="4" fill="{ACC if state == "done" else PANEL}" stroke="{ACC}"/>'
    if state == 'done':
        b += f'<path d="M252 {y + 9} l4 4 l7 -8" stroke="#fff" stroke-width="2" fill="none"/>'
    b += text(278, y + 14, name, 14, weight=600) + text(278, y + 34, date, 12, DIM) + (chip(440, y + 2, 'OVERDUE', '#c62828') if state == 'overdue' else '')
b += card(578, 116, 350, 380) + text(598, 146, 'Sprints', 15, weight=600)
for i, (name, dates, d, t, cur) in enumerate([('Sprint 1', 'Jun 1 - Jun 14', 5, 5, False), ('Sprint 2', 'Jun 15 - Jun 28', 2, 7, True)]):
    y = 164 + i * 150
    b += f'<rect x="596" y="{y}" width="314" height="132" rx="10" fill="{PANEL}" stroke="{ACC if cur else LINE}"/>'
    b += text(612, y + 28, name, 14, weight=600) + (chip(790, y + 12, 'CURRENT', ACC) if cur else '')
    b += text(612, y + 50, f'{dates} · {d} of {t} done', 12, DIM) + bar(612, y + 62, 282, round(100 * d / t))
    b += text(612, y + 100, 'Select a sprint on each card', 11, DIM)
write(os.path.join(OUT, 'plan.svg'), 'Projects: milestones with dates and sprints with their progress', b)
print('ok')
