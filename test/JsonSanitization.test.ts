import { describe, it, expect } from 'vitest';

const sanitizeAIResponse = (raw: string): any => {
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  const cleanJson = jsonMatch ? jsonMatch[0] : raw;
  return JSON.parse(cleanJson);
};

describe('JSON Sanitization Pipeline', () => {
  it('should extract JSON from markdown code blocks', () => {
    const raw = '```json\n{"meta": {"unit_title": "Test"}}\n```';
    const result = sanitizeAIResponse(raw);
    expect(result.meta.unit_title).toBe('Test');
  });

  it('should extract JSON wrapped in markdown without json tag', () => {
    const raw = '```\n{"key": "value"}\n```';
    const result = sanitizeAIResponse(raw);
    expect(result.key).toBe('value');
  });

  it('should handle JSON with surrounding text', () => {
    const raw = 'Here is the result:\n{"status": "ok", "data": [1, 2, 3]}\nThat is all.';
    const result = sanitizeAIResponse(raw);
    expect(result.status).toBe('ok');
    expect(result.data).toEqual([1, 2, 3]);
  });

  it('should handle plain JSON without wrapping', () => {
    const raw = '{"word": "bus", "definition": "a vehicle"}';
    const result = sanitizeAIResponse(raw);
    expect(result.word).toBe('bus');
  });

  it('should handle nested JSON with arrays and objects', () => {
    const raw = `{
      "meta": {"unit_title": "City", "theme": "Transport"},
      "knowledge_graph": {
        "vocabulary": [{"word": "bus", "definition": "a large vehicle"}]
      }
    }`;
    const result = sanitizeAIResponse(raw);
    expect(result.meta.theme).toBe('Transport');
    expect(result.knowledge_graph.vocabulary.length).toBe(1);
  });

  it('should throw on invalid JSON', () => {
    const raw = 'This is not JSON at all';
    expect(() => sanitizeAIResponse(raw)).toThrow();
  });

  it('should handle JSON with leading/trailing whitespace', () => {
    const raw = '   \n\n  {"key": "value"}  \n  ';
    const result = sanitizeAIResponse(raw);
    expect(result.key).toBe('value');
  });

  it('should handle JSON from LLM that includes explanation before', () => {
    const raw = `I have generated the manifest as requested.

{
  "meta": { "unit_title": "Animals", "theme": "Jungle" },
  "knowledge_graph": { "vocabulary": [] }
}

Let me know if you need changes!`;
    const result = sanitizeAIResponse(raw);
    expect(result.meta.unit_title).toBe('Animals');
  });

  it('should handle JSON with escaped characters', () => {
    const raw = '{"text": "He said \\"hello\\" and left"}';
    const result = sanitizeAIResponse(raw);
    expect(result.text).toBe('He said "hello" and left');
  });
});
