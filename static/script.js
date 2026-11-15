/* Existing FastAPI endpoints remain the source of every displayed crawl result. */
(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  function setText(id, value) {
    const text = String(value);
    if ($(id).textContent !== text) $(id).textContent = text;
  }
  const pageSize = 25,
    edgeSize = 100;
  let run = null,
    counts = {},
    running = false,
    connected = false;
  let pages = [],
    edges = [],
    offset = 0,
    edgeOffset = 0,
    tab = "pages";
  let connectionError = false;
  let acting = false,
    stopping = false,
    inFlight = false,
    epoch = 0,
    timer;
  let pageHasNext = false,
    edgeHasNext = false,
    lastPageSignature = "",
    lastEdgeSignature = "",
    lastLogsSignature = "";

  function message(text, error = false) {
    $("app-message").hidden = !text;
    setText("app-message", text);
    $("app-message").classList.toggle("error", error);
  }
  async function api(path, options = {}) {
    const response = await fetch(path, {
      ...options,
      signal: AbortSignal.timeout(12000),
      cache: "no-store",
    });
    const data = await response.json();
    if (!response.ok) {
      const detail = data.detail;
      throw Error(
        typeof detail === "string"
          ? detail
          : Array.isArray(detail)
            ? detail.map((x) => x.msg).join("; ")
            : "The request could not be completed.",
      );
    }
    return data;
  }
  function make(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }
  function safeLink(url, title) {
    const a = make("a", "", title || url);
    try {
      const parsed = new URL(url);
      if (
        !["http:", "https:"].includes(parsed.protocol) ||
        parsed.username ||
        parsed.password
      )
        throw Error();
      a.href = parsed.href;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
    } catch {
      a.removeAttribute("href");
    }
    return a;
  }
  function empty(body, text, title) {
    const tr = make("tr"),
      td = make("td", "empty-state");
    td.colSpan = 4;
    if (title) td.append(make("h3", "", title));
    td.append(make("p", "", text));
    tr.append(td);
    body.replaceChildren(tr);
  }
  function stateDescription(state) {
    return (
      {
        running: "Following links within your configured scope.",
        completed:
          "The discovered queue is exhausted. Review page errors and observations before drawing conclusions.",
        limited: "The page limit was reached. The recorded map is incomplete.",
        stopped: "Stopped at your request. The recorded map may be incomplete.",
        failed: "The crawl failed. Open Activity to review the reason.",
        interrupted:
          "The server stopped during this run. Start a new crawl to continue exploring.",
      }[state] || "Set your scope, then start a crawl."
    );
  }
  function updateControls() {
    $("start-btn").disabled = acting || running || !connected;
    $("stop-btn").disabled = acting || stopping || !running || !connected;
    setText("stop-btn", stopping ? "Stopping…" : "Stop crawl");
    ["seed-url", "max-pages", "concurrency", "delay", "render"].forEach(
      (id) => ($(id).disabled = acting || running),
    );
    $("download-db").setAttribute(
      "aria-disabled",
      String(!run || running || acting || !connected),
    );
  }
  function renderSummary() {
    const labels = {
      running: "Crawling",
      completed: "Completed",
      limited: "Page limit reached",
      stopped: "Stopped",
      failed: "Failed",
      interrupted: "Interrupted",
    };
    setText(
      "status-text",
      !connected
        ? "Connection unavailable"
        : run
          ? `${labels[run.state] || run.state} · Run ${run.id}`
          : "Ready to map",
    );
    $("status-dot").classList.toggle("running", running && connected);
    $("status-dot").classList.toggle("disconnected", !connected);
    setText(
      "live-caption",
      !connected
        ? "RECONNECTING"
        : run
          ? running
            ? "LIVE CRAWL"
            : "RECORDED RUN"
          : "WAITING FOR A CRAWL",
    );
    setText("run-seed", run?.seed || "Your starting URL will appear here.");
    setText(
      "run-id",
      run
        ? `RUN ${String(run.id).padStart(2, "0")} / ${run.render ? "BROWSER" : "HTTP"}`
        : "NO CRAWL YET",
    );
    setText("visited-count", run ? String(counts.visited || 0) : "—");
    setText("queued-count", run ? String(counts.queued || 0) : "—");
    setText("error-count", run ? String(counts.error || 0) : "—");
    const total = Object.values(counts).reduce((a, b) => a + Number(b), 0);
    $("budget-progress").value = run ? total : 0;
    $("budget-progress").max = run?.max_pages || 100;
    setText(
      "budget-label",
      run
        ? `${total.toLocaleString()} / ${run.max_pages.toLocaleString()}`
        : "Waiting",
    );
    setText(
      "run-description",
      stopping
        ? "A stop is requested. Active requests finish first."
        : stateDescription(run?.state),
    );
    updateControls();
    updatePageCount();
  }
  function updatePageCount() {
    const query = $("page-search").value.trim().toLowerCase();
    const matches = pages.filter(
      (p) =>
        !query ||
        `${p.url} ${p.title || ""} ${p.status_code || ""}`
          .toLowerCase()
          .includes(query),
    ).length;
    setText(
      "result-count",
      run
        ? `${matches} of ${pages.length} loaded pages${query ? " match this filter" : ""}. ${Number(counts.visited || 0).toLocaleString()} visited in this run.`
        : "Your pages will appear here.",
    );
  }
  function renderPages() {
    const body = document.querySelector("#results-table tbody");
    const query = $("page-search").value.trim().toLowerCase();
    const filtered = pages.filter(
      (page) =>
        !query ||
        `${page.url} ${page.title || ""} ${page.status_code || ""}`
          .toLowerCase()
          .includes(query),
    );
    setText(
      "result-count",
      run
        ? `${filtered.length} of ${pages.length} loaded pages${query ? " match this filter" : ""}. ${Number(counts.visited || 0).toLocaleString()} visited in this run.`
        : "Your pages will appear here.",
    );
    if (!filtered.length) {
      empty(
        body,
        query
          ? "Try another URL, title or response code on this results page."
          : run
            ? "Pages will appear as the crawler records them."
            : "Start a crawl to see the pages and their connections.",
        query ? "No matches on this page." : "A map waiting to happen.",
      );
      return;
    }
    const openDetails = new Set(
      [...body.querySelectorAll("details[open]")].map((x) => x.dataset.url),
    );
    const fragment = document.createDocumentFragment();
    for (const page of filtered) {
      const tr = make("tr"),
        pageCell = make("td");
      const link = safeLink(page.url, page.title || page.url);
      link.className = "page-title";
      pageCell.append(link, make("span", "page-url", page.url));
      if (page.error) pageCell.append(make("p", "error-text", page.error));
      if (page.truncated)
        pageCell.append(
          make("p", "error-text", "Response truncated at the page-size limit."),
        );
      const status = make("td");
      status.append(
        make(
          "span",
          `response-badge ${page.state === "error" || page.status_code >= 400 ? "error" : page.state === "queued" ? "queued" : ""}`,
          String(page.status_code || page.state),
        ),
      );
      const observations = make("td");
      if (page.findings.length) {
        const details = make("details", "page-detail");
        details.dataset.url = page.url;
        details.open = openDetails.has(page.url);
        details.append(
          make(
            "summary",
            "",
            `${page.findings.length} observation${page.findings.length === 1 ? "" : "s"}`,
          ),
        );
        const list = make("ul");
        page.findings.forEach((f) =>
          list.append(make("li", "", `${f.severity}: ${f.description}`)),
        );
        details.append(list);
        observations.append(details);
      } else
        observations.append(
          make(
            "span",
            "no-findings",
            page.state === "queued" ? "Not fetched yet" : "None reported",
          ),
        );
      tr.append(
        pageCell,
        status,
        observations,
        make("td", "", String(page.depth)),
      );
      fragment.append(tr);
    }
    body.replaceChildren(fragment);
  }
  function renderFindings() {
    const filter = $("severity").value;
    const entries = pages
      .flatMap((page) => page.findings.map((f) => ({ ...f, url: page.url })))
      .filter((f) => filter === "all" || f.severity === filter);
    const list = $("findings-list");
    if (!entries.length) {
      list.replaceChildren(
        make(
          "p",
          "empty-state",
          "No matching observations on this loaded page. This is not a security assurance.",
        ),
      );
      return;
    }
    const frag = document.createDocumentFragment();
    for (const finding of entries) {
      const article = make("article", "finding"),
        text = make("div");
      article.append(
        make(
          "span",
          `severity ${["high", "medium", "low", "info"].includes(finding.severity) ? finding.severity : "info"}`,
          finding.severity,
        ),
      );
      text.append(
        make("h3", "", finding.code.replaceAll("_", " ")),
        make("p", "", finding.description),
        safeLink(finding.url, finding.url),
      );
      article.append(text);
      frag.append(article);
    }
    list.replaceChildren(frag);
  }
  function svgElement(name, attrs = {}, text) {
    const el = document.createElementNS("http://www.w3.org/2000/svg", name);
    Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, String(v)));
    if (text !== undefined) el.textContent = text;
    return el;
  }
  function renderLinks() {
    const body = $("links-body");
    body.replaceChildren();
    if (!edges.length) {
      setText("link-caption", "No recorded relationships on this page.");
      $("link-graph").replaceChildren(
        make(
          "p",
          "empty-state",
          "Connections appear as linked pages are discovered.",
        ),
      );
      return;
    }
    for (const edge of edges) {
      const row = make("tr"),
        source = make("td"),
        target = make("td");
      source.append(safeLink(edge.source_url));
      target.append(safeLink(edge.target_url));
      row.append(
        source,
        target,
        make("td", "", edge.internal ? "Same origin" : "External"),
      );
      body.append(row);
    }
    const shown = edges.slice(0, 40),
      urls = [...new Set(shown.flatMap((e) => [e.source_url, e.target_url]))];
    const height = Math.max(300, Math.ceil(urls.length / 7) * 85 + 65),
      width = 900;
    const svg = svgElement("svg", {
      viewBox: `0 0 ${width} ${height}`,
      role: "img",
      "aria-label": `Relationship overview for ${shown.length} recorded links. The table below lists their full URLs.`,
    });
    const defs = svgElement("defs"),
      marker = svgElement("marker", {
        id: "edge-arrow",
        viewBox: "0 0 8 8",
        refX: 7,
        refY: 4,
        markerWidth: 5,
        markerHeight: 5,
        orient: "auto",
      });
    marker.append(
      svgElement("path", { d: "M 0 0 L 8 4 L 0 8 z", fill: "#a5b98a" }),
    );
    defs.append(marker);
    svg.append(defs);
    const points = new Map(
      urls.map((url, i) => [
        url,
        { x: 65 + (i % 7) * 127, y: 55 + Math.floor(i / 7) * 85 },
      ]),
    );
    for (const edge of shown) {
      const a = points.get(edge.source_url),
        b = points.get(edge.target_url);
      const cx = (a.x + b.x) / 2,
        cy = Math.min(a.y, b.y) - 25,
        dx = b.x - cx,
        dy = b.y - cy,
        distance = Math.hypot(dx, dy) || 1;
      const bx = b.x - (dx / distance) * 21,
        by = b.y - (dy / distance) * 21;
      const path =
        a === b
          ? `M ${a.x - 12} ${a.y - 12} C ${a.x - 60} ${a.y - 65} ${a.x + 60} ${a.y - 65} ${a.x + 12} ${a.y - 15}`
          : `M ${a.x} ${a.y} Q ${cx} ${cy} ${bx} ${by}`;
      const curve = svgElement("path", {
        d: path,
        class: "graph-edge",
        "marker-end": "url(#edge-arrow)",
      });
      svg.append(curve);
    }
    urls.forEach((url, i) => {
      const p = points.get(url),
        isExternal =
          !edges.some((e) => e.target_url === url && e.internal) &&
          !edges.some((e) => e.source_url === url);
      const group = svgElement("g");
      group.append(
        svgElement("title", {}, url),
        svgElement("circle", {
          cx: p.x,
          cy: p.y,
          r: 17,
          class: `graph-node${isExternal ? " external" : ""}`,
        }),
        svgElement(
          "text",
          { x: p.x, y: p.y + 4, "text-anchor": "middle" },
          String(i + 1).padStart(2, "0"),
        ),
      );
      let short;
      try {
        const parsed = new URL(url);
        short = parsed.pathname === "/" ? parsed.hostname : parsed.pathname;
      } catch {
        short = url;
      }
      group.append(
        svgElement(
          "text",
          { x: p.x, y: p.y + 34, "text-anchor": "middle" },
          short.length > 17 ? short.slice(0, 15) + "…" : short,
        ),
      );
      svg.append(group);
    });
    $("link-graph").replaceChildren(svg);
    setText(
      "link-caption",
      `Showing ${edges.length} recorded edges. Diagram previews the first ${shown.length}; arrows and positions do not imply crawl order.`,
    );
  }
  function pagination() {
    const isLinks = tab === "links",
      start = isLinks ? edgeOffset : offset,
      size = isLinks ? edges.length : pages.length;
    $("pagination").hidden = tab === "activity";
    setText(
      "page-label",
      size
        ? `${isLinks ? "Edges" : "Pages"} ${start + 1}–${start + size}${tab === "findings" ? " · observations from these pages" : ""}`
        : "No records on this page",
    );
    $("previous-page").disabled = !run || start === 0 || inFlight;
    $("next-page").disabled =
      !run || !(isLinks ? edgeHasNext : pageHasNext) || inFlight;
  }
  function renderLogs(logs) {
    const signature = JSON.stringify(logs);
    if (signature === lastLogsSignature) return;
    lastLogsSignature = signature;
    const container = $("logs-container"),
      nearBottom =
        container.scrollTop + container.clientHeight >=
        container.scrollHeight - 40;
    if (!logs.length) {
      container.replaceChildren(
        make("p", "empty-state", "No activity messages are available."),
      );
      return;
    }
    const frag = document.createDocumentFragment();
    logs.forEach((log) => {
      const row = make("div", "log-line");
      row.append(
        make("span", "log-time", log.time),
        make("span", "", log.message),
      );
      frag.append(row);
    });
    container.replaceChildren(frag);
    if (nearBottom) container.scrollTop = container.scrollHeight;
  }
  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(refresh, 2500);
  }
  async function refresh() {
    if (inFlight || acting) return;
    if (document.hidden) {
      schedule();
      return;
    }
    inFlight = true;
    const version = epoch;
    pagination();
    try {
      const status = await api("/status");
      if (version !== epoch) return;
      if (connectionError) {
        message("Connection restored.");
        connectionError = false;
      }
      const previousId = run?.id;
      run = status.run;
      counts = status.counts;
      running = status.is_running;
      connected = true;
      if (!running) stopping = false;
      if (previousId !== run?.id) {
        offset = 0;
        edgeOffset = 0;
        pages = [];
        edges = [];
        lastPageSignature = "";
        lastEdgeSignature = "";
      }
      renderSummary();
      renderLogs(status.logs);
      if (run) {
        const requested = await api(
          `/results?run_id=${run.id}&limit=${pageSize + 1}&offset=${offset}`,
        );
        if (version !== epoch) return;
        pageHasNext = requested.length > pageSize;
        pages = requested.slice(0, pageSize);
        const signature = JSON.stringify(pages);
        if (signature !== lastPageSignature) {
          lastPageSignature = signature;
          renderPages();
          renderFindings();
        }
        if (tab === "links") {
          const links = await api(
            `/links?run_id=${run.id}&limit=${edgeSize + 1}&offset=${edgeOffset}`,
          );
          if (version !== epoch) return;
          edgeHasNext = links.length > edgeSize;
          edges = links.slice(0, edgeSize);
          const edgeSignature = JSON.stringify(edges);
          if (edgeSignature !== lastEdgeSignature) {
            lastEdgeSignature = edgeSignature;
            renderLinks();
          }
        }
      } else {
        pages = [];
        pageHasNext = false;
        if (lastPageSignature !== "empty") {
          renderPages();
          lastPageSignature = "empty";
        }
      }
    } catch (error) {
      if (version !== epoch) return;
      connected = false;
      connectionError = true;
      renderSummary();
      message(
        `Unable to refresh the workspace. Check that the local server is running. ${error.message}`,
        true,
      );
    } finally {
      inFlight = false;
      $("results-loading").hidden = true;
      pagination();
      schedule();
    }
  }
  $("crawl-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (acting || running) return;
    const payload = {
      url: $("seed-url").value.trim(),
      max_pages: Number($("max-pages").value),
      concurrency: Number($("concurrency").value),
      delay: Number($("delay").value),
      render: $("render").checked,
    };
    acting = true;
    epoch++;
    updateControls();
    message("");
    try {
      await api("/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      message(
        "Crawl started. The workspace will update as pages are recorded.",
      );
    } catch (error) {
      message(error.message, true);
    } finally {
      acting = false;
      updateControls();
      if (!inFlight) refresh();
      else schedule();
    }
  });
  $("stop-btn").addEventListener("click", async () => {
    if (acting || !running) return;
    acting = true;
    epoch++;
    updateControls();
    try {
      await api("/stop", { method: "POST" });
      stopping = true;
      message(
        "Stop requested. Active requests finish before the crawl closes.",
      );
    } catch (error) {
      message(error.message, true);
    } finally {
      acting = false;
      updateControls();
      if (!inFlight) refresh();
      else schedule();
    }
  });
  $("download-db").addEventListener("click", (event) => {
    if ($("download-db").getAttribute("aria-disabled") === "true")
      event.preventDefault();
  });
  function selectTab(value, focus = false) {
    tab = value;
    document.querySelectorAll("[data-tab]").forEach((button) => {
      const active = button.dataset.tab === tab;
      button.setAttribute("aria-selected", String(active));
      button.tabIndex = active ? 0 : -1;
      if (active && focus) button.focus();
    });
    ["pages", "findings", "links", "activity"].forEach(
      (value) => ($("panel-" + value).hidden = value !== tab),
    );
    pagination();
    if (tab === "links" && !inFlight) refresh();
  }
  document.querySelector(".result-tabs").addEventListener("click", (event) => {
    const button = event.target.closest("[data-tab]");
    if (button) selectTab(button.dataset.tab);
  });
  document
    .querySelector(".result-tabs")
    .addEventListener("keydown", (event) => {
      const values = ["pages", "findings", "links", "activity"],
        index = values.indexOf(tab);
      if (["ArrowRight", "ArrowLeft", "Home", "End"].includes(event.key)) {
        event.preventDefault();
        selectTab(
          event.key === "Home"
            ? values[0]
            : event.key === "End"
              ? values[3]
              : values[(index + (event.key === "ArrowRight" ? 1 : 3)) % 4],
          true,
        );
      }
    });
  $("page-search").addEventListener("input", renderPages);
  $("severity").addEventListener("change", renderFindings);
  async function page(direction) {
    if (inFlight || !run) return;
    epoch++;
    const isLinks = tab === "links";
    if (isLinks) {
      edgeOffset = Math.max(0, edgeOffset + direction * edgeSize);
      lastEdgeSignature = "";
    } else {
      offset = Math.max(0, offset + direction * pageSize);
      lastPageSignature = "";
    }
    $("results-loading").hidden = false;
    await refresh();
  }
  $("previous-page").addEventListener("click", () => page(-1));
  $("next-page").addEventListener("click", () => page(1));
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) refresh();
  });
  refresh();
})();
