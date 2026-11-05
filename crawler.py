import asyncio, json, sqlite3, time
from collections import deque
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urljoin, urlsplit, urlunsplit
from urllib.robotparser import RobotFileParser
import aiohttp
from bs4 import BeautifulSoup

DB = Path(__file__).parent / 'scraped_data' / 'crawl.sqlite3'
UA = 'ScraperPro/2.0'
MAX_BYTES = 2 * 1024 * 1024

def normalize(url, base=None):
    try:
        p = urlsplit(urljoin(base or url, url))
        if p.scheme.lower() not in ('http', 'https') or not p.hostname or p.username or p.password:
            return None
        host = p.hostname.lower().encode('idna').decode('ascii')
        if ':' in host: host = '[' + host + ']'
        port = p.port
        netloc = host + (f':{port}' if port and (p.scheme.lower(), port) not in [('http', 80), ('https', 443)] else '')
        return urlunsplit((p.scheme.lower(), netloc, p.path or '/', p.query, ''))
    except (ValueError, UnicodeError): return None

def origin(url):
    p = urlsplit(url)
    return (p.scheme, p.netloc)

def findings(url, headers, soup):
    h = {k.lower(): v for k, v in headers.items()}
    out = []
    def add(code, severity, message): out.append({'code':code, 'severity':severity, 'description':message})
    if urlsplit(url).scheme != 'https': add('http', 'medium', 'Page uses unencrypted HTTP.')
    else:
        if 'strict-transport-security' not in h: add('missing_hsts', 'low', 'HSTS header is absent on this HTTPS response.')
    csp = h.get('content-security-policy', '')
    if not csp: add('missing_csp', 'low', 'Content-Security-Policy header is absent.')
    if 'x-content-type-options' not in h or h['x-content-type-options'].lower() != 'nosniff': add('missing_nosniff', 'low', 'X-Content-Type-Options: nosniff is absent.')
    if 'x-frame-options' not in h and 'frame-ancestors' not in csp.lower(): add('missing_frame_protection', 'low', 'No X-Frame-Options or CSP frame-ancestors restriction was observed.')
    if 'referrer-policy' not in h: add('missing_referrer_policy', 'info', 'Referrer-Policy header is absent.')
    if soup:
        for form in soup.select('form'):
            if form.select_one('input[type="password" i]') and urlsplit(urljoin(url, form.get('action') or url)).scheme != 'https':
                add('insecure_password_form', 'high', 'A password form submits to an HTTP URL.'); break
        if urlsplit(url).scheme == 'https' and any((tag.get('src') or '').lower().startswith('http://') for tag in soup.select('script[src], iframe[src], img[src]')):
            add('mixed_content', 'medium', 'Page references an HTTP resource from HTTPS.')
    return out

class OSINTCrawler:
    def __init__(self):
        DB.parent.mkdir(parents=True, exist_ok=True)
        self.db = sqlite3.connect(DB, check_same_thread=False)
        self.db.row_factory = sqlite3.Row
        self.db.executescript('''PRAGMA journal_mode=WAL;
        CREATE TABLE IF NOT EXISTS runs(id INTEGER PRIMARY KEY, seed TEXT, started_at TEXT, finished_at TEXT, state TEXT, max_pages INTEGER, render INTEGER);
        CREATE TABLE IF NOT EXISTS pages(id INTEGER PRIMARY KEY, run_id INTEGER, url TEXT, depth INTEGER, state TEXT, status_code INTEGER, content_type TEXT, title TEXT, html TEXT, headers TEXT, fetched_at TEXT, error TEXT, truncated INTEGER DEFAULT 0, UNIQUE(run_id,url));
        CREATE INDEX IF NOT EXISTS page_queue ON pages(run_id,state,id);
        CREATE TABLE IF NOT EXISTS links(run_id INTEGER, source_url TEXT, target_url TEXT, internal INTEGER, UNIQUE(run_id,source_url,target_url));
        CREATE INDEX IF NOT EXISTS link_source ON links(run_id,source_url);
        CREATE TABLE IF NOT EXISTS findings(id INTEGER PRIMARY KEY, run_id INTEGER, page_url TEXT, code TEXT, severity TEXT, description TEXT);
        CREATE INDEX IF NOT EXISTS findings_page ON findings(run_id,page_url);''')
        self.db.execute("UPDATE runs SET state='interrupted', finished_at=? WHERE state='running'", (datetime.now(timezone.utc).isoformat(),)); self.db.commit()
        self.is_running = False; self.stopping = False; self.logs = deque(maxlen=100); latest=self.db.execute('SELECT MAX(id) FROM runs').fetchone()[0]; self.run_id = latest

    def log(self, message): self.logs.append({'time':time.strftime('%H:%M:%S'), 'message':str(message)})
    async def stop(self): self.stopping = True; self.log('Stopping after active requests finish.')
    def reserve(self, seed, max_pages, render):
        if self.is_running: raise ValueError('A crawl is already running')
        seed=normalize(seed)
        if not seed: raise ValueError('Enter an absolute HTTP or HTTPS URL without credentials.')
        cur=self.db.execute('INSERT INTO runs(seed,started_at,state,max_pages,render) VALUES(?,?,?,?,?)', (seed,datetime.now(timezone.utc).isoformat(),'running',max_pages,int(render)))
        self.limit_reached=False; self.run_id=cur.lastrowid; self.db.execute('INSERT INTO pages(run_id,url,depth,state) VALUES(?,?,0,?)',(self.run_id,seed,'queued')); self.db.commit()
        self.is_running=True; self.stopping=False; self.logs.clear(); return seed

    async def start(self, seed, max_pages=10000, concurrency=4, delay=0.25, render=False):
        run=self.run_id; state='completed'; self.log(f'Started crawl {run}: {seed}')
        robots=RobotFileParser(); robots.set_url(urljoin(seed,'/robots.txt'))
        browser=None; playwright=None
        try:
            timeout=aiohttp.ClientTimeout(total=25)
            async with aiohttp.ClientSession(timeout=timeout, headers={'User-Agent':UA}, trust_env=False) as session:
                try:
                    async with session.get(robots.url, allow_redirects=False) as r:
                        if r.status in (401,403): robots.parse(['User-agent: *','Disallow: /'])
                        elif r.status==404: robots.parse(['User-agent: *','Allow: /'])
                        elif r.status==200: robots.parse((await r.content.read(512000)).decode('utf-8','replace').splitlines())
                        else: raise RuntimeError(f'robots.txt returned {r.status}')
                except Exception as e: raise RuntimeError(f'Cannot verify robots.txt: {e}') from e
                delay=max(delay, robots.crawl_delay(UA) or robots.crawl_delay('*') or 0)
                if render:
                    from playwright.async_api import async_playwright
                    playwright=await async_playwright().start()
                    browser=await playwright.chromium.launch(headless=True, args=['--enable-gpu'])
                    self.log('Browser rendering enabled; GPU use depends on Chromium and device support.')
                sem=asyncio.Semaphore(concurrency); gate=asyncio.Lock(); next_request=0.0
                async def fetch(row):
                    nonlocal next_request
                    url=row['url']
                    if not robots.can_fetch(UA,url): return row, None, None, None, 'Blocked by robots.txt', False, []
                    async with sem:
                        async with gate:
                            wait=max(0,next_request-time.monotonic())
                            if wait: await asyncio.sleep(wait)
                            next_request=time.monotonic()+delay
                        try:
                            async with session.get(url,allow_redirects=False) as response:
                                status=response.status; headers=dict(response.headers); ctype=response.headers.get('Content-Type','')
                                redirect=normalize(response.headers.get('Location',''),url) if 300 <= status < 400 and response.headers.get('Location') else None
                                data=bytearray()
                                async for chunk in response.content.iter_chunked(65536):
                                    data.extend(chunk)
                                    if len(data)>MAX_BYTES: break
                                truncated=len(data)>MAX_BYTES; data=bytes(data[:MAX_BYTES])
                                if redirect: return row,status,headers,None,None,truncated,[redirect]
                                if 'html' not in ctype.lower(): return row,status,headers,None,None,truncated,[]
                                content=data.decode(response.charset or 'utf-8','replace')
                                if browser and status<400:
                                    page=await browser.new_page()
                                    async def route_handler(route):
                                        u=normalize(route.request.url)
                                        if not u or origin(u)!=origin(seed) or not robots.can_fetch(UA,u): await route.abort()
                                        else: await route.continue_()
                                    await page.route('**/*',route_handler)
                                    try:
                                        await page.goto(url, wait_until='domcontentloaded',timeout=20000)
                                        content=await page.content()
                                        if len(content.encode('utf-8')) > MAX_BYTES:
                                            truncated=True
                                            content=content.encode('utf-8')[:MAX_BYTES].decode('utf-8','replace')
                                    finally: await page.close()
                                soup=BeautifulSoup(content,'html.parser')
                                links=list(dict.fromkeys(filter(None,(normalize(a.get('href',''),url) for a in soup.select('a[href]')))))
                                return row,status,headers,soup,None,truncated,links
                        except Exception as e: return row,None,None,None,str(e)[:500],False,[]
                while not self.stopping:
                    rows=self.db.execute("SELECT url,depth FROM pages WHERE run_id=? AND state='queued' ORDER BY id LIMIT ?",(run,concurrency)).fetchall()
                    if not rows: break
                    results=await asyncio.gather(*(fetch(row) for row in rows))
                    for row,status,headers,soup,error,truncated,links in results:
                        url=row['url']; title=soup.title.get_text(' ',strip=True)[:500] if soup and soup.title else ''
                        self.db.execute('UPDATE pages SET state=?,status_code=?,content_type=?,title=?,html=?,headers=?,fetched_at=?,error=?,truncated=? WHERE run_id=? AND url=?',('error' if error else 'visited',status,(headers or {}).get('Content-Type',''),title,str(soup) if soup else None,json.dumps(headers or {}),datetime.now(timezone.utc).isoformat(),error,int(truncated),run,url))
                        for f in findings(url,headers or {},soup) if headers else []: self.db.execute('INSERT INTO findings(run_id,page_url,code,severity,description) VALUES(?,?,?,?,?)',(run,url,f['code'],f['severity'],f['description']))
                        count=self.db.execute('SELECT COUNT(*) FROM pages WHERE run_id=?',(run,)).fetchone()[0]
                        for link in links:
                            internal=origin(link)==origin(seed)
                            self.db.execute('INSERT OR IGNORE INTO links VALUES(?,?,?,?)',(run,url,link,int(internal)))
                            if internal and count < max_pages:
                                cur=self.db.execute("INSERT OR IGNORE INTO pages(run_id,url,depth,state) VALUES(?,?,?,'queued')",(run,link,row['depth']+1)); count+=cur.rowcount
                            elif internal and count >= max_pages and not self.db.execute('SELECT 1 FROM pages WHERE run_id=? AND url=?',(run,link)).fetchone():
                                self.limit_reached = True
                        self.log(f'{status or "ERROR"} {url}' + (f' â€” {error}' if error else ''))
                    self.db.commit()
                if self.stopping: state='stopped'
                elif self.limit_reached: state='limited'
        except Exception as e: state='failed'; self.log(f'Crawl failed: {e}')
        finally:
            if browser: await browser.close()
            if playwright: await playwright.stop()
            self.db.execute('UPDATE runs SET state=?,finished_at=? WHERE id=?',(state,datetime.now(timezone.utc).isoformat(),run)); self.db.commit(); self.is_running=False; self.log(f'Crawl {state}.')
