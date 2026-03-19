export function normalizePhoneDigits(value: string): string {
  const stripped = value.replace(/\D/g, "");
  const withoutCountryCode =
    stripped.length === 11 && stripped.startsWith("1") ? stripped.slice(1) : stripped;
  return withoutCountryCode.slice(0, 10);
}

export function formatUsPhoneDisplay(value: string): string {
  const digits = normalizePhoneDigits(value);
  if (digits.length === 0) {
    return "";
  }
  if (digits.length <= 3) {
    return `(${digits}`;
  }
  if (digits.length <= 6) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  }
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
}

export function normalizeUsPhoneInput(value: string): string {
  return formatUsPhoneDisplay(value);
}

export function toE164FromUsTenDigit(value: string): string | null {
  const digits = normalizePhoneDigits(value);
  if (digits.length !== 10) {
    return null;
  }
  return `+1${digits}`;
}
