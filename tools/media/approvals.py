import os, sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from media_kit import *  # noqa: E402,F403

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'approvals', 'media')
os.makedirs(OUT, exist_ok=True)
APPS2 = ['Approvals', 'Documents', 'Tasks', 'Chat', 'Meet']
OK, NO, WAIT = '#2e7d52', '#c62828', '#b9811a'

# the list of requests
b = sidebar('Approvals', APPS2) + text(228, 44, 'Approvals', 24, weight=600) + button(780, 22, 140, '+ New request')
b += text(228, 78, 'To decide', 12, ACC, 600) + text(310, 78, 'My requests', 12, DIM) + text(400, 78, 'All', 12, DIM)
rows = [('PENDING', WAIT, 'Laptop for the new designer', '1,450 EUR', [('MR', '#4db6ac', '?'), ('LB', '#e57373', '?')], True),
        ('APPROVED', OK, 'Two days of remote work', '', [('AR', '#7b8fd1', 'ok'), ('PD', '#f2a93b', 'ok')], False),
        ('REJECTED', NO, 'Conference in Lisbon', '2,300 EUR', [('MR', '#4db6ac', 'no')], False)]
y = 96
for st, col, title, amount, people, mine in rows:
    b += card(228, y, 700, 120) + chip(250, y + 14, st, col) + text(250, y + 56, title, 17, weight=600)
    b += text(250, y + 78, 'Asked by Giulia Marini' + (' · ' + amount if amount else ''), 13, DIM)
    for i, (ini, c, mark) in enumerate(people):
        xx = 266 + i * 44
        b += avatar(xx, y + 100, ini, c, 12)
    if mine:
        b += button(700, y + 70, 100, 'Reject', False, NO) + button(812, y + 70, 100, 'Approve', True)
    y += 134
write(os.path.join(OUT, 'requests.svg'), 'Approvals: the list of requests with their state and approvers', b)

# one request with the verdicts
b = sidebar('Approvals', APPS2) + text(228, 44, 'Laptop for the new designer', 22, weight=600) + chip(228, 58, 'PENDING', WAIT)
b += card(228, 96, 430, 380) + text(250, 130, 'Asked by Giulia Marini · 1,450 EUR', 13, DIM)
b += text(250, 168, 'A 14 inch laptop with 32 GB of memory for the', 14) + text(250, 190, 'designer who starts on the 3rd of June.', 14)
b += text(250, 240, 'Comment (optional)', 12, DIM) + f'<rect x="250" y="250" width="386" height="70" rx="8" fill="{PANEL}" stroke="{LINE}"/>'
b += button(250, 420, 120, 'Reject', False, NO) + button(382, 420, 120, 'Approve', True)
b += card(678, 96, 250, 380) + text(698, 126, 'Approvers · in sequence', 14, weight=600)
for i, (ini, name, col, verdict, vc, note) in enumerate([('AR', 'Anna Rossi', '#4db6ac', 'Approved', OK, 'Within the budget.'), ('LB', 'Luca Bianchi', '#e57373', 'Waiting', WAIT, ''), ('PD', 'Paolo De Luca', '#f2a93b', 'Not yet', DIM, '')]):
    yy = 164 + i * 78
    b += avatar(716, yy, ini, col) + text(742, yy - 2, name, 13, weight=600) + text(742, yy + 15, verdict, 12, vc, 600)
    if note:
        b += text(742, yy + 33, note, 11, DIM)
write(os.path.join(OUT, 'decision.svg'), 'Approvals: one request, the approvers and what each decided', b)
print('ok')
