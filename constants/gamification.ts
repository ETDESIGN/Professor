export const XP_REWARDS = {
  CORRECT_ANSWER: 10,
  PERFECT_LESSON: 50,
  DAILY_STREAK: 25,
  DUBBING_COMPLETE: 20,
  DUBBING_PERFECT: 35,
  LESSON_COMPLETE: 30,
  SRS_REVIEW: 5,
  QUEST_COMPLETE: 15,
} as const;

export const XP_LEVELS = {
  XP_PER_LEVEL: 1000,
  getTitleForLevel: (level: number): string => {
    if (level <= 3) return 'Beginner';
    if (level <= 6) return 'Explorer';
    if (level <= 10) return 'Scholar';
    if (level <= 15) return 'Linguist';
    if (level <= 20) return 'Master';
    return 'Grandmaster';
  },
} as const;

export const GEM_REWARDS = {
  QUEST_COMPLETE: 10,
  ACHIEVEMENT_UNLOCK: 25,
  PERFECT_LESSON: 15,
  DAILY_CHEST: 30,
} as const;

export const QUEST_TYPES = {
  EARN_XP: 'earn_xp',
  COMPLETE_LESSONS: 'complete_lessons',
  PERFECT_SPEAKING: 'perfect_speaking',
  REVIEW_WORDS: 'review_words',
  DUBBING_TAKE: 'dubbing_take',
} as const;

export const DAILY_QUEST_TEMPLATES = [
  { type: QUEST_TYPES.EARN_XP, title: 'Earn {target} XP', target: 50, rewardGems: GEM_REWARDS.QUEST_COMPLETE },
  { type: QUEST_TYPES.COMPLETE_LESSONS, title: 'Complete {target} Lessons', target: 2, rewardGems: GEM_REWARDS.QUEST_COMPLETE },
  { type: QUEST_TYPES.PERFECT_SPEAKING, title: 'Score Perfect in Speaking', target: 1, rewardGems: GEM_REWARDS.QUEST_COMPLETE },
  { type: QUEST_TYPES.REVIEW_WORDS, title: 'Review {target} Words', target: 5, rewardGems: GEM_REWARDS.QUEST_COMPLETE },
  { type: QUEST_TYPES.DUBBING_TAKE, title: 'Record {target} Dubbing Take', target: 1, rewardGems: GEM_REWARDS.QUEST_COMPLETE },
] as const;

export const SHOP_ITEMS = {
  STREAK_FREEZE: { id: 'freeze', cost: 200 },
  HEART_REFILL: { id: 'hearts', cost: 100 },
  HAT_CROWN: { id: 'hat_crown', cost: 300 },
  SHIRT_SPACE: { id: 'shirt_space', cost: 150 },
  GLASS_COOL: { id: 'glass_cool', cost: 120 },
} as const;
