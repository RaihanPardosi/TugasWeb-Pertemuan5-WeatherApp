"use strict";

// ====== KONFIGURASI ======
// Ganti dengan API key OpenWeatherMap kamu (https://openweathermap.org/api)
const API_KEY = "ISI_API_KEY_KAMU_DISINI";
const BASE_URL = "https://api.openweathermap.org/data/2.5";
const HISTORY_KEY = "weather_history";
const UNIT_KEY = "weather_unit";
const MAX_HISTORY = 5;

const $ = (id) => document.getElementById(id);
const state = { unit: "C", current: null, forecast: null };

// ====== LOCALSTORAGE (aman dari error) ======
const store = {
  get: (key, fallback) => {
    try {
      const raw = localStorage.getItem(key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch { return fallback; }
  },
  set: (key, value) => {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* abaikan */ }
  }
};

// ====== IKON SVG ======
const cloudPath = (y = 0, fill = "url(#gCloud)") =>
  `<path transform="translate(0 ${y})" d="M20 40h26a9 9 0 0 0 1-17.9A13 13 0 0 0 21 24a8 8 0 0 0-1 16z" fill="${fill}"/>`;

const sunShape = (cx, cy, r, rayLen) => {
  const rays = Array.from({ length: 8 }, (_, i) => {
    const a = (i * Math.PI) / 4;
    const p = (d) => `${(cx + Math.cos(a) * d).toFixed(1)}`;
    const q = (d) => `${(cy + Math.sin(a) * d).toFixed(1)}`;
    return `<line x1="${p(r + 4)}" y1="${q(r + 4)}" x2="${p(r + 4 + rayLen)}" y2="${q(r + 4 + rayLen)}"/>`;
  }).join("");
  return `<g stroke="#ffc93c" stroke-width="3" stroke-linecap="round">${rays}</g><circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#gSun)"/>`;
};

const moonShape = `<path d="M40 12a19 19 0 1 0 13 32A17 17 0 0 1 40 12z" fill="url(#gMoon)"/>`;
const drops = `<g stroke="#4aa8ff" stroke-width="3" stroke-linecap="round"><line x1="24" y1="48" x2="21" y2="56"/><line x1="34" y1="48" x2="31" y2="56"/><line x1="44" y1="48" x2="41" y2="56"/></g>`;
const flakes = `<g fill="#fff"><circle cx="24" cy="52" r="2.5"/><circle cx="34" cy="55" r="2.5"/><circle cx="44" cy="52" r="2.5"/></g>`;
const bolt = `<polygon points="35,42 26,54 32,54 30,63 41,48 35,48" fill="#ffc93c"/>`;
const mist = `<g stroke="#c9cfe8" stroke-width="3.5" stroke-linecap="round"><line x1="14" y1="24" x2="50" y2="24"/><line x1="10" y1="34" x2="46" y2="34"/><line x1="16" y1="44" x2="54" y2="44"/></g>`;

const getIcon = (code = "01d") => {
  const night = code.endsWith("n");
  const type = code.slice(0, 2);
  const shapes = {
    "01": night ? moonShape : sunShape(32, 32, 12, 6),
    "02": (night ? `<g transform="translate(-6 -2) scale(.7)">${moonShape}</g>` : sunShape(24, 22, 8, 4)) + cloudPath(6),
    "03": cloudPath(0),
    "04": cloudPath(-4, "url(#gCloudD)") + cloudPath(4),
    "09": cloudPath(-4, "url(#gCloudD)") + drops,
    "10": cloudPath(-4, "url(#gCloudD)") + drops,
    "11": cloudPath(-6, "url(#gCloudD)") + bolt,
    "13": cloudPath(-4) + flakes,
    "50": mist
  };
  return `<svg viewBox="0 0 64 64" aria-hidden="true">${shapes[type] ?? cloudPath(0)}</svg>`;
};

const badgeClass = (code) => {
  const type = code.slice(0, 2), night = code.endsWith("n");
  if (["01", "02"].includes(type)) return night ? "moon" : "sun";
  if (["09", "10", "11", "13"].includes(type)) return "rain";
  return "cloud";
};

// ====== HELPER ======
const escapeHTML = (str) =>
  String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const titleCase = (s) => s.replace(/(^|\s)\p{L}/gu, (m) => m.toUpperCase());
const toUnit = (c) => Math.round(state.unit === "C" ? c : (c * 9) / 5 + 32);
const fmtTemp = (c) => `${toUnit(c)}\u00B0`;
const localDate = (dt, tz) => new Date((dt + tz) * 1000); // dibaca dengan getUTC* / timeZone UTC

const showError = (msg) => { $("errorText").textContent = msg; $("error").classList.add("show"); };
const clearError = () => $("error").classList.remove("show");

const setMenu = (open) => {
  $("menu").classList.toggle("open", open);
  $("menuBtn").setAttribute("aria-expanded", String(open));
};

const setLoading = (on) => {
  $("loading").classList.toggle("show", on);
  $("btn").disabled = on;
  if (on) { $("empty").classList.add("hidden"); $("result").classList.add("hidden"); }
};

const tickClock = () => {
  const t = new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", hour12: false }).replace(".", ":");
  $("clock").textContent = t;
  $("clock2").textContent = t;
};

// ====== RIWAYAT ======
const getHistory = () => store.get(HISTORY_KEY, []);

const saveHistory = (city) => {
  const list = [city, ...getHistory().filter((c) => c.toLowerCase() !== city.toLowerCase())].slice(0, MAX_HISTORY);
  store.set(HISTORY_KEY, list);
  renderHistory();
};

const renderHistory = () => {
  const list = getHistory();
  $("history").innerHTML = list.length
    ? list.map((c) => `<button type="button" class="chip" data-city="${escapeHTML(c)}">${escapeHTML(c)}</button>`).join("") +
      `<button type="button" class="chip clear" data-clear="1">Hapus riwayat</button>`
    : "";
};

// ====== FETCH ======
const request = async (endpoint, city) => {
  const url = `${BASE_URL}/${endpoint}?q=${encodeURIComponent(city)}&units=metric&lang=id&appid=${API_KEY}`;
  const res = await fetch(url);
  if (res.status === 404) throw new Error("NOT_FOUND");
  if (res.status === 401) throw new Error("BAD_KEY");
  if (!res.ok) throw new Error("HTTP_" + res.status);
  return res.json();
};

const fetchWeather = async (city) => {
  clearError();
  if (!city.trim()) { showError("Masukkan nama kota terlebih dahulu."); return; }
  if (API_KEY === "ISI_API_KEY_KAMU_DISINI") {
    showError("API key belum diisi. Isi konstanta API_KEY di dalam index.html.");
    return;
  }
  setMenu(false);
  setLoading(true);
  try {
    const [current, forecast] = await Promise.all([request("weather", city.trim()), request("forecast", city.trim())]);
    state.current = current;
    state.forecast = forecast;
    saveHistory(current.name);
    $("city").value = "";
    render();
  } catch (err) {
    $("empty").classList.toggle("hidden", Boolean(state.current));
    $("result").classList.toggle("hidden", !state.current);
    if (err.message === "NOT_FOUND") showError(`Kota "${city.trim()}" tidak ditemukan. Periksa penulisan nama kota.`);
    else if (err.message === "BAD_KEY") showError("API key tidak valid atau belum aktif. Key baru biasanya aktif setelah beberapa menit.");
    else if (err instanceof TypeError) showError("Gagal terhubung ke server. Periksa koneksi internet kamu.");
    else showError("Terjadi kesalahan saat mengambil data. Coba lagi nanti.");
  } finally {
    setLoading(false);
  }
};

// ====== RENDER ======
const groupByDay = (list, tz) =>
  list.reduce((acc, item) => {
    const key = localDate(item.dt, tz).toISOString().slice(0, 10);
    (acc[key] ??= []).push(item);
    return acc;
  }, {});

const render = () => {
  const { current: c, forecast: f } = state;
  if (!c || !f) return;
  const tz = c.timezone;
  const w = c.weather[0];
  const d = localDate(c.dt, tz);

  $("cityName").textContent = `${c.name}, ${c.sys.country}`;
  $("bigIcon").innerHTML = getIcon(w.icon);
  $("title").textContent = titleCase(w.description);
  $("date").textContent =
    d.toLocaleDateString("id-ID", { weekday: "long", timeZone: "UTC" }) + " " +
    d.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  $("tempNum").textContent = toUnit(c.main.temp);

  // tiga kartu kecil
  const miniIcons = ["03d", "09d", "02d"];
  const miniVals = [`${c.clouds.all}%`, `${c.main.humidity}%`, `${Math.round(c.wind.speed * 3.6)} km/j`];
  const miniLabels = ["AWAN", "LEMBAB", "ANGIN"];
  document.querySelector(".mini").innerHTML = miniIcons.map((ic, i) =>
    `<div>${getIcon(ic)}<span>${miniVals[i]}</span><small>${miniLabels[i]}</small></div>`).join("");

  // per jam: kartu "Sekarang" + 4 data forecast
  const hourItems = [
    { label: "Sekarang", icon: w.icon, temp: c.main.temp, now: true },
    ...f.list.slice(0, 4).map((h) => ({
      label: `${String(localDate(h.dt, tz).getUTCHours()).padStart(2, "0")}:00`,
      icon: h.weather[0].icon, temp: h.main.temp, now: false
    }))
  ];
  $("hours").innerHTML = hourItems.map((h) => `
    <div class="hour${h.now ? " now" : ""}">
      <div class="badge ${badgeClass(h.icon)}">${getIcon(h.icon)}</div>
      <span>${h.label}</span><b>${fmtTemp(h.temp)}</b>
    </div>`).join("");

  // 5 hari: kelompokkan per tanggal pakai reduce
  const days = Object.entries(groupByDay(f.list, tz)).slice(0, 5).map(([key, items]) => {
    const noon = items.reduce((a, b) =>
      Math.abs(localDate(b.dt, tz).getUTCHours() - 12) < Math.abs(localDate(a.dt, tz).getUTCHours() - 12) ? b : a);
    return {
      name: new Date(key + "T00:00:00Z").toLocaleDateString("id-ID", { weekday: "long", timeZone: "UTC" }),
      desc: noon.weather[0].description,
      icon: noon.weather[0].icon,
      min: Math.min(...items.map((i) => i.main.temp_min)),
      max: Math.max(...items.map((i) => i.main.temp_max)),
      humid: Math.round(items.reduce((s, i) => s + i.main.humidity, 0) / items.length),
      pop: Math.round(Math.max(...items.map((i) => i.pop ?? 0)) * 100)
    };
  });

  const [first, ...rest] = days;
  $("hl").innerHTML = `
    <div class="ico">${getIcon(first.icon)}</div>
    <h3>${escapeHTML(first.name)}</h3>
    <div class="d">${escapeHTML(first.desc)}</div>
    <div class="row">
      <div>${fmtTemp(first.max)}<small>Maks</small></div>
      <div>${fmtTemp(first.min)}<small>Min</small></div>
      <div>${first.humid}%<small>Lembab</small></div>
      <div>${escapeHTML(c.name)}<small>${escapeHTML(c.sys.country)}</small></div>
    </div>`;

  $("list").innerHTML = rest.map((x) => `
    <div class="li">
      <div class="n">${escapeHTML(x.name)},<small>${escapeHTML(x.desc)}</small></div>
      <div class="p">${getIcon(x.icon)}<span>${x.pop}%</span></div>
    </div>`).join("");

  $("empty").classList.add("hidden");
  $("result").classList.remove("hidden");
  $("weekEmpty").classList.add("hidden");
  $("weekBody").classList.remove("hidden");
};

// ====== EVENT ======
$("form").addEventListener("submit", (e) => { e.preventDefault(); fetchWeather($("city").value); });
$("menuBtn").addEventListener("click", () => setMenu(!$("menu").classList.contains("open")));
document.addEventListener("keydown", (e) => { if (e.key === "Escape") setMenu(false); });

$("history").addEventListener("click", (e) => {
  const btn = e.target.closest("button");
  if (!btn) return;
  if (btn.dataset.clear) { store.set(HISTORY_KEY, []); renderHistory(); }
  else if (btn.dataset.city) fetchWeather(btn.dataset.city);
});

document.querySelector(".units").addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-unit]");
  if (!btn) return;
  state.unit = btn.dataset.unit;
  store.set(UNIT_KEY, state.unit);
  document.querySelectorAll(".units button").forEach((b) => b.classList.toggle("active", b === btn));
  render();
});

// ====== INIT ======
const init = () => {
  state.unit = store.get(UNIT_KEY, "C") === "F" ? "F" : "C";
  document.querySelectorAll(".units button").forEach((b) => b.classList.toggle("active", b.dataset.unit === state.unit));
  tickClock();
  setInterval(tickClock, 30000);
  renderHistory();
  const [last] = getHistory();
  if (last) fetchWeather(last); else setMenu(true);
};
init();
