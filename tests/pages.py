import asyncio
from playwright.async_api import async_playwright
HIDE=".nav,.to-top,.progress,.skip,.toasts{display:none!important} .ws-left{position:static!important}"
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch()
        for name,w,h in [("d",1440,900),("m",390,844)]:
            pg=await b.new_page(viewport={"width":w,"height":h}); errs=[]
            pg.on("pageerror",lambda e:errs.append(str(e))); pg.on("console",lambda m:errs.append(m.text) if m.type=="error" else None)
            for page in ["index","project"]:
                await pg.goto(f"http://localhost:8765/{page}.html",wait_until="networkidle")
                await pg.add_style_tag(content=HIDE); await pg.evaluate("document.querySelectorAll('.reveal').forEach(e=>e.classList.add('in'))")
                await pg.wait_for_timeout(1500)
                ow=await pg.evaluate("document.documentElement.scrollWidth"); hh=await pg.evaluate("document.documentElement.scrollHeight")
                print(name,page,"scrollWidth",ow,"height",hh,"errs",errs)
                await pg.screenshot(path=f"/tmp/shots/full-{name}-{page}.png",full_page=True)
        await b.close()
asyncio.run(main())
