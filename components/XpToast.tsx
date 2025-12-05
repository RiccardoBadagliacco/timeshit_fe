import styles from "./XpToast.module.css";

import { XpToastPayload } from "@/types/gamification";

type Props = {
  xp: XpToastPayload | null;
};

export default function XpToast({ xp }: Props) {
  if (!xp) return null;
  const percent = Math.min(100, Math.max(0, xp.fillPercent ?? 0));

  return (
    <div aria-live="polite" className={styles.toast}>
      <div className={styles.card}>
        <div className={styles.top}>
          <span className={styles.badge}>+{xp.delta} XP</span>
          {xp.level ? (
            <span className={styles.level}>LVL {xp.level}</span>
          ) : null}
        </div>
        <div className={styles.track}>
          <div className={styles.fill} style={{ width: `${percent}%` }} />
        </div>
      </div>
    </div>
  );
}
