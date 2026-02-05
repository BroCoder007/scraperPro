import asyncio
import sys
import uvicorn
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("runner")

if __name__ == "__main__":
    if sys.platform == 'win32':
        logger.info("Setting WindowsProactorEventLoopPolicy...")
        asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())
    
    logger.info("Starting Uvicorn...")
    # Using loop="asyncio" ensures Uvicorn uses the policy we just set
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=False, loop="asyncio")
