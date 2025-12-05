import styles from "./AchievementToast.module.css";

import { AchievementCard } from "@/types/gamification";

type Props = {
  items: AchievementCard[];
  onClose: () => void;
};

export default function AchievementToast({ items, onClose }: Props) {
  if (!items.length) return null;

  return (
    <div aria-live="polite" className={styles.toast}>
      <div className={styles.card}>
        <div className={styles.head}>
          <div className={styles.title}>🏅 Achievement sbloccato!</div>
          <button
            aria-label="Chiudi"
            className={styles.close}
            type="button"
            onClick={onClose}
          >
            ✕
          </button>
        </div>
        <div className={styles.list}>
          {items.map((ach) => (
            <div key={ach.id} className={styles.row}>
              <div className={styles.icon}>{ach.emoji}</div>
              <div className={styles.body}>
                <div className={styles.nameRow}>
                  <div className={styles.name}>{ach.title}</div>
                  {ach.year ? (
                    <span className={styles.tag}>📅 {ach.year}</span>
                  ) : null}
                </div>
                <div className={styles.desc}>
                  {ach.description ||
                    "Nuovo badge aggiunto alla tua collezione."}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
