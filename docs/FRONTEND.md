# Frontend and motion notes

The frontend is served by the existing FastAPI app at `/`. No frontend framework, Node build, external font service or paid asset is needed. Start it with `python run.py` as described in the main README.

## Reference review

The supplied reference was https://traced.life/, reviewed on desktop and a 390 px mobile viewport. The review followed the opening hero, the long blur-led introduction, the difference carousel, process stages, closing sequence and expanded navigation; the product page was also inspected. The implementation recreates the observed visual behaviours with original ScraperPro graphics and copy. It does not bundle Traced’s photography, video, logos or source code.

| Observed behaviour                                                               | ScraperPro adaptation                                                                                     |
| -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Floating frosted navigation moves from centred to the top-left on desktop scroll | Compact Map / How it works / Results dock; stays centred on mobile                                        |
| Blurred background motion behind crisp foreground content                        | Slowly drifting sage fields with a sharp original SVG link network                                        |
| A horizontal trace line with moving dashes and changing labels                   | Decorative path markers and short text scrambles, separate from live results                              |
| Text fades from soft focus into place                                            | Blur/opacity/vertical reveal, about 0.85–1 second                                                         |
| Focused carousel card with blurred, scaled neighbours                            | Three feature cards with previous/next controls and arrow-key support; no autoplay                        |
| Scroll-controlled process image with numbered rails                              | Sticky Discover / Observe / Understand visual, crossfades between original diagrams and fills a step rail |
| Floating status labels and rounded report surfaces                               | Crawl summary, budget, observations and database action in soft cards                                     |
| Large rounded footer against a pastel field                                      | Simple project/API navigation, without unrelated commerce controls                                        |

Timings are independently chosen to match the observed feel rather than measurements of the reference’s code. Ordinary scrolling is preserved; there is no scroll hijacking or forced multi-second intro.

## UI behaviour

- The form posts to `/start`; Stop posts to `/stop`. Page limit, concurrency, request delay and optional browser rendering use the existing API bounds.
- The current/latest run is polled every 2.5 seconds without overlapping refreshes. Polling pauses in hidden tabs. Failed requests show a connection state, and old data stays visible until a successful response.
- Pages are paginated in batches of 25. The text filter applies only to the loaded batch, as its label says. Observations and severity filters also apply to that batch.
- Link edges are paginated in batches of 100. The diagram previews at most 40 edges from the current batch; the table carries full source/target URLs. Layout positions do not imply page depth or crawl order. External URLs may be recorded without being visited.
- The page-budget indicator shows recorded pages divided by the configured cap, including queued/error records. It is not a percentage of a website discovered or a promise of completion.
- Database download is disabled during an active crawl; it includes all database runs. A running crawl’s inputs are locked, and a pending stop stays disabled until active requests finish.
- Fetched titles, URLs, messages and finding descriptions are inserted with DOM text operations. Outgoing page links accept only HTTP(S) without embedded credentials. No page content is interpreted as frontend HTML.

## Motion and fallback

`static/motion.js` is separate from the data controls. Motion follows the device’s reduced-motion setting, including changes during a session. A user can pause it with the navigation control; this preference is kept in localStorage if available. Hero SVG motion, label timers and hero CSS animations pause when the hero is offscreen. Other animated panels pause when their sections are offscreen, and decorative animation pauses in hidden tabs. OS reduced-motion preferences take priority. Process stages and carousel selection remain functional with movement disabled.

All artwork is local SVG/CSS. If motion JavaScript is unavailable, feature cards remain a readable grid and content stays visible. API actions need JavaScript; a noscript notice links to the API reference. No analytics, autoplay audio, video or runtime CDN is introduced.

## Verification

Run `node --check static/script.js` and `node --check static/motion.js` for syntax. The existing crawler tests run with `python -m unittest discover -s tests -v`. Use an owned local fixture to verify the UI’s real data flow, including start/stop, limits, errors, pagination, filters, link graph, database download and lost/recovered connectivity. Review keyboard tab navigation, carousel controls, mobile overflow and motion pause/resume in the browser. Test artifacts, temporary databases and fixture servers should stay outside committed source.
