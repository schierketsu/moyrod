"use strict";

const path = require("path");
const fs = require("fs");
const express = require("express");
const Database = require("better-sqlite3");

/**
 * Подсказки населённых пунктов: Photon (OSM), запасной Open-Meteo.
 * Строка: «Страна - Область - Населённый пункт».
 * @see https://github.com/komoot/photon
 */
const PHOTON_SEARCH = "https://photon.komoot.io/api/";
const GEO_FETCH_TIMEOUT_MS = 8000;
const GEO_USER_AGENT = "SvoiKorni/1.0 (genealogy app; https://github.com/)";

const suggestCache = new Map();
const SUGGEST_CACHE_TTL_MS = 10 * 60 * 1000;
const SUGGEST_CACHE_MAX = 200;
let lastSuggestUpstreamAt = 0;
const SUGGEST_MIN_INTERVAL_MS = 600;

const CYRILLIC_RE = /[\u0400-\u04FF]/;

/** Строго: «Страна - Область - Населённый пункт» (пустые звенья пропускаем, порядок сохраняем). */
function joinCountryRegionSettlement(country, region, settlement) {
  const c = String(country || "").trim();
  const r = String(region || "").trim();
  const s = String(settlement || "").trim();
  if (!s) return "";
  const parts = [];
  if (c) parts.push(c);
  if (r && r !== c && r !== s) parts.push(r);
  parts.push(s);
  return parts.join(" - ");
}

/** Не населённые пункты в OSM (ГЭС, промзоны, инфраструктура). */
const PHOTON_NON_PLACE_KEYS = new Set([
  "landuse",
  "natural",
  "amenity",
  "power",
  "man_made",
  "building",
  "highway",
  "railway",
  "waterway",
  "tourism",
  "historic",
  "shop",
  "office",
  "boundary",
]);

/** Название явно не про населённый пункт (Чебоксарская ГЭС и т.п.). */
function nameLooksLikeNonSettlement(name) {
  const n = String(name || "").toLowerCase();
  return (
    /\bгэс\b|\bгес\b|гидроэлектростанц|hydroelectric|power\s*station|электростанц|substation|подстанц/.test(n) ||
    /\bаэропорт\b|\bairport\b|\bвокзал\b|railway\s*station|станция\s*метро/.test(n)
  );
}

/** Только населённые пункты (Photon / OSM). */
function photonIsSettlementLike(p) {
  if (!p || typeof p !== "object") return false;
  const hasOsmKey = Object.prototype.hasOwnProperty.call(p, "osm_key") && p.osm_key != null && String(p.osm_key) !== "";
  /* Ответ Open-Meteo мы кладём без osm_* — это всегда населённые пункты (PPL*). */
  if (!hasOsmKey && String(p.name || "").trim() && (p.country || p.countrycode)) return true;

  const key = String(p.osm_key || "");
  if (PHOTON_NON_PLACE_KEYS.has(key)) return false;
  if (key === "place") {
    const v = String(p.osm_value || "");
    return ["city", "town", "village", "hamlet", "municipality", "suburb"].includes(v);
  }
  return false;
}

/** Подпись подсказки из свойств Photon (или shim Open-Meteo). */
function labelFromPhotonProps(p) {
  if (!p || typeof p !== "object") return "";
  if (!photonIsSettlementLike(p)) return "";
  const settlement = String(p.name || p.city || "").trim();
  if (!settlement || nameLooksLikeNonSettlement(settlement)) return "";
  const country = String(p.country || "").trim() || String(p.countrycode || "").trim();
  const region = String(p.state || "").trim() || String(p.county || "").trim();
  return joinCountryRegionSettlement(country, region, settlement);
}

/**
 * Релевантность подсказки запросу (выше = лучше).
 * @param {string} qLower
 * @param {{ formattedAddress?: string }} r
 * @param {string} label
 */
function placeSuggestScore(qLower, r, label) {
  const ln = label.toLowerCase();
  const extra = String(r.formattedAddress || "").toLowerCase();
  const hay = `${ln} ${extra}`;
  if (ln.startsWith(qLower)) return 2000 - Math.min(ln.length, 80);
  const pos = hay.indexOf(qLower);
  if (pos !== -1) return 1500 - Math.min(pos, 400);
  for (const token of hay.split(/[\s,.;]+/)) {
    if (token && token.startsWith(qLower)) return 900;
  }
  return 0;
}

function cyrillicCountryBonus(countryRaw) {
  const c = String(countryRaw || "").toLowerCase();
  if (c.includes("росс") || c === "russia" || c === "ru") return 280;
  if (c.includes("беларус") || c.includes("belarus") || c === "by") return 140;
  if (c.includes("украин") || c.includes("ukraine") || c === "ua") return 140;
  if (c.includes("казах") || c.includes("kazakhstan") || c === "kz") return 140;
  return 0;
}

function rankPhotonFeatures(q, features) {
  const qLower = q.toLowerCase();
  const cyr = CYRILLIC_RE.test(q);
  const scored = [];
  for (const f of features) {
    const p = f.properties || {};
    const label = labelFromPhotonProps(p);
    if (!label) continue;
    const row = { formattedAddress: label };
    let score = placeSuggestScore(qLower, row, label);
    if (cyr) score += cyrillicCountryBonus(p.country || p.countrycode);
    scored.push({ f, label, score });
  }
  scored.sort((a, b) => b.score - a.score);
  const best = scored[0]?.score ?? 0;
  if (q.length >= 3 && best >= 800) {
    return scored.filter((x) => x.score >= 400);
  }
  return scored;
}

async function geoFetchJson(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), GEO_FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": GEO_USER_AGENT,
      },
      signal: ctrl.signal,
    });
    if (!res.ok) return null;
    return res.json();
  } finally {
    clearTimeout(t);
  }
}

/** Photon: не передавать lang=ru — публичный komoot.io отвечает 400 и подсказки пропадают. */
async function fetchPhotonSuggestions(q) {
  const u = new URL(PHOTON_SEARCH);
  u.searchParams.set("q", q);
  u.searchParams.set("limit", "22");
  const j = await geoFetchJson(u);
  if (!j || !Array.isArray(j.features)) return [];
  return j.features;
}

/** Запасной вариант: Open-Meteo (без ключа), хорошо отдаёт кириллицу с language=ru. */
async function fetchOpenMeteoSuggestions(q) {
  const u = new URL("https://geocoding-api.open-meteo.com/v1/search");
  u.searchParams.set("name", q);
  u.searchParams.set("count", "20");
  u.searchParams.set("language", "ru");
  u.searchParams.set("format", "json");
  const j = await geoFetchJson(u);
  if (!j || !Array.isArray(j.results)) return [];
  return j.results
    .filter((r) => {
      const f = String(r.feature_code || "");
      return f.startsWith("PPL");
    })
    .map((r) => ({
      type: "Feature",
      properties: {
        name: r.name,
        state: r.admin1,
        country: r.country,
        countrycode: r.country_code,
      },
    }));
}

const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, "data");
const DB_PATH = path.join(DATA_DIR, "svoi-korni.sqlite");

fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL DEFAULT '',
    updated_at INTEGER NOT NULL,
    field_w INTEGER NOT NULL DEFAULT 0,
    field_h INTEGER NOT NULL DEFAULT 0,
    cam_x REAL NOT NULL DEFAULT 0,
    cam_y REAL NOT NULL DEFAULT 0,
    zoom REAL NOT NULL DEFAULT 1,
    profile_json TEXT,
    cards_json TEXT NOT NULL DEFAULT '[]',
    links_json TEXT NOT NULL DEFAULT '[]'
  );
`);

const app = express();
app.use(express.json({ limit: "12mb" }));

/** Все API под префиксом /api — не пересекается со статикой из корня проекта. */
const api = express.Router();

api.get("/health", (req, res) => {
  res.json({ ok: true });
});

api.get("/places/suggest", async (req, res) => {
  const q = String(req.query.q || "").trim();
  if (q.length < 2) {
    res.json([]);
    return;
  }
  const cacheKey = `v4:${CYRILLIC_RE.test(q) ? "cyr" : "lat"}:${q.toLowerCase()}`;
  const cached = suggestCache.get(cacheKey);
  if (cached && Date.now() - cached.t < SUGGEST_CACHE_TTL_MS) {
    res.json(cached.data);
    return;
  }
  try {
    const gapWait = SUGGEST_MIN_INTERVAL_MS - (Date.now() - lastSuggestUpstreamAt);
    if (gapWait > 0) {
      await new Promise((resolve) => setTimeout(resolve, gapWait));
    }
    lastSuggestUpstreamAt = Date.now();

    let features = await fetchPhotonSuggestions(q);
    if (features.length === 0) {
      features = await fetchOpenMeteoSuggestions(q);
    }
    const ranked = rankPhotonFeatures(q, features);
    const seen = new Set();
    const out = [];
    for (const { label } of ranked) {
      if (!label || seen.has(label)) continue;
      seen.add(label);
      out.push({ value: label });
      if (out.length >= 12) break;
    }
    if (suggestCache.size >= SUGGEST_CACHE_MAX) suggestCache.clear();
    suggestCache.set(cacheKey, { t: Date.now(), data: out });
    res.json(out);
  } catch {
    res.json([]);
  }
});

api.get("/projects", (req, res) => {
  try {
    const rows = db
      .prepare("SELECT id, name, updated_at FROM projects ORDER BY updated_at DESC")
      .all();
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

api.get("/projects/:id", (req, res) => {
  const id = +req.params.id;
  const row = db.prepare("SELECT * FROM projects WHERE id = ?").get(id);
  if (!row) {
    res.status(404).json({ error: "not found" });
    return;
  }
  let profile = null;
  if (row.profile_json) {
    try {
      profile = JSON.parse(row.profile_json);
    } catch {
      profile = null;
    }
  }
  let cards = [];
  let links = [];
  try {
    cards = JSON.parse(row.cards_json || "[]");
  } catch {
    cards = [];
  }
  try {
    links = JSON.parse(row.links_json || "[]");
  } catch {
    links = [];
  }
  res.json({
    id: row.id,
    name: row.name,
    updated_at: row.updated_at,
    fieldW: row.field_w,
    fieldH: row.field_h,
    camX: row.cam_x,
    camY: row.cam_y,
    zoom: row.zoom,
    profile,
    cards,
    links,
  });
});

api.post("/projects", (req, res) => {
  const name = String(req.body?.name ?? "Без названия").trim().slice(0, 200) || "Без названия";
  const now = Date.now();
  const info = db
    .prepare(
      `INSERT INTO projects (name, updated_at, field_w, field_h, cam_x, cam_y, zoom, profile_json, cards_json, links_json)
       VALUES (?, ?, 0, 0, 0, 0, 1, NULL, '[]', '[]')`
    )
    .run(name, now);
  res.json({ id: info.lastInsertRowid, name, updated_at: now });
});

api.put("/projects/:id", (req, res) => {
  const id = +req.params.id;
  const exists = db.prepare("SELECT id FROM projects WHERE id = ?").get(id);
  if (!exists) {
    res.status(404).json({ error: "not found" });
    return;
  }

  const b = req.body || {};
  const name = String(b.name ?? "").trim().slice(0, 200);
  const now = Date.now();
  const prevRow = db.prepare("SELECT profile_json FROM projects WHERE id = ?").get(id);
  const profileJson =
    b.profile !== undefined ? JSON.stringify(b.profile) : prevRow.profile_json;
  const cardsJson = JSON.stringify(Array.isArray(b.cards) ? b.cards : []);
  const linksJson = JSON.stringify(Array.isArray(b.links) ? b.links : []);

  db.prepare(
    `UPDATE projects SET
      name = ?,
      updated_at = ?,
      field_w = ?,
      field_h = ?,
      cam_x = ?,
      cam_y = ?,
      zoom = ?,
      profile_json = ?,
      cards_json = ?,
      links_json = ?
     WHERE id = ?`
  ).run(
    name || "Без названия",
    now,
    Math.round(+b.fieldW) || 0,
    Math.round(+b.fieldH) || 0,
    +b.camX || 0,
    +b.camY || 0,
    +b.zoom || 1,
    profileJson,
    cardsJson,
    linksJson,
    id
  );

  res.json({ ok: true, id, updated_at: now });
});

api.delete("/projects/:id", (req, res) => {
  const id = +req.params.id;
  db.prepare("DELETE FROM projects WHERE id = ?").run(id);
  res.json({ ok: true });
});

app.use("/api", api);
app.use(express.static(ROOT));

const PORT = process.env.PORT || 3456;
app.listen(PORT, () => {
  console.log(`Свои корни → http://localhost:${PORT}`);
  console.log(`SQLite: ${DB_PATH}`);
});
