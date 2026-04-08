/** Порядок в UI: день → месяц → год. Хранение: YYYY-MM-DD, YYYY-MM, YYYY или MM-DD (без года). */

export const BIRTH_MONTH_OPTIONS = [
  { value: "", label: "месяц" },
  { value: "1", label: "январь" },
  { value: "2", label: "февраль" },
  { value: "3", label: "март" },
  { value: "4", label: "апрель" },
  { value: "5", label: "май" },
  { value: "6", label: "июнь" },
  { value: "7", label: "июль" },
  { value: "8", label: "август" },
  { value: "9", label: "сентябрь" },
  { value: "10", label: "октябрь" },
  { value: "11", label: "ноябрь" },
  { value: "12", label: "декабрь" },
];

/**
 * Разбор сохранённой строки в части для полей день / месяц / год.
 */
export function parseBirthParts(raw) {
  const s = String(raw || "").trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) {
    return {
      day: String(parseInt(m[3], 10)),
      month: String(parseInt(m[2], 10)),
      year: m[1],
    };
  }
  m = s.match(/^(\d{4})-(\d{2})$/);
  if (m) {
    return { day: "", month: String(parseInt(m[2], 10)), year: m[1] };
  }
  m = s.match(/^(\d{4})$/);
  if (m) {
    return { day: "", month: "", year: m[1] };
  }
  m = s.match(/^(\d{2})-(\d{2})$/);
  if (m) {
    return {
      day: String(parseInt(m[2], 10)),
      month: String(parseInt(m[1], 10)),
      year: "",
    };
  }
  return { day: "", month: "", year: "" };
}

/**
 * Сборка строки для store из частей (пустые поля — не подставляем нули).
 */
export function buildBirthFromParts(parts) {
  const day = String(parts?.day ?? "").trim();
  const month = String(parts?.month ?? "").trim();
  const year = String(parts?.year ?? "").trim();

  const y = parseInt(year, 10);
  const mo = parseInt(month, 10);
  const d = parseInt(day, 10);

  if (year && !month && !day && Number.isFinite(y)) return String(y);
  if (year && month && !day && Number.isFinite(y) && mo >= 1 && mo <= 12) {
    return `${y}-${String(mo).padStart(2, "0")}`;
  }
  if (year && month && day && Number.isFinite(y) && mo >= 1 && mo <= 12 && d >= 1 && d <= 31) {
    const dt = new Date(y, mo - 1, d);
    if (dt.getFullYear() === y && dt.getMonth() === mo - 1 && dt.getDate() === d) {
      return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    }
  }
  if (!year && month && day && mo >= 1 && mo <= 12 && d >= 1 && d <= 31) {
    return `${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }
  return "";
}
