import os, sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from media_kit import *  # noqa: E402,F403

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'whiteboard', 'media')
os.makedirs(OUT, exist_ok=True)
APPS2 = ['Whiteboard', 'Documents', 'Tasks', 'Chat', 'Meet']
PAPER = '#fbfbfd'


def note(x, y, w, h, fill, stroke, lines):
    s = f'<rect x="{x+3}" y="{y+5}" width="{w}" height="{h}" rx="6" fill="#000" opacity="0.14"/>'
    s += f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="6" fill="{fill}" stroke="{stroke}" stroke-opacity="0.55"/>'
    for i, l in enumerate(lines):
        s += text(x + 12, y + 28 + i * 22, l, 15, INK)
    return s


def cursor(x, y, name, color):
    w = 14 + len(name) * 7
    return (f'<path d="M{x} {y}l0 17 4.5-4 3 7 2.5-1-3-7 6 0z" fill="{color}" stroke="#fff" stroke-width="1.2"/>'
            f'<rect x="{x+12}" y="{y+18}" width="{w}" height="20" rx="10" fill="{color}"/>' + text(x + 12 + w / 2, y + 32, name, 12, '#fff', 600, 'middle'))


def arrow(x0, y0, x1, y1, color):
    return (f'<path d="M{x0} {y0}L{x1} {y1}" stroke="{color}" stroke-width="3" stroke-linecap="round" fill="none"/>'
            f'<path d="M{x1-14} {y1-8}L{x1} {y1}L{x1-14} {y1+8}" stroke="{color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" fill="none"/>')


# the board in use
b = sidebar('Whiteboard', APPS2) + f'<rect x="200" y="0" width="760" height="540" fill="{PAPER}"/>'
b += f'<rect x="200" y="0" width="760" height="52" fill="{PANEL}" stroke="{LINE}"/>' + text(214, 32, 'Sprint retro', 15, INK, 600)
for i, c in enumerate(['#fff3a3', '#ffd9b0', '#ffc9c9', '#dccbff', '#bfdcff', '#c4ecc8']):
    b += f'<circle cx="{420+i*26}" cy="26" r="9" fill="{c}" stroke="#8a8f9c"/>'
b += avatar(900, 26, 'AR', '#4db6ac', 14) + avatar(922, 26, 'LB', '#e57373', 14)
b += text(250, 96, 'Went well', 16, '#1d6b2c', 700) + text(500, 96, 'To improve', 16, '#b3261e', 700) + text(750, 96, 'Ideas', 16, '#1a55b0', 700)
b += note(240, 112, 180, 96, '#c4ecc8', '#1d6b2c', ['Fast reviews', 'on the new API'])
b += note(262, 232, 180, 96, '#c4ecc8', '#1d6b2c', ['Demo with', 'the customer'])
b += note(490, 112, 180, 96, '#ffc9c9', '#b3261e', ['Too many', 'meetings'])
b += note(512, 232, 180, 96, '#ffd9b0', '#a34a00', ['Flaky tests', 'on Fridays'])
b += note(740, 112, 180, 96, '#bfdcff', '#1a55b0', ['Pair on', 'releases'])
b += f'<ellipse cx="830" cy="290" rx="80" ry="44" fill="#dccbff" stroke="#5b32b8" stroke-width="2.5"/>' + text(830, 295, 'Next sprint', 15, INK, 600, 'middle')
b += arrow(690, 160, 735, 160, '#3d4452') + arrow(700, 280, 745, 290, '#3d4452')
b += cursor(600, 380, 'Anna', '#a31f6b') + cursor(330, 400, 'Luca', '#1a55b0')
write(os.path.join(OUT, 'board.svg'), 'Whiteboard: a retrospective with sticky notes, shapes, arrows and the pointers of two people', b)

# the list
b = sidebar('Whiteboard', APPS2) + text(228, 44, 'Whiteboard', 24, weight=600) + button(760, 22, 170, '+ New whiteboard')
for i, (title, col) in enumerate([('Sprint retro', '#3f51b5'), ('Customer journey', '#00897b'), ('Release flow', '#b3261e'), ('Workshop plan', '#5b32b8')]):
    x = 228 + (i % 2) * 360
    y = 80 + (i // 2) * 210
    b += card(x, y, 340, 190) + f'<rect x="{x+12}" y="{y+12}" width="316" height="120" rx="8" fill="{PAPER}" stroke="{LINE}"/>'
    b += f'<rect x="{x+30}" y="{y+30}" width="70" height="44" rx="4" fill="#fff3a3"/><rect x="{x+120}" y="{y+44}" width="70" height="44" rx="4" fill="#bfdcff"/>'
    b += f'<ellipse cx="{x+250}" cy="{y+70}" rx="40" ry="26" fill="#c4ecc8" stroke="#1d6b2c" stroke-width="2"/>' + arrow(x + 100, y + 52, x + 120, y + 62, col)
    b += text(x + 14, y + 156, title, 15, INK, 600) + text(x + 14, y + 176, 'Edited today', 12, DIM)
write(os.path.join(OUT, 'list.svg'), 'Whiteboard: the list of whiteboards as cards with a small picture of each', b)
print('ok')
