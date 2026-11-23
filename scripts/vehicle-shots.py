"""Close-ups of each vehicle marker driving the demo route, with the drive panel hidden.
Usage: python3 scripts/vehicle-shots.py base_url out_dir"""
import asyncio, json, pathlib, sys
from playwright.async_api import async_playwright

BASE = sys.argv[1].rstrip("/")
OUT = pathlib.Path(sys.argv[2])
OUT.mkdir(parents=True, exist_ok=True)
FX = (pathlib.Path(__file__).resolve().parent.parent / "src/providers/fixtures/stelvio-prad-valhalla.json").read_text()

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        for vid in ["dot", "car", "bike", "utv", "truck"]:
            ctx = await b.new_context(**p.devices["iPhone 15"], permissions=["geolocation"], geolocation={"latitude": 45.42, "longitude": -75.7})
            await ctx.add_init_script("localStorage.setItem('navi.settings.v2', %s)" % json.dumps(json.dumps({"vehicle": vid, "safetyAccepted": True, "muted": True, "traffic": False})))
            pg = await ctx.new_page()
            await pg.route("**/valhalla1.openstreetmap.de/route*", lambda r: r.fulfill(content_type="application/json", body=FX))
            await pg.route("**/valhalla1.openstreetmap.de/trace_attributes", lambda r: r.fulfill(status=500, body="{}"))
            await pg.goto(BASE)
            await pg.wait_for_selector('input[placeholder="Where to?"]')
            await pg.mouse.click(10, 10)
            await pg.get_by_role("button", name="Try a real twisty road").click()
            await pg.wait_for_selector("text=corners")
            if vid == "dot":
                # whole route with the traffic outline, sheet hidden
                await pg.add_style_tag(content=".rounded-t-3xl{display:none !important}")
                await pg.wait_for_timeout(1500)
                await pg.screenshot(path=OUT / "route-traffic.png", clip={"x": 0, "y": 0, "width": 393, "height": 330})
                await pg.add_style_tag(content=".rounded-t-3xl{display:block !important}")
            await pg.get_by_role("button", name="Watch the demo drive").click()
            await pg.wait_for_selector("text=Stop demo", timeout=15000)
            await pg.wait_for_timeout(7000)
            await pg.add_style_tag(content=".safe-t, .edge-cue, [data-testid=stage-hud]{display:none !important}")
            await pg.wait_for_timeout(600)
            await pg.screenshot(path=OUT / f"vehicle-{vid}.png", clip={"x": 0, "y": 250, "width": 393, "height": 420})
            await ctx.close()
        await b.close()

asyncio.run(main())
