import { Star, BookOpen, Mic, Headphones, Zap, Puzzle, Activity, Gauge, SpellCheck, Trophy } from 'lucide-react';
import type { StageIconKey } from '../../types/stage';

/** Icon keys (units.student_path[].icon) → lucide components. Shared by the
 * teacher StudentPathComposer and the student HomeMap so a node looks the
 * same when planned and when played. */
export const STAGE_ICON_MAP: Record<string, React.ComponentType<{ size?: number | string; className?: string }>> = {
  star: Star,
  book: BookOpen,
  mic: Mic,
  headphones: Headphones,
  zap: Zap,
  puzzle: Puzzle,
  activity: Activity,
  gauge: Gauge,
  spellcheck: SpellCheck,
  trophy: Trophy,
};

export const StageIcon: React.FC<{ icon?: string; size?: number; className?: string }> = ({ icon, size = 24, className }) => {
  const Cmp = STAGE_ICON_MAP[icon || 'star'] || Star;
  return <Cmp size={size} className={className} />;
};

export const stageIconKeys: StageIconKey[] = Object.keys(STAGE_ICON_MAP) as StageIconKey[];
