"""Render public/favicon.svg to the PNG icons the PWA manifest and iOS need."""
import asyncio, pathlib
from playwright.async_api import async_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
SVG = (ROOT / "public/favicon.svg").read_text()

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        for name, size in [("icon-192.png", 192), ("icon-512.png", 512), ("apple-touch-icon.png", 180)]:
            pg = await b.new_page(viewport={"width": size, "height": size})
            await pg.set_content(f"<style>html,body{{margin:0;background:#0b0d10}}svg{{display:block;width:{size}px;height:{size}px}}</style>{SVG}")
            await pg.screenshot(path=str(ROOT / "public" / name))
            await pg.close()
        await b.close()

asyncio.run(main())
