import asyncio
import sys
import uvicorn

print(f"Python version: {sys.version}")
print(f"Platform: {sys.platform}")

policy = asyncio.get_event_loop_policy()
print(f"Default Policy: {policy}")

loop = asyncio.new_event_loop()
print(f"New Loop type: {type(loop)}")
loop.close()

if sys.platform == 'win32':
    asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())
    print("Set Proactor Policy")
    policy = asyncio.get_event_loop_policy()
    print(f"New Policy: {policy}")
    loop = asyncio.new_event_loop()
    print(f"New Loop type (after fix): {type(loop)}")
    loop.close()
