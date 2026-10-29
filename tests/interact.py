import asyncio, json
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        page = await b.new_page(viewport={"width":1440,"height":900})
        errs=[]
        page.on("pageerror", lambda e: errs.append(str(e)))
        page.on("console", lambda m: errs.append(m.text) if m.type=="error" else None)
        await page.goto("http://localhost:8787/about.html", wait_until="networkidle")
        await page.evaluate("document.querySelectorAll('.reveal').forEach(e=>e.classList.add('in'))")
        T=lambda s: page.inner_text(s)
        # context: accept ref2
        await page.click("#tab-context"); await page.click('[data-accept^="r-v2-08"]')
        assert "Linked to" in await T("#ctx-refs"), "accept failed"
        # remember ref1
        await page.click('[data-remember="r-v2-05"]')
        # play
        await page.click("#play"); await page.wait_for_timeout(1500); await page.click("#play")
        print("time", await T("#time"))
        # notes
        await page.click("#tab-notes"); await page.click("#cmp-go")
        print("summary", (await T(".sumrow")).replace("\n"," "))
        await page.click('[data-fix="kp3"]'); await page.click('[data-add="kp5"]')
        print("after", (await T(".sumrow")).replace("\n"," "), "| notes:", (await page.input_value("#notes-ta")).replace("\n"," / "))
        await page.click("[data-notes-save]")
        # remember
        await page.click("#tab-remember"); await page.click("#up-v3")
        await page.wait_for_selector("[data-review^='accept']", timeout=8000)
        print("bell", await T("#bell-n"))
        await page.screenshot(path="/tmp/shots/remember.png")
        await page.click("[data-review^='accept']")
        print((await T("#rem-body"))[-300:].replace("\n"," "))
        await page.click("#re-check"); await page.wait_for_timeout(1500)
        print("log tail:", (await T("#rem-log")).split("\n")[-1])
        # free text on day2
        await page.click("#tab-context"); await page.fill("#try-in","Remember the nginx proxy block we covered in the last session."); await page.click("#try-go")
        print("try:", (await T("#try-out"))[:120].replace("\n"," "))
        # palette
        await page.keyboard.press("Control+k"); await page.fill("#pal-q","whisper"); 
        print("pal:", (await T("#pal-list"))[:100].replace("\n"," "))
        await page.keyboard.press("Escape")
        await page.click("#ws-reset")
        print("errors", errs)
        await b.close()
asyncio.run(main())
