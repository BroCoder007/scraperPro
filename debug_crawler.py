import asyncio
from playwright.async_api import async_playwright
import traceback

async def test_crawler_setup():
    print("Testing Playwright setup...")
    try:
        async with async_playwright() as p:
            print("Playwright initialized.")
            print("Launching browser (headless)...")
            # Mimic the args used in crawler.py
            browser = await p.chromium.launch(headless=True, args=["--use-gl=desktop"])
            print("Browser launched successfully.")
            context = await browser.new_context()
            print("Context created.")
            page = await context.new_page()
            print("Page created.")
            await page.goto("https://www.coursera.org/")
            print("Navigated to coursera.org")
            title = await page.title()
            print(f"Page title: {title}")
            
            # 1. Take Screenshot
            print("Taking screenshot...")
            await page.screenshot(path="debug_screenshot.png", full_page=False)
            
            # 2. Extract Data
            print("Getting content...")
            content = await page.content()
            from bs4 import BeautifulSoup
            import re
            soup = BeautifulSoup(content, 'html.parser')
            text = soup.get_text()
            
            print("Running Regex...")
            emails = set(re.findall(r"[a-z0-9\.\-+_]+@[a-z0-9\.\-+_]+\.[a-z]+", text, re.I))
            print(f"Found {len(emails)} emails")
            
            await browser.close()
            print("Browser closed.")
    except Exception:
        print("CRASHED during setup:")
        print(traceback.format_exc())

if __name__ == "__main__":
    asyncio.run(test_crawler_setup())
