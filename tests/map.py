import asyncio
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(); pg=await b.new_page(viewport={"width":1440,"height":900}); errs=[]
        pg.on("pageerror",lambda e:errs.append(str(e))); pg.on("console",lambda m:errs.append(m.text) if m.type=="error" else None)
        await pg.goto("http://localhost:8787/about.html",wait_until="networkidle")
        await pg.evaluate("document.querySelectorAll('.reveal').forEach(e=>e.classList.add('in'))")
        await pg.click("#tab-context"); await pg.click('[data-accept^="r-v2-08"]'); await pg.click('[data-remember="r-v2-05"]')
        await pg.click("#tab-map"); 
        print((await pg.inner_text("#map-body"))[:400].replace("\n"," | "))
        await (await pg.query_selector("#ws")).screenshot(path="/tmp/shots/map1.png")
        await pg.click("#tab-remember"); await pg.click("#up-v3"); await pg.wait_for_selector("[data-review^='accept']",timeout=8000)
        await pg.click("#tab-map"); await (await pg.query_selector("#map-body")).screenshot(path="/tmp/shots/map2.png")
        await pg.click("#tab-remember"); await pg.click("[data-review^='accept']"); await pg.click("#tab-map")
        print((await pg.inner_text("#map-body"))[:300].replace("\n"," | "))
        await (await pg.query_selector("#map-body")).screenshot(path="/tmp/shots/map3.png")
        print("errors",errs); await b.close()
asyncio.run(main())
