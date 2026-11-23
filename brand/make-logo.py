"""Build the Navi logo family from Barlow Condensed Bold Italic as vector paths.

Main mark: white "Navi" with a red full stop on black. Outputs:
  public/favicon.svg            square app icon (rendered to PNG by scripts/make-icons.py)
  src/components/naviWordmark.ts  glyph paths for the animated splash
  brand/logo/*.svg + *.png      colour sets and event variants
No font file ships in the app. Barlow Condensed is SIL Open Font License 1.1 (docs/CREDITS.md)."""
import json, pathlib, subprocess
import uharfbuzz as hb
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.boundsPen import BoundsPen

ROOT = pathlib.Path(__file__).resolve().parent.parent
FONT = ROOT / "brand/fonts/barlow-condensed-700-italic.ttf"
tt = TTFont(FONT)
gs = tt.getGlyphSet()
hbf = hb.Font(hb.Face(hb.Blob.from_file_path(str(FONT))))
RED, WHITE, BLACK = "#e41626", "#ffffff", "#0b0b0c"


def layout(text, track=0):
    """Return [(char, path d (y down, baseline 0), x)], ink bounds (x0, y0, x1, y1), advance."""
    buf = hb.Buffer(); buf.add_str(text); buf.guess_segment_properties(); hb.shape(hbf, buf, {"kern": True})
    x, out, bb = 0.0, [], [1e9, 1e9, -1e9, -1e9]
    for info, pos in zip(buf.glyph_infos, buf.glyph_positions):
        name = hbf.glyph_to_string(info.codepoint)
        pen = SVGPathPen(gs); gs[name].draw(TransformPen(pen, (1, 0, 0, -1, x + pos.x_offset, 0)))
        bp = BoundsPen(gs); gs[name].draw(TransformPen(bp, (1, 0, 0, -1, x + pos.x_offset, 0)))
        if bp.bounds:
            bb = [min(bb[0], bp.bounds[0]), min(bb[1], bp.bounds[1]), max(bb[2], bp.bounds[2]), max(bb[3], bp.bounds[3])]
        out.append((text[info.cluster], pen.getCommands(), x))
        x += pos.x_advance + track
    return out, bb, x


def run(text, fill, track=0):
    g, bb, _ = layout(text, track)
    return "".join(f'<path d="{d}" fill="{fill}"/>' for _, d, _ in g), bb


def navi(letters=WHITE, stop=RED):
    """The wordmark: returns (svg inner, ink bounds). Origin = baseline left, y down."""
    g, bb, _ = layout("Navi.")
    inner = "".join(f'<path d="{d}" fill="{stop if c == "." else letters}"/>' for c, d, _ in g)
    return inner, bb


def fit(inner, bb, cw, ch, width_frac=None, height_frac=None, dy=0.0, cx=0.5):
    """Wrap ink inner so its bbox is scaled to a fraction of the canvas and centred (optionally nudged)."""
    w, h = bb[2] - bb[0], bb[3] - bb[1]
    k = min((cw * width_frac) / w if width_frac else 1e9, (ch * height_frac) / h if height_frac else 1e9)
    tx = cw * cx - (bb[0] + w / 2) * k
    ty = ch / 2 - (bb[1] + h / 2) * k + dy
    return f'<g transform="translate({tx:.2f} {ty:.2f}) scale({k:.5f})">{inner}</g>', k


def svg(w, h, body, bg=None, rx=0):
    r = f'<rect width="{w}" height="{h}" rx="{rx}" fill="{bg}"/>' if bg else ""
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}">{r}{body}</svg>\n'


OUT = ROOT / "brand/logo"; OUT.mkdir(exist_ok=True)
files = {}

def wordmark(name, letters, stop, bg=None, pad=0.14):
    inner, bb = navi(letters, stop)
    w, h = bb[2] - bb[0], bb[3] - bb[1]
    cw = 1600; ch = round(cw * (h / w) + 2 * pad * 1600 * 0.55) if False else round(cw * h / w / (1 - 2 * pad)) 
    body, _ = fit(inner, bb, cw, ch, width_frac=1 - 2 * pad)
    files[name] = svg(cw, ch, body, bg)

# ---- colour sets -------------------------------------------------------------------
wordmark("navi-dark-bg", WHITE, RED, BLACK)           # white Navi on black (default / dark mode)
wordmark("navi-light-bg", BLACK, RED, WHITE)          # black Navi on white (inverse / light mode)
wordmark("navi-dark-transparent", WHITE, RED)         # for placing on dark photos and screens
wordmark("navi-light-transparent", BLACK, RED)        # for placing on light backgrounds
wordmark("navi-mono-white", WHITE, WHITE)             # one-colour, for stamps and embroidery
wordmark("navi-mono-black", BLACK, BLACK)
wordmark("navi-red-bg", WHITE, BLACK, RED)            # red sticker / banner: white Navi, black full stop
wordmark("navi-red-bg-black", BLACK, WHITE, RED)      # red banner: black Navi, white full stop
wordmark("navi-yellow-bg", BLACK, RED, "#ffd21f")     # high-visibility yellow

# ---- square icon / avatar --------------------------------------------------------------
def square(name, letters, stop, bg, rx=0, frac=0.70, size=1024):
    inner, bb = navi(letters, stop)
    body, _ = fit(inner, bb, size, size, width_frac=frac)
    files[name] = svg(size, size, body, bg, rx)
square("navi-icon-dark", WHITE, RED, BLACK)
square("navi-icon-light", BLACK, RED, WHITE)
square("navi-icon-red", WHITE, BLACK, RED)
square("navi-icon-dark-round", WHITE, RED, BLACK, rx=512)   # social avatar crop

# ---- stacked: Navi. over RALLY ----------------------------------------------------------
def stacked(name, letters, stop, bg, tag_fill, tag="RALLY"):
    ni, nb = navi(letters, stop)
    ti, tb = run(tag, tag_fill, track=210)
    W = 1600
    nk = (W * 0.62) / (nb[2] - nb[0])
    nh = (nb[3] - nb[1]) * nk
    tk = (W * 0.62) / (tb[2] - tb[0]) * 0.62
    th = (tb[3] - tb[1]) * tk
    gap = nh * 0.20
    H = round((nh + gap + th) / 0.56)
    top = (H - (nh + gap + th)) / 2
    body = (f'<g transform="translate({W/2 - ((nb[0]+nb[2])/2)*nk:.2f} {top - nb[1]*nk:.2f}) scale({nk:.5f})">{ni}</g>'
            f'<g transform="translate({W/2 - ((tb[0]+tb[2])/2)*tk:.2f} {top + nh + gap - tb[1]*tk:.2f}) scale({tk:.5f})">{ti}</g>')
    files[name] = svg(W, H, body, bg)
stacked("navi-rally-stacked-dark", WHITE, RED, BLACK, WHITE)
stacked("navi-rally-stacked-light", BLACK, RED, WHITE, BLACK)

# ---- wide lockup: Navi. | RALLY CO-DRIVER ------------------------------------------------
def wide(name, letters, stop, bg, tag_fill):
    ni, nb = navi(letters, stop)
    t1, b1 = run("RALLY", tag_fill, track=190)
    t2, b2 = run("CO-DRIVER", tag_fill, track=190)
    H = 640; navi_h = H * 0.50
    nk = navi_h / (nb[3] - nb[1])
    nw = (nb[2] - nb[0]) * nk
    tk = (navi_h * 0.40) / (b1[3] - b1[1])   # tag cap height = 40 % of the wordmark height
    tag_w = max((b1[2] - b1[0]), (b2[2] - b2[0])) * tk
    gap = H * 0.10
    W = round((nw + gap * 2.4 + tag_w) / 0.84)
    x0 = (W - (nw + gap * 2.4 + tag_w)) / 2
    top = (H - navi_h) / 2
    cap = (b1[3] - b1[1]) * tk
    rule_x = x0 + nw + gap
    body = (f'<g transform="translate({x0 - nb[0]*nk:.2f} {top - nb[1]*nk:.2f}) scale({nk:.5f})">{ni}</g>'
            f'<rect x="{rule_x:.1f}" y="{top:.1f}" width="{H*0.012:.1f}" height="{navi_h:.1f}" fill="{tag_fill}" opacity="0.55"/>'
            f'<g transform="translate({rule_x + gap*1.4 - b1[0]*tk:.2f} {top - b1[1]*tk:.2f}) scale({tk:.5f})">{t1}</g>'
            f'<g transform="translate({rule_x + gap*1.4 - b2[0]*tk:.2f} {top + navi_h - b2[3]*tk:.2f}) scale({tk:.5f})">{t2}</g>')
    files[name] = svg(W, H, body, bg)
wide("navi-rally-wide-dark", WHITE, RED, BLACK, WHITE)
wide("navi-rally-wide-light", BLACK, RED, WHITE, BLACK)

# ---- event badge: round roundel with ring text-free centre and a name plate -------------------
def badge(name, ring, face, letters, stop, tag_fill, tag="PACENOTES"):
    S = 1200; c = S / 2
    ni, nb = navi(letters, stop)
    body_n, k = fit(ni, nb, S, S, width_frac=0.62, dy=-S * 0.035)
    ti, tb = run(tag, tag_fill, track=230)
    tk = (S * 0.34) / (tb[2] - tb[0])
    ty = c + S * 0.145
    body = (f'<circle cx="{c}" cy="{c}" r="{c}" fill="{ring}"/>'
            f'<circle cx="{c}" cy="{c}" r="{c*0.94}" fill="{face}"/>'
            f'<circle cx="{c}" cy="{c}" r="{c*0.885}" fill="none" stroke="{ring}" stroke-width="{S*0.006:.1f}" stroke-dasharray="{S*0.018:.1f} {S*0.014:.1f}" opacity="0.75"/>'
            f'{body_n}'
            f'<g transform="translate({c - ((tb[0]+tb[2])/2)*tk:.2f} {ty - tb[1]*tk:.2f}) scale({tk:.5f})">{ti}</g>')
    files[name] = svg(S, S, body)
badge("navi-event-badge-dark", RED, BLACK, WHITE, RED, WHITE)
badge("navi-event-badge-light", BLACK, WHITE, BLACK, RED, BLACK)
badge("navi-event-badge-red", BLACK, RED, WHITE, BLACK, WHITE)

# ---- write everything -----------------------------------------------------------------
for n, s in files.items():
    (OUT / f"{n}.svg").write_text(s)
    w = 1600 if n.startswith(("navi-dark", "navi-light", "navi-mono", "navi-red", "navi-yellow", "navi-rally")) else 1024
    subprocess.run(["rsvg-convert", "-w", str(w), str(OUT / f"{n}.svg"), "-o", str(OUT / f"{n}.png")], check=True)

# app icon: same artwork as navi-icon-dark but 512 viewBox, full-bleed black (maskable-safe at 70 % width)
inner, bb = navi(WHITE, RED)
body, _ = fit(inner, bb, 512, 512, width_frac=0.66)
(ROOT / "public/favicon.svg").write_text(svg(512, 512, body, BLACK))

# splash glyphs: letters (N a v i) and the full stop as separate shapes
g, bb, _ = layout("Navi.")
pad = 40
vb = (bb[0] - pad, bb[1] - pad, bb[2] - bb[0] + 2 * pad, bb[3] - bb[1] + 2 * pad)
letters = [(round(x), d) for c, d, x in g if c != "."]
stop_d = [d for c, d, x in g if c == "."][0]
sbp = BoundsPen(gs)
sp = [(c, x) for c, d, x in g if c == "."][0]
ts = ("// Generated by brand/make-logo.py. Do not edit.\n"
      f"export const NAVI_VIEWBOX = '{vb[0]:.0f} {vb[1]:.0f} {vb[2]:.0f} {vb[3]:.0f}';\n"
      f"export const NAVI_LETTERS: string[] = {json.dumps([d for _, d in letters])};\n"
      f"export const NAVI_STOP = {json.dumps(stop_d)};\n")
(ROOT / "src/components/naviWordmark.ts").write_text(ts)
print("ok", len(files), "variants; viewBox", vb)

# ---- native app icons and splash (copied into the Android and iPhone projects by scripts/native-patch.mjs) ----
from PIL import Image
NATIVE = ROOT / "brand/native"
(NATIVE / "ios").mkdir(parents=True, exist_ok=True)

def render(svg_text, size, out, opaque=False):
    tmp = NATIVE / "_tmp.svg"; tmp.write_text(svg_text)
    subprocess.run(["rsvg-convert", "-w", str(size), "-h", str(size), str(tmp), "-o", str(out)], check=True)
    tmp.unlink()
    if opaque:
        Image.open(out).convert("RGB").save(out)

square_svg = files["navi-icon-dark"]; round_svg = files["navi-icon-dark-round"]
render(square_svg, 1024, NATIVE / "ios/AppIcon-512@2x.png", opaque=True)

# Android: legacy icons, round icons, and the adaptive-icon foreground (logo inside the central 61 % safe zone)
fg_inner, fg_bb = navi(WHITE, RED)
fg_body, _ = fit(fg_inner, fg_bb, 108, 108, width_frac=0.56)
fg_svg = svg(108, 108, fg_body)
for dens, legacy, fg in [("mdpi", 48, 108), ("hdpi", 72, 162), ("xhdpi", 96, 216), ("xxhdpi", 144, 324), ("xxxhdpi", 192, 432)]:
    d = NATIVE / f"android/mipmap-{dens}"; d.mkdir(parents=True, exist_ok=True)
    render(square_svg, legacy, d / "ic_launcher.png")
    render(round_svg, legacy, d / "ic_launcher_round.png")
    render(fg_svg, fg, d / "ic_launcher_foreground.png")

# Splash: black screen, white Navi with the red full stop, centred and small enough to survive any crop
sp_inner, sp_bb = navi(WHITE, RED)
sp_body, _ = fit(sp_inner, sp_bb, 2732, 2732, width_frac=0.36)
render(svg(2732, 2732, sp_body, BLACK), 2732, NATIVE / "splash.png", opaque=True)
print("native icons written to", NATIVE)
