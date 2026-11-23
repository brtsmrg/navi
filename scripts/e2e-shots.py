"""Drive the built app on emulated phones, save screenshots, fail on console errors.
Usage: python3 scripts/e2e-shots.py [base_url] [out_dir]"""
import asyncio, sys, pathlib
from playwright.async_api import async_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:4173"
OUT = pathlib.Path(sys.argv[2] if len(sys.argv) > 2 else "/tmp/shots")
OUT.mkdir(parents=True, exist_ok=True)
IGNORE = ("Failed to load resource", "net::ERR", "ERR_", "tiles.openfreemap", "style")

def enc(points, prec=5):
    out, plat, plng = "", 0, 0
    for lng, lat in points:
        for v, prev in ((lat, plat), (lng, plng)):
            d = round(v * 10**prec) - round(prev * 10**prec)
            d = ~(d << 1) if d < 0 else d << 1
            while d >= 0x20:
                out += chr((0x20 | (d & 0x1F)) + 63); d >>= 5
            out += chr(d + 63)
        plat, plng = lat, lng
    return out

async def run(p, name):
    dev = p.devices[name]
    b = await p.chromium.launch()
    ctx = await b.new_context(**dev, permissions=["geolocation"], geolocation={"latitude": 45.42, "longitude": -75.7})
    pg = await ctx.new_page()
    errors = []
    pg.on("pageerror", lambda e: errors.append(str(e)))
    pg.on("console", lambda m: m.type == "error" and not any(i in m.text for i in IGNORE) and errors.append(m.text))
    slug = name.replace(" ", "_").lower()
    fx = (pathlib.Path(__file__).resolve().parent.parent / "src/providers/fixtures/stelvio-prad-valhalla.json").read_text()
    await pg.route("**/valhalla1.openstreetmap.de/route*", lambda r: r.fulfill(content_type="application/json", body=fx))
    await pg.route("**/valhalla1.openstreetmap.de/trace_attributes", lambda r: r.fulfill(status=500, body="{}"))
    await pg.goto(BASE)
    await pg.wait_for_selector('input[placeholder="Where to?"]')
    await pg.mouse.click(10, 10)  # skip the splash if it is still up
    await pg.wait_for_timeout(500)
    await pg.screenshot(path=OUT / f"{slug}-1-home.png")
    await pg.get_by_role("button", name="Try a real twisty road").click()
    await pg.wait_for_selector("text=corners")
    await pg.wait_for_timeout(900)
    await pg.screenshot(path=OUT / f"{slug}-2-route.png")
    await pg.get_by_role("button", name="Pacenotes").click()
    await pg.wait_for_timeout(300)
    await pg.screenshot(path=OUT / f"{slug}-3-notes.png")
    await pg.get_by_role("button", name="Watch the demo drive").click()
    await pg.wait_for_selector("text=Before you drive")
    await pg.get_by_role("button", name="I understand").click()
    await pg.wait_for_selector("text=Stop demo")
    await pg.wait_for_timeout(9000)
    await pg.screenshot(path=OUT / f"{slug}-4-ride.png")
    small = await pg.evaluate("""() => [...document.querySelectorAll('button')].map(b => {const r=b.getBoundingClientRect();return {t:(b.getAttribute('aria-label')||b.innerText||'').slice(0,24),w:Math.round(r.width),h:Math.round(r.height)}}).filter(x => x.w>0 && (x.w<44||x.h<44))""")
    overflow = await pg.evaluate("document.documentElement.scrollWidth > window.innerWidth")
    print(name, "errors:", errors or "none", "| small targets:", small or "none", "| h-overflow:", overflow)
    # driver correction, then the stage view
    await pg.get_by_role("button", name="The last corner was easier than called").click()
    await pg.wait_for_selector("text=Saved:")
    await pg.screenshot(path=OUT / f"{slug}-4b-corrected.png")
    await pg.get_by_role("button", name="Show the stage view").click()
    await pg.wait_for_selector('[data-testid="stage-hud"]')
    await pg.wait_for_timeout(500)
    await pg.screenshot(path=OUT / f"{slug}-4c-stage.png")
    small2 = await pg.evaluate("""() => [...document.querySelectorAll('button')].map(b => {const r=b.getBoundingClientRect();return {t:(b.getAttribute('aria-label')||b.innerText||'').slice(0,24),w:Math.round(r.width),h:Math.round(r.height)}}).filter(x => x.w>0 && (x.w<44||x.h<44))""")
    print(name, "stage view small targets:", small2 or "none")
    await pg.get_by_role("button", name="Show the map view").click()
    await pg.get_by_role("button", name="Stop ride").click()
    await pg.wait_for_timeout(400)
    # edit a pacenote and check it was saved on this device
    edit = pg.locator('button[aria-label^="Edit call"]')
    if await edit.count() == 0:
        await pg.get_by_role("button", name="Pacenotes").click()
        await pg.wait_for_timeout(300)
    await edit.nth(1).click()
    await pg.wait_for_selector("text=How tight is it?")
    await pg.screenshot(path=OUT / f"{slug}-4d-editor.png")
    await pg.get_by_role("button", name="Hairpin").click()
    await pg.get_by_label("Add your own words").fill("watch the gravel")
    await pg.get_by_role("button", name="Done").click()
    await pg.wait_for_timeout(300)
    saved = await pg.evaluate("localStorage.getItem('navi.edits.v1') || ''")
    if "watch the gravel" not in saved:
        errors.append("pacenote edit was not saved")
    await pg.screenshot(path=OUT / f"{slug}-4e-edited-list.png")
    # open a share link: names, route and a notice, with the link removed from the address bar
    from urllib.parse import quote
    link = f"{BASE}/#r={quote(enc([(-83.9327, 35.4686), (-83.9935, 35.5207)]))}&n={quote('Deals Gap~Tabcat Creek')}"
    await pg.goto("about:blank")
    await pg.goto(link)
    await pg.wait_for_selector("text=Shared route opened")
    await pg.wait_for_selector("text=Tabcat Creek")
    if "#r=" in pg.url:
        errors.append("share link stayed in the address bar")
    await pg.screenshot(path=OUT / f"{slug}-4f-shared.png")
    await pg.goto("about:blank")
    await pg.goto(f"{BASE}/#r=zzz-not-a-route")
    await pg.wait_for_selector("text=damaged or too long")
    await pg.goto(BASE)
    await pg.wait_for_selector('input[placeholder="Where to?"]')
    await pg.mouse.click(10, 10)
    await pg.wait_for_timeout(300)
    await pg.get_by_role("button", name="Saved", exact=True).click()
    await pg.wait_for_selector("text=Favourites")
    await pg.screenshot(path=OUT / f"{slug}-5-saved.png")
    await pg.get_by_role("button", name="Recent", exact=True).click()
    await pg.wait_for_selector("text=Directions history")
    await pg.screenshot(path=OUT / f"{slug}-6-history.png")
    await pg.get_by_role("button", name="Settings").first.click()
    await pg.wait_for_selector("text=What the voice says")
    await pg.screenshot(path=OUT / f"{slug}-7-settings.png")
    await pg.get_by_role("radio", name="Light").click()
    await pg.wait_for_timeout(300)
    if await pg.evaluate("document.documentElement.dataset.theme") != "light":
        errors.append("light theme did not apply")
    await pg.screenshot(path=OUT / f"{slug}-8-settings-light.png")
    await pg.get_by_role("button", name="Close").click()
    await pg.wait_for_timeout(300)
    await pg.get_by_role("button", name="Explore").click()
    await pg.wait_for_timeout(300)
    await pg.screenshot(path=OUT / f"{slug}-9-home-light.png")
    await b.close()
    return errors

async def main():
    async with async_playwright() as p:
        bad = []
        for n in ["iPhone 15", "Pixel 7"]:
            bad += await run(p, n)
        sys.exit(1 if bad else 0)

asyncio.run(main())
