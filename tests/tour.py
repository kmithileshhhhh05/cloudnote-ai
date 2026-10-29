import asyncio
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(); pg=await b.new_page(viewport={"width":1440,"height":900}); errs=[]
        pg.on("pageerror",lambda e:errs.append(str(e))); pg.on("console",lambda m:errs.append(m.text) if m.type=="error" else None)
        await pg.goto("http://localhost:8787/about.html",wait_until="networkidle")
        await pg.evaluate("document.querySelectorAll('.reveal').forEach(e=>e.classList.add('in'))")
        await pg.click("#tour-go")
        seen=[]
        for i in range(60):
            await pg.wait_for_timeout(1000)
            t=await pg.inner_text("#tour-step") if await pg.is_visible("#tour-cap") else ""
            if t and (not seen or seen[-1]!=t): seen.append(t)
            if i==22: await pg.screenshot(path="/tmp/shots/tour.png")
            if not await pg.is_disabled("#tour-go"): break
        print(seen, "iter",i)
        print("map:", (await pg.inner_text("#map-body"))[:120].replace("\n"," | "))
        # interrupt test
        await pg.click("#tour-go"); await pg.wait_for_timeout(1500); await pg.click("#play"); await pg.wait_for_timeout(300)
        print("after interrupt disabled:", await pg.is_disabled("#tour-go"), "cap visible:", await pg.is_visible("#tour-cap"))
        print("errors",errs); await b.close()
asyncio.run(main())
