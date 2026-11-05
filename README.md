# ScraperPro

ScraperPro maps pages linked from a starting URL and records the results in a local SQLite database. It can also report passive security observations, such as missing response headers and password forms that submit over HTTP.

Use it only on websites you are authorized to assess. The tool respects `robots.txt`; its observations are leads for manual review, not proof that a site is secure or vulnerable.

## Requirements

- Python 3.10 or later and `pip`.
- Internet access to install dependencies and reach the site being assessed.
- Optional: Playwright Chromium for pages that need JavaScript rendering. A GPU is not required.

## Installation

Clone the repository and enter the project directory:

```bash
git clone https://github.com/BroCoder007/scraperPro.git
cd scraperPro
```

Create a virtual environment and install the dependencies. On Windows PowerShell:

```powershell
py -m venv .venv
.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

On macOS or Linux:

```bash
python3 -m venv .venv
.venv/bin/python -m pip install --upgrade pip
.venv/bin/python -m pip install -r requirements.txt
```

These commands use the environment directly; activation is optional. If you activate it, substitute `python` for the full environment path in the commands below.

For optional JavaScript rendering, install Playwright's browser **in the same environment**:

```powershell
# Windows
.\.venv\Scripts\python.exe -m playwright install chromium
```

```bash
# macOS / Linux
.venv/bin/python -m playwright install chromium
```

On Linux, if Chromium reports missing system libraries, consult the [Playwright installation guide](https://playwright.dev/python/docs/intro) for your distribution.

## Start the application

From the project directory, run:

```powershell
# Windows
.\.venv\Scripts\python.exe run.py
```

```bash
# macOS / Linux
.venv/bin/python run.py
```

Open [http://127.0.0.1:8000](http://127.0.0.1:8000) in your browser. Leave the terminal running while you use the dashboard. Press **Ctrl+C** in that terminal to stop the server. The application listens on your computer's loopback interface.

## Run a crawl

1. Enter the starting page's full `http://` or `https://` URL. URLs containing embedded credentials are rejected.
2. Set the **Page limit** and **Concurrency**, or use the defaults of 10,000 pages and four concurrent requests. The limits are 1–100,000 pages and 1–16 concurrent requests.
3. Leave **Render JavaScript pages** unchecked for the lighter HTTP mode. Select it only after installing Playwright Chromium if the pages need browser rendering.
4. Select **Start crawl**. The activity panel shows recent requests; the table shows page status and passive observations.
5. Use **Stop** to request a stop. Active requests finish first. When the crawl is no longer running, select **Download SQLite database** to save its database.

The dashboard shows the first 100 recorded pages. Use the API or SQLite database to inspect additional pages, all recorded links and previous runs. One crawl can run at a time.

## Crawl scope and status

The crawler follows HTML anchor links on the **same origin** as the starting URL: the scheme, hostname and port must match. A link to another origin is recorded in the link table but is not crawled. Redirect destinations are recorded as links and are queued only if they are in scope. URL fragments are removed, and repeated URLs are deduplicated.

The request-start delay defaults to 0.25 seconds and can be changed through the API; a larger `robots.txt` crawl delay is honored when present. Disallowed pages are recorded as errors. A 401 or 403 response for `robots.txt` disallows crawling, a 404 permits crawling, and other failures stop the run. The HTML response cap is 2 MiB per page; larger responses are marked `truncated`.

| Run state | Meaning |
| --- | --- |
| `running` | The crawl is active. |
| `completed` | The queue was exhausted; individual pages may still have errors or have been blocked by `robots.txt`. |
| `limited` | The page cap prevented at least one discovered in-scope URL from being queued. |
| `stopped` | A stop was requested before the queue was exhausted. |
| `failed` | The run stopped because of an error; check recent activity. |
| `interrupted` | The server stopped during a run. |

An interrupted run cannot currently be resumed; start a new run. The crawl covers links it can discover within its scope, not unlinked pages, form submissions, authenticated pages or hidden endpoints. A `completed` status does not mean every page on a site was discovered.

## Database and example queries

Data is stored in `scraped_data/crawl.sqlite3` within the project directory and remains there between runs. The dashboard's download is available only when a crawl is not active. The database may contain page content or response headers; handle it according to your site's data requirements.

The main tables are:

- `runs`: starting URL, timestamps, state and settings.
- `pages`: URL, depth, state, HTTP status, content type, title, stored HTML, response headers, timestamp, errors and truncation flag.
- `links`: directed source and target URLs, plus an `internal` flag. The target may be external or may not have been visited.
- `findings`: page URL, rule code, severity and explanation for each observation.

Open the downloaded file with an SQLite client. Replace `1` with the run ID shown by the dashboard or `/runs`:

```sql
-- Pages and their crawl status
SELECT url, depth, state, status_code, title, error, truncated
FROM pages WHERE run_id = 1 ORDER BY depth, id;

-- Relationships between pages
SELECT source_url, target_url, internal
FROM links WHERE run_id = 1 ORDER BY source_url, target_url;

-- Security observations
SELECT page_url, severity, code, description
FROM findings WHERE run_id = 1 ORDER BY page_url, severity;
```

The link table represents a directed graph: cycles and pages linked from multiple parents are possible, so it is more general than a strict tree.

## API

Interactive API documentation is available at [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs) while the app is running.

| Endpoint | Purpose |
| --- | --- |
| `POST /start` | Start a crawl and receive a run ID. |
| `POST /stop` | Request that the active crawl stop. |
| `GET /status` | Get the current or most recent run, page counts and recent logs. |
| `GET /runs?limit=50&offset=0` | List run history. |
| `GET /results?run_id=1&limit=100&offset=0` | Get a page of records and their findings. |
| `GET /links?run_id=1&limit=100&offset=0` | Get a page of graph edges. |
| `GET /database` | Download the SQLite database when no crawl is active. |

For example, from PowerShell, with a site you are authorized to assess:

```powershell
$body = @{
    url = 'https://example.com/'
    max_pages = 1000
    concurrency = 4
    delay = 0.25
    render = $false
} | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:8000/start' -ContentType 'application/json' -Body $body
Invoke-RestMethod -Uri 'http://127.0.0.1:8000/status'
```

`delay` is in seconds and accepts 0.05–30. The result and link endpoints accept `limit` from 1–1,000 and a nonnegative `offset`; use successive offsets for larger results. `/runs` accepts a limit of 1–500. To see earlier runs, pass their `run_id` explicitly to `/results` or `/links`.

## JavaScript rendering and GPU use

HTTP mode avoids starting a browser and is generally lighter for static pages. With rendering enabled, Chromium is launched with `--enable-gpu`, but actual GPU use depends on the browser, drivers and hardware; Chromium may fall back to software. GPU rendering can help supported graphics and compositing work. It does not accelerate network requests or HTML parsing and can use more memory.

Rendering makes a second request for each rendered page, runs page scripts and can load same-origin resources. Requests outside the starting origin and requests disallowed by `robots.txt` are blocked. Browser subrequests are not governed by the main request-start delay. No authentication or credentials are configured.

## Security observations

The checks look for HTTP transport, missing HSTS, Content-Security-Policy, frame protection, `X-Content-Type-Options: nosniff` and Referrer-Policy headers, password forms targeting HTTP, and HTTP resources referenced from an HTTPS page. Missing headers can be intentional or mitigated elsewhere. A finding requires context and manual verification.

ScraperPro does not perform exploit attempts, authentication tests, port scans or a comprehensive vulnerability assessment. An empty findings list does not establish that a page is secure.

## Troubleshooting

- **`python` or `py` is not found:** install Python 3.10 or later and reopen the terminal. On Windows, use the full `.venv\Scripts\python.exe` path shown above.
- **A dependency is missing:** confirm that you installed `requirements.txt` into the same virtual environment used to start the app.
- **Chromium is missing:** run the appropriate `python -m playwright install chromium` command above using that environment. Leave rendering disabled if you do not need JavaScript.
- **Port 8000 is in use:** stop the other process or change the port in `run.py`, then restart the app and use the matching address.
- **A run fails immediately on `robots.txt`:** inspect recent activity and confirm that the file is reachable and the site permits crawling. The crawler stops when it cannot verify the rules.
- **A page is missing or marked as an error:** check its origin, `robots.txt`, HTTP response, page limit and any authentication requirements. External URLs are recorded but not followed.
- **Results look incomplete:** check for `limited`, `stopped`, `failed` or `interrupted` status, page errors and `truncated` flags. The dashboard displays only the first 100 pages.
- **Database download returns 409:** wait for the active crawl to stop before downloading.

## Run the tests

From the project directory, after installing the requirements and Playwright Chromium:

```powershell
# Windows
.\.venv\Scripts\python.exe -m unittest discover -s tests -v
```

```bash
# macOS / Linux
.venv/bin/python -m unittest discover -s tests -v
```

The tests use a temporary local website and database. They cover link deduplication and scope, `robots.txt`, stored results, passive findings, the page cap and optional browser rendering. Browser rendering tests require a working Chromium installation.
