import os, sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from media_kit import *  # noqa: E402,F403

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'dashboard', 'media')
os.makedirs(OUT, exist_ok=True)
APPS2 = ['Dashboard', 'Tasks', 'Notes', 'Announcements', 'Polls']

# a board: two numbers and two lists
b = sidebar('Dashboard', APPS2) + text(228, 44, 'My dashboard', 24, weight=600) + button(790, 22, 140, '+ New board')
# open tasks
b += card(228, 76, 220, 150) + text(246, 102, 'Open tasks', 13, DIM, 600) + text(246, 160, '12', 44, weight=700)
b += chip(246, 176, '▲ ATTENTION', '#e0a93a', 112) + text(246, 212, '3 overdue', 13)
# notices to confirm
b += card(464, 76, 220, 150) + text(482, 102, 'Notices to confirm', 13, DIM, 600) + text(482, 160, '2', 44, weight=700)
b += chip(482, 176, '● ALERT', '#c62828', 84) + text(482, 212, '1 urgent', 13)
# polls to vote
b += card(700, 76, 230, 150) + text(718, 102, 'Polls to vote', 13, DIM, 600) + text(718, 160, '1', 44, weight=700)
b += chip(718, 176, '✓ OK', '#3f9a68', 64)
# requests to decide
b += card(228, 244, 340, 250) + text(246, 270, 'Requests to decide', 13, DIM, 600)
for i, (t, m, c) in enumerate([('Laptop for the new hire', 'Anna Rossi, 2 days ago', '#e0a93a'), ('Conference in Milan', 'Luca Bianchi, today', '#e0a93a'), ('Software licences', 'Paolo De Luca, 5 days ago', '#c62828')]):
    y = 292 + i * 56
    b += f'<line x1="246" y1="{y}" x2="550" y2="{y}" stroke="{LINE}"/>' + chip(246, y + 10, '▲' if c != '#c62828' else '●', c, 28) + text(284, y + 24, t, 14) + text(284, y + 42, m, 12, DIM)
b += text(246, 474, '+2 more', 12, DIM)
# recent notes
b += card(584, 244, 346, 250) + text(602, 270, 'Recent notes', 13, DIM, 600)
for i, (t, m) in enumerate([('Roadmap for the autumn', 'Edited today'), ('Notes of the Monday meeting', 'Edited yesterday'), ('Ideas for the offsite', 'Edited 3 days ago'), ('Onboarding checklist', 'Edited last week')]):
    y = 292 + i * 44
    b += f'<line x1="602" y1="{y}" x2="912" y2="{y}" stroke="{LINE}"/>' + text(602, y + 22, t, 14) + text(602, y + 38, m, 12, DIM)
write(os.path.join(OUT, 'board.svg'), 'Dashboard: a board with numbers and lists from the apps', b)

# the editor of a board
b = sidebar('Dashboard', APPS2) + text(228, 44, 'My dashboard', 24, weight=600)
b += card(290, 70, 520, 430, 16) + text(316, 108, 'Edit board', 18, weight=600)
b += text(316, 140, 'Name', 12, DIM) + f'<rect x="316" y="148" width="468" height="34" rx="8" fill="#ffffff" stroke="{LINE}"/>' + text(328, 170, 'My dashboard', 14)
b += text(316, 210, 'Columns', 12, DIM) + f'<rect x="316" y="218" width="220" height="34" rx="8" fill="#ffffff" stroke="{LINE}"/>' + text(328, 240, 'Automatic', 14)
b += text(316, 282, 'Widgets', 12, DIM)
for i, (name, on) in enumerate([('Open tasks', True), ('Notices to confirm', True), ('Polls to vote', True), ('Requests to decide', False), ('Recent notes', False)]):
    y = 296 + i * 38
    fill = ACC if on else '#ffffff'
    b += f'<rect x="316" y="{y}" width="18" height="18" rx="4" fill="{fill}" stroke="{ACC if on else LINE}"/>'
    if on:
        b += f'<path d="M320 {y+9} l4 4 l7 -8" stroke="#fff" stroke-width="2" fill="none"/>'
    b += text(346, y + 14, name, 14) + button(700, y - 6, 36, '↑', False) + button(744, y - 6, 36, '↓', False)
b += button(580, 462, 100, 'Cancel', False) + button(690, 462, 94, 'Save', True)
write(os.path.join(OUT, 'edit.svg'), 'Dashboard: choosing and ordering the widgets of a board', b)
print('ok')
