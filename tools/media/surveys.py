import os, sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from media_kit import *  # noqa: E402,F403

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'surveys', 'media')
os.makedirs(OUT, exist_ok=True)
APPS2 = ['Surveys', 'Documents', 'Tasks', 'Chat', 'Meet']
OK = '#2e7d32'

# answering a quiz: progress, one question per card
b = sidebar('Surveys', APPS2) + text(228, 44, 'Onboarding quiz', 24, weight=600) + chip(420, 28, 'QUIZ', ACC)
b += f'<rect x="228" y="70" width="700" height="8" rx="4" fill="{LINE}"/><rect x="228" y="70" width="350" height="8" rx="4" fill="{ACC}"/>'
b += text(228, 98, 'Answered 2 of 4', 12, DIM)
b += card(228, 112, 700, 130) + text(250, 142, '1. Where do you find the expense policy?', 15, weight=600)
for i, (lab, on) in enumerate([('In the handbook', True), ('On the notice board', False), ('Nowhere', False)]):
    y = 168 + i * 24
    b += f'<circle cx="262" cy="{y}" r="7" fill="none" stroke="{ACC if on else "#b9bfcc"}" stroke-width="2"/>'
    if on:
        b += f'<circle cx="262" cy="{y}" r="3.5" fill="{ACC}"/>'
    b += text(280, y + 5, lab, 13)
b += card(228, 256, 700, 140) + text(250, 286, '2. Which of these are safety rules? (several)', 15, weight=600)
for i, (lab, on) in enumerate([('Wear the badge', True), ('Report any accident', True), ('Skip the training', False)]):
    y = 310 + i * 24
    b += f'<rect x="255" y="{y-7}" width="14" height="14" rx="3" fill="{ACC if on else PANEL}" stroke="{ACC if on else "#b9bfcc"}" stroke-width="2"/>'
    if on:
        b += f'<path d="M258 {y} l3 3 l5 -6" stroke="#fff" stroke-width="2" fill="none"/>'
    b += text(280, y + 5, lab, 13)
b += card(228, 410, 700, 90) + text(250, 440, '3. How clear was the first week?', 15, weight=600)
for i in range(5):
    b += f'<rect x="{250 + i * 52}" y="454" width="44" height="32" rx="8" fill="{ACC if i == 3 else "#e8eaf6"}"/>' + text(272 + i * 52, 475, str(i + 1), 13, '#ffffff' if i == 3 else INK, 600, 'middle')
b += button(808, 500, 120, 'Submit')
write(os.path.join(OUT, 'survey.svg'), 'Surveys: answering a quiz, one question per card with a progress bar', b)

# the results
b = sidebar('Surveys', APPS2) + text(228, 44, 'Team climate survey', 24, weight=600) + button(780, 22, 148, 'Export CSV', False)
b += text(228, 80, 'Responses: 18', 14, weight=600)
b += card(228, 94, 700, 190) + text(250, 124, '1. How satisfied are you with the team?', 15, weight=600)
for i, (lab, n) in enumerate([('Very satisfied', 9), ('Satisfied', 6), ('Neutral', 2), ('Unsatisfied', 1)]):
    y = 148 + i * 32
    b += text(250, y + 12, lab, 13) + f'<rect x="400" y="{y}" width="360" height="14" rx="7" fill="{BG}" stroke="{LINE}"/><rect x="400" y="{y}" width="{max(8, 360 * n // 18)}" height="14" rx="7" fill="{ACC}"/>'
    b += text(780, y + 12, f'{n} ({round(n * 100 / 18)}%)', 12, DIM)
b += card(228, 298, 700, 80) + text(250, 328, '2. How clear are the goals? (scale 1 to 5)', 15, weight=600) + text(250, 356, 'Average: 4.2', 14, ACC, 600)
b += card(228, 392, 450, 108) + text(250, 420, '3. What should we change?', 15, weight=600)
b += text(250, 446, '• Fewer meetings on Mondays', 13, DIM) + text(250, 468, '• A quiet room for calls', 13, DIM)
b += card(698, 392, 230, 108) + text(718, 420, 'Respondents', 14, weight=600)
for i, (ini, name, col) in enumerate([('AR', 'Anna Rossi', '#4db6ac'), ('LB', 'Luca Bianchi', '#e57373')]):
    yy = 446 + i * 28
    b += avatar(730, yy, ini, col, 11) + text(750, yy + 4, name, 12)
write(os.path.join(OUT, 'results.svg'), 'Surveys: results per question with a bar for each option', b)
print('ok')
