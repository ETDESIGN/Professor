import { useState, useCallback } from 'react';
import { createClientLogger } from '../../../../services/logger';

const log = createClientLogger('useAISuggestion');

export const useAISuggestion = () => {
  const [showAiSuggestion, setShowAiSuggestion] = useState(false);
  const [aiSuggestionText, setAiSuggestionText] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  const handleGenerate = useCallback(async () => {
    setIsGenerating(true);
    try {
      const context = aiSuggestionText || 'class activity';
      log.info('live_feedback_not_yet_implemented', { metadata: { context } });
      setShowAiSuggestion(false);
      return null;
    } catch (err) {
      log.warn('live_ai_error', { error: err instanceof Error ? err.message : String(err) });
    } finally {
      setIsGenerating(false);
    }
  }, [aiSuggestionText]);

  const showSuggestion = useCallback(async (context: string) => {
    setIsGenerating(true);
    try {
      log.info('live_feedback_not_yet_implemented', { metadata: { context } });
      setAiSuggestionText(context);
      setShowAiSuggestion(true);
    } catch (err) {
      log.warn('live_ai_error', { error: err instanceof Error ? err.message : String(err) });
    } finally {
      setIsGenerating(false);
    }
  }, []);

  const dismissSuggestion = useCallback(() => setShowAiSuggestion(false), []);

  return { showAiSuggestion, aiSuggestionText, isGenerating, handleGenerate, showSuggestion, dismissSuggestion };
};
