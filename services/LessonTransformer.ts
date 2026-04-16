
import { LessonManifest, ActivityBlock, RichVocabItem } from '../types/pipeline';
import { supabase } from './supabaseClient';
import { createClientLogger } from './logger';

const log = createClientLogger('LessonTransformer');

const differentiateText = async (text: string, theme: string): Promise<{ below: string, on: string, above: string }> => {
  try {
    const { data, error } = await supabase.functions.invoke('generate-lesson', {
      body: {
        action: 'differentiate',
        text,
        theme
      }
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

/**
 * LessonTransformer
 * 
 * The bridge between the "AI Brain" (Manifest) and the "Game Engine" (Board Components).
 * It takes generic AI concepts and structures them into the exact JSON props required by React components.
 */

// Helper to get image URL (Mock or Real)
const getAssetUrl = (keyword: string) => {
  return `https://api.dicebear.com/7.x/shapes/svg?seed=${encodeURIComponent(keyword)}&backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5be`;
};

export const transformManifestToFlow = async (manifest: LessonManifest): Promise<any[]> => {

  // 1. Create Intro Splash
  const introSlide = {
    id: 'step_intro',
    type: 'INTRO_SPLASH',
    title: `Welcome to ${manifest.meta.unit_title}`,
    duration: 5,
    data: { theme: manifest.meta.theme }
  };

  // 2. Transform Timeline Items
  const flowSlidesPromises = manifest.timeline.map(async (block, index) => {
    const stepId = `step_${index + 1}`;
    const upperType = block.type.toUpperCase(); // Normalize AI output

    switch (true) {
      case upperType.includes('MEDIA') || upperType.includes('VIDEO'):
        return {
          id: stepId,
          type: 'MEDIA_PLAYER',
          title: block.title,
          duration: block.duration || 300,
          teacherGuide: {
            instruction: "Play the video to introduce the topic.",
            script: `Let's watch a video about ${manifest.meta.theme}.`,
          },
          data: {
            title: block.title,
            videoThumbnail: getAssetUrl(block.config?.search_query || manifest.meta.theme),
            lyrics: []
          }
        };

      case upperType.includes('FOCUS') || upperType.includes('VOCAB'):
        // Use full vocabulary list if block config is empty
        const vocabSource = (block.config?.items && block.config.items.length > 0)
          ? block.config.items
          : manifest.knowledge_graph.vocabulary;

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
              image: getAssetUrl(v.word)
            }))
          }
        };

      case upperType.includes('GAME') || upperType.includes('ARENA') || upperType.includes('QUIZ'):
        // Generate Quiz Questions from Vocabulary + Distractors
        const quizQuestions = manifest.knowledge_graph.vocabulary.slice(0, 5).map((v, i) => ({
          id: `q_${i}`,
          text: `Which one is the ${v.word}?`,
          image: getAssetUrl(v.word),
          options: [v.word, ...(v.distractors || ['Option A', 'Option B'])].sort(() => Math.random() - 0.5),
          correct: v.word
        }));

        return {
          id: stepId,
          type: 'TEAM_BATTLE', // Map GAME_ARENA to TEAM_BATTLE
          title: block.title,
          duration: block.duration || 600,
          teacherGuide: {
            instruction: "Divide class into Red vs Blue teams.",
            script: "Who knows the answer? Team Red?",
            answerKey: quizQuestions.map(q => q.correct).join(', ')
          },
          data: {
            topic: manifest.meta.theme,
            questions: quizQuestions
          }
        };

      case upperType.includes('STORY') || upperType.includes('READING'):
        const baseText = block.config?.text || `One day in the ${manifest.meta.theme}, something unexpected happened.`;
        const readingLevels = await differentiateText(baseText, manifest.meta.theme);

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
            pages: [
              { id: 'p1', text: baseText }
            ],
            readingLevels: readingLevels
          }
        };

      default:
        // Safe fallback for unknown types
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
