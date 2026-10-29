import asyncio, os
from playwright.async_api import async_playwright
BASE = os.environ.get("BASE","http://localhost:8787")
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=["--autoplay-policy=no-user-gesture-required"])
        pg = await b.new_page(viewport={"width":1440,"height":900}); errs=[]
        pg.on("pageerror", lambda e: errs.append(str(e))); pg.on("console", lambda m: errs.append(m.text) if m.type=="error" else None)
        await pg.goto(BASE+"/", wait_until="networkidle")
        await pg.click("button.linkbtn"); await pg.fill("#email","media%d@example.com"%os.getpid()); await pg.fill("#password","passw0rd!"); await pg.click("button[type=submit]")
        await pg.wait_for_selector(".shell"); await pg.click(".nav-i:has-text('Add video')")
        await pg.set_input_files("#vfile","/tmp/test.webm"); print("title prefilled:", await pg.input_value("#vtitle")); await pg.click("#vgo")
        await pg.wait_for_selector(".vgrid2", timeout=25000)
        await pg.wait_for_selector("video", timeout=10000)
        await pg.wait_for_function("document.querySelector('video').readyState>=1", timeout=10000)
        print("duration:", await pg.evaluate("document.querySelector('video').duration"))
        await pg.click(".tx-row >> nth=1"); await pg.wait_for_timeout(800)
        print("seek via transcript -> currentTime:", await pg.evaluate("document.querySelector('video').currentTime"), "paused:", await pg.evaluate("document.querySelector('video').paused"))
        await pg.click(".ts-link >> nth=0"); await pg.wait_for_timeout(500)
        print("active row:", await pg.locator(".tx-row.on").count())
        await pg.screenshot(path="/tmp/shots/app-webm.png")
        print("errors:", errs); await b.close()
asyncio.run(main())
