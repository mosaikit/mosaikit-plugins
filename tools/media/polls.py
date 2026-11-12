import os, sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from media_kit import *  # noqa: E402,F403

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'polls', 'media')
os.makedirs(OUT, exist_ok=True)
APPS2 = ['Polls', 'Documents', 'Tasks', 'Chat', 'Meet']

# the list of polls
b = sidebar('Polls', APPS2) + text(228, 44, 'Polls', 24, weight=600) + button(800, 22, 120, '+ New poll')
b += text(228, 78, 'Open', 12, ACC, 600) + text(276, 78, 'Closed', 12, DIM) + text(330, 78, 'All', 12, DIM)
rows = [('Where do we go for the team lunch?', 'Open', '#2e7d32', '12 voters', True),
        ('Which days work for the workshop?', 'Closes on 20 Jun', '#b9811a', '7 voters', False),
        ('Name for the new project', 'Open', '#2e7d32', '3 voters', False)]
y = 96
for q, state, col, n, voted in rows:
    b += card(228, y, 700, 110) + chip(250, y + 14, state.upper(), col) + text(250, y + 58, q, 17, weight=600)
    b += text(250, y + 84, n, 12, DIM)
    if voted:
        b += chip(340, y + 70, 'VOTED', ACC)
    y += 124
write(os.path.join(OUT, 'poll.svg'), 'Polls: the list of polls with their state and the number of voters', b)

# one poll with live results
b = sidebar('Polls', APPS2) + text(228, 44, 'Where do we go for the team lunch?', 22, weight=600) + chip(228, 58, 'OPEN', '#2e7d32')
b += card(228, 96, 700, 380)
opts = [('The pizzeria by the river', 7, 58, True), ('Sushi at the station', 3, 25, False), ('The canteen', 2, 17, False)]
y = 130
for label, votes, pct, win in opts:
    b += text(252, y, label, 14, weight=600 if win else None) + text(904, y, f'{pct}%  ·  {votes}', 13, DIM, anchor='end')
    b += f'<rect x="252" y="{y+10}" width="652" height="14" rx="7" fill="#e8eaf6"/>'
    b += f'<rect x="252" y="{y+10}" width="{652*pct/100:.0f}" height="14" rx="7" fill="{ACC if win else "#9fa8da"}"/>'
    for k, (ini, col) in enumerate([('AR', '#4db6ac'), ('LB', '#e57373'), ('PD', '#f2a93b')][:min(votes, 3)]):
        b += avatar(262 + k * 22, y + 46, ini, col, 11)
    y += 92
b += text(252, 436, '12 people voted', 12, DIM) + button(784, 424, 120, 'Change my vote', False)
write(os.path.join(OUT, 'results.svg'), 'Polls: one poll with its results as bars', b)
print('ok')
