const SUMMARY_PATH = "history/summary.json";

const els = {
  overallStatus: document.querySelector("#overallStatus"),
  lastUpdated: document.querySelector("#lastUpdated"),
  operationalCount: document.querySelector("#operationalCount"),
  operationalMeta: document.querySelector("#operationalMeta"),
  avgLatency: document.querySelector("#avgLatency"),
  avgUptime: document.querySelector("#avgUptime"),
  serviceList: document.querySelector("#serviceList"),
  timeline: document.querySelector("#timeline"),
  statusPanel: document.querySelector(".status-panel"),
};

const formatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

// Live data source: the data branch (main) updates every ~5–30 min. Fetch from there at
// runtime so the page is always current — not the once-a-day build-time snapshot.
// Falls back to the bundled copy if the live fetch fails (offline / CORS / rate limit).
const DATA_BASE = "https://raw.githubusercontent.com/namoidhq/namoid-status/HEAD";

async function fetchLive(path) {
  try {
    const live = await fetch(`${DATA_BASE}/${path}?v=${Date.now()}`, { cache: "no-store" });
    if (live.ok) return live;
  } catch (_) {
    /* network / CORS / rate-limit hiccup — fall through to the bundled snapshot */
  }
  const local = await fetch(`./${path}?v=${Date.now()}`, { cache: "no-store" });
  if (!local.ok) throw new Error(`Unable to load ${path}`);
  return local;
}

async function fetchJson(path) {
  return (await fetchLive(path)).json();
}

async function fetchText(path) {
  return (await fetchLive(path)).text();
}

function readYamlValue(text, key) {
  const match = text.match(new RegExp(`^${key}:\\s*(.+)$`, "m"));
  return match?.[1]?.trim() ?? "";
}

function numberFromPercent(value) {
  return Number(String(value).replace("%", "")) || 0;
}

function formatMs(value) {
  const ms = Number(value) || 0;
  return `${Math.round(ms)}ms`;
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Updated recently";
  return formatter.format(date);
}

function serviceTone(service) {
  return service.status === "up" ? "Operational" : "Needs attention";
}

function makeBars(service) {
  const base = Math.max(12, Math.min(40, Number(service.timeWeek) / 40 || 16));
  return Array.from({ length: 18 }, (_, index) => {
    const variation = ((index * 7) % 13) - 5;
    const height = Math.max(10, Math.min(40, base + variation));
    return `<span style="height:${height}px"></span>`;
  }).join("");
}

function renderServices(services) {
  els.serviceList.innerHTML = services
    .map(
      (service) => `
        <article class="service-card ${service.status === "up" ? "" : "is-down"}">
          <div class="service-main">
            <div class="service-name">
              <span class="status-dot" aria-hidden="true"></span>
              <span>${service.name}</span>
            </div>
            <p class="service-url">${service.url}</p>
          </div>
          <div class="service-stat">
            <span>Status</span>
            <strong>${serviceTone(service)}</strong>
          </div>
          <div class="service-stat">
            <span>Latency</span>
            <strong>${formatMs(service.time)}</strong>
          </div>
          <div class="sparkline" aria-label="Recent response time profile">
            ${makeBars(service)}
          </div>
        </article>
      `,
    )
    .join("");
}

function renderMetrics(services) {
  const upCount = services.filter((service) => service.status === "up").length;
  const avgLatency =
    services.reduce((sum, service) => sum + (Number(service.time) || 0), 0) / Math.max(services.length, 1);
  const avgUptime =
    services.reduce((sum, service) => sum + numberFromPercent(service.uptimeMonth), 0) /
    Math.max(services.length, 1);
  const allUp = upCount === services.length;

  els.statusPanel.classList.toggle("is-down", !allUp);
  els.overallStatus.textContent = allUp ? "All systems operational" : "Service degradation detected";
  els.operationalCount.textContent = `${upCount}/${services.length}`;
  els.operationalMeta.textContent = allUp ? "services online" : "services available";
  els.avgLatency.textContent = formatMs(avgLatency);
  els.avgUptime.textContent = `${avgUptime.toFixed(2)}%`;
}

async function renderTimeline(services) {
  const histories = await Promise.all(
    services.map(async (service) => {
      const text = await fetchText(`history/${service.slug}.yml`).catch(() => "");
      return {
        ...service,
        responseTime: readYamlValue(text, "responseTime") || service.time,
        lastUpdated: readYamlValue(text, "lastUpdated"),
      };
    }),
  );

  const sorted = histories
    .filter((item) => item.lastUpdated)
    .sort((a, b) => new Date(b.lastUpdated) - new Date(a.lastUpdated));

  els.lastUpdated.textContent = sorted[0]
    ? `Last checked ${formatDate(sorted[0].lastUpdated)}`
    : "Latest monitor data loaded";

  els.timeline.innerHTML = sorted
    .slice(0, 6)
    .map(
      (item) => `
        <article class="timeline-item">
          <span class="timeline-marker" aria-hidden="true"></span>
          <div>
            <p class="timeline-title">${item.name} checked successfully</p>
            <p class="timeline-subtitle">HTTP 200 in ${formatMs(item.responseTime)}</p>
          </div>
          <time class="timeline-time" datetime="${item.lastUpdated}">${formatDate(item.lastUpdated)}</time>
        </article>
      `,
    )
    .join("");
}

async function boot() {
  try {
    const services = await fetchJson(SUMMARY_PATH);
    renderMetrics(services);
    renderServices(services);
    await renderTimeline(services);
  } catch (error) {
    els.statusPanel.classList.add("is-down");
    els.overallStatus.textContent = "Status data unavailable";
    els.lastUpdated.textContent = "Could not load the latest Upptime data";
    els.serviceList.innerHTML = `
      <article class="service-card is-down">
        <div class="service-main">
          <div class="service-name">
            <span class="status-dot" aria-hidden="true"></span>
            <span>Monitor data could not be loaded</span>
          </div>
          <p class="service-url">${error.message}</p>
        </div>
      </article>
    `;
  }
}

boot();

// Keep an open tab current: silently re-fetch live data every 60s. On a transient
// failure we keep the last good render instead of flashing the error state.
setInterval(() => {
  fetchJson(SUMMARY_PATH)
    .then((services) => {
      renderMetrics(services);
      renderServices(services);
      return renderTimeline(services);
    })
    .catch(() => {});
}, 60000);
