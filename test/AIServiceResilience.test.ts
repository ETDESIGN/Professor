import { describe, it, expect } from 'vitest';

const buildResilientResponse = (data: any) => {
  const textContent = data?.textContent || {};
  const vocabulary = Array.isArray(textContent.vocabulary) ? textContent.vocabulary : [];
  const grammarRules = Array.isArray(textContent.grammarRules) ? textContent.grammarRules : [];
  const sentences = Array.isArray(textContent.sentences) ? textContent.sentences : [];

  return {
    textContent: {
      title: textContent.title || 'Generated Lesson',
      description: textContent.description || 'A lesson',
      vocabulary: vocabulary.length > 0 ? vocabulary : [
        { word: 'Vocabulary', definition: 'A key term' },
      ],
      grammarRules: grammarRules.length > 0 ? grammarRules : [
        { rule: 'Basic Sentence Structure', explanation: 'Subject + verb.' },
      ],
      sentences: sentences.length > 0 ? sentences : [
        { original: 'We are learning.', translation: 'We are studying.' },
      ],
    },
    imageUrl: data?.imageUrl || `https://api.dicebear.com/7.x/shapes/svg?seed=fallback`,
    audioUrl: data?.audioUrl || null,
  };
};

describe('AIService Response Resilience', () => {
  it('should handle null data gracefully', () => {
    const result = buildResilientResponse(null);
    expect(result.textContent.title).toBe('Generated Lesson');
    expect(result.textContent.vocabulary.length).toBe(1);
    expect(result.textContent.grammarRules.length).toBe(1);
    expect(result.audioUrl).toBeNull();
  });

  it('should handle empty object', () => {
    const result = buildResilientResponse({});
    expect(result.textContent.vocabulary.length).toBe(1);
  });

  it('should handle partial data with missing vocabulary', () => {
    const result = buildResilientResponse({
      textContent: { title: 'My Lesson', grammarRules: [{ rule: 'Tense', explanation: 'Past tense' }] },
    });
    expect(result.textContent.title).toBe('My Lesson');
    expect(result.textContent.vocabulary.length).toBe(1);
    expect(result.textContent.grammarRules.length).toBe(1);
  });

  it('should handle vocabulary as non-array', () => {
    const result = buildResilientResponse({
      textContent: { vocabulary: 'not an array' },
    });
    expect(result.textContent.vocabulary.length).toBe(1);
  });

  it('should pass through valid data unchanged', () => {
    const data = {
      textContent: {
        title: 'City Transport',
        vocabulary: [{ word: 'bus', definition: 'vehicle' }],
        grammarRules: [{ rule: 'is/are', explanation: 'singular/plural' }],
        sentences: [{ original: 'The bus is here.', translation: 'Le bus est la.' }],
      },
      imageUrl: 'https://example.com/image.png',
      audioUrl: 'https://example.com/audio.mp3',
    };
    const result = buildResilientResponse(data);
    expect(result.textContent.title).toBe('City Transport');
    expect(result.textContent.vocabulary.length).toBe(1);
    expect(result.textContent.vocabulary[0].word).toBe('bus');
    expect(result.imageUrl).toBe('https://example.com/image.png');
    expect(result.audioUrl).toBe('https://example.com/audio.mp3');
  });

  it('should handle empty vocabulary array by providing defaults', () => {
    const result = buildResilientResponse({
      textContent: { vocabulary: [] },
    });
    expect(result.textContent.vocabulary.length).toBe(1);
    expect(result.textContent.vocabulary[0].word).toBe('Vocabulary');
  });
});
