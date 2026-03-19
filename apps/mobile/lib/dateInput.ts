export function normalizeUsDateInput(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  const month = digits.slice(0, 2);
  const day = digits.slice(2, 4);
  const year = digits.slice(4, 8);

  if (digits.length <= 2) {
    return month;
  }
  if (digits.length <= 4) {
    return `${month}-${day}`;
  }
  return `${month}-${day}-${year}`;
}

export function parseUsDateToIso(value: string): string | null {
  const normalized = value.trim();
  const match = normalized.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (!match) {
    return null;
  }
  const month = Number(match[1]);
  const day = Number(match[2]);
  const year = Number(match[3]);
  if (day < 1 || day > 31 || month < 1 || month > 12) {
    return null;
  }
  const candidate = new Date(year, month - 1, day);
  if (
    candidate.getFullYear() !== year ||
    candidate.getMonth() !== month - 1 ||
    candidate.getDate() !== day
  ) {
    return null;
  }
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function formatIsoToUsDate(value: string | null): string {
  if (!value) {
    return "";
  }
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) {
    return "";
  }
  return `${match[2]}-${match[3]}-${match[1]}`;
}
