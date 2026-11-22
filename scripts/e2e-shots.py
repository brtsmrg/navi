"""Drive the built app on emulated phones, save screenshots, fail on console errors.
Usage: python3 scripts/e2e-shots.py [base_url] [out_dir]"""
import asyncio, sys, pathlib
from playwright.async_api import async_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:4173"
OUT = pathlib.Path(sys.argv[2] if len(sys.argv) > 2 else "/tmp/shots")
OUT.mkdir(parents=True, exist_ok=True)
IGNORE = ("Failed to load resource", "net::ERR", "ERR_", "tiles.openfreemap", "style")

async def run(p, name):
    dev = p.devices[name]
    b = await p.chromium.launch()
    ctx = await b.new_context(**dev, permissions=["geolocation"], geolocation={"latitude": 45.42, "longitude": -75.7})
    pg = await ctx.new_page()
    errors = []
    pg.on("pageerror", lambda e: errors.append(str(e)))
    pg.on("console", lambda m: m.type == "error" and not any(i in m.text for i in IGNORE) and errors.append(m.text))
    slug = name.replace(" ", "_").lower()
    await pg.goto(BASE)
    await pg.wait_for_selector("text=Write the pacenotes")
    await pg.screenshot(path=OUT / f"{slug}-1-plan.png")
    await pg.get_by_role("button", name="Try a demo stage").click()
    await pg.wait_for_selector("text=hairpins")
    await pg.wait_for_timeout(900)
    await pg.screenshot(path=OUT / f"{slug}-2-stage.png")
    await pg.get_by_role("button", name="Watch a demo drive").click()
    await pg.wait_for_selector("text=Before you drive")
    await pg.screenshot(path=OUT / f"{slug}-3-gate.png")
    await pg.get_by_role("button", name="I understand").click()
    await pg.wait_for_selector("text=Stop demo")
    await pg.wait_for_timeout(9000)
    await pg.screenshot(path=OUT / f"{slug}-4-ride.png")
    # touch-target audit on the ride screen
    small = await pg.evaluate("""() => [...document.querySelectorAll('button')].map(b => {const r=b.getBoundingClientRect();return {t:(b.getAttribute('aria-label')||b.innerText||'').slice(0,24),w:Math.round(r.width),h:Math.round(r.height)}}).filter(x => x.w>0 && (x.w<44||x.h<44))""")
    overflow = await pg.evaluate("document.documentElement.scrollWidth > window.innerWidth")
    print(name, "errors:", errors or "none", "| small targets:", small or "none", "| h-overflow:", overflow)
    await pg.get_by_role("button", name="Settings").first.click()
    await pg.wait_for_selector("text=Call style")
    await pg.screenshot(path=OUT / f"{slug}-5-settings.png")
    await b.close()
    return errors

async def main():
    async with async_playwright() as p:
        bad = []
        for n in ["iPhone 15", "Pixel 7"]:
            bad += await run(p, n)
        sys.exit(1 if bad else 0)

asyncio.run(main())
