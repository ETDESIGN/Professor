import React, { useState, useEffect, useCallback } from 'react';
import {
  BookOpen, Wand2, Check, X, RefreshCw, Music, Video, Users, MessageSquare,
  Loader2, ChevronRight, ChevronLeft, Sparkles, FileText, AlertTriangle,
  ThumbsUp, ThumbsDown, Play, Search, BookmarkPlus, Image
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../../services/supabaseClient';
import { AIService } from '../../services/AIService';
import { toast } from 'sonner';
import { createClientLogger } from '../../services/logger';

const log = createClientLogger('AssetWorkshop');

type Category = 'vocabulary' | 'grammar' | 'characters' | 'story' | 'songs' | 'videos' | 'dialogues';

interface EnrichedItem {
  [key: string]: any;
  _approved?: boolean;
  _regenerating?: boolean;
}

interface EnrichedManifest {
  title: string;
  topic: string;
  gradeLevel: string;
  description: string;
  vocabulary: EnrichedItem[];
  grammar: EnrichedItem[];
  characters: EnrichedItem[];
  story: { title: string; setting: string; pages: EnrichedItem[] };
  song_suggestions: EnrichedItem[];
  video_suggestions: EnrichedItem[];
  dialogues: EnrichedItem[];
}

const CATEGORIES: { id: Category; label: string; icon: React.ReactNode; color: string }[] = [
  { id: 'vocabulary', label: 'Vocabulary', icon: <BookOpen size={18} />, color: 'emerald' },
  { id: 'grammar', label: 'Grammar', icon: <FileText size={18} />, color: 'indigo' },
  { id: 'characters', label: 'Characters', icon: <Users size={18} />, color: 'purple' },
  { id: 'story', label: 'Story', icon: <Sparkles size={18} />, color: 'amber' },
  { id: 'songs', label: 'Songs', icon: <Music size={18} />, color: 'pink' },
  { id: 'videos', label: 'Videos', icon: <Video size={18} />, color: 'blue' },
  { id: 'dialogues', label: 'Dialogues', icon: <MessageSquare size={18} />, color: 'teal' },
];

const colorClasses: Record<string, { bg: string; border: string; text: string; badge: string; light: string }> = {
  emerald: { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-800', badge: 'bg-emerald-100 text-emerald-700', light: 'bg-emerald-100' },
  indigo: { bg: 'bg-indigo-50', border: 'border-indigo-200', text: 'text-indigo-800', badge: 'bg-indigo-100 text-indigo-700', light: 'bg-indigo-100' },
  purple: { bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-800', badge: 'bg-purple-100 text-purple-700', light: 'bg-purple-100' },
  amber: { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-800', badge: 'bg-amber-100 text-amber-700', light: 'bg-amber-100' },
  pink: { bg: 'bg-pink-50', border: 'border-pink-200', text: 'text-pink-800', badge: 'bg-pink-100 text-pink-700', light: 'bg-pink-100' },
  blue: { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-800', badge: 'bg-blue-100 text-blue-700', light: 'bg-blue-100' },
  teal: { bg: 'bg-teal-50', border: 'border-teal-200', text: 'text-teal-800', badge: 'bg-teal-100 text-teal-700', light: 'bg-teal-100' },
};

interface AssetWorkshopProps {
  unitId: string;
  onBack: () => void;
  onOrchestrate: (unitId: string, enriched: EnrichedManifest) => void;
}

const AssetWorkshop: React.FC<AssetWorkshopProps> = ({ unitId, onBack, onOrchestrate }) => {
  const [activeCategory, setActiveCategory] = useState<Category>('vocabulary');
  const [enriched, setEnriched] = useState<EnrichedManifest | null>(null);
  const [loadingCategories, setLoadingCategories] = useState<Set<string>>(new Set());
  const [isOrchestrating, setIsOrchestrating] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    loadExistingEnrichment();
  }, [unitId]);

  const loadExistingEnrichment = async () => {
    try {
      const { data: unit, error } = await supabase
        .from('units')
        .select('manifest')
        .eq('id', unitId)
        .single();

      if (error) throw error;

      const existing = unit?.manifest?.enriched_content;
      if (existing) {
        setEnriched(ensureApprovalStates(existing));

        // Check which categories are empty and re-enrich only those
        const emptyCategories: string[] = [];
        if (!existing.vocabulary?.length) emptyCategories.push('vocabulary');
        if (!existing.grammar?.length) emptyCategories.push('grammar');
        if (!existing.characters?.length) emptyCategories.push('characters');
        if (!existing.story?.pages?.length) emptyCategories.push('story');
        if (!existing.song_suggestions?.length) emptyCategories.push('media');
        if (!existing.dialogues?.length) emptyCategories.push('dialogues');

        if (emptyCategories.length > 0) {
          log.info('re_enriching_empty_categories', { categories: emptyCategories });
          await handleEnrichCategories(emptyCategories);
        }
        return;
      }

      await handleEnrich();
    } catch (err: any) {
      log.warn('load_enrichment_error', { error: err?.message });
      setLoadError('Failed to load unit data.');
    }
  };

  const ensureApprovalStates = (data: any): EnrichedManifest => {
    const patch = (arr: any[]) => arr.map((item: any) => ({ ...item, _approved: item._approved !== false }));
    return {
      title: data.title || '',
      topic: data.topic || '',
      gradeLevel: data.gradeLevel || 'A1',
      description: data.description || '',
      vocabulary: patch(data.vocabulary || []),
      grammar: patch(data.grammar || []),
      characters: patch(data.characters || []),
      story: {
        title: data.story?.title || '',
        setting: data.story?.setting || '',
        pages: patch(data.story?.pages || []),
      },
      song_suggestions: patch(data.song_suggestions || []),
      video_suggestions: patch(data.video_suggestions || []),
      dialogues: patch(data.dialogues || []),
    };
  };

  const handleEnrich = async () => {
    setLoadError(null);
    const categories = ['vocabulary', 'grammar', 'characters', 'story', 'media', 'dialogues'];
    await handleEnrichCategories(categories);
  };

  const handleEnrichCategories = async (categories: string[]) => {
    setLoadingCategories(prev => new Set([...prev, ...categories]));

    // Initialize empty manifest so the UI renders immediately
    setEnriched(prev => prev || {
      title: 'Enriching...', topic: '', gradeLevel: 'A1', description: '',
      vocabulary: [], grammar: [], characters: [], story: { title: '', setting: '', pages: [] },
      song_suggestions: [], video_suggestions: [], dialogues: []
    } as any);

    // Sequential enrichment with delay between categories
    for (let i = 0; i < categories.length; i++) {
      const category = categories[i];
      try {
        const { data, error } = await supabase.functions.invoke('enrich-unit', {
          body: { unitId, category },
        });
        if (error) throw error;
        if (data?.success === false) throw new Error(data.error || `Enrichment failed for ${category}`);
        if (data?.enriched) {
          setEnriched(prev => {
            const patched = ensureApprovalStates(data.enriched);
            if (!prev) return patched;

            const merged = { ...prev };
            if (patched.title && patched.title !== 'Enriching...') merged.title = patched.title;
            if (patched.topic) merged.topic = patched.topic;
            if (patched.gradeLevel) merged.gradeLevel = patched.gradeLevel;
            if (patched.description) merged.description = patched.description;
            if (patched.vocabulary?.length > 0) merged.vocabulary = patched.vocabulary;
            if (patched.grammar?.length > 0) merged.grammar = patched.grammar;
            if (patched.characters?.length > 0) merged.characters = patched.characters;
            if (patched.story?.pages?.length > 0) merged.story = patched.story;
            if (patched.song_suggestions?.length > 0) merged.song_suggestions = patched.song_suggestions;
            if (patched.video_suggestions?.length > 0) merged.video_suggestions = patched.video_suggestions;
            if (patched.dialogues?.length > 0) merged.dialogues = patched.dialogues;

            return merged;
          });
        }
      } catch (err: any) {
        log.warn(`enrich_error_${category}`, { error: err?.message });
        toast.error(`Failed to load ${category}: ${err?.message || 'Unknown error'}`);
      } finally {
        setLoadingCategories(prev => {
          const next = new Set(prev);
          next.delete(category);
          return next;
        });
      }

      // 1.5s delay between categories
      if (i < categories.length - 1) {
        await new Promise(r => setTimeout(r, 1500));
      }
    }

    toast.success('Content enrichment complete!');
  };

  const toggleApproval = useCallback((category: string, index: number) => {
    setEnriched(prev => {
      if (!prev) return prev;
      const updated = { ...prev };
      const arr = getCategoryArray(updated, category);
      if (arr && arr[index] !== undefined) {
        arr[index] = { ...arr[index], _approved: !arr[index]._approved };
      }
      return updated;
    });
  }, []);

  const getCategoryArray = (manifest: EnrichedManifest, category: string): EnrichedItem[] | null => {
    switch (category) {
      case 'vocabulary': return manifest.vocabulary;
      case 'grammar': return manifest.grammar;
      case 'characters': return manifest.characters;
      case 'story': return manifest.story.pages;
      case 'songs': return manifest.song_suggestions;
      case 'videos': return manifest.video_suggestions;
      case 'dialogues': return manifest.dialogues;
      default: return null;
    }
  };

  const getCounts = useCallback((): Record<Category, { total: number; approved: number }> => {
    if (!enriched) return {} as any;
    const count = (arr: EnrichedItem[]) => ({
      total: arr.length,
      approved: arr.filter(i => i._approved !== false).length,
    });
    return {
      vocabulary: count(enriched.vocabulary),
      grammar: count(enriched.grammar),
      characters: count(enriched.characters),
      story: count(enriched.story.pages),
      songs: count(enriched.song_suggestions),
      videos: count(enriched.video_suggestions),
      dialogues: count(enriched.dialogues),
    };
  }, [enriched]);

  const handleOrchestrate = async () => {
    if (!enriched) return;
    setIsOrchestrating(true);
    try {
      const approvedAssets = {
        vocabulary: enriched.vocabulary.filter(v => v._approved !== false),
        grammar: enriched.grammar.filter(g => g._approved !== false),
        characters: enriched.characters.filter(c => c._approved !== false),
        story: {
          ...enriched.story,
          pages: enriched.story.pages.filter(p => p._approved !== false),
        },
        song_suggestions: enriched.song_suggestions.filter(s => s._approved !== false),
        video_suggestions: enriched.video_suggestions.filter(v => v._approved !== false),
        dialogues: enriched.dialogues.filter(d => d._approved !== false),
        title: enriched.title,
        topic: enriched.topic,
        gradeLevel: enriched.gradeLevel,
        description: enriched.description,
      };

      await supabase.from('units').update({
        manifest: {
          meta: { unit_title: enriched.title, theme: enriched.topic, difficulty_cefr: enriched.gradeLevel },
          enriched_content: enriched,
          knowledge_graph: {
            vocabulary: approvedAssets.vocabulary.map(v => ({
              word: v.word, definition: v.definition, image_prompt: v.image_prompt,
              context_sentence: v.example_sentence, distractors: v.distractors || [],
            })),
            grammar_rules: approvedAssets.grammar.map(g => ({
              rule: g.rule, explanation: g.explanation, world_examples: g.examples || [],
            })),
            characters: approvedAssets.characters,
            narrative_arc: approvedAssets.story.pages.map((p: any) => p.text).join(' '),
          },
          theme_context: {
            setting: enriched.story?.setting || '',
            characters: approvedAssets.characters,
            world_description: enriched.description || '',
          },
        },
      }).eq('id', unitId);

      const { data, error } = await supabase.functions.invoke('orchestrate-lesson', {
        body: { unitId, approvedAssets },
      });

      if (error) throw error;
      if (data?.success === false && data?.errors?.length) {
        toast.warning(`Lesson created with warnings: ${data.errors.join(', ')}`);
      } else {
        toast.success('Lesson orchestrated and published!');
      }

      onOrchestrate(unitId, enriched);
    } catch (err: any) {
      log.warn('orchestrate_error', { error: err?.message });
      toast.error(err.message || 'Failed to orchestrate lesson');
    } finally {
      setIsOrchestrating(false);
    }
  };

  const approveAll = useCallback((category: string) => {
    setEnriched(prev => {
      if (!prev) return prev;
      const updated = { ...prev };
      const arr = getCategoryArray(updated, category);
      if (arr) arr.forEach((item: any, i: number) => { arr[i] = { ...item, _approved: true }; });
      return updated;
    });
  }, []);

  const rejectAll = useCallback((category: string) => {
    setEnriched(prev => {
      if (!prev) return prev;
      const updated = { ...prev };
      const arr = getCategoryArray(updated, category);
      if (arr) arr.forEach((item: any, i: number) => { arr[i] = { ...item, _approved: false }; });
      return updated;
    });
  }, []);

  const counts = getCounts();

  const isEnriching = loadingCategories.size > 0;

  if (loadError && !enriched) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center h-[calc(100vh-64px)] bg-slate-50 gap-4">
        <AlertTriangle size={48} className="text-amber-500" />
        <p className="text-slate-600 font-bold">Content Enrichment Failed</p>
        <p className="text-slate-400 text-sm max-w-md text-center">{loadError}</p>
        <div className="flex gap-3">
          <button onClick={onBack} className="px-4 py-2 border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50">
            Back to Upload
          </button>
          <button onClick={handleEnrich} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2">
            <RefreshCw size={16} /> Retry
          </button>
        </div>
      </div>
    );
  }

  if (!enriched) return null;

  const renderCategoryContent = () => {
    const cat = CATEGORIES.find(c => c.id === activeCategory);
    if (!cat) return null;
    const c = colorClasses[cat.color];

    switch (activeCategory) {
      case 'vocabulary':
        return (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {enriched.vocabulary.map((v, i) => (
              <VocabCard key={i} item={v} index={i} color={c} onToggle={() => toggleApproval('vocabulary', i)} />
            ))}
          </div>
        );

      case 'grammar':
        return (
          <div className="space-y-4">
            {enriched.grammar.map((g, i) => (
              <GrammarCard key={i} item={g} index={i} color={c} onToggle={() => toggleApproval('grammar', i)} />
            ))}
          </div>
        );

      case 'characters':
        return (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {enriched.characters.map((ch, i) => (
              <CharacterCard key={i} item={ch} index={i} color={c} onToggle={() => toggleApproval('characters', i)} />
            ))}
          </div>
        );

      case 'story':
        return (
          <div className="space-y-4">
            <div className={`p-4 rounded-lg ${c.bg} border ${c.border}`}>
              <h3 className={`font-bold ${c.text} text-lg`}>{enriched.story.title || 'Untitled Story'}</h3>
              <p className="text-slate-500 text-sm mt-1">Setting: {enriched.story.setting || 'Not specified'}</p>
            </div>
            {enriched.story.pages.map((p, i) => (
              <StoryPageCard key={i} item={p} index={i} color={c} characters={enriched.characters} onToggle={() => toggleApproval('story', i)} />
            ))}
          </div>
        );

      case 'songs':
        return (
          <div className="space-y-4">
            {enriched.song_suggestions.map((s, i) => (
              <MediaCard key={i} item={s} index={i} color={c} type="song" onToggle={() => toggleApproval('songs', i)} />
            ))}
          </div>
        );

      case 'videos':
        return (
          <div className="space-y-4">
            {enriched.video_suggestions.map((v, i) => (
              <MediaCard key={i} item={v} index={i} color={c} type="video" onToggle={() => toggleApproval('videos', i)} />
            ))}
          </div>
        );

      case 'dialogues':
        return (
          <div className="space-y-4">
            {enriched.dialogues.map((d, i) => (
              <DialogueCard key={i} item={d} index={i} color={c} characters={enriched.characters} onToggle={() => toggleApproval('dialogues', i)} />
            ))}
          </div>
        );
    }
  };

  const totalItems = Object.values(counts).reduce((s, c) => s + c.total, 0);
  const totalApproved = Object.values(counts).reduce((s, c) => s + c.approved, 0);
  const progressPct = totalItems > 0 ? Math.round((totalApproved / totalItems) * 100) : 0;

  return (
    <div className="flex flex-col h-[calc(100vh-64px)] bg-white">
      {/* Header */}
      <div className="border-b border-slate-200 bg-white px-6 py-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="p-2 hover:bg-slate-100 rounded-lg text-slate-400">
            <ChevronLeft size={20} />
          </button>
          <div>
            <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
              <Wand2 size={22} className="text-blue-600" /> Asset Workshop
            </h1>
            <p className="text-sm text-slate-500">
              Review, approve, or regenerate content before building the lesson
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-right mr-2">
            <p className="text-sm font-bold text-slate-700">{totalApproved}/{totalItems} approved</p>
            <div className="w-32 h-2 bg-slate-200 rounded-full mt-1 overflow-hidden">
              <div className="h-full bg-emerald-500 rounded-full transition-all duration-300" style={{ width: `${progressPct}%` }} />
            </div>
          </div>

          <button
            onClick={handleEnrich}
            className="px-3 py-2 border border-blue-200 text-blue-600 rounded-lg text-sm font-bold hover:bg-blue-50 flex items-center gap-1.5"
          >
            <RefreshCw size={14} /> Re-enrich
          </button>

          <button
            onClick={handleOrchestrate}
            disabled={isOrchestrating || totalApproved === 0}
            className="px-4 py-2 bg-blue-600 text-white font-bold rounded-lg text-sm flex items-center gap-2 disabled:bg-slate-300 disabled:cursor-not-allowed hover:bg-blue-700 transition-colors"
          >
            {isOrchestrating ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
            {isOrchestrating ? 'Building...' : 'Build Lesson'}
            {!isOrchestrating && <ChevronRight size={16} />}
          </button>
        </div>
      </div>

      {/* Category Tabs */}
      <div className="border-b border-slate-200 bg-slate-50 px-6 py-2 flex gap-1 overflow-x-auto shrink-0">
        {CATEGORIES.map(cat => {
          const cnt = counts[cat.id] || { total: 0, approved: 0 };
          const isActive = activeCategory === cat.id;
          return (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold whitespace-nowrap transition-all ${
                isActive
                  ? `bg-white shadow-sm ${colorClasses[cat.color].text} border ${colorClasses[cat.color].border}`
                  : 'text-slate-500 hover:bg-white/60'
              }`}
            >
              {cat.icon}
              {cat.label}
              {loadingCategories.has(cat.id === 'songs' || cat.id === 'videos' ? 'media' : cat.id) ? (
                <Loader2 size={14} className="animate-spin text-blue-500 ml-1" />
              ) : (
                <span className={`text-xs px-1.5 py-0.5 rounded-full ${cnt.approved === cnt.total && cnt.total > 0 ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-200 text-slate-500'}`}>
                  {cnt.approved}/{cnt.total}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Bulk Actions */}
      <div className="px-6 py-2 bg-white border-b border-slate-100 flex items-center justify-between shrink-0">
        <p className="text-sm text-slate-500">
          {counts[activeCategory]?.approved || 0} of {counts[activeCategory]?.total || 0} items approved in this category
        </p>
        <div className="flex gap-2">
          <button
            onClick={() => approveAll(activeCategory)}
            className="px-3 py-1 text-xs font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 rounded hover:bg-emerald-100 flex items-center gap-1"
          >
            <ThumbsUp size={12} /> Approve All
          </button>
          <button
            onClick={() => rejectAll(activeCategory)}
            className="px-3 py-1 text-xs font-bold text-red-600 bg-red-50 border border-red-200 rounded hover:bg-red-100 flex items-center gap-1"
          >
            <ThumbsDown size={12} /> Reject All
          </button>
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto p-6 bg-slate-50">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeCategory}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.15 }}
          >
            {renderCategoryContent()}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
};

/* ─── Card Components ─── */

const ApprovalBadge = ({ approved, onToggle }: { approved: boolean; onToggle: () => void }) => (
  <button
    onClick={onToggle}
    className={`p-1.5 rounded-full transition-colors ${approved ? 'bg-emerald-100 text-emerald-600 hover:bg-emerald-200' : 'bg-red-100 text-red-500 hover:bg-red-200'}`}
    title={approved ? 'Approved — click to reject' : 'Rejected — click to approve'}
  >
    {approved ? <Check size={16} /> : <X size={16} />}
  </button>
);

const VocabCard = ({ item, index, color, onToggle }: any) => (
  <div className={`rounded-xl border-2 transition-all ${item._approved !== false ? `${color.bg} ${color.border}` : 'bg-slate-100 border-slate-300 opacity-60'}`}>
    <div className="p-4 flex gap-4">
      <div className="w-20 h-20 rounded-lg overflow-hidden bg-white border border-slate-200 flex items-center justify-center shrink-0">
        {item.image_url ? (
          <img src={item.image_url} alt={item.word} className="w-full h-full object-cover" />
        ) : (
          <Image size={24} className="text-slate-300" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <h4 className="font-bold text-lg text-slate-800">{item.word}</h4>
          <ApprovalBadge approved={item._approved !== false} onToggle={onToggle} />
        </div>
        <p className="text-sm text-slate-600 mt-1">{item.definition}</p>
        {item.example_sentence && (
          <p className="text-xs text-slate-400 italic mt-1">"{item.example_sentence}"</p>
        )}
        {item.translation && (
          <span className="inline-block mt-1 text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded">{item.translation}</span>
        )}
        {item.distractors?.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {item.distractors.slice(0, 3).map((d: string, j: number) => (
              <span key={j} className="text-xs px-1.5 py-0.5 bg-red-50 text-red-400 rounded">{d}</span>
            ))}
          </div>
        )}
      </div>
    </div>
  </div>
);

const GrammarCard = ({ item, index, color, onToggle }: any) => (
  <div className={`rounded-xl border-2 p-5 transition-all ${item._approved !== false ? `${color.bg} ${color.border}` : 'bg-slate-100 border-slate-300 opacity-60'}`}>
    <div className="flex items-start justify-between">
      <div className="flex-1">
        <h4 className={`font-bold text-lg ${color.text}`}>{item.rule}</h4>
        <p className="text-sm text-slate-600 mt-2">{item.explanation}</p>
        {item.examples?.length > 0 && (
          <div className="mt-3 space-y-1">
            {item.examples.map((ex: string, j: number) => (
              <div key={j} className="text-sm text-slate-500 flex gap-2">
                <span className="text-slate-300">•</span> {ex}
              </div>
            ))}
          </div>
        )}
      </div>
      <ApprovalBadge approved={item._approved !== false} onToggle={onToggle} />
    </div>
  </div>
);

const CharacterCard = ({ item, index, color, onToggle }: any) => (
  <div className={`rounded-xl border-2 p-5 text-center transition-all ${item._approved !== false ? `${color.bg} ${color.border}` : 'bg-slate-100 border-slate-300 opacity-60'}`}>
    <div className="flex justify-end mb-2">
      <ApprovalBadge approved={item._approved !== false} onToggle={onToggle} />
    </div>
    <div className="w-20 h-20 mx-auto rounded-full overflow-hidden bg-white border-2 border-slate-200 mb-3">
      {item.image_url ? (
        <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-3xl">👤</div>
      )}
    </div>
    <h4 className={`font-bold ${color.text}`}>{item.name}</h4>
    <p className="text-xs text-slate-500 mt-1">{item.role}</p>
    {item.personality && <p className="text-xs text-slate-400 mt-2 italic">{item.personality}</p>}
  </div>
);

const StoryPageCard = ({ item, index, color, characters, onToggle }: any) => (
  <div className={`rounded-xl border-2 p-5 transition-all ${item._approved !== false ? `${color.bg} ${color.border}` : 'bg-slate-100 border-slate-300 opacity-60'}`}>
    <div className="flex items-start justify-between gap-4">
      <div className="flex-1">
        <div className="flex items-center gap-2 mb-2">
          <span className={`text-xs font-bold px-2 py-0.5 rounded ${color.badge}`}>Page {index + 1}</span>
          {item.speaker && (
            <span className="text-xs font-bold px-2 py-0.5 rounded bg-blue-100 text-blue-700">{item.speaker}</span>
          )}
        </div>
        <p className="text-sm text-slate-700 leading-relaxed">{item.text}</p>
        {item.image_prompt && (
          <p className="text-xs text-slate-400 mt-2 flex items-center gap-1">
            <Image size={12} /> {item.image_prompt}
          </p>
        )}
      </div>
      <ApprovalBadge approved={item._approved !== false} onToggle={onToggle} />
    </div>
  </div>
);

const MediaCard = ({ item, index, color, type, onToggle }: any) => (
  <div className={`rounded-xl border-2 p-5 transition-all ${item._approved !== false ? `${color.bg} ${color.border}` : 'bg-slate-100 border-slate-300 opacity-60'}`}>
    <div className="flex items-start justify-between gap-4">
      <div className="flex items-start gap-3 flex-1">
        <div className={`p-2 rounded-lg ${color.light}`}>
          {type === 'song' ? <Music size={20} className={color.text} /> : <Video size={20} className={color.text} />}
        </div>
        <div className="flex-1">
          <h4 className={`font-bold ${color.text}`}>{item.title}</h4>
          <p className="text-sm text-slate-500 mt-1">{item.topic_relevance}</p>
          {item.search_query && (
            <div className="mt-2 flex items-center gap-2">
              <Search size={12} className="text-slate-400" />
              <code className="text-xs bg-white px-2 py-1 rounded border border-slate-200 text-slate-600">{item.search_query}</code>
            </div>
          )}
        </div>
      </div>
      <ApprovalBadge approved={item._approved !== false} onToggle={onToggle} />
    </div>
  </div>
);

const DialogueCard = ({ item, index, color, characters, onToggle }: any) => (
  <div className={`rounded-xl border-2 p-5 transition-all ${item._approved !== false ? `${color.bg} ${color.border}` : 'bg-slate-100 border-slate-300 opacity-60'}`}>
    <div className="flex items-start justify-between mb-3">
      <h4 className={`font-bold ${color.text}`}>{item.title || `Dialogue ${index + 1}`}</h4>
      <ApprovalBadge approved={item._approved !== false} onToggle={onToggle} />
    </div>
    <div className="space-y-2 ml-2">
      {(item.lines || []).map((line: any, j: number) => (
        <div key={j} className="flex gap-2 text-sm">
          <span className="font-bold text-slate-600 min-w-[80px]">{line.speaker}:</span>
          <span className="text-slate-500">{line.text}</span>
        </div>
      ))}
    </div>
  </div>
);

export default AssetWorkshop;
