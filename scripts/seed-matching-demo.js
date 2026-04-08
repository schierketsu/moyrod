"use strict";

/**
 * Локальная проверка подбора: гарантирует двух пользователей (не системных) и
 * у каждого — проект с share_for_matching и пересекающимися карточками.
 * Запуск: из каталога moyrod — `node scripts/seed-matching-demo.js`
 */

const path = require("path");
const bcrypt = require("bcryptjs");
const Database = require("better-sqlite3");

const ROOT = path.join(__dirname, "..");
const DB_PATH = path.join(ROOT, "data", "svoi-korni.sqlite");
const SYSTEM_UID = 10000;

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");

function nextUid() {
  const row = db.prepare("SELECT MAX(uid) AS m FROM users").get();
  const max = Number(row?.m || SYSTEM_UID - 1);
  return Math.max(SYSTEM_UID + 1, max + 1);
}

const overlappingCardsA = [
  {
    id: "seed_card_a1",
    x: 120,
    y: 140,
    fio: "Кузнецов Алексей Викторович",
    birth: "1962-05-20",
    birthPlace: "Россия - Тверская область - Ржев",
    gender: "m",
  },
];

const overlappingCardsB = [
  {
    id: "seed_card_b1",
    x: 120,
    y: 140,
    fio: "Кузнецов Алексей Викторович",
    birth: "1962-05-20",
    birthPlace: "Россия - Тверская область - Ржев",
    gender: "m",
  },
];

function ensureAtLeastTwoHumans() {
  let humans = db.prepare("SELECT id, uid FROM users WHERE uid <> ? ORDER BY id").all(SYSTEM_UID);
  while (humans.length < 2) {
    const uid = nextUid();
    const now = Date.now();
    const hash = bcrypt.hashSync("seed-matching-demo", 10);
    const info = db
      .prepare(
        `INSERT INTO users (uid, full_name, birth_date, birth_place, birth_place_confirmed, password_hash, created_at)
         VALUES (?, ?, ?, ?, 1, ?, ?)`
      )
      .run(uid, "Демо подбор", "1980-01-01", "Россия - Тестовая область - Город", hash, now);
    const id = Number(info.lastInsertRowid);
    console.log(`Создан пользователь: uid=${uid}, id=${id}, пароль: seed-matching-demo`);
    humans = db.prepare("SELECT id, uid FROM users WHERE uid <> ? ORDER BY id").all(SYSTEM_UID);
  }
  if (humans.length >= 2) {
    console.log("В базе не менее двух пользователей (не считая служебного).");
  }
  return humans.slice(0, 2);
}

function ensureSharingProject(ownerUserId, cards, label) {
  const row = db.prepare("SELECT id FROM projects WHERE owner_user_id = ? ORDER BY id LIMIT 1").get(ownerUserId);
  const now = Date.now();
  const profile = JSON.stringify({
    completed: true,
    fio: `Демо ${label}`,
    birth: "1980-01-01",
    birthPlace: "Россия - Тест - Город",
    shareForMatching: true,
  });
  const cardsJson = JSON.stringify(cards);
  if (row) {
    db.prepare(
      `UPDATE projects SET profile_json = ?, cards_json = ?, share_for_matching = 1, updated_at = ? WHERE id = ?`
    ).run(profile, cardsJson, now, row.id);
    console.log(`Обновлён проект id=${row.id} (owner ${ownerUserId}), участие в подборе включено.`);
    return row.id;
  }
  const info = db
    .prepare(
      `INSERT INTO projects (name, updated_at, field_w, field_h, cam_x, cam_y, zoom, profile_json, cards_json, links_json, owner_user_id, share_for_matching)
       VALUES (?, ?, 2000, 1400, 0, 0, 1, ?, ?, '[]', ?, 1)`
    )
    .run(`Демо подбор ${label}`, now, profile, cardsJson, ownerUserId);
  const pid = Number(info.lastInsertRowid);
  console.log(`Создан проект id=${pid} (owner ${ownerUserId}).`);
  return pid;
}

const pair = ensureAtLeastTwoHumans();
if (pair.length < 2) {
  console.error("Не удалось получить двух пользователей.");
  process.exit(1);
}

ensureSharingProject(pair[0].id, overlappingCardsA, "A");
ensureSharingProject(pair[1].id, overlappingCardsB, "B");

console.log("Готово. Войдите под разными UID и откройте профиль — блок «Совпадения» должен показать пары.");
process.exit(0);
