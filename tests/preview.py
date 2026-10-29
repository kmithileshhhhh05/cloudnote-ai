import asyncio, os
from playwright.async_api import async_playwright
BASE = os.environ.get("BASE","http://localhost:8766")
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(viewport={"width":1440,"height":900}); errs=[]
        pg.on("pageerror", lambda e: errs.append(str(e))); pg.on("console", lambda m: errs.append(m.text) if m.type=="error" else None)
        await pg.goto(BASE+"/", wait_until="networkidle")
        print("preview note:", "Preview mode" in await pg.inner_text(".auth-card"))
        await pg.fill("#email","me@example.com"); await pg.fill("#password","anything1"); await pg.click("button[type=submit]")
        await pg.wait_for_selector(".shell"); await pg.click("text=Try with sample videos")
        await pg.wait_for_function("document.querySelectorAll('.vcard-lib .pill.green').length===2", timeout=20000)
        await pg.click("a.vc-link[aria-label*='Application Setup']"); await pg.wait_for_selector(".vgrid2")
        await pg.click('.tab:has-text("Context")'); await pg.wait_for_selector("#ctx-panel .rcard")
        await pg.click('button:has-text("Accept this source")'); await pg.wait_for_selector(".linked")
        await pg.click('button:has-text("Leave unresolved and remember it")'); await pg.wait_for_selector(".nomatch.pend")
        await pg.click(".nav-i:has-text('Library')"); await pg.click("text=Add Database Tutorial")
        await pg.wait_for_function("window.__cn.unread===1", timeout=20000); print("notification:", await pg.inner_text(".side .bell .n"))
        await pg.click(".side .bell"); await pg.click('.np button:has-text("Accept link")'); await pg.wait_for_selector(".np .pill.green"); await pg.keyboard.press("Escape")
        await pg.click(".nav-i:has-text('Library map')"); await pg.wait_for_selector("svg.map"); print("map:", (await pg.inner_text(".sumrow")).replace("\n"," "))
        await pg.click(".nav-i:has-text('Add video')"); print("media tab hidden:", await pg.locator('.seg button:has-text("Video or audio")').count()==0)
        await pg.reload(wait_until="networkidle"); await pg.evaluate("location.hash='#/library'"); await pg.wait_for_selector(".vcard-lib"); print("persisted after reload:", await pg.locator(".vcard-lib").count())
        print("errors:", errs); await b.close()
asyncio.run(main())
