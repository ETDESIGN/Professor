import DOMPurify from 'dompurify';

const RICH_TAGS = ['b', 'i', 'em', 'strong', 'p', 'br', 'ul', 'ol', 'li', 'span'];

export function sanitizeText(input: string): string {
  return DOMPurify.sanitize(input, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] }) as string;
}

export function sanitizeRichText(input: string): string {
  return DOMPurify.sanitize(input, { ALLOWED_TAGS: RICH_TAGS, ALLOWED_ATTR: ['class'] }) as string;
}

export function sanitizeObject<T extends Record<string, unknown>>(obj: T, fields: (keyof T)[]): T {
  const result = { ...obj };
  for (const field of fields) {
    if (typeof result[field] === 'string') {
      (result as Record<string, unknown>)[field as string] = sanitizeText(result[field] as string);
    }
  }
  return result;
}

const SQL_INJECTION_PATTERNS = [
  /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|UNION|ALTER|CREATE|EXEC|EXECUTE)\b)/gi,
  /(--|;|\/\*|\*\/|xp_|0x)/gi,
];

export function detectSqlInjection(input: string): boolean {
  return SQL_INJECTION_PATTERNS.some((pattern) => pattern.test(input));
}

export function sanitizeFilename(filename: string): string {
  return filename.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 255);
}
