# Renders the synthetic demo documents (data/packages.json) as real PDFs, one PDF page per [Page N] marker,
# so the citations returned by the AI ("p.2") can be checked against a real document during the demo.
import json, re, sys, os
from reportlab.lib.pagesizes import LETTER
from reportlab.pdfgen import canvas
from reportlab.lib.units import inch

ROOT = os.path.join(os.path.dirname(__file__), '..')
data = json.load(open(os.path.join(ROOT, 'data', 'packages.json')))
out = os.path.join(ROOT, 'sample-documents')
os.makedirs(out, exist_ok=True)

def wrap(text, width=95):
    words, line, lines = text.split(' '), '', []
    for w in words:
        if len(line) + len(w) + 1 > width: lines.append(line); line = w
        else: line = (line + ' ' + w).strip()
    lines.append(line)
    return lines

def render(doc, business, path):
    pages = re.split(r'\[Page (\d+)\]\n?', doc['text'])
    chunks = [(int(pages[i]), pages[i + 1]) for i in range(1, len(pages), 2)]
    c = canvas.Canvas(path, pagesize=LETTER)
    W, H = LETTER
    for n, body in chunks:
        c.setFillColorRGB(0.12, 0.31, 0.47); c.rect(0, H - 0.55 * inch, W, 0.55 * inch, stroke=0, fill=1)
        c.setFillColorRGB(1, 1, 1); c.setFont('Helvetica-Bold', 10)
        c.drawString(0.6 * inch, H - 0.35 * inch, business)
        c.setFont('Helvetica', 8); c.drawRightString(W - 0.6 * inch, H - 0.35 * inch, doc['name'] + '  ·  SYNTHETIC DEMO DOCUMENT')
        c.setFillColorRGB(0, 0, 0)
        y = H - 1.1 * inch
        for raw in body.strip('\n').split('\n'):
            heading = raw.isupper() or re.match(r'^\d\. ', raw)
            c.setFont('Helvetica-Bold' if heading else 'Helvetica', 12 if raw.isupper() else 10)
            for ln in wrap(raw):
                c.drawString(0.7 * inch, y, ln); y -= 15
            if heading: y -= 4
        c.setFont('Helvetica', 8); c.setFillColorRGB(0.4, 0.4, 0.4)
        c.drawCentredString(W / 2, 0.45 * inch, f'Page {n}')
        c.showPage()
    c.save()

count = 0
for key, pkg in data['packages'].items():
    for version in ('documents_v1', 'documents_v2'):
        for d in pkg.get(version) or []:
            name = os.path.splitext(d['name'])[0] + '.pdf'
            render(d, pkg['business_name'], os.path.join(out, f'{key}_{name}'))
            count += 1
print(count, 'PDFs in', out)
