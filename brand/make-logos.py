"""Generates the Navi logo concepts (SVG with the font embedded) and PNG renders.
Run: python3 brand/make-logos.py"""
import base64, pathlib, asyncio
from playwright.async_api import async_playwright

ROOT = pathlib.Path(__file__).resolve().parent
FONT = pathlib.Path(ROOT.parent / "node_modules/@fontsource/barlow-condensed/files/barlow-condensed-latin-800-italic.woff2").read_bytes()
B64 = base64.b64encode(FONT).decode()
STYLE = f"<style>@font-face{{font-family:'BC';font-weight:800;font-style:italic;src:url(data:font/woff2;base64,{B64}) format('woff2')}}.w{{font-family:'BC',sans-serif;font-weight:800;font-style:italic}}</style>"

RED, HOT, DEEP = "#ff1f2d", "#ff8a8f", "#7a0008"

def defs():
    return f"""<defs>{STYLE}
  <radialGradient id="glow" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="{RED}" stop-opacity=".55"/><stop offset="1" stop-color="{RED}" stop-opacity="0"/></radialGradient>
  <linearGradient id="trailL" x1="1" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{RED}"/><stop offset=".55" stop-color="{RED}" stop-opacity=".35"/><stop offset="1" stop-color="{RED}" stop-opacity="0"/></linearGradient>
  <linearGradient id="bar" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="{RED}"/><stop offset="1" stop-color="{HOT}"/></linearGradient>
  <linearGradient id="barR" x1="1" y1="0" x2="0" y2="0"><stop offset="0" stop-color="{RED}"/><stop offset="1" stop-color="{HOT}"/></linearGradient>
  <linearGradient id="word" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#e6e6e8"/></linearGradient>
  <linearGradient id="redword" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="{RED}"/><stop offset="1" stop-color="#c00014"/></linearGradient>
  <filter id="b8" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="8"/></filter>
  <filter id="b24" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="24"/></filter>
</defs>"""

# ---------- A: the rally slide (v2) ----------
def logo_a():
    # Side-on rally hatch (original shape, not a real model) in a hard slide: big tyres, tall wing, roof scoop,
    # gravel roost and a dust plume lit red by the tail lights, trails swinging round the corner. Only light shows it.
    body = ("M 352 598 L 336 540 C 332 505 338 470 350 444 L 366 428 "
            "C 424 416 474 396 524 372 C 584 342 664 324 764 324 C 856 324 924 340 982 374 "
            "L 1092 442 C 1136 454 1184 464 1234 482 C 1256 492 1264 522 1260 558 L 1252 598 Z")
    def wheel(cx, cy, sx=1.0):
        spokes = "".join(f'<path d="M0 0 L {44*__import__("math").cos(a):.1f} {44*__import__("math").sin(a):.1f}" stroke="#2b2b31" stroke-width="7" stroke-linecap="round"/>' for a in [i*72*3.14159/180+0.3 for i in range(5)])
        return f"""<g transform="translate({cx} {cy}) scale({sx} 1)">
      <circle r="84" fill="#000"/>
      <circle r="72" fill="#050506" stroke="#1a1a1e" stroke-width="3"/>
      <circle r="66" fill="none" stroke="#0e0e11" stroke-width="6" stroke-dasharray="4 6"/>
      <circle r="48" fill="#0b0b0e" stroke="#44444c" stroke-width="2.5"/>
      {spokes}
      <circle r="12" fill="#17171b" stroke="#55555d" stroke-width="2"/>
      <path d="M -66 -22 A 70 70 0 0 1 -16 -68" fill="none" stroke="#3b3b42" stroke-width="3" stroke-linecap="round"/>
      <path d="M 40 52 A 66 66 0 0 1 8 68" fill="none" stroke="#7a1820" stroke-width="3" stroke-linecap="round" opacity=".8"/>
    </g>"""
    gravel = "".join(
        f'<circle cx="{x}" cy="{y}" r="{r}" fill="{c}" opacity="{o}"/>'
        for x, y, r, c, o in [
            (300,470,4,"#d8d8e0",.8),(262,430,3,"#d8d8e0",.7),(228,392,5,"#ffb0b4",.8),(205,360,3,"#d8d8e0",.6),(318,420,3,"#fff",.8),
            (270,500,3,"#ffb0b4",.7),(236,468,4,"#d8d8e0",.7),(190,430,3,"#fff",.6),(160,402,4,"#d8d8e0",.5),(335,372,3,"#ffb0b4",.7),
            (292,330,4,"#d8d8e0",.6),(248,300,3,"#fff",.6),(210,520,3,"#d8d8e0",.55),(140,480,3,"#ffb0b4",.5),(110,455,4,"#d8d8e0",.4),
            (176,560,3,"#d8d8e0",.5),(120,540,3,"#fff",.4),(60,500,3,"#d8d8e0",.35),
        ])
    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1000" width="1600" height="1000">{defs()}
<defs>
  <linearGradient id="bodyfill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#17171b"/><stop offset=".45" stop-color="#0b0b0e"/><stop offset="1" stop-color="#040405"/></linearGradient>
  <linearGradient id="roofrim" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#ff3a44"/><stop offset=".35" stop-color="#9b2a33"/><stop offset=".75" stop-color="#4a4a54"/><stop offset="1" stop-color="#8a8a96"/></linearGradient>
  <linearGradient id="belt" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#ff2a36" stop-opacity=".9"/><stop offset=".5" stop-color="#5a1219" stop-opacity=".35"/><stop offset="1" stop-color="#ffffff" stop-opacity=".12"/></linearGradient>
  <radialGradient id="dust" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#d07a84" stop-opacity=".8"/><stop offset=".5" stop-color="#8a4a52" stop-opacity=".4"/><stop offset="1" stop-color="#3a2a2c" stop-opacity="0"/></radialGradient>
  <linearGradient id="streak" gradientUnits="userSpaceOnUse" x1="360" y1="0" x2="0" y2="0"><stop offset="0" stop-color="{RED}"/><stop offset="1" stop-color="{RED}" stop-opacity="0"/></linearGradient>
  <linearGradient id="trailL" x1="1" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{RED}"/><stop offset=".55" stop-color="{RED}" stop-opacity=".35"/><stop offset="1" stop-color="{RED}" stop-opacity="0"/></linearGradient>
</defs>
<rect width="1600" height="1000" fill="#000"/>
<!-- red light pooled on the gravel behind the car -->
<ellipse cx="520" cy="650" rx="560" ry="70" fill="{RED}" opacity=".32" filter="url(#b24)"/>
<!-- dust plume: the slide, lit red from behind -->
<g filter="url(#b24)">
  <ellipse cx="420" cy="560" rx="230" ry="110" fill="url(#dust)"/>
  <ellipse cx="250" cy="520" rx="260" ry="130" fill="url(#dust)" opacity=".85"/>
  <ellipse cx="120" cy="470" rx="220" ry="120" fill="url(#dust)" opacity=".6"/>
  <ellipse cx="300" cy="610" rx="300" ry="60" fill="url(#dust)" opacity=".7"/>
  <ellipse cx="390" cy="590" rx="170" ry="80" fill="url(#dust)"/>
  <ellipse cx="330" cy="470" rx="130" ry="100" fill="url(#dust)" opacity=".8"/>
  <ellipse cx="200" cy="400" rx="150" ry="90" fill="url(#dust)" opacity=".5"/>
</g>
<!-- speed streaks through the dust -->
<g stroke="url(#streak)" stroke-linecap="round" fill="none">
  <path d="M330 470 H 20" stroke-width="4" opacity=".7"/>
  <path d="M340 505 H 40" stroke-width="7" opacity=".95"/>
  <path d="M346 540 H -10" stroke-width="4" opacity=".6"/>
  <path d="M360 575 H 100" stroke-width="10" opacity=".95"/>
</g>
<!-- the stage road: light trail swinging round the corner -->
<g fill="none" stroke-linecap="round">
  <path d="M1330 640 C 1100 700, 760 690, 400 720 C 220 736, 110 790, -40 860" stroke="url(#trailL)" stroke-width="22" filter="url(#b24)" opacity=".6"/>
  <path d="M1330 640 C 1100 700, 760 690, 400 720 C 220 736, 110 790, -40 860" stroke="url(#trailL)" stroke-width="7"/>
</g>
<g transform="rotate(-3 800 520)">
  <!-- body -->
  <path d="{body}" fill="url(#bodyfill)"/>
  <!-- rim light: roof, A-pillar, hood -->
  <path d="M 366 428 C 424 416 474 396 524 372 C 584 342 664 324 764 324 C 856 324 924 340 982 374 L 1092 442 C 1136 454 1184 464 1234 482" fill="none" stroke="url(#roofrim)" stroke-width="4.5" stroke-linecap="round"/>
  <!-- glass -->
  <path d="M 540 384 C 596 356 674 340 764 340 C 846 340 906 354 952 382 L 1034 436 L 548 436 Z" fill="#020203"/>
  <path d="M 540 384 C 596 356 674 340 764 340 C 846 340 906 354 952 382" fill="none" stroke="#2c2c33" stroke-width="2"/>
  <path d="M 752 342 L 752 436 M 580 372 L 566 436" stroke="#0e0e12" stroke-width="5"/>
  <!-- roof scoop and wing mirror -->
  <path d="M 700 322 L 760 316 L 800 322 Z" fill="#050506" stroke="#4a4a54" stroke-width="1.5"/>
  <path d="M 1010 424 L 1052 420 L 1058 436 L 1020 440 Z" fill="#0b0b0e" stroke="#3a3a42" stroke-width="2"/>
  <!-- door cuts, belt line, sill -->
  <path d="M 752 436 L 756 590 M 560 436 L 556 590 M 960 440 L 966 592" stroke="#1d1d22" stroke-width="2.5" fill="none"/>
  <path d="M 352 470 L 1240 500" stroke="url(#belt)" stroke-width="3" fill="none"/>
  <path d="M 420 580 L 1196 590" stroke="#2a0c10" stroke-width="5" fill="none"/>
  <path d="M 420 574 L 1196 584" stroke="#7a1a22" stroke-width="1.5" fill="none" opacity=".8"/>
  <!-- rally details: aux lamps, mud flap -->
  <circle cx="1232" cy="522" r="11" fill="#d8d8e0" opacity=".75"/>
  <circle cx="1232" cy="522" r="20" fill="#fff" opacity=".1" filter="url(#b8)"/>
  <rect x="396" y="590" width="14" height="40" rx="3" fill="#0a0a0c" stroke="#2a2a30" stroke-width="1.5"/>
  <!-- tail light, wrapping round the rear quarter -->
  <g stroke-linecap="round" fill="none">
    <path d="M 346 452 L 430 462" stroke="{RED}" stroke-width="30" filter="url(#b8)" opacity=".95"/>
    <path d="M 346 452 L 430 462" stroke="url(#bar)" stroke-width="17"/>
    <path d="M 352 452 L 420 460" stroke="#fff" stroke-width="3.5" opacity=".95"/>
    <path d="M 340 486 L 352 486" stroke="{RED}" stroke-width="8" opacity=".9"/>
  </g>
  <!-- tall rear wing -->
  <path d="M 318 410 L 438 394 L 444 408 L 324 424 Z" fill="#0d0d10" stroke="#5a1a22" stroke-width="2"/>
  <path d="M 318 388 L 346 386 L 352 430 L 324 432 Z" fill="#0a0a0c" stroke="#3a3a42" stroke-width="2"/>
  <path d="M 400 400 L 392 430" stroke="#17171b" stroke-width="6"/>
  <!-- wheels: big rally tyres, front one counter-steered -->
  {wheel(486, 560)}
  {wheel(1112, 560, 0.84)}
</g>
<!-- gravel thrown by the rear tyre -->
<g>{gravel}</g>
<text class="w" x="800" y="905" text-anchor="middle" font-size="190" letter-spacing="8" fill="url(#redword)" filter="url(#b24)" opacity=".55">Navi</text>
<text class="w" x="800" y="905" text-anchor="middle" font-size="190" letter-spacing="8" fill="url(#redword)">Navi</text>
<path d="M 560 952 H 1040" stroke="#ff1f2d" stroke-width="4" stroke-linecap="round" opacity=".9"/>
</svg>"""

# ---------- B: monogram / app icon ----------
def logo_b():
    d = "M372 770 V 300 C 372 232 452 222 482 284 L 618 650 C 648 730 730 722 730 650 V 230"
    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">{defs()}
<rect width="1024" height="1024" fill="#000"/>
<ellipse cx="372" cy="790" rx="260" ry="150" fill="url(#glow)" opacity=".9"/>
<!-- the N is a road: red surface, dark centre line, a tail light where it starts -->
<path d="{d}" fill="none" stroke="{RED}" stroke-width="120" stroke-linecap="butt" stroke-linejoin="round" filter="url(#b24)" opacity=".55"/>
<path d="{d}" fill="none" stroke="{RED}" stroke-width="104" stroke-linecap="butt" stroke-linejoin="round"/>
<path d="{d}" fill="none" stroke="#000" stroke-width="6" stroke-dasharray="34 30" stroke-linecap="butt" stroke-linejoin="round" opacity=".9"/>
<g>
  <rect x="300" y="786" width="144" height="26" rx="13" fill="{RED}" filter="url(#b8)"/>
  <rect x="300" y="786" width="144" height="26" rx="13" fill="url(#bar)"/>
  <rect x="318" y="796" width="108" height="5" rx="2.5" fill="#fff" opacity=".9"/>
</g>
</svg>"""

# ---------- C: wordmark in motion ----------
def logo_c():
    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900" width="1600" height="900">{defs()}
<rect width="1600" height="900" fill="#000"/>
<ellipse cx="800" cy="470" rx="640" ry="190" fill="url(#glow)" opacity=".5"/>
<g stroke-linecap="round" fill="none">
  <path d="M60 330 H 330" stroke="{RED}" stroke-width="5" opacity=".35"/>
  <path d="M130 410 H 330" stroke="{RED}" stroke-width="9" opacity=".6"/>
  <path d="M30 495 H 330" stroke="{RED}" stroke-width="4" opacity=".25"/>
  <path d="M190 575 H 330" stroke="{RED}" stroke-width="12" opacity=".85"/>
  <path d="M90 650 H 330" stroke="{RED}" stroke-width="5" opacity=".35"/>
</g>
<text class="w" x="380" y="640" font-size="470" letter-spacing="8" fill="url(#redword)" filter="url(#b24)" opacity=".5">Navi</text>
<text class="w" x="380" y="640" font-size="470" letter-spacing="8" fill="url(#redword)">Navi</text>
<!-- the tail light sits under the last letter like a road marking -->
<rect x="1060" y="676" width="150" height="22" rx="11" fill="{RED}" filter="url(#b8)"/>
<rect x="1060" y="676" width="150" height="22" rx="11" fill="url(#bar)"/>
<rect x="1076" y="684" width="118" height="5" rx="2.5" fill="#fff" opacity=".9"/>
</svg>"""

async def render():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        for name, fn, w, h in [("navi-logo-a-drift", logo_a, 1600, 1000), ("navi-logo-b-road-n", logo_b, 1024, 1024), ("navi-logo-c-wordmark", logo_c, 1600, 900)]:
            svg = fn()
            (ROOT / f"{name}.svg").write_text(svg)
            pg = await b.new_page(viewport={"width": w, "height": h})
            await pg.set_content(f"<style>html,body{{margin:0;background:#000}}svg{{display:block}}</style>{svg}")
            await pg.wait_for_timeout(300)
            await pg.screenshot(path=str(ROOT / f"{name}.png"))
            await pg.close()
        await b.close()

asyncio.run(render())
print("done")
