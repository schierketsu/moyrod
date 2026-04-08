/** Родительный падеж («16 апреля»). */
const MONTHS_GEN = [
  "января",
  "февраля",
  "марта",
  "апреля",
  "мая",
  "июня",
  "июля",
  "августа",
  "сентября",
  "октября",
  "ноября",
  "декабря",
];

/** Именительный падеж для даты без дня («апрель 2004 года»). */
const MONTHS_NOM = [
  "январь",
  "февраль",
  "март",
  "апрель",
  "май",
  "июнь",
  "июль",
  "август",
  "сентябрь",
  "октябрь",
  "ноябрь",
  "декабрь",
];

/**
 * Форматирует сохранённое значение даты (YYYY-MM-DD, YYYY-MM, YYYY или MM-DD) для отображения.
 * Пример полной даты: «5 июля 2004 года».
 */
export function formatBirthDateRu(raw) {
  const s = String(raw || "").trim();
  if (!s) return "";

  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) {
    const y = parseInt(m[1], 10);
    const mo = parseInt(m[2], 10);
    const d = parseInt(m[3], 10);
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31 && y > 0) {
      const dt = new Date(y, mo - 1, d);
      if (dt.getFullYear() === y && dt.getMonth() === mo - 1 && dt.getDate() === d) {
        return `${d} ${MONTHS_GEN[mo - 1]} ${y} года`;
      }
    }
  }

  m = s.match(/^(\d{4})-(\d{2})$/);
  if (m) {
    const y = parseInt(m[1], 10);
    const mo = parseInt(m[2], 10);
    if (mo >= 1 && mo <= 12 && y > 0) {
      return `${MONTHS_NOM[mo - 1]} ${y} года`;
    }
  }

  m = s.match(/^(\d{4})$/);
  if (m) {
    const y = parseInt(m[1], 10);
    if (y > 0) return `${y} год`;
  }

  m = s.match(/^(\d{2})-(\d{2})$/);
  if (m) {
    const mo = parseInt(m[1], 10);
    const d = parseInt(m[2], 10);
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) {
      return `${d} ${MONTHS_GEN[mo - 1]}`;
    }
  }

  return s;
}
