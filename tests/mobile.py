import asyncio, os
from playwright.async_api import async_playwright
BASE = os.environ.get("BASE","http://localhost:8787")
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page(viewport={"width":390,"height":844}, device_scale_factor=2); errs=[]
        pg.on("pageerror", lambda e: errs.append(str(e))); pg.on("console", lambda m: errs.append(m.text) if m.type=="error" else None)
        await pg.goto(BASE+"/", wait_until="networkidle"); await pg.screenshot(path="/tmp/shots/m-login.png")
        await pg.click("button.linkbtn"); await pg.fill("#email","mob%d@example.com"%os.getpid()); await pg.fill("#password","passw0rd!"); await pg.click("button[type=submit]")
        await pg.wait_for_selector(".shell"); await pg.screenshot(path="/tmp/shots/m-empty.png")
        await pg.click("text=Try with sample videos"); await pg.wait_for_function("document.querySelectorAll('.vcard-lib .pill.green').length===2", timeout=20000)
        await pg.screenshot(path="/tmp/shots/m-library.png")
        await pg.click("a.vc-link[aria-label*='Application Setup']"); await pg.wait_for_selector(".vgrid2"); await pg.screenshot(path="/tmp/shots/m-video.png")
        await pg.click('.tab:has-text("Context")'); await pg.wait_for_selector("#ctx-panel .rcard"); await (await pg.query_selector(".ws-right2")).screenshot(path="/tmp/shots/m-context.png")
        await pg.click(".tabbar a[data-href='/map']"); await pg.wait_for_selector("svg.map"); await pg.screenshot(path="/tmp/shots/m-map.png")
        for route in ["/", "/upload", "/ask", "/map"]:
            await pg.evaluate("location.hash='#%s'" % route); await pg.wait_for_timeout(700)
            print(route, "scrollWidth", await pg.evaluate("document.documentElement.scrollWidth"))
        await pg.click("a.vc-link >> nth=0") if False else None
        print("errors", errs); await b.close()
asyncio.run(main())
