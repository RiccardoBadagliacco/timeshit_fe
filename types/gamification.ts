export type AchievementCard = {
  id: string;
  title: string;
  emoji: string;
  unlocked: boolean;
  description?: string;
  year?: number;
  hidden?: boolean;
  condition?: Record<string, unknown>;
  progress?: {
    current: number;
    target: number;
    pct: number;
    label: string;
  };
};

export type XpToastPayload = {
  delta: number;
  level?: number;
  fillPercent?: number;
};
