import os, sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from media_kit import *  # noqa: E402,F403

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'forms', 'media')
os.makedirs(OUT, exist_ok=True)
APPS2 = ['Forms', 'Documents', 'Tasks', 'Chat', 'Meet']
OK = '#2e7d32'

# the form as a visitor fills it in
b = sidebar('Forms', APPS2) + text(228, 44, 'Summer festival registration', 24, weight=600) + chip(560, 28, 'OPEN', OK)
b += text(228, 74, 'Tell us who is coming. Takes one minute.', 13, DIM)
b += card(228, 92, 700, 84) + text(250, 120, 'Full name *', 13, weight=600)
b += f'<rect x="250" y="130" width="656" height="32" rx="8" fill="{BG}" stroke="{LINE}"/>' + text(262, 151, 'Anna Rossi', 13)
b += card(228, 188, 700, 84) + text(250, 216, 'Email *', 13, weight=600)
b += f'<rect x="250" y="226" width="656" height="32" rx="8" fill="{BG}" stroke="{LINE}"/>' + text(262, 247, 'anna@example.org', 13)
b += card(228, 284, 700, 136) + text(250, 312, 'Menu', 13, weight=600)
for i, (lab, on) in enumerate([('Vegetarian', True), ('Fish', False), ('Meat', False)]):
    y = 336 + i * 26
    b += f'<circle cx="262" cy="{y}" r="7" fill="none" stroke="{ACC if on else "#b9bfcc"}" stroke-width="2"/>'
    if on:
        b += f'<circle cx="262" cy="{y}" r="3.5" fill="{ACC}"/>'
    b += text(280, y + 5, lab, 13)
b += card(228, 432, 700, 70) + text(250, 460, 'Guests', 13, weight=600)
b += f'<rect x="250" y="468" width="120" height="24" rx="8" fill="{BG}" stroke="{LINE}"/>' + text(262, 485, '2', 13)
b += button(808, 512, 120, 'Send')
write(os.path.join(OUT, 'form.svg'), 'Forms: a registration form with text, email, choice and number fields', b)

# the answers
b = sidebar('Forms', APPS2) + text(228, 44, 'Summer festival registration', 24, weight=600) + button(740, 22, 188, 'Export CSV', False)
b += text(228, 82, 'Fill in', 12, DIM) + text(290, 82, 'Answers (24)', 12, ACC, 600)
b += card(228, 96, 700, 140) + text(250, 124, 'Menu', 14, weight=600)
for i, (lab, n) in enumerate([('Vegetarian', 11), ('Fish', 6), ('Meat', 7)]):
    y = 142 + i * 28
    b += text(250, y + 12, lab, 13) + f'<rect x="380" y="{y}" width="380" height="14" rx="7" fill="{BG}" stroke="{LINE}"/><rect x="380" y="{y}" width="{max(8, 380 * n // 24)}" height="14" rx="7" fill="{ACC}"/>'
    b += text(780, y + 12, f'{n} ({round(n * 100 / 24)}%)', 12, DIM)
b += card(228, 250, 700, 250)
b += text(250, 280, 'Name', 12, DIM, 600) + text(420, 280, 'Email', 12, DIM, 600) + text(640, 280, 'Menu', 12, DIM, 600) + text(780, 280, 'From', 12, DIM, 600)
rows = [('Anna Rossi', 'anna@example.org', 'Vegetarian', 'manager'), ('Maria Verdi', 'maria@example.org', 'Fish', 'visitor'),
        ('Luca Bianchi', 'luca@example.org', 'Meat', 'visitor'), ('Paolo De Luca', 'paolo@example.org', 'Vegetarian', 'visitor')]
for i, (n, m, menu, who) in enumerate(rows):
    y = 312 + i * 44
    b += f'<line x1="250" y1="{y - 20}" x2="906" y2="{y - 20}" stroke="{LINE}"/>'
    b += text(250, y, n, 13) + text(420, y, m, 13, DIM) + text(640, y, menu, 13) + text(780, y, who, 13, DIM)
write(os.path.join(OUT, 'answers.svg'), 'Forms: the table of the answers with the counts per option', b)
print('ok')
