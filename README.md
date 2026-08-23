# scraperPro

A lightweight OSINT web crawler with a browser-based UI. Point it at a seed URL and it recursively crawls same-domain pages, screenshots each one, and pulls out any email addresses it finds along the way.

Built on FastAPI (backend + API) and Playwright (headless Chromium) for the actual page rendering and scraping, with a simple static frontend to control and monitor the crawl in real time.

## What it does

- Starts from a single URL and follows internal links (same domain only) breadth-first
- Takes a full screenshot of every page it visits, so you have a visual record of what was there
- Scrapes visible page text and regex-matches email addresses out of it
- Logs everything as it happens (visited URLs, emails found, errors) and exposes it through a `/status` endpoint
- Lets you start, stop, and pull results through a small REST API and a browser UI

Data (screenshots + scraped page data) is written to `scraped_data/` as the crawl runs.

## Why it's built this way

The crawler runs as an `asyncio` background task inside FastAPI, driven by a queue of URLs rather than plain recursion, so it can be paused/stopped mid-crawl without killing the whole process. Playwright is used instead of a plain requests + BeautifulSoup combo because a lot of real-world OSINT targets render content with JavaScript, and a headless browser handles that without extra work.

One thing worth calling out if you're on Windows: Playwright's subprocess handling needs the `ProactorEventLoop`, but `uvicorn main:app` defaults to the `SelectorEventLoop`. Running it that way will crash the crawler with a fairly unhelpful low-level error. `run.py` sets the correct event loop policy before starting Uvicorn, so that's the entry point you actually want to use, not `main.py` directly.

## Getting started

```bash
git clone https://github.com/BroCoder007/scraperPro.git
cd scraperPro
pip install -r requirements.txt
playwright install chromium
```

Then run:

```bash
python run.py
```

Open `http://localhost:8000` in your browser. Enter a target URL, hit start, and watch the log stream in as pages get visited.

If you want to sanity-check your environment before crawling anything, `check_env.py` will flag missing dependencies or Playwright browser installs.

## API

| Endpoint | Method | Description |
|---|---|---|
| `/` | GET | Serves the frontend |
| `/start` | POST | Starts a crawl. Body: `{ "url": "https://example.com" }` |
| `/stop` | POST | Stops the current crawl |
| `/status` | GET | Current run state, recent logs, and page count |
| `/results` | GET | Full scraped dataset for the current/last run |

## Project layout

```
main.py           FastAPI app and routes
run.py            Correct entry point (sets asyncio event loop policy, then runs Uvicorn)
crawler.py        OSINTCrawler class — the actual crawl/scrape logic
debug_crawler.py  Standalone script for testing the crawler outside the web server
get_crash_logs.py Pulls recent logs after a crash for debugging
trigger_crawl.py  Fires off a crawl via the API without using the UI
static/           Frontend (HTML/CSS/JS)
scraped_data/      Screenshots and scrape output (created at runtime)
```

## Notes

This is built for scraping sites you have permission to crawl — respect `robots.txt` and target sites' terms of service. It's a personal OSINT/security tooling project, not meant for scraping at scale or against arbitrary third-party targets.

Currently single-domain, single-crawl-at-a-time. No rate limiting or depth cap yet, so point it at a reasonably sized site unless you want it running for a while.
