const NON_DIGITS = /\D/g;

export function normalizePhoneInput(value: string): string {
  return String(value || "")
    .replace(/[^\d+()\-\s]/g, "")
    .replace(/(?!^)\+/g, "");
}

export function extractPhoneDigits(value: string): string {
  return String(value || "").replace(NON_DIGITS, "");
}

export function isValidPhone(value: string): boolean {
  const digits = extractPhoneDigits(value);
  return digits.length >= 10 && digits.length <= 15;
}

export function toStoragePhone(value: string, defaultCountryCode = "1"): string {
  const digits = extractPhoneDigits(value);
  if (!digits) return "";

  if (digits.length === 10) {
    return `+${defaultCountryCode}${digits}`;
  }

  return `+${digits}`;
}

export function formatPhoneForDisplay(value: string): string {
  const digits = extractPhoneDigits(value);
  if (!digits) return "";

  if (digits.length === 10) {
    return `+1 (${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }

  if (digits.length === 11 && digits.startsWith("1")) {
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }

  return `+${digits}`;
}
