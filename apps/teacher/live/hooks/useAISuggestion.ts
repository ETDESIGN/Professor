import { useState, useEffect } from 'react';
import { AIService } from '../../../../services/AIService';
import { createClientLogger } from '../../../../services/logger';

const log = createClientLogger('useAISuggestion');

export const useAISuggestion = () => {
  const [showAiSuggestion, setShowAiSuggestion] = useState(false);
  const [aiSuggestionText, setAiSuggestionText] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
    const aiTimer = setTimeout(() => {
      setAiSuggestionText("4 students are struggling with 'Orbit'. Generate a quick review slide?");
      setShowAiSuggestion(true);
    }, 15000);

    return () => clearTimeout(aiTimer);
  }, []);

  const handleGenerate = async () => {
    setIsGenerating(true);
    try {
      await AIService.generateLiveFeedback(aiSuggestionText);
      setShowAiSuggestion(false);
    } catch (err) {
      log.warn('live_ai_error', { error: err instanceof Error ? err.message : String(err) });
    } finally {
      setIsGenerating(false);
    }
  };

  const dismissSuggestion = () => setShowAiSuggestion(false);

  return { showAiSuggestion, aiSuggestionText, isGenerating, handleGenerate, dismissSuggestion };
};
