import sys, asyncio, json
from playwright.async_api import async_playwright

# usage: shots.py WIDTH HEIGHT OUTDIR [sections comma list]
W, H, OUT = int(sys.argv[1]), int(sys.argv[2]), sys.argv[3]
ONLY = sys.argv[4].split(",") if len(sys.argv) > 4 else None
IDS = ["top","problem","platform","features","demo","pipeline","architecture","research","plan","roadmap","faq","team","references"]

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={"width": W, "height": H}, device_scale_factor=1)
        page = await ctx.new_page()
        errs = []
        page.on("console", lambda m: errs.append(("console."+m.type, m.text)) if m.type in ("error","warning") else None)
        page.on("pageerror", lambda e: errs.append(("pageerror", str(e))))
        page.on("requestfailed", lambda r: errs.append(("requestfailed", r.url)))
        await page.goto("http://localhost:8765/index.html", wait_until="networkidle")
        await page.evaluate("document.querySelectorAll('.reveal').forEach(e=>e.classList.add('in'))")
        await page.wait_for_timeout(1200)
        import os; os.makedirs(OUT, exist_ok=True)
        for i in IDS:
            if ONLY and i not in ONLY: continue
            el = await page.query_selector("#"+i)
            await el.scroll_into_view_if_needed()
            await page.wait_for_timeout(500)
            await el.screenshot(path=f"{OUT}/{i}.png")
        ow = await page.evaluate("document.documentElement.scrollWidth")
        print("scrollWidth", ow, "viewport", W)
        print(json.dumps(errs, indent=1))
        await b.close()
asyncio.run(main())
