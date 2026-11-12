import datetime, os, sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from media_kit import *  # noqa: E402,F403

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'calendar', 'media')
os.makedirs(OUT, exist_ok=True)
APPS2 = ['Calendar', 'Tasks', 'Documents', 'Chat', 'Meet']
BLUE, GREEN, RED, ORANGE, PURPLE = '#4a7be8', '#2f9e66', '#d9534f', '#e08a1e', '#8e5bd0'


def bar(x, y, w, label, color):
    """An event chip: a colour bar and the text."""
    return f'<rect x="{x}" y="{y}" width="{w}" height="17" rx="4" fill="#f0f1f5"/><rect x="{x}" y="{y}" width="4" height="17" rx="2" fill="{color}"/>' + text(x + 9, y + 12, label, 10.5)


# the month with events, a due date of a task and today highlighted
b = sidebar('Calendar', APPS2) + text(228, 44, 'Calendar', 18, weight=600)
b += button(246, 20, 62, 'Today', False) + text(330, 44, 'November 2026', 16, weight=600)
b += card(560, 20, 190, 34, 9) + text(588, 42, 'Month', 12, ACC, 600) + text(660, 42, 'Week', 12, DIM) + text(712, 42, 'Day', 12, DIM)
b += button(790, 20, 140, '+ New event')
days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
x0, y0, cw, ch = 220, 74, 102, 82
for i, d in enumerate(days):
    b += text(x0 + i * cw + 8, y0 + 12, d.upper(), 10, DIM, 600)
events = {
    (0, 2): [('09:30 Standup', BLUE)], (1, 1): [('10:00 Design review', PURPLE), ('Pay supplier', None)],
    (1, 3): [('All day Holiday: Ana', GREEN)], (1, 4): [('All day Holiday: Ana', GREEN)],
    (2, 0): [('14:00 Planning', BLUE), ('16:00 1:1 Luca', ORANGE)], (2, 3): [('09:30 Standup', BLUE)],
    (3, 1): [('11:00 Client call', RED)],
}
first = datetime.date(2026, 10, 26)  # the grid begins on Monday 26 October
for r in range(5):
    for c in range(7):
        d = first + datetime.timedelta(days=r * 7 + c)
        day = d.day
        x, y = x0 + c * cw, y0 + 20 + r * ch
        today = (r == 2 and c == 3)
        b += f'<rect x="{x}" y="{y}" width="{cw}" height="{ch}" fill="{"#e8eaf6" if today else PANEL}" stroke="{LINE}"/>'
        if today:
            b += f'<circle cx="{x + 18}" cy="{y + 15}" r="11" fill="{ACC}"/>' + text(x + 18, y + 19, str(day), 11, '#ffffff', 700, 'middle')
        else:
            out = d.month != 11
            b += text(x + 18, y + 19, str(day), 11, '#9aa1ae' if out else INK, 600, 'middle')
        for k, (label, col) in enumerate(events.get((r, c), [])):
            yy = y + 28 + k * 21
            if col:
                b += bar(x + 4, yy, cw - 8, label, col)
            else:
                b += f'<rect x="{x + 4}" y="{yy}" width="{cw - 8}" height="17" rx="4" fill="none" stroke="#b9bfcc" stroke-dasharray="3 2"/>' + text(x + 10, yy + 12, '☐ ' + label, 10.5)
write(os.path.join(OUT, 'month.svg'), 'Calendar: the month with events, a task due date and today highlighted', b)

# a day with an invitation and the answers
b = sidebar('Calendar', APPS2) + text(228, 44, 'Thursday 12 November 2026', 20, weight=600)
b += button(790, 20, 140, '+ New event') + card(660, 20, 110, 34, 9) + text(680, 42, 'Invitations', 12, ACC, 600)
b += f'<circle cx="752" cy="37" r="9" fill="#e8eaf6" stroke="{ACC}"/>' + text(752, 41, '2', 10, INK, 700, 'middle')
for h in range(8, 17):
    y = 90 + (h - 8) * 44
    b += f'<line x1="270" y1="{y}" x2="640" y2="{y}" stroke="{LINE}"/>' + text(224, y + 4, f'{h:02d}:00', 11, DIM)
b += f'<rect x="274" y="{90 + 44 * 1.5}" width="360" height="62" rx="6" fill="#f0f1f5" stroke="{LINE}"/><rect x="274" y="{90 + 44 * 1.5}" width="5" height="62" rx="2" fill="{BLUE}"/>'
b += text(290, 90 + 44 * 1.5 + 22, '09:30 - 10:30', 12, INK, 600) + text(290, 90 + 44 * 1.5 + 42, 'Team standup', 13)
b += f'<rect x="274" y="{90 + 44 * 5}" width="360" height="62" rx="6" fill="#f0f1f5" stroke="{LINE}"/><rect x="274" y="{90 + 44 * 5}" width="5" height="62" rx="2" fill="{ORANGE}"/>'
b += text(290, 90 + 44 * 5 + 22, '13:00 - 14:30', 12, INK, 600) + text(290, 90 + 44 * 5 + 42, 'Budget review', 13)
b += f'<line x1="270" y1="{90 + 44 * 3.4}" x2="640" y2="{90 + 44 * 3.4}" stroke="{RED}" stroke-width="2"/><circle cx="270" cy="{90 + 44 * 3.4}" r="4" fill="{RED}"/>'
b += card(668, 90, 260, 396) + text(688, 122, 'Budget review', 16, weight=600)
b += text(688, 144, 'Thursday 12 November, 13:00-14:30', 12, DIM) + text(688, 162, 'Meeting room 2', 12, DIM)
b += text(688, 196, 'Invitees  3 yes, 1 maybe, 0 no', 12, weight=600)
for i, (ini, name, col, mark, word) in enumerate([('AR', 'Anna Rossi', '#4db6ac', '✓', 'coming'), ('LB', 'Luca Bianchi', '#e57373', '?', 'maybe'), ('PD', 'Paolo De Luca', '#f2a93b', '✓', 'coming')]):
    yy = 224 + i * 38
    b += avatar(704, yy, ini, col, 13) + text(728, yy + 4, name, 12, weight=600) + text(840, yy + 4, f'{mark} {word}', 12, DIM)
b += text(688, 352, 'Your answer', 12, DIM, 600)
b += button(688, 362, 68, 'Yes', True) + button(764, 362, 78, 'Maybe', False) + button(850, 362, 64, 'No', False)
b += button(688, 420, 226, 'Add to my calendar (.ics)', False)
write(os.path.join(OUT, 'invitation.svg'), 'Calendar: a day with an invitation and the answers of the invitees', b)
print('ok')
