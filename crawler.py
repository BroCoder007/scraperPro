import asyncio
import sys
from playwright.async_api import async_playwright
from datetime import datetime
import json
import os
from urllib.parse import urlparse, urljoin
from bs4 import BeautifulSoup
import re

import traceback

class OSINTCrawler:
    def __init__(self):
        self.is_running = False
        self.logs = []
        self.data = []
        self.visited_urls = set()
        self.queue = asyncio.Queue()
        self.browser = None
        self.context = None
        
        # Create data directories
        os.makedirs("scraped_data/screenshots", exist_ok=True)

    def log(self, message):
        timestamp = datetime.now().strftime("%H:%M:%S")
        entry = {"time": timestamp, "message": message}
        self.logs.append(entry)
        print(f"[{timestamp}] {message}")

    async def start(self, seed_url):
        self.is_running = True
        self.log(f"Starting crawl at {seed_url}")
        self.visited_urls.clear()
        self.data.clear()
        self.logs.clear()
        
        # Add seed to queue
        await self.queue.put(seed_url)
        
        try:
            current_loop = asyncio.get_running_loop()
            self.log(f"DEBUG: Current event loop: {current_loop}")
            
            # Windows Check: Must use ProactorEventLoop for Playwright
            if sys.platform == 'win32' and not isinstance(current_loop, asyncio.ProactorEventLoop):
                error_msg = (
                    "CRITICAL ERROR: On Windows, Playwright requires asyncio.ProactorEventLoop.\n"
                    "You are likely running with 'uvicorn main:app' which defaults to SelectorEventLoop.\n"
                    "PLEASE RUN WITH: 'python run.py' (or 'python3 run.py')"
                )
                self.log(error_msg)
                raise NotImplementedError(error_msg)
            async with async_playwright() as p:
                # Use hardware acceleration if possible
                self.browser = await p.chromium.launch(headless=True, args=["--use-gl=desktop"])
                self.context = await self.browser.new_context()
                
                while self.is_running and not self.queue.empty():
                    url = await self.queue.get()
                    if url in self.visited_urls:
                        continue
                    
                    await self.process_url(url)
                    self.visited_urls.add(url)
        except Exception as e:
            self.log(f"Crawler crashed: {e}")
            self.log(f"Traceback:\n{traceback.format_exc()}")
        finally:
            self.is_running = False
            self.log("Crawling finished or stopped.")
            if self.browser:
                await self.browser.close()

    async def stop(self):
        self.is_running = False
        self.log("Stopping crawler...")

    async def process_url(self, url):
        if not self.is_running:
            return

        self.log(f"Visiting: {url}")
        page = await self.context.new_page()
        try:
            await page.goto(url, timeout=30000, wait_until="domcontentloaded")
            
            # 1. Take Screenshot (Time Travel)
            filename = f"scraped_data/screenshots/{datetime.now().strftime('%Y%m%d_%H%M%S')}_{len(self.visited_urls)}.png"
            await page.screenshot(path=filename, full_page=False)
            
            # 2. Extract Data
            content = await page.content()
            soup = BeautifulSoup(content, 'html.parser')
            text = soup.get_text()
            
            # Simple REGEX for emails (OSINT)
            emails = set(re.findall(r"[a-z0-9\.\-+_]+@[a-z0-9\.\-+_]+\.[a-z]+", text, re.I))
            
            page_data = {
                "url": url,
                "title": await page.title(),
                "emails": list(emails),
                "screenshot": filename,
                "timestamp": datetime.now().isoformat()
            }
            self.data.append(page_data)
            self.log(f"Found {len(emails)} emails on {url}")

            # 3. Find more links (Recursive)
            # Limit depth or domain via logic if needed. For now, simple same-domain check.
            base_domain = urlparse(url).netloc
            links = soup.find_all('a', href=True)
            for link in links:
                href = link['href']
                full_url = urljoin(url, href)
                parsed_new = urlparse(full_url)
                
                # Only follow http/https and same domain to avoid spiraling out
                if parsed_new.scheme in ['http', 'https'] and parsed_new.netloc == base_domain:
                    if full_url not in self.visited_urls:
                        await self.queue.put(full_url)

        except Exception as e:
            self.log(f"Error visiting {url}: {e}")
            self.log(f"Traceback:\n{traceback.format_exc()}")
        finally:
            await page.close()
