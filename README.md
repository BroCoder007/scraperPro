# ScraperPro

ScraperPro maps links reachable from a starting URL and stores pages, directed links and passive security observations in SQLite. Crawls are restricted to the exact origin (scheme, hostname and port); external links are recorded but not fetched. Redirects are recorded as links and only followed by the queue when in scope. URL fragments are removed. Cycles are deduplicated.

## Run

```bash
python -m pip install -r requirements.txt
python run.py
```
Open http://127.0.0.1:8000. Enter a URL you are authorized to assess. The app binds to localhost. The default page limit is 10,000, concurrency is four and the delay between request starts is 0.25 seconds. Adjust the limit to suit the site. A run marked `limited` hit its page cap; a `stopped`, `failed` or `interrupted` run is incomplete. Pages disallowed by robots.txt are recorded as errors, and robots.txt errors fail closed. The crawler follows same-origin HTML anchor links, not pages requiring authentication, forms, hidden endpoints or URLs that are never linked. Therefore no crawl can promise every page on a site.

Each HTML response is limited to 2 MiB and marked truncated when larger. A bounded batch of requests is processed at a time, while the queue and results live in SQLite at `scraped_data/crawl.sqlite3`. Page records include URL, depth, response status, headers, title, HTML (up to the cap), timestamp and errors. The link table stores source, target and scope. The findings table contains severity, rule and explanation. The database may include sensitive page content: protect it appropriately.

## JavaScript and GPU

The default HTTP mode is faster and lighter for static pages. To opt into JavaScript rendering, install a Chromium runtime with `python -m playwright install chromium` and select **Render JavaScript pages**. Chromium is launched with `--enable-gpu`, but actual GPU usage depends on the system and browser; it can fall back to software. GPU rendering accelerates supported graphical/compositing work, not network requests or HTML parsing, and it may consume more memory. Rendering makes a second request, may run page scripts and load same-origin resources, and its subrequests are not governed by the main request delay. Requests to other origins and robots-disallowed URLs are blocked. No credentials or authentication are configured.

## Security checks

Checks are passive heuristics: HTTP transport, missing HSTS, CSP, frame protection, nosniff and Referrer-Policy headers, HTTP password-form actions and mixed HTTP resources. Findings are indicators for manual review, not confirmed vulnerabilities. No exploit attempts, authentication tests, port scanning or comprehensive vulnerability assessment are performed. A clean result does not establish that a page is secure.

## API

- `POST /start`: `{"url":"https://example.com/", "max_pages":10000, "concurrency":4, "delay":0.25, "render":false}`; returns a run ID.
- `POST /stop`; `GET /status`; `GET /runs?limit=50&offset=0`.
- `GET /results?run_id=1&limit=100&offset=0`: paginated page records and findings.
- `GET /links?run_id=1&limit=100&offset=0`: paginated graph edges, including external links.
- `GET /database`: downloads SQLite after the active crawl stops.

The UI shows the first 100 records; query the API or database for the complete recorded graph. The database contains persistent run history. Resume after interruption is not currently implemented; start a new run.
