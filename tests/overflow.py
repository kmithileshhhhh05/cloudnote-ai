import asyncio
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); page = await b.new_page(viewport={"width":390,"height":844})
        await page.goto("http://localhost:8765/index.html", wait_until="networkidle")
        await page.evaluate("document.querySelectorAll('.reveal').forEach(e=>e.classList.add('in'))")
        r = await page.evaluate("""()=>{const out=[];document.querySelectorAll('body *').forEach(e=>{const r=e.getBoundingClientRect();if(!e.closest('.marquee')&&r.right>391&&r.width>0&&getComputedStyle(e).position!=='fixed'){out.push(e.tagName+'.'+e.className+' '+Math.round(r.right))}});return out.slice(0,15)}""")
        print("\n".join(r)); await b.close()
asyncio.run(main())
