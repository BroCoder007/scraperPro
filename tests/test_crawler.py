import asyncio, tempfile, unittest
from pathlib import Path
from aiohttp import web
import crawler

class CrawlTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.temp=tempfile.TemporaryDirectory(); crawler.DB=Path(self.temp.name)/'crawl.sqlite3'
        app=web.Application()
        async def robots(request): return web.Response(text='User-agent: *\nDisallow: /private\n')
        async def home(request): return web.Response(text='<title>Home</title><a href="/child#fragment">child</a><a href="/private">private</a><a href="https://outside.invalid/">offsite</a>',content_type='text/html')
        async def child(request): return web.Response(text='<title>Child</title><a href="/">cycle</a><form action="http://example.org/login"><input type="password"></form>',content_type='text/html',headers={'X-Content-Type-Options':'nosniff'})
        app.router.add_get('/robots.txt',robots); app.router.add_get('/',home); app.router.add_get('/child',child)
        self.runner=web.AppRunner(app); await self.runner.setup(); site=web.TCPSite(self.runner,'127.0.0.1',0); await site.start(); self.port=site._server.sockets[0].getsockname()[1]
        self.crawler=crawler.OSINTCrawler(); self.seed=f'http://127.0.0.1:{self.port}/'
    async def asyncTearDown(self):
        self.crawler.db.close(); await self.runner.cleanup(); self.temp.cleanup()
    async def test_graph_findings_robots_and_persistence(self):
        seed=self.crawler.reserve(self.seed,50,False); await self.crawler.start(seed,50,2,0.05,False)
        db=self.crawler.db
        pages=db.execute('SELECT url,state,title,html FROM pages ORDER BY id').fetchall()
        self.assertEqual(len(pages),3); self.assertEqual([p['state'] for p in pages],['visited','visited','error'])
        self.assertIn('Home',pages[0]['html']); self.assertEqual(db.execute('SELECT COUNT(*) FROM links').fetchone()[0],4)
        self.assertEqual(db.execute("SELECT COUNT(*) FROM links WHERE internal=0").fetchone()[0],1)
        self.assertGreater(db.execute("SELECT COUNT(*) FROM findings WHERE code='insecure_password_form'").fetchone()[0],0)
        self.assertEqual(db.execute('SELECT state FROM runs').fetchone()[0],'completed')
        again=crawler.OSINTCrawler(); self.assertEqual(again.run_id,1); self.assertEqual(again.db.execute('SELECT COUNT(*) FROM pages').fetchone()[0],3); again.db.close()
    async def test_limit_reports_incomplete(self):
        seed=self.crawler.reserve(self.seed,1,False); await self.crawler.start(seed,1,2,0.05,False)
        self.assertEqual(self.crawler.db.execute('SELECT state FROM runs').fetchone()[0],'limited')
        self.assertEqual(self.crawler.db.execute('SELECT COUNT(*) FROM links').fetchone()[0],3)
    async def test_optional_browser_render(self):
        seed=self.crawler.reserve(self.seed,1,True); await self.crawler.start(seed,1,1,0.05,True)
        row=self.crawler.db.execute('SELECT state,error FROM pages WHERE depth=0').fetchone()
        self.assertEqual(row['state'],'visited',row['error'])
    def test_normalization(self):
        self.assertEqual(crawler.normalize('HTTPS://Example.COM:443/a#x'),'https://example.com/a')
        self.assertIsNone(crawler.normalize('http://user:password@example.com'))
if __name__=='__main__': unittest.main()
