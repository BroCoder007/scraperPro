/* Motion is decorative. Crawling and result rendering live in script.js. */
(() => {
  "use strict";
  const root = document.documentElement;
  const preference = matchMedia("(prefers-reduced-motion: reduce)");
  const control = document.getElementById("motion-toggle");
  const hero = document.querySelector(".hero");
  const steps = [...document.querySelectorAll(".process-step")];
  const visuals = [...document.querySelectorAll(".process-card")];
  let manualPause = false;
  try {
    manualPause = localStorage.getItem("scraperpro-motion") === "off";
  } catch {}
  const paused = () => manualPause || preference.matches;
  let heroVisible = true,
    labelTimer = 0,
    scrambleTimer = 0,
    cycle = 0;
  const words = ["FOLLOW THE LINKS", "READ THE CONNECTIONS", "KEEP THE DATA"];
  const label = document.querySelector("[data-cycle]");
  function stopLabels() {
    clearInterval(labelTimer);
    clearInterval(scrambleTimer);
    label.textContent = words[cycle];
  }
  function startLabels() {
    stopLabels();
    if (paused() || !heroVisible || document.hidden) return;
    labelTimer = setInterval(() => {
      cycle = (cycle + 1) % words.length;
      const text = words[cycle];
      let tick = 0;
      clearInterval(scrambleTimer);
      scrambleTimer = setInterval(() => {
        tick++;
        label.textContent = [...text]
          .map((c, i) =>
            c === " " || i < tick * 3
              ? c
              : "ABCDEFGHIJKLMNOPQRSTUVWXYZ"[(i * 7 + tick * 11) % 26],
          )
          .join("");
        if (tick * 3 >= text.length) {
          clearInterval(scrambleTimer);
          label.textContent = text;
        }
      }, 45);
    }, 5500);
  }
  function sync() {
    root.classList.toggle("motion-paused", paused());
    root.classList.toggle("hero-idle", !heroVisible || document.hidden);
    root.classList.toggle("tab-idle", document.hidden);
    control.hidden = false;
    control.disabled = preference.matches;
    control.setAttribute("aria-pressed", String(paused()));
    control.textContent = preference.matches
      ? "Reduced motion"
      : paused()
        ? "Play motion"
        : "Pause motion";
    control.setAttribute(
      "aria-label",
      preference.matches
        ? "Motion follows your device preference"
        : paused()
          ? "Resume decorative motion"
          : "Pause decorative motion",
    );
    document.querySelectorAll("svg").forEach((svg) => {
      if (paused() || !heroVisible || document.hidden) svg.pauseAnimations?.();
      else svg.unpauseAnimations?.();
    });
    startLabels();
  }
  control.addEventListener("click", () => {
    manualPause = !manualPause;
    try {
      localStorage.setItem("scraperpro-motion", manualPause ? "off" : "on");
    } catch {}
    sync();
  });
  preference.addEventListener("change", sync);
  document.addEventListener("visibilitychange", sync);
  if ("IntersectionObserver" in window) {
    const reveal = new IntersectionObserver(
      (entries) =>
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("visible");
            reveal.unobserve(entry.target);
          }
        }),
      { threshold: 0.08 },
    );
    document.querySelectorAll(".reveal").forEach((el) => reveal.observe(el));
    root.classList.add("reveal-ready");
    const offscreen = new IntersectionObserver((entries) =>
      entries.forEach((entry) =>
        entry.target.classList.toggle("is-idle", !entry.isIntersecting),
      ),
    );
    document
      .querySelectorAll(".process-visual,.carousel")
      .forEach((el) => offscreen.observe(el));
    new IntersectionObserver(
      (entries) => {
        heroVisible = entries[0].isIntersecting;
        sync();
      },
      { threshold: 0 },
    ).observe(hero);
  }
  let ticking = false;
  function scrollUpdate() {
    ticking = false;
    root.classList.toggle("scrolled", scrollY > 80);
    root.style.setProperty(
      "--hero-y",
      paused() ? "0px" : `${Math.min(80, scrollY * 0.13)}px`,
    );
    const target = innerHeight * (innerWidth < 700 ? 0.75 : 0.5);
    const rects = steps.map((step) => step.getBoundingClientRect());
    let current = 0,
      nearest = Infinity;
    rects.forEach((rect, i) => {
      const distance = Math.abs(rect.top + rect.height * 0.35 - target);
      if (distance < nearest) {
        current = i;
        nearest = distance;
      }
    });
    steps.forEach((step, i) => {
      step.classList.toggle("active", i === current);
      const fill = Math.max(
        0,
        Math.min(1, (target - rects[i].top) / rects[i].height),
      );
      step.style.setProperty("--step-fill", `${Math.round(fill * 100)}%`);
      visuals[i].classList.toggle("active", i === current);
    });
  }
  addEventListener(
    "scroll",
    () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(scrollUpdate);
      }
    },
    { passive: true },
  );
  addEventListener("resize", scrollUpdate, { passive: true });
  sync();
  scrollUpdate();

  // One focused card; neighbouring cards remain a visual hint. No autoplay.
  const carousel = document.querySelector(".carousel");
  const track = carousel.querySelector(".carousel-track");
  const slides = [...carousel.querySelectorAll(".learn-card")];
  const previous = document.getElementById("slide-prev");
  const next = document.getElementById("slide-next");
  let active = 0;
  carousel.classList.add("enhanced-carousel");
  document.querySelector(".carousel-controls").hidden = false;
  function show(index) {
    active = Math.max(0, Math.min(slides.length - 1, index));
    const width = slides[0].offsetWidth;
    const gap = parseFloat(getComputedStyle(track).gap) || 0;
    const x = carousel.clientWidth / 2 - width / 2 - active * (width + gap);
    track.style.transform = `translateX(${x}px)`;
    slides.forEach((slide, i) => {
      slide.classList.toggle("active", i === active);
      slide.setAttribute("aria-hidden", String(i !== active));
    });
    previous.disabled = active === 0;
    next.disabled = active === slides.length - 1;
    document.getElementById("slide-status").textContent =
      `${active + 1} of ${slides.length}`;
  }
  previous.addEventListener("click", () => show(active - 1));
  next.addEventListener("click", () => show(active + 1));
  document.querySelector(".explore").addEventListener("keydown", (event) => {
    if (event.key === "ArrowRight") {
      event.preventDefault();
      show(active + 1);
    }
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      show(active - 1);
    }
  });
  if ("ResizeObserver" in window)
    new ResizeObserver(() => show(active)).observe(carousel);
  else addEventListener("resize", () => show(active), { passive: true });
  show(0);
})();
