import sys
import asyncio
import logging

# Windows-specific event loop policy to support subprocesses (Playwright)
# Must be set before any async loops are created
if sys.platform == 'win32':
    try:
        asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())
    except AttributeError:
        pass # Not on Windows or policy doesn't exist

from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse
import uvicorn
from crawler import OSINTCrawler
from pydantic import BaseModel

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("server")

app = FastAPI()

app.mount("/static", StaticFiles(directory="static"), name="static")

crawler_instance = OSINTCrawler()

class StartRequest(BaseModel):
    url: str

@app.get("/", response_class=HTMLResponse)
async def read_root():
    try:
        with open("static/index.html", "r", encoding="utf-8") as f:
            return f.read()
    except Exception as e:
        print(f"CRITICAL ERROR: {e}")
        return HTMLResponse(content=f"<h1>Error: {e}</h1>", status_code=500)

@app.post("/start")
async def start_crawl(request: StartRequest):
    if crawler_instance.is_running:
        return {"status": "error", "message": "Crawler is already running"}
    
    # Log current loop policy for debugging
    try:
        policy = asyncio.get_event_loop_policy()
        logger.info(f"Start crawl requested. Current Loop Policy: {policy}")
        logger.info(f"Current Loop: {asyncio.get_running_loop()}")
    except Exception as e:
        logger.error(f"Could not inspect loop: {e}")

    asyncio.create_task(crawler_instance.start(request.url))
    return {"status": "started", "message": f"Started crawling {request.url}"}

@app.post("/stop")
async def stop_crawl():
    await crawler_instance.stop()
    return {"status": "stopped", "message": "Crawler stopped"}

@app.get("/status")
async def get_status():
    return {
        "is_running": crawler_instance.is_running,
        "logs": crawler_instance.logs[-50:], # Return last 50 logs
        "data_count": len(crawler_instance.data)
    }

@app.get("/results")
async def get_results():
    return crawler_instance.data

if __name__ == "__main__":
    # Ensure loop="asyncio" is used to respect the policy set at the top
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True, loop="asyncio")
