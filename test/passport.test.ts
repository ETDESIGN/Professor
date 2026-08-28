import { describe, it, expect } from 'vitest';
import {
    PASSPORT_EMAIL_DOMAIN,
    resolveLoginIdentifier,
    encodeLoginPayload,
    decodeLoginPayload,
    buildLoginQrUrl,
    parseQrText,
} from '../services/passport';

describe('resolveLoginIdentifier', () => {
    it('passes emails through untouched', () => {
        expect(resolveLoginIdentifier('teacher@example.com')).toBe('teacher@example.com');
    });

    it('maps usernames to the synthetic passport email', () => {
        expect(resolveLoginIdentifier('leo')).toBe(`leo${PASSPORT_EMAIL_DOMAIN}`);
        expect(resolveLoginIdentifier('Leomendes')).toBe(`leomendes${PASSPORT_EMAIL_DOMAIN}`);
    });

    it('trims and lowercases usernames only', () => {
        expect(resolveLoginIdentifier('  Leo ')).toBe(`leo${PASSPORT_EMAIL_DOMAIN}`);
    });
});

describe('login QR payload round-trip', () => {
    it('encodes and decodes username:password', () => {
        const payload = encodeLoginPayload('leomendes', 'blue-tiger-mango-42');
        const decoded = decodeLoginPayload(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
        expect(decoded).toEqual({ username: 'leomendes', password: 'blue-tiger-mango-42' });
    });

    it('builds a login URL with the payload in the fragment', () => {
        const url = buildLoginQrUrl('leo', 'pw');
        expect(url).toMatch(/^https?:\/\/[^/]+\/login#p=/);
        expect(url.includes('?')).toBe(false); // fragment only — never sent to a server
    });
});

describe('parseQrText', () => {
    const payload = encodeLoginPayload('leomendesfam', 'sunny-otter-42-77');

    it('parses the full login URL a native camera scan opens', () => {
        const url = `https://professor.example.com/login#p=${payload}`;
        expect(parseQrText(url)).toEqual({ username: 'leomendesfam', password: 'sunny-otter-42-77' });
    });

    it('parses a bare payload value', () => {
        expect(parseQrText(payload)).toEqual({ username: 'leomendesfam', password: 'sunny-otter-42-77' });
    });

    it('parses a p= fragment', () => {
        expect(parseQrText(`p=${payload}`)).toEqual({ username: 'leomendesfam', password: 'sunny-otter-42-77' });
    });

    it('rejects non-login QR content', () => {
        expect(parseQrText('https://example.com/other')).toBeNull();
        expect(parseQrText('')).toBeNull();
        expect(parseQrText('hello world')).toBeNull();
    });

    it('rejects malformed payloads', () => {
        expect(parseQrText('aGVsbG8')).toBeNull(); // valid base64 of "hello", no colon
    });
});
