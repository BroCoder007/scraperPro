import asyncio
from pathlib import Path
from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from crawler import OSINTCrawler, DB

ROOT=Path(__file__).parent
app=FastAPI(title='ScraperPro')
app.mount('/static',StaticFiles(directory=ROOT/'static'),name='static')
crawler=OSINTCrawler()
class StartRequest(BaseModel):
    url: str
    max_pages: int = Field(default=10000, ge=1, le=100000)
    concurrency: int = Field(default=4, ge=1, le=16)
    delay: float = Field(default=0.25, ge=0.05, le=30)
    render: bool = False
@app.get('/')
async def home(): return FileResponse(ROOT/'static/index.html')
@app.post('/start')
async def start(req:StartRequest):
    try: seed=crawler.reserve(req.url,req.max_pages,req.render)
    except ValueError as e: raise HTTPException(409 if crawler.is_running else 400,str(e))
    asyncio.create_task(crawler.start(seed,req.max_pages,req.concurrency,req.delay,req.render))
    return {'status':'started','run_id':crawler.run_id}
@app.post('/stop')
async def stop(): await crawler.stop(); return {'status':'stopping'}
@app.get('/status')
async def status():
    run=crawler.run_id
    counts=dict(crawler.db.execute('SELECT state,COUNT(*) FROM pages WHERE run_id=? GROUP BY state',(run,)).fetchall()) if run else {}
    record=crawler.db.execute('SELECT * FROM runs WHERE id=?',(run,)).fetchone() if run else None
    return {'is_running':crawler.is_running,'run':dict(record) if record else None,'counts':counts,'logs':list(crawler.logs)}
@app.get('/runs')
async def runs(limit:int=Query(50,ge=1,le=500),offset:int=Query(0,ge=0)):
    return [dict(x) for x in crawler.db.execute('SELECT * FROM runs ORDER BY id DESC LIMIT ? OFFSET ?',(limit,offset))]
@app.get('/results')
async def results(run_id:int|None=None,limit:int=Query(100,ge=1,le=1000),offset:int=Query(0,ge=0)):
    run_id=run_id or crawler.run_id
    pages=[dict(x) for x in crawler.db.execute('SELECT url,depth,state,status_code,content_type,title,fetched_at,error,truncated FROM pages WHERE run_id=? ORDER BY id LIMIT ? OFFSET ?',(run_id,limit,offset))]
    for p in pages: p['findings']=[dict(x) for x in crawler.db.execute('SELECT code,severity,description FROM findings WHERE run_id=? AND page_url=?',(run_id,p['url']))]
    return pages
@app.get('/links')
async def links(run_id:int,limit:int=Query(100,ge=1,le=1000),offset:int=Query(0,ge=0)):
    return [dict(x) for x in crawler.db.execute('SELECT source_url,target_url,internal FROM links WHERE run_id=? ORDER BY rowid LIMIT ? OFFSET ?',(run_id,limit,offset))]
@app.get('/database')
async def database():
    if crawler.is_running: raise HTTPException(409,'Wait for the crawl to finish before downloading the database.')
    crawler.db.execute('PRAGMA wal_checkpoint(FULL)')
    return FileResponse(DB,filename='scraperpro.sqlite3',media_type='application/vnd.sqlite3')
