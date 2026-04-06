const NON_DIGITS = /\D/g;
const BRAZIL_COUNTRY_CODE = '55';
const USA_COUNTRY_CODE = '1';
const BRAZIL_AREA_CODES = new Set([
  '11', '12', '13', '14', '15', '16', '17', '18', '19',
  '21', '22', '24',
  '27', '28',
  '31', '32', '33', '34', '35', '37', '38',
  '41', '42', '43', '44', '45', '46',
  '47', '48', '49',
  '51', '53', '54', '55',
  '61', '62', '63', '64', '65', '66', '67', '68', '69',
  '71', '73', '74', '75', '77', '79',
  '81', '82', '83', '84', '85', '86', '87', '88', '89',
  '91', '92', '93', '94', '95', '96', '97', '98', '99',
]);

function isLikelyBrazilMobileLocal(digits: string): boolean {
  return digits.length === 11
    && BRAZIL_AREA_CODES.has(digits.slice(0, 2))
    && digits.slice(2, 3) === '9';
}

function inferCountryCodeFromPhone(value: string): string {
  const raw = String(value || '').trim();
  const digits = extractPhoneDigits(raw);
  if (!digits) return '';

  if (raw.startsWith('+')) {
    if (digits.startsWith(BRAZIL_COUNTRY_CODE)) return BRAZIL_COUNTRY_CODE;
    if (digits.startsWith(USA_COUNTRY_CODE)) return USA_COUNTRY_CODE;
    return digits.slice(0, Math.min(3, digits.length));
  }

  if (raw.startsWith('00') && digits.length > 2) {
    if (digits.slice(2).startsWith(BRAZIL_COUNTRY_CODE)) return BRAZIL_COUNTRY_CODE;
    if (digits.slice(2).startsWith(USA_COUNTRY_CODE)) return USA_COUNTRY_CODE;
    return digits.slice(2, Math.min(5, digits.length));
  }

  if (isLikelyBrazilMobileLocal(digits)) {
    return BRAZIL_COUNTRY_CODE;
  }

  if ((digits.startsWith(BRAZIL_COUNTRY_CODE) && (digits.length === 12 || digits.length === 13))) {
    return BRAZIL_COUNTRY_CODE;
  }

  if (digits.startsWith(USA_COUNTRY_CODE) && digits.length === 11) {
    return USA_COUNTRY_CODE;
  }

  if (digits.length === 10) {
    return USA_COUNTRY_CODE;
  }

  if (digits.length >= 11) {
    return digits.slice(0, Math.min(3, digits.length));
  }

  return '';
}

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

export function getDefaultCountryCode(value?: string): string {
  return inferCountryCodeFromPhone(value || '') || BRAZIL_COUNTRY_CODE;
}

export function toStoragePhone(value: string): string {
  const raw = String(value || '').trim();
  const digits = extractPhoneDigits(raw);
  if (!digits) return "";

  if (raw.startsWith('+')) {
    return digits;
  }

  if (raw.startsWith('00') && digits.length > 2) {
    return digits.slice(2);
  }

  if (isLikelyBrazilMobileLocal(digits)) {
    return `${BRAZIL_COUNTRY_CODE}${digits}`;
  }

  if ((digits.startsWith(BRAZIL_COUNTRY_CODE) && (digits.length === 12 || digits.length === 13))
    || (digits.startsWith(USA_COUNTRY_CODE) && digits.length === 11)) {
    return digits;
  }

  if (digits.length === 10) {
    return `${USA_COUNTRY_CODE}${digits}`;
  }

  if (digits.length >= 11) return digits;

  return digits;
}

export function formatPhoneForDisplay(value: string): string {
  const normalized = toStoragePhone(value);
  const digits = extractPhoneDigits(normalized);
  if (!digits) return "";

  if (digits.startsWith(BRAZIL_COUNTRY_CODE) && digits.length === 12) {
    const area = digits.slice(2, 4);
    const local = digits.slice(4);
    return `+55 (${area}) ${local.slice(0, 4)}-${local.slice(4)}`;
  }

  if (digits.startsWith(BRAZIL_COUNTRY_CODE) && digits.length === 13) {
    const area = digits.slice(2, 4);
    const local = digits.slice(4);
    return `+55 (${area}) ${local.slice(0, 5)}-${local.slice(5)}`;
  }

  if (digits.startsWith(USA_COUNTRY_CODE) && digits.length === 11) {
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }

  return `+${digits}`;
}

export function inferPhoneCountry(value: string): 'Brasil' | 'USA' | null {
  const countryCode = inferCountryCodeFromPhone(value);
  if (countryCode === BRAZIL_COUNTRY_CODE) return 'Brasil';
  if (countryCode === USA_COUNTRY_CODE) return 'USA';
  return null;
}
