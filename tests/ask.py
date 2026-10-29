import asyncio
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(); pg=await b.new_page(viewport={"width":1440,"height":900}); errs=[]
        pg.on("pageerror",lambda e:errs.append(str(e))); pg.on("console",lambda m:errs.append(m.text) if m.type=="error" else None)
        await pg.goto("http://localhost:8787/about.html",wait_until="networkidle")
        await pg.evaluate("document.querySelectorAll('.reveal').forEach(e=>e.classList.add('in'))")
        print("default tab visible:", await pg.is_visible("#pn-ask"))
        await pg.click('[data-ask="0"]'); print((await pg.inner_text("#ask-out"))[:150].replace("\n"," | "))
        await pg.fill("#ask-in","what is the capital of France"); await pg.keyboard.press("Enter"); print((await pg.inner_text("#ask-out"))[:90])
        await pg.click('[data-ask="1"]'); await pg.click("#ask-out [data-seek]"); print("time", await pg.inner_text("#time"))
        await pg.click('[data-vid="v1"]'); print((await pg.inner_text("#ask-notes"))[:80].replace("\n"," "))
        async with pg.expect_download() as d: await pg.click("#dl-notes")
        dl=await d.value; print("download", dl.suggested_filename)
        await (await pg.query_selector("#ws")).screenshot(path="/tmp/shots/ask.png")
        # project page
        await pg.goto("http://localhost:8787/project.html",wait_until="networkidle")
        print("project sections", await pg.evaluate("['architecture','research','plan','team','references'].map(i=>!!document.getElementById(i))"), "papers", await pg.evaluate("document.querySelectorAll('.paper').length"))
        await pg.keyboard.press("Control+k"); await pg.fill("#pal-q","tour"); print("pal", (await pg.inner_text("#pal-list"))[:60].replace("\n"," "))
        print("errors",errs); await b.close()
asyncio.run(main())
