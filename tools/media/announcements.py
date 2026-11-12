import os, sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from media_kit import *  # noqa: E402,F403

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'announcements', 'media')
os.makedirs(OUT, exist_ok=True)
APPS2 = ['Announcements', 'Documents', 'Tasks', 'Chat', 'Meet']

# the board
b = sidebar('Announcements', APPS2) + text(228, 44, 'Announcements', 24, weight=600) + button(780, 22, 140, '+ New notice')
b += text(228, 78, 'Current', 12, ACC, 600) + text(290, 78, 'Upcoming', 12, DIM) + text(364, 78, 'Past', 12, DIM)
rows = [('URGENT', '#c62828', 'Fire drill on Thursday at 11:00', 'Everyone leaves the building by the nearest exit.', 'Confirmed by 14', True),
        ('IMPORTANT', '#b9811a', 'New expense policy from June', 'Receipts are required for every claim above 25 euro.', 'Confirmed by 9', False),
        ('INFORMATION', '#5d86d6', 'The terrace is open for lunch', 'Tables for the whole team until the end of September.', '', False)]
y = 96
for lvl, col, title, body, ack, pin in rows:
    b += card(228, y, 700, 120) + f'<rect x="228" y="{y}" width="5" height="120" rx="2" fill="{col}"/>'
    b += chip(250, y + 14, lvl, col) + (text(360 if lvl != 'URGENT' else 350, y + 28, '📌 Pinned', 11, DIM) if pin else '')
    b += text(250, y + 56, title, 17, weight=600) + text(250, y + 78, body, 13, DIM)
    if ack:
        b += button(250, y + 88, 120, 'I have read it', True) + text(386, y + 109, ack, 12, DIM)
    y += 134
write(os.path.join(OUT, 'board.svg'), 'Announcements: the board with urgent, important and information notices', b)

# one notice with who confirmed
b = sidebar('Announcements', APPS2) + text(228, 44, 'Fire drill on Thursday at 11:00', 22, weight=600) + chip(228, 58, 'URGENT', '#c62828')
b += card(228, 96, 430, 380) + text(250, 130, 'Everyone leaves the building by the nearest exit.', 14)
for i, line in enumerate(['Meet at the car park, group by group.', 'The floor wardens count their people.', 'Nobody goes back in until the all-clear.']):
    b += text(250, 168 + i * 28, '• ' + line, 14, DIM)
b += button(250, 420, 130, 'I have read it', True)
b += card(678, 96, 250, 380) + text(698, 126, 'Who confirmed', 14, weight=600) + text(698, 146, '3 of 14 people', 12, DIM)
for i, (ini, name, col, when) in enumerate([('AR', 'Anna Rossi', '#4db6ac', '09:12'), ('LB', 'Luca Bianchi', '#e57373', '09:20'), ('PD', 'Paolo De Luca', '#f2a93b', '09:41')]):
    yy = 184 + i * 52
    b += avatar(716, yy, ini, col) + text(742, yy - 2, name, 13, weight=600) + text(742, yy + 14, 'Today ' + when, 11, DIM)
write(os.path.join(OUT, 'notice.svg'), 'Announcements: one notice and the people who confirmed it', b)
print('ok')
