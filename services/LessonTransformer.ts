import { supabase } from './supabaseClient';
import { createClientLogger } from './logger';
import { MediaService } from './MediaService';
import { normalizeManifest } from './manifest';

const log = createClientLogger('LessonTransformer');

const differentiateText = async (text: string, theme: string): Promise<{ below: string, on: string, above: string }> => {
  try {
    const { data, error } = await supabase.functions.invoke('generate-lesson', {
      body: { action: 'differentiate', text, theme }
    });

    if (error) {
      log.warn('differentiate_edge_error', { error: error.message });
      return { below: text, on: text, above: text };
    }

    if (data?.below && data?.on && data?.above) {
      return { below: data.below, on: data.on, above: data.above };
    }

    log.warn('differentiate_missing_fields');
    return { below: text, on: text, above: text };
  } catch (err: any) {
    log.warn('differentiate_fallback', { error: err.message });
    return { below: text, on: text, above: text };
  }
};

const getAssetUrl = (keyword: string) => {
  return `https://api.dicebear.com/7.x/shapes/svg?seed=${encodeURIComponent(keyword || 'vocab')}&backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5be`;
};

export const transformManifestToFlow = async (manifest: any): Promise<any[]> => {
  // Normalize any manifest shape (knowledge_graph / enriched_content / flat /
  // null) into the canonical flat view so this never crashes on partial data.
  const m = normalizeManifest(manifest);
  const unitId = (m.meta as any).unit_id || m.meta.unit_title || 'unknown';

  const vocabImagePromises = m.vocabulary.map(async (v: any) => {
    try {
      const cachedImage = MediaService.getCachedImage(unitId, v.word);
      if (cachedImage) return { word: v.word, url: cachedImage };
      if (v.image_url && v.image_url.startsWith('http')) return { word: v.word, url: v.image_url };
      const url = await MediaService.getVocabImage(unitId, v.word, v.definition);
      return { word: v.word, url };
    } catch (err: any) {
      log.warn('vocab_image_error', { error: err.message, metadata: { word: v.word } } as any);
      return { word: v.word, url: v.image_url || '' };
    }
  });

  const vocabImages = await Promise.all(vocabImagePromises);
  const imageMap = new Map(vocabImages.filter(v => v.url).map(v => [v.word, v.url]));

  const getImageForWord = (word: string): string => {
    return imageMap.get(word) || getAssetUrl(word);
  };

  const introSlide = {
    id: 'step_intro',
    type: 'INTRO_SPLASH',
    title: `Welcome to ${m.meta.unit_title}`,
    duration: 5,
    data: { theme: m.meta.theme }
  };

  const flowSlidesPromises = m.timeline.map(async (block, index) => {
    const stepId = `step_${index + 1}`;
    const upperType = block.type.toUpperCase();

    switch (true) {
      case upperType.includes('MEDIA') || upperType.includes('VIDEO'):
        return {
          id: stepId,
          type: 'MEDIA_PLAYER',
          title: block.title,
          duration: block.duration || 300,
          teacherGuide: {
            instruction: "Play the video to introduce the topic.",
            script: `Let's watch a video about ${m.meta.theme}.`,
          },
          data: {
            title: block.title,
            videoThumbnail: getImageForWord(block.config?.search_query || m.meta.theme),
            lyrics: []
          }
        };

      case upperType.includes('FOCUS') || upperType.includes('VOCAB'):
        const vocabSource = (block.config?.items && block.config.items.length > 0)
          ? block.config.items
          : m.vocabulary;

        return {
          id: stepId,
          type: 'FOCUS_CARDS',
          title: block.title,
          duration: block.duration || 300,
          teacherGuide: {
            instruction: "Drill pronunciation. Use the 'Flip' button to reveal the word.",
            script: "Repeat after me.",
          },
          data: {
            title: "New Vocabulary",
            cards: vocabSource.map((v: any, i: number) => ({
              id: `c_${i}`,
              front: v.image_prompt ? '🎨' : '📸',
              back: v.word,
              pronunciation: `/${v.word.toLowerCase()}/`,
              image: getImageForWord(v.word)
            }))
          }
        };

      case upperType.includes('GAME') || upperType.includes('ARENA') || upperType.includes('QUIZ'):
        const quizQuestions = m.vocabulary.slice(0, 5).map((v, i) => ({
          id: `q_${i}`,
          text: `Which one is the ${v.word}?`,
          image: getImageForWord(v.word),
          options: [v.word, ...(v.distractors || ['Option A', 'Option B'])].sort(() => Math.random() - 0.5),
          correct: v.word
        }));

        return {
          id: stepId,
          type: 'TEAM_BATTLE',
          title: block.title,
          duration: block.duration || 600,
          teacherGuide: {
            instruction: "Divide class into Red vs Blue teams.",
            script: "Who knows the answer? Team Red?",
            answerKey: quizQuestions.map(q => q.correct).join(', ')
          },
          data: {
            topic: m.meta.theme,
            questions: quizQuestions
          }
        };

      case upperType.includes('LISTEN') || upperType.includes('LISTEN_TAP'):
        const listenVocab = m.vocabulary.slice(0, 4);
        const listenOptions = listenVocab.length > 0 ? listenVocab.map((v, i) => ({
          id: i,
          img: getImageForWord(v.word),
          label: v.word,
          correct: i === 0
        })) : undefined;

        if (listenVocab.length >= 2) {
          const correctWord = listenVocab[Math.floor(Math.random() * listenVocab.length)];
          const others = listenVocab.filter(v => v.word !== correctWord.word).slice(0, 3);
          const allOptions = [correctWord, ...others].sort(() => Math.random() - 0.5).map((v, i) => ({
            id: i,
            img: getImageForWord(v.word),
            label: v.word,
            correct: v.word === correctWord.word
          }));

          return {
            id: stepId,
            type: 'LISTEN_TAP',
            title: block.title || 'Listen & Tap',
            duration: block.duration || 120,
            data: {
              instruction: `Listen and select the "${correctWord.word}"`,
              targetWord: correctWord.word,
              options: allOptions
            }
          };
        }
        return {
          id: stepId,
          type: 'INTRO_SPLASH',
          title: block.title,
          duration: block.duration || 120,
          data: { theme: block.title }
        };

      case upperType.includes('FLASH') || upperType.includes('MATCH') || upperType.includes('FLASH_MATCH'):
        const matchVocab = m.vocabulary.slice(0, 5);
        if (matchVocab.length >= 2) {
          const matchPairs = matchVocab.map((v, i) => ({
            id: `p_${i}`,
            left: v.word,
            right: v.definition || v.translation || `${v.word} def`
          }));

          return {
            id: stepId,
            type: 'FLASH_MATCH',
            title: block.title || 'Match the Pairs',
            duration: block.duration || 180,
            data: { pairs: matchPairs }
          };
        }
        return {
          id: stepId,
          type: 'INTRO_SPLASH',
          title: block.title,
          duration: block.duration || 120,
          data: { theme: block.title }
        };

      case upperType.includes('SCRAMBLE') || upperType.includes('SENTENCE'):
        const scrambleVocab = m.vocabulary.slice(0, 3);
        if (scrambleVocab.length > 0) {
          const target = scrambleVocab[Math.floor(Math.random() * scrambleVocab.length)];
          const sentence = target.example_sentence || `The ${target.word} is very interesting`;
          const words = sentence.split(/\s+/).filter(w => w.length > 0);
          const distractors = scrambleVocab
            .filter(v => v.word !== target.word)
            .slice(0, 2)
            .map((v, i) => ({ id: `d_${i}`, text: v.word.toLowerCase() }));

          const wordBank = words.map((w, i) => ({ id: `w_${i}`, text: w }))
            .concat(distractors)
            .sort(() => Math.random() - 0.5);

          return {
            id: stepId,
            type: 'SCRAMBLE',
            title: block.title || 'Build the Sentence',
            duration: block.duration || 180,
            data: {
              targetSentence: {
                en: sentence,
                translation: target.translation || target.definition || ''
              },
              wordBank
            }
          };
        }
        return {
          id: stepId,
          type: 'INTRO_SPLASH',
          title: block.title,
          duration: block.duration || 120,
          data: { theme: block.title }
        };

      case upperType.includes('SPEAK') || upperType.includes('PRONUNCIATION'):
        const speakVocab = m.vocabulary.slice(0, 3);
        if (speakVocab.length > 0) {
          const word = speakVocab[Math.floor(Math.random() * speakVocab.length)];
          return {
            id: stepId,
            type: 'SPEAKING',
            title: block.title || 'Pronunciation Practice',
            duration: block.duration || 120,
            data: {
              targetSentence: word.example_sentence || word.word,
              targetWord: word.word
            }
          };
        }
        return {
          id: stepId,
          type: 'INTRO_SPLASH',
          title: block.title,
          duration: block.duration || 120,
          data: { theme: block.title }
        };

      case upperType.includes('STORY') || upperType.includes('READING'):
        const baseText = block.config?.text || `One day in the ${m.meta.theme}, something unexpected happened.`;
        const readingLevels = await differentiateText(baseText, m.meta.theme);

        return {
          id: stepId,
          type: 'STORY_STAGE',
          title: block.title,
          duration: block.duration || 600,
          teacherGuide: {
            instruction: "Read aloud, then assign roles. Use the differentiation toggle to adjust reading level for different students.",
            script: "Let's see what happens next.",
          },
          data: {
            pages: [{ id: 'p1', text: baseText }],
            readingLevels: readingLevels
          }
        };

      default:
        return {
          id: stepId,
          type: 'INTRO_SPLASH',
          title: block.title,
          duration: block.duration || 300,
          data: { theme: block.title }
        };
    }
  });

  const flowSlides = await Promise.all(flowSlidesPromises);
  return [introSlide, ...flowSlides];
};
