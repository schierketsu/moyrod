"use strict";

const path = require("path");
const fs = require("fs");
const express = require("express");
const Database = require("better-sqlite3");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const rateLimit = require("express-rate-limit");

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
const DIST_DIR = path.join(ROOT, "dist");
const CLIENT_ROOT = fs.existsSync(path.join(DIST_DIR, "index.html")) ? DIST_DIR : ROOT;
const DATA_DIR = path.join(ROOT, "data");
const DB_PATH = path.join(DATA_DIR, "svoi-korni.sqlite");
const JWT_SECRET = process.env.JWT_SECRET || "dev-insecure-jwt-secret-change-me";
const JWT_EXPIRES_IN = "7d";
const UID_START = 10000;
const SYSTEM_UID = UID_START;

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

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uid INTEGER NOT NULL UNIQUE,
    full_name TEXT NOT NULL,
    birth_date TEXT NOT NULL,
    birth_place TEXT NOT NULL,
    birth_place_confirmed INTEGER NOT NULL DEFAULT 0,
    password_hash TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS shared_card_index (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    owner_user_id INTEGER NOT NULL,
    project_id INTEGER NOT NULL,
    card_id TEXT NOT NULL,
    fio_norm TEXT NOT NULL DEFAULT '',
    birth_norm TEXT NOT NULL DEFAULT '',
    birth_place_norm TEXT NOT NULL DEFAULT '',
    gender TEXT NOT NULL DEFAULT '',
    payload_json TEXT NOT NULL DEFAULT '{}',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
`);

function hasColumn(tableName, columnName) {
  const rows = db.prepare(`PRAGMA table_info(${tableName})`).all();
  return rows.some((r) => r.name === columnName);
}

if (!hasColumn("projects", "owner_user_id")) {
  db.exec("ALTER TABLE projects ADD COLUMN owner_user_id INTEGER;");
}
if (!hasColumn("projects", "share_for_matching")) {
  db.exec("ALTER TABLE projects ADD COLUMN share_for_matching INTEGER NOT NULL DEFAULT 0;");
  const rows = db.prepare("SELECT id, profile_json FROM projects").all();
  for (const r of rows) {
    let prof = null;
    try {
      prof = r.profile_json ? JSON.parse(r.profile_json) : null;
    } catch {
      prof = null;
    }
    const sm = prof?.shareForMatching === true ? 1 : 0;
    db.prepare("UPDATE projects SET share_for_matching = ? WHERE id = ?").run(sm, r.id);
  }
}
db.exec("CREATE INDEX IF NOT EXISTS idx_projects_owner ON projects(owner_user_id);");
db.exec("CREATE INDEX IF NOT EXISTS idx_cards_owner ON shared_card_index(owner_user_id);");
db.exec("CREATE INDEX IF NOT EXISTS idx_cards_fio ON shared_card_index(fio_norm);");
db.exec("CREATE INDEX IF NOT EXISTS idx_cards_birth ON shared_card_index(birth_norm);");
db.exec("CREATE INDEX IF NOT EXISTS idx_cards_place ON shared_card_index(birth_place_norm);");

function normalizeText(v) {
  return String(v || "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^\p{L}\p{N}\s-]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Даты в разных форматах (1990-01-01 vs 01.01.1990) → один ключ для индекса и сравнения. */
function normalizeBirthForMatch(raw) {
  const s = String(raw || "").trim();
  if (!s) return "";
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) {
    return `${iso[1]}-${String(iso[2]).padStart(2, "0")}-${String(iso[3]).padStart(2, "0")}`;
  }
  const dmy = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/);
  if (dmy) {
    const dd = String(dmy[1]).padStart(2, "0");
    const mm = String(dmy[2]).padStart(2, "0");
    return `${dmy[3]}-${mm}-${dd}`;
  }
  const ym = s.match(/^(\d{4})-(\d{1,2})$/);
  if (ym) return `${ym[1]}-${String(ym[2]).padStart(2, "0")}-01`;
  const y = s.match(/^(\d{4})$/);
  if (y) return y[1];
  return normalizeText(s);
}

function ensureSystemUserAndBackfillProjects() {
  const now = Date.now();
  const sys = db.prepare("SELECT id FROM users WHERE uid = ?").get(SYSTEM_UID);
  let systemUserId = sys ? sys.id : null;
  if (!systemUserId) {
    const pass = bcrypt.hashSync("system-account-disabled", 10);
    const info = db
      .prepare(
        `INSERT INTO users (uid, full_name, birth_date, birth_place, birth_place_confirmed, password_hash, created_at)
         VALUES (?, ?, ?, ?, 1, ?, ?)`
      )
      .run(SYSTEM_UID, "System User", "1900", "System", pass, now);
    systemUserId = Number(info.lastInsertRowid);
  }
  db.prepare("UPDATE projects SET owner_user_id = ? WHERE owner_user_id IS NULL").run(systemUserId);
}
ensureSystemUserAndBackfillProjects();

/** Пользователи в БД, кроме системного (uid = SYSTEM_UID). */
function countRegisteredHumanUsers() {
  const row = db.prepare(`SELECT COUNT(*) AS c FROM users WHERE uid <> ?`).get(SYSTEM_UID);
  return Number(row?.c) || 0;
}

function nextUid() {
  const row = db.prepare("SELECT MAX(uid) AS max_uid FROM users").get();
  const max = Number(row?.max_uid || UID_START - 1);
  return Math.max(UID_START, max + 1);
}

function signToken(user) {
  return jwt.sign({ sub: user.id, uid: user.uid }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

function authOptional(req, _res, next) {
  const hdr = String(req.headers.authorization || "");
  const m = hdr.match(/^Bearer\s+(.+)$/i);
  if (!m) {
    req.user = null;
    next();
    return;
  }
  try {
    const payload = jwt.verify(m[1], JWT_SECRET);
    const sub = Number(payload.sub);
    const user = db
      .prepare("SELECT id, uid, full_name, birth_date, birth_place, created_at FROM users WHERE id = ?")
      .get(Number.isFinite(sub) ? sub : payload.sub);
    req.user = user || null;
  } catch {
    req.user = null;
  }
  next();
}

function requireAuth(req, res, next) {
  if (!req.user) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  next();
}

/** «Сильное» совпадение; ниже попадает в список как weak (всё равно показываем). */
const MIN_MATCH_SCORE = 10;

function placeTokensSet(placeNorm) {
  return new Set(
    String(placeNorm || "")
      .split(" ")
      .filter((t) => t.length >= 3)
  );
}

function scoreCardMatch(a, b) {
  let score = 0;
  const bnA = String(a.birth_norm || "");
  const bnB = String(b.birth_norm || "");

  if (bnA && bnB && bnA === bnB) {
    score += 35;
  } else if (bnA.length >= 4 && bnB.length >= 4) {
    const yA = bnA.slice(0, 4);
    const yB = bnB.slice(0, 4);
    if (/^\d{4}$/.test(yA) && yA === yB) {
      score += 22;
    }
  }

  const plA = String(a.birth_place_norm || "");
  const plB = String(b.birth_place_norm || "");
  if (plA && plB && plA === plB) {
    score += 25;
  } else if (plA && plB && plA !== plB) {
    const sa = placeTokensSet(plA);
    const sb = placeTokensSet(plB);
    let pl = 0;
    for (const t of sa) if (sb.has(t)) pl += 1;
    if (pl > 0) score += Math.min(22, pl * 7);
  }

  if (a.gender && b.gender && a.gender === b.gender) score += 10;

  const at = new Set(String(a.fio_norm || "").split(" ").filter(Boolean));
  const bt = new Set(String(b.fio_norm || "").split(" ").filter(Boolean));
  let overlap = 0;
  for (const t of at) if (bt.has(t)) overlap += 1;
  score += Math.min(36, overlap * 12);

  if (overlap === 0) {
    const ar = String(a.fio_norm || "")
      .split(" ")
      .filter((t) => t.length >= 4);
    const br = String(b.fio_norm || "")
      .split(" ")
      .filter((t) => t.length >= 4);
    outer: for (const x of ar) {
      for (const y of br) {
        if (x === y) continue;
        if (x.startsWith(y) || y.startsWith(x)) {
          score += 14;
          break outer;
        }
      }
    }
  }

  if (overlap === 0) {
    const w1 = String(a.fio_norm || "")
      .split(" ")
      .filter(Boolean)[0];
    const w2 = String(b.fio_norm || "")
      .split(" ")
      .filter(Boolean)[0];
    if (w1 && w2 && w1.length >= 3 && w2.length >= 3 && w1.slice(0, 3) === w2.slice(0, 3)) {
      score += 12;
    }
  }

  if (overlap === 0) {
    const ta = String(a.fio_norm || "")
      .split(" ")
      .filter((t) => t.length >= 3 && t.length <= 5);
    const tb = String(b.fio_norm || "")
      .split(" ")
      .filter((t) => t.length >= 3 && t.length <= 5);
    inner: for (const x of ta) {
      for (const y of tb) {
        if (x === y) continue;
        if (x.startsWith(y) || y.startsWith(x)) {
          score += 5;
          break inner;
        }
      }
    }
  }

  return score;
}

/** Базовый фильтр кандидатов: допускаем пары только при полном/частичном совпадении ФИО. */
function fioLooksMatching(a, b) {
  const sa = String(a?.fio_norm || "").trim();
  const sb = String(b?.fio_norm || "").trim();
  if (!sa || !sb) return false;

  // Полное совпадение.
  if (sa === sb) return true;

  // Частичное совпадение: один вариант ФИО является началом другого по словам
  // (например, "александрова алена" vs "александрова алена димитриевна").
  const ta = sa.split(" ").filter(Boolean);
  const tb = sb.split(" ").filter(Boolean);
  if (ta.length < 2 || tb.length < 2) return false;

  const min = Math.min(ta.length, tb.length);
  let samePrefixTokens = 0;
  for (let i = 0; i < min; i += 1) {
    if (ta[i] !== tb[i]) break;
    samePrefixTokens += 1;
  }

  // Требуем как минимум совпадение фамилии+имени в правильном порядке.
  return samePrefixTokens >= 2;
}

/** SQLite может отдавать NULL; пустая строка не считается данными для сравнения. */
function indexedRowHasComparableData(row) {
  const nz = (x) => x != null && String(x).trim() !== "";
  return nz(row.fio_norm) || nz(row.birth_norm) || nz(row.birth_place_norm);
}

/** Одна карточка из JSON проекта — тот же формат полей, что и строка shared_card_index (для scoreCardMatch). */
function cardJsonToMatchRow(ownerUserId, projectId, card) {
  if (!card) return null;
  const fio = normalizeText(card.fio || "");
  const birth = normalizeBirthForMatch(card.birth || "");
  const place = normalizeText(card.birthPlace || "");
  if (!fio && !birth && !place) return null;
  return {
    owner_user_id: Number(ownerUserId),
    project_id: Number(projectId),
    card_id: String(card.id || ""),
    fio_norm: fio,
    birth_norm: birth,
    birth_place_norm: place,
    gender: String(card.gender || ""),
    payload_json: JSON.stringify({
      fio: String(card.fio || ""),
      birth: String(card.birth || ""),
      birthPlace: String(card.birthPlace || ""),
      gender: String(card.gender || ""),
    }),
  };
}

/**
 * Пул карточек для подбора: все проекты с включённым участием в поиске.
 * Рекомендации считаются отсюда (актуальные данные), а не только из shared_card_index.
 */
function loadMatchRowsFromSharingProjects() {
  const projectRows = db
    .prepare(
      `SELECT id, owner_user_id, cards_json FROM projects
       WHERE owner_user_id IS NOT NULL AND COALESCE(share_for_matching, 0) = 1`
    )
    .all();
  const out = [];
  for (const pr of projectRows) {
    let cards = [];
    try {
      cards = JSON.parse(pr.cards_json || "[]");
    } catch {
      continue;
    }
    const oid = Number(pr.owner_user_id);
    const pid = Number(pr.id);
    for (const c of cards || []) {
      const mr = cardJsonToMatchRow(oid, pid, c);
      if (mr) out.push(mr);
    }
  }
  return out;
}

function updateSharedCardIndex(ownerUserId, projectId, cards, shareForMatching) {
  db
    .prepare("DELETE FROM shared_card_index WHERE owner_user_id = ? AND project_id = ?")
    .run(Number(ownerUserId), projectId);
  const sharingOn =
    shareForMatching === true || shareForMatching === 1 || shareForMatching === "true";
  if (!sharingOn) return;
  const now = Date.now();
  const insert = db.prepare(
    `INSERT INTO shared_card_index
      (owner_user_id, project_id, card_id, fio_norm, birth_norm, birth_place_norm, gender, payload_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  for (const card of cards || []) {
    if (!card) continue;
    const fio = normalizeText(card.fio || "");
    const birth = normalizeBirthForMatch(card.birth || "");
    const place = normalizeText(card.birthPlace || "");
    if (!fio && !birth && !place) continue;
    insert.run(
      Number(ownerUserId),
      projectId,
      String(card.id || ""),
      fio,
      birth,
      place,
      String(card.gender || ""),
      JSON.stringify({
        fio: String(card.fio || ""),
        birth: String(card.birth || ""),
        birthPlace: String(card.birthPlace || ""),
        gender: String(card.gender || ""),
      }),
      now,
      now
    );
  }
}

/** Пересобирает индекс из карточек проектов (нужно после смены нормализации дат и для починки рассинхрона). */
function rebuildAllSharedCardIndexes() {
  db.prepare("DELETE FROM shared_card_index").run();
  const rows = db
    .prepare(
      "SELECT id, owner_user_id, cards_json, COALESCE(share_for_matching, 0) AS sm FROM projects WHERE owner_user_id IS NOT NULL"
    )
    .all();
  for (const row of rows) {
    let cards = [];
    try {
      cards = JSON.parse(row.cards_json || "[]");
    } catch {
      continue;
    }
    const shareForMatching = Number(row.sm) === 1;
    updateSharedCardIndex(row.owner_user_id, row.id, cards, shareForMatching);
  }
}

const app = express();
app.use(express.json({ limit: "12mb" }));
app.use(authOptional);

/** Все API под префиксом /api — не пересекается со статикой из корня проекта. */
const api = express.Router();

api.get("/health", (req, res) => {
  res.json({ ok: true });
});

const authLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
});

api.post("/auth/register", authLimiter, (req, res) => {
  const b = req.body || {};
  const fullName = String(b.fullName || "").trim();
  const birthDate = String(b.birthDate || "").trim();
  const birthPlace = String(b.birthPlace || "").trim();
  const birthPlaceConfirmed = b.birthPlaceConfirmed === true;
  const password = String(b.password || "");
  if (!fullName || !birthDate || !birthPlace || !birthPlaceConfirmed || !password) {
    res.status(400).json({ error: "required_fields_missing" });
    return;
  }
  if (password.length < 6) {
    res.status(400).json({ error: "password_too_short" });
    return;
  }
  if (!birthPlace.includes(" - ")) {
    res.status(400).json({ error: "birth_place_must_come_from_suggest" });
    return;
  }

  const uid = nextUid();
  const now = Date.now();
  const hash = bcrypt.hashSync(password, 10);
  try {
    const info = db
      .prepare(
        `INSERT INTO users
          (uid, full_name, birth_date, birth_place, birth_place_confirmed, password_hash, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(uid, fullName, birthDate, birthPlace, 1, hash, now);
    const user = db
      .prepare("SELECT id, uid, full_name, birth_date, birth_place, created_at FROM users WHERE id = ?")
      .get(info.lastInsertRowid);
    const token = signToken(user);
    res.json({ token, user });
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

api.post("/auth/login", authLimiter, (req, res) => {
  const uid = Number(req.body?.uid);
  const password = String(req.body?.password || "");
  if (!uid || !password) {
    res.status(400).json({ error: "uid_and_password_required" });
    return;
  }
  const row = db.prepare("SELECT * FROM users WHERE uid = ?").get(uid);
  if (!row) {
    res.status(401).json({ error: "invalid_credentials" });
    return;
  }
  const ok = bcrypt.compareSync(password, row.password_hash);
  if (!ok) {
    res.status(401).json({ error: "invalid_credentials" });
    return;
  }
  const user = {
    id: row.id,
    uid: row.uid,
    full_name: row.full_name,
    birth_date: row.birth_date,
    birth_place: row.birth_place,
    created_at: row.created_at,
  };
  const token = signToken(user);
  res.json({ token, user });
});

api.get("/auth/me", requireAuth, (req, res) => {
  res.json({ user: req.user });
});

api.post("/auth/logout", requireAuth, (_req, res) => {
  // Stateless JWT logout: client removes token.
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

/** Только флаг участия в подборе — без полного PUT (избегает гонок и перезаписи полей). */
function handleShareForMatchingUpdate(req, res) {
  const id = +req.params.id;
  const ownerId = Number(req.user.id);
  const row = db.prepare("SELECT * FROM projects WHERE id = ? AND owner_user_id = ?").get(id, ownerId);
  if (!row) {
    res.status(404).json({ error: "not found" });
    return;
  }
  const b = req.body || {};
  const shareForMatching = b.shareForMatching === true || b.shareForMatching === "true";
  let prevProfile = null;
  try {
    prevProfile = row.profile_json ? JSON.parse(row.profile_json) : null;
  } catch {
    prevProfile = null;
  }
  const nextProfile = { ...(prevProfile || {}), shareForMatching };
  const now = Date.now();
  db.prepare("UPDATE projects SET profile_json = ?, updated_at = ?, share_for_matching = ? WHERE id = ?").run(
    JSON.stringify(nextProfile),
    now,
    shareForMatching ? 1 : 0,
    id
  );

  let cards = [];
  try {
    cards = JSON.parse(row.cards_json || "[]");
  } catch {
    cards = [];
  }
  updateSharedCardIndex(ownerId, id, cards, shareForMatching);

  res.json({ ok: true, id, updated_at: now, shareForMatching });
}

api.get("/projects", requireAuth, (req, res) => {
  try {
    const ownerId = Number(req.user.id);
    const rows = db
      .prepare(
        `SELECT id, name, updated_at, COALESCE(share_for_matching, 0) AS share_for_matching, profile_json
         FROM projects WHERE owner_user_id = ? ORDER BY updated_at DESC`
      )
      .all(ownerId);
    const out = rows.map((row) => {
      let profile = null;
      try {
        profile = row.profile_json ? JSON.parse(row.profile_json) : null;
      } catch {
        profile = null;
      }
      const shareForMatching = !!(
        Number(row.share_for_matching) === 1 || profile?.shareForMatching === true
      );
      return {
        id: row.id,
        name: row.name,
        updated_at: row.updated_at,
        shareForMatching,
      };
    });
    res.json(out);
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

api.post("/projects/:id/share-for-matching", requireAuth, handleShareForMatchingUpdate);
api.patch("/projects/:id/share-for-matching", requireAuth, handleShareForMatchingUpdate);
api.put("/projects/:id/share-for-matching", requireAuth, handleShareForMatchingUpdate);

api.get("/projects/:id", requireAuth, (req, res) => {
  const id = +req.params.id;
  const ownerId = Number(req.user.id);
  const row = db
    .prepare(
      `SELECT id, name, updated_at, field_w, field_h, cam_x, cam_y, zoom,
              profile_json, cards_json, links_json, owner_user_id,
              COALESCE(share_for_matching, 0) AS share_for_matching
       FROM projects WHERE id = ? AND owner_user_id = ?`
    )
    .get(id, ownerId);
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
  const shareForMatching = !!(
    Number(row.share_for_matching) === 1 || profile?.shareForMatching === true
  );
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
    shareForMatching,
    cards,
    links,
  });
});

api.post("/projects", requireAuth, (req, res) => {
  const name = String(req.body?.name ?? "Без названия").trim().slice(0, 200) || "Без названия";
  const now = Date.now();
  const info = db
    .prepare(
      `INSERT INTO projects (name, updated_at, field_w, field_h, cam_x, cam_y, zoom, profile_json, cards_json, links_json, owner_user_id)
       VALUES (?, ?, 0, 0, 0, 0, 1, NULL, '[]', '[]', ?)`
    )
    .run(name, now, req.user.id);
  res.json({ id: info.lastInsertRowid, name, updated_at: now });
});

api.put("/projects/:id", requireAuth, (req, res) => {
  const id = +req.params.id;
  const exists = db.prepare("SELECT id FROM projects WHERE id = ? AND owner_user_id = ?").get(id, req.user.id);
  if (!exists) {
    res.status(404).json({ error: "not found" });
    return;
  }

  const b = req.body || {};
  const name = String(b.name ?? "").trim().slice(0, 200);
  const now = Date.now();
  const prevRow = db.prepare("SELECT profile_json, share_for_matching FROM projects WHERE id = ?").get(id);
  let prevProfile = null;
  try {
    prevProfile = prevRow?.profile_json ? JSON.parse(prevRow.profile_json) : null;
  } catch {
    prevProfile = null;
  }
  let shareForMatching = Number(prevRow?.share_for_matching) === 1 || prevProfile?.shareForMatching === true;
  if (Object.prototype.hasOwnProperty.call(b, "shareForMatching")) {
    shareForMatching = b.shareForMatching === true || b.shareForMatching === "true";
  }
  const profilePatch = b.profile !== undefined ? b.profile || {} : {};
  const profileObj = { ...(prevProfile || {}), ...profilePatch };
  const nextProfile = {
    ...profileObj,
    shareForMatching,
  };
  const profileJson = JSON.stringify(nextProfile);
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
      links_json = ?,
      share_for_matching = ?
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
    shareForMatching ? 1 : 0,
    id
  );

  if (Array.isArray(b.cards)) {
    updateSharedCardIndex(req.user.id, id, b.cards, shareForMatching);
  }

  res.json({ ok: true, id, updated_at: now });
});

api.delete("/projects/:id", requireAuth, (req, res) => {
  const id = +req.params.id;
  db.prepare("DELETE FROM projects WHERE id = ? AND owner_user_id = ?").run(id, req.user.id);
  db.prepare("DELETE FROM shared_card_index WHERE owner_user_id = ? AND project_id = ?").run(req.user.id, id);
  res.json({ ok: true });
});

function handleMatchingRebuild(_req, res) {
  try {
    rebuildAllSharedCardIndexes();
    const total = db.prepare("SELECT COUNT(*) AS c FROM shared_card_index").get();
    const owners = db.prepare("SELECT COUNT(DISTINCT owner_user_id) AS c FROM shared_card_index").get();
    res.json({ ok: true, indexedRows: total.c, distinctOwners: owners.c });
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
}

api.get("/matching/rebuild", requireAuth, handleMatchingRebuild);
api.post("/matching/rebuild", requireAuth, handleMatchingRebuild);

api.get("/matching/suggestions", requireAuth, (req, res) => {
  const myOwnerId = Number(req.user.id);
  const registeredUsersCount = countRegisteredHumanUsers();
  const pool = loadMatchRowsFromSharingProjects();
  const mine = pool.filter((r) => r.owner_user_id === myOwnerId);
  const allOthers = pool.filter((r) => r.owner_user_id !== myOwnerId);

  const distinctOtherOwnerIds = [...new Set((allOthers || []).map((r) => r.owner_user_id))];
  const publicUidByOwnerId = new Map();
  const selPublicUid = db.prepare("SELECT uid FROM users WHERE id = ?");
  for (const oid of distinctOtherOwnerIds) {
    const idNum = Number(oid);
    const row = selPublicUid.get(idNum);
    if (row) publicUidByOwnerId.set(idNum, row.uid);
  }

  const sharingOwnersCount = new Set(pool.map((r) => r.owner_user_id)).size;
  const myProjectsSharing = db
    .prepare(
      `SELECT COUNT(*) AS c FROM projects WHERE owner_user_id = ? AND COALESCE(share_for_matching, 0) = 1`
    )
    .get(myOwnerId);
  const mySharingProjectCount = Number(myProjectsSharing?.c) || 0;

  const baseMeta = {
    matchSource: "sharing_projects_live",
    registeredUsersCount,
    sharingOwnersCount,
    indexedMine: mine.length,
    indexedOthers: allOthers.length,
    totalRowsInIndex: pool.length,
    distinctOwnersInIndex: sharingOwnersCount,
    myProjectsWithSharingOn: mySharingProjectCount,
    minScore: MIN_MATCH_SCORE,
  };

  if (mine.length === 0) {
    const blockingReason = mySharingProjectCount === 0 ? "no_sharing_projects" : "no_own_cards_in_pool";
    res.json({
      suggestions: [],
      meta: {
        ...baseMeta,
        blockingReason,
        reason: "no_own_cards_in_index",
        hint:
          mySharingProjectCount > 0
            ? "В проектах с включённым «Участвовать в поиске» нет ваших карточек с заполненными ФИО, датой или местом. Добавьте данные на карточках и сохраните проект."
            : "Включите участие в подборе хотя бы у одного проекта (профиль или статистика дерева), затем сохраните проект и заполните хотя бы ФИО, дату или место у карточек.",
      },
    });
    return;
  }

  if (allOthers.length === 0) {
    const blockingReason = registeredUsersCount < 2 ? "only_one_user_in_db" : "no_others_in_pool";
    res.json({
      suggestions: [],
      meta: {
        ...baseMeta,
        blockingReason,
        reason: "no_other_users_in_index",
        hint:
          registeredUsersCount < 2
            ? "В базе только один пользователь. Подбор — между разными UID: зарегистрируйте второй аккаунт, включите «Участвовать в поиске» у его проекта и заполните карточки."
            : "Другие пользователи есть, но в пуле подбора нет чужих карточек: у них должно быть включено участие и заполнены ФИО, дата или место.",
      },
    });
    return;
  }

  let maxScoreSeen = 0;
  let pairsCompared = 0;
  const raw = [];
  for (const m of mine) {
    for (const o of allOthers) {
      if (!indexedRowHasComparableData(m) || !indexedRowHasComparableData(o)) continue;
      if (!fioLooksMatching(m, o)) continue;
      pairsCompared += 1;
      const score = scoreCardMatch(m, o);
      if (score > maxScoreSeen) maxScoreSeen = score;
      raw.push({ score, m, o });
    }
  }
  raw.sort((a, b) => b.score - a.score);

  const pairKey = (e) =>
    `${e.m.owner_user_id}|${e.m.project_id}|${e.m.card_id}|${e.o.owner_user_id}|${e.o.project_id}|${e.o.card_id}`;
  const seen = new Set();
  const deduped = [];
  for (const e of raw) {
    const k = pairKey(e);
    if (seen.has(k)) continue;
    seen.add(k);
    deduped.push(e);
  }

  function toSuggestion(entry, weak) {
    const { m, o, score } = entry;
    return {
      score,
      weak: !!weak,
      mine: {
        projectId: m.project_id,
        cardId: m.card_id,
        ...JSON.parse(m.payload_json || "{}"),
      },
      other: {
        ownerUserId: o.owner_user_id,
        ownerUid: publicUidByOwnerId.get(Number(o.owner_user_id)) ?? null,
        projectId: o.project_id,
        cardId: o.card_id,
        ...JSON.parse(o.payload_json || "{}"),
      },
    };
  }

  const strong = deduped.filter((x) => x.score >= MIN_MATCH_SCORE).slice(0, 24);
  const weak = deduped.filter((x) => x.score > 0 && x.score < MIN_MATCH_SCORE).slice(0, 18);
  const suggestions = [...strong.map((e) => toSuggestion(e, false)), ...weak.map((e) => toSuggestion(e, true))].slice(
    0,
    30
  );

  let hintNoHits = null;
  let blockingReason = "ok";
  if (suggestions.length === 0) {
    if (pairsCompared === 0) {
      blockingReason = "no_comparable_pairs";
      hintNoHits =
        "Нет пар, где у обеих карточек есть хотя бы одно из полей: ФИО, дата или место — проверьте данные у себя и у другого участника.";
    } else if (maxScoreSeen > 0) {
      blockingReason = "below_threshold";
      hintNoHits = `Сравнено пар: ${pairsCompared}. Лучший балл: ${maxScoreSeen} (порог «сильного» ${MIN_MATCH_SCORE}). Добавьте общие данные или более похожие ФИО.`;
    } else {
      blockingReason = "below_threshold";
      hintNoHits = `Сравнено пар: ${pairsCompared}, но балл у всех 0 — проверьте ФИО, дату и место на карточках.`;
    }
  }

  res.json({
    suggestions,
    meta: {
      ...baseMeta,
      maxScoreSeen,
      pairsCompared,
      blockingReason,
      reason: suggestions.length === 0 ? blockingReason : "ok",
      hint: suggestions.length === 0 ? hintNoHits : null,
    },
  });
});

app.use("/api", api);
app.use(express.static(CLIENT_ROOT));
app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api/")) {
    next();
    return;
  }
  res.sendFile(path.join(CLIENT_ROOT, "index.html"));
});

rebuildAllSharedCardIndexes();

const PORT = process.env.PORT || 3456;
app.listen(PORT, () => {
  console.log(`Свои корни → http://localhost:${PORT}`);
  console.log(`SQLite: ${DB_PATH}`);
});
