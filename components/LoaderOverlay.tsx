import styles from "./LoaderOverlay.module.css";

type LoaderOverlayProps = {
  show: boolean;
  title: string;
  subtitle?: string;
  emoji?: string;
};

export default function LoaderOverlay({
  show,
  title,
  subtitle,
  emoji = "🚽",
}: LoaderOverlayProps) {
  if (!show) return null;

  return (
    <div aria-live="polite" className={styles.overlay} role="status">
      <div className={styles.card}>
        <div className={styles.emoji}>{emoji}</div>
        <div className={styles.spinner}>
          <span />
          <span />
          <span />
        </div>
        <div className={styles.title}>{title}</div>
        {subtitle ? <div className={styles.subtitle}>{subtitle}</div> : null}
      </div>
    </div>
  );
}
