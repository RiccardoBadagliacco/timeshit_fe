"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, Trash2 } from "lucide-react";

import LoaderOverlay from "@/components/LoaderOverlay";

type OptionCfg = { label: string; emoji?: string; xp?: number };
type GameConfig = {
  consistency?: Record<string, OptionCfg>;
  size?: Record<string, OptionCfg>;
  location?: Record<string, OptionCfg>;
};
type UserInfo = {
  id: number;
  username?: string;
  name?: string;
  photo_url?: string;
};
type UserInfoResponse = {
  user?: UserInfo;
  game_config?: GameConfig;
};
type PoopEntry = {
  id: number;
  user_id: number;
  consistency: string;
  size: string;
  location: string;
  note?: string | null;
  xp_awarded?: number;
  lat?: number | null;
  lng?: number | null;
  accuracy?: number | null;
  created_at: string;
};
type MonthlyPoopsResponse = { poops: PoopEntry[] };
type DeletePoopResponse = {
  stats: unknown;
  progress: unknown;
  achievements: unknown;
};

const apiBaseEnv = (process.env.NEXT_PUBLIC_API_BASE || "").replace(/\/$/, "");
const STORAGE_USERNAME_KEY = "ts_username";
const STORAGE_UID_KEY = "ts_uid";
const DAYS_SHORT = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];

function normalizeBase(base?: string | null) {
  if (!base) return "";
  const trimmed = base.trim();

  return trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed;
}

function coerceBaseForHttps(base: string) {
  if (typeof window === "undefined") return base;
  if (!base.startsWith("http://")) return base;
  if (window.location.protocol === "https:") {
    try {
      const url = new URL(base);

      if (url.hostname === window.location.hostname) {
        url.protocol = "https:";

        return normalizeBase(url.toString());
      }
    } catch (err) {
      console.warn("Invalid api base", err);
    }

    return "";
  }

  return base;
}

function resolveApiBase() {
  if (typeof window !== "undefined") {
    const params = new URLSearchParams(window.location.search);
    const qp =
      params.get("api") || params.get("api_base") || params.get("apiBase");

    if (qp) return normalizeBase(qp);

    const globalBase = (window as any).__API_BASE__ || (window as any).API_BASE;

    if (globalBase) return normalizeBase(String(globalBase));
  }

  if (apiBaseEnv) return coerceBaseForHttps(normalizeBase(apiBaseEnv));
  if (typeof window === "undefined") return "";
  const { origin, port } = window.location;

  if (port === "3000" || port === "3001") {
    return origin.replace(`:${port}`, ":8000");
  }

  return "";
}

function buildApiUrl(path: string, base?: string | null) {
  const apiBase = coerceBaseForHttps(normalizeBase(base ?? resolveApiBase()));

  return `${apiBase}${path}`;
}

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function dateKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function parseDate(value: string) {
  const dt = new Date(value);

  return Number.isNaN(dt.getTime()) ? new Date() : dt;
}

function computeXp(log: PoopEntry, config?: GameConfig | null) {
  if (typeof log.xp_awarded === "number") return log.xp_awarded;

  let xp = 0;
  const consXp = config?.consistency?.[log.consistency]?.xp || 0;
  const sizeXp = config?.size?.[log.size]?.xp || 0;
  const locXp = config?.location?.[log.location]?.xp || 0;

  xp += consXp + sizeXp + locXp;

  return xp;
}

function PageContent() {
  const searchParams = useSearchParams();
  const [config, setConfig] = useState<GameConfig | null>(null);
  const [logs, setLogs] = useState<PoopEntry[]>([]);
  const [userId, setUserId] = useState<number | null>(null);
  const [apiBase, setApiBase] = useState<string | null>(null);
  const [viewDate, setViewDate] = useState<Date>(() => new Date());
  const [selectedDate, setSelectedDate] = useState<Date>(() => new Date());
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<PoopEntry | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      const apiBaseParam =
        searchParams.get("api") ||
        searchParams.get("api_base") ||
        searchParams.get("apiBase");

      setApiBase(apiBaseParam);

      let username = searchParams.get("username");
      let uid = searchParams.get("uid");

      if (typeof window !== "undefined") {
        if (!username) username = localStorage.getItem(STORAGE_USERNAME_KEY);
        if (!uid) uid = localStorage.getItem(STORAGE_UID_KEY);
      }

      if (!uid && !username) {
        setError("Nessun username/uid fornito");
        setLoading(false);

        return;
      }

      try {
        const qs = uid
          ? `uid=${encodeURIComponent(uid)}`
          : `username=${encodeURIComponent(username as string)}`;
        const userUrl = buildApiUrl(`/webapp/userinfo?${qs}`, apiBaseParam);
        const res = await fetch(userUrl, { cache: "no-store" });
        const body = await res.text();

        if (!res.ok) throw new Error(`HTTP ${res.status} ${body}`);
        const data = JSON.parse(body) as UserInfoResponse;

        if (typeof window !== "undefined") {
          if (username) localStorage.setItem(STORAGE_USERNAME_KEY, username);
          if (uid) localStorage.setItem(STORAGE_UID_KEY, uid);
        }

        if (data.game_config) {
          setConfig((prev) => prev || data.game_config || null);
        }

        if (data.user?.id) {
          setUserId(data.user.id);
        }
      } catch (err) {
        console.warn("Pooplog page load failed", err);
        setError("Impossibile caricare il PoopLog");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [searchParams]);

  const fetchMonthPoops = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError(null);
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth() + 1;

    try {
      const url = buildApiUrl(
        `/user/${userId}/poops/month?year=${year}&month=${month}`,
        apiBase,
      );
      const res = await fetch(url, { cache: "no-store" });
      const body = await res.text();

      if (!res.ok) throw new Error(`HTTP ${res.status} ${body}`);
      const data = JSON.parse(body) as MonthlyPoopsResponse;

      setLogs(data.poops || []);
    } catch (err) {
      console.warn("Monthly poops load failed", err);
      setError("Impossibile caricare il PoopLog");
    } finally {
      setLoading(false);
    }
  }, [apiBase, userId, viewDate]);

  useEffect(() => {
    fetchMonthPoops();
  }, [fetchMonthPoops]);

  const logsByDay = useMemo(() => {
    const map = new Map<string, PoopEntry[]>();

    logs.forEach((log) => {
      const dt = parseDate(log.created_at);
      const key = dateKey(dt);
      const existing = map.get(key) || [];

      existing.push(log);
      map.set(key, existing);
    });

    return map;
  }, [logs]);

  const dailyLogs = useMemo(() => {
    const key = dateKey(selectedDate);
    const dayLogs = logsByDay.get(key) || [];

    return [...dayLogs].sort(
      (a, b) =>
        parseDate(b.created_at).getTime() - parseDate(a.created_at).getTime(),
    );
  }, [logsByDay, selectedDate]);

  const dailyXp = useMemo(
    () => dailyLogs.reduce((sum, log) => sum + computeXp(log, config), 0),
    [dailyLogs, config],
  );

  const monthTitle = useMemo(
    () =>
      viewDate.toLocaleDateString("it-IT", { month: "long", year: "numeric" }),
    [viewDate],
  );
  const monthLoot = useMemo(() => {
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();

    return logs.reduce((count, log) => {
      const dt = parseDate(log.created_at);

      return dt.getFullYear() === year && dt.getMonth() === month
        ? count + 1
        : count;
    }, 0);
  }, [logs, viewDate]);
  const monthStats = useMemo(() => `Loot Totale: ${monthLoot}`, [monthLoot]);
  const selectedLabel = useMemo(
    () =>
      selectedDate.toLocaleDateString("it-IT", {
        weekday: "long",
        day: "numeric",
        month: "long",
      }),
    [selectedDate],
  );

  const buildCalendarCells = () => {
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    const start = new Date(year, month, 1);
    const startOffset = (start.getDay() + 6) % 7; // Monday-first
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells: Array<Date | null> = [];

    for (let i = 0; i < startOffset; i += 1) cells.push(null);
    for (let i = 1; i <= daysInMonth; i += 1) {
      cells.push(new Date(year, month, i));
    }

    return cells;
  };

  const calendarCells = useMemo(buildCalendarCells, [viewDate]);
  const today = useMemo(() => new Date(), []);

  const shiftMonth = (delta: number) => {
    setViewDate((prev) => {
      const next = new Date(prev.getFullYear(), prev.getMonth() + delta, 1);

      setSelectedDate((current) => {
        const today = new Date();

        if (
          today.getFullYear() === next.getFullYear() &&
          today.getMonth() === next.getMonth()
        ) {
          return today;
        }
        if (
          current.getFullYear() === next.getFullYear() &&
          current.getMonth() === next.getMonth()
        ) {
          return current;
        }

        return next;
      });

      return next;
    });
  };

  const startDelete = (log: PoopEntry) => {
    setConfirmTarget(log);
  };

  const cancelDelete = () => setConfirmTarget(null);

  const performDelete = async () => {
    if (!userId || !confirmTarget) return;
    setDeleting(true);
    setError(null);
    try {
      const url = buildApiUrl(`/poop/${confirmTarget.id}`, apiBase);
      const res = await fetch(url, { method: "DELETE", cache: "no-store" });
      const body = await res.text();

      if (!res.ok) throw new Error(`HTTP ${res.status} ${body}`);
      JSON.parse(body) as DeletePoopResponse;
      await fetchMonthPoops();
      setConfirmTarget(null);
    } catch (err) {
      console.warn("Delete poop failed", err);
      setError("Impossibile cancellare il log");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <div aria-hidden className="bg-layer-pooplog" />
      <main className="pooplog-page">
        <div className="container">
          {error ? <div className="error">{error}</div> : null}

          <section className="calendar-card" id="calendarCard">
            <div className="calendar-header">
              <button
                aria-label="Mese precedente"
                className="cal-nav-btn"
                type="button"
                onClick={() => shiftMonth(-1)}
              >
                <ChevronLeft size={18} />
              </button>
              <div className="month-info">
                <h2 className="month-title">{monthTitle}</h2>
                <div className="month-stats">{monthStats}</div>
              </div>
              <button
                aria-label="Mese successivo"
                className="cal-nav-btn"
                type="button"
                onClick={() => shiftMonth(1)}
              >
                <ChevronRight size={18} />
              </button>
            </div>

            <div className="weekdays-grid">
              {DAYS_SHORT.map((day) => (
                <div key={day} className="weekday">
                  {day}
                </div>
              ))}
            </div>

            <div className="days-grid">
              {calendarCells.map((date, idx) => {
                if (!date) {
                  return (
                    <div
                      key={`empty-${idx}`}
                      className="day-cell placeholder"
                    />
                  );
                }

                const dayLogs = logsByDay.get(dateKey(date)) || [];
                const count = dayLogs.length;
                const hasBoss = dayLogs.some((l) => l.size === "XL");
                const counterClasses = [
                  "loot-counter",
                  count >= 3 ? "fire" : "",
                  hasBoss ? "boss-border" : "",
                ]
                  .filter(Boolean)
                  .join(" ");
                const isToday = isSameDay(date, today);
                const isSelected = isSameDay(date, selectedDate);

                return (
                  <div
                    key={dateKey(date)}
                    className={`day-cell active-day ${isSelected ? "selected" : ""}`}
                    onClick={() => setSelectedDate(date)}
                  >
                    <span className="day-num">{date.getDate()}</span>
                    {isToday ? <div className="today-badge">OGGI</div> : null}
                    {count > 0 ? (
                      <div className={counterClasses}>
                        {count > 9 ? "9+" : count}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </section>

          <div className="section-header">
            <span className="date-label">{selectedLabel}</span>
            <span className="xp-display">+{dailyXp} XP</span>
          </div>

          <div className="logs-list">
            {dailyLogs.length ? (
              dailyLogs.map((log) => {
                const cons = config?.consistency?.[log.consistency];
                const size = config?.size?.[log.size];
                const loc = config?.location?.[log.location];
                const xp = computeXp(log, config);
                const timeStr = parseDate(log.created_at).toLocaleTimeString(
                  "it-IT",
                  { hour: "2-digit", minute: "2-digit" },
                );

                return (
                  <div key={log.id} className="log-card">
                    <div className="log-emoji">{size?.emoji || "💩"}</div>
                    <div className="log-info">
                      <div className="log-badges">
                        <span className="badge cons">
                          {cons?.label || log.consistency}
                        </span>
                        <span className="badge loc">
                          {loc?.label || log.location}
                        </span>
                      </div>
                      <div className="log-details">
                        {xp} XP • {timeStr}
                      </div>
                    </div>
                    <button
                      aria-label="Elimina log"
                      className="btn-trash"
                      disabled={deleting}
                      type="button"
                      onClick={() => startDelete(log)}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                );
              })
            ) : (
              <div className="empty-state">💩 Nessun drop oggi.</div>
            )}
          </div>
        </div>
      </main>

      {confirmTarget ? (
        <div aria-modal="true" className="confirm-overlay" role="dialog">
          <div className="confirm-card">
            <div className="confirm-icon">🚽</div>
            <div className="confirm-title">Eliminare questo log?</div>
            <div className="confirm-desc">
              L&apos;idraulico porterà via definitivamente questa cacca. Sei
              sicuro?
            </div>
            <div className="confirm-actions">
              <button
                className="btn-ghost"
                disabled={deleting}
                type="button"
                onClick={cancelDelete}
              >
                Annulla
              </button>
              <button
                className="btn-danger"
                disabled={deleting}
                type="button"
                onClick={performDelete}
              >
                Elimina
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <LoaderOverlay
        emoji="🚽"
        show={loading}
        subtitle="Aggiorno il diario..."
        title="Caricamento PoopLog"
      />
      <LoaderOverlay
        emoji="🧑‍🔧"
        show={deleting}
        subtitle="L'idraulico sta recuperando le tue feci..."
        title="Eliminazione in corso"
      />

      <style jsx>{`
        :global(body) {
          background: var(--bg);
          margin: 0;
          padding: 0;
          font-family: "Nunito", sans-serif;
          overflow-x: hidden;
        }

        .pooplog-page {
          position: relative;
          z-index: 1;
          color: #3e2723;
          min-height: 100vh;
        }

        .container {
          max-width: 520px;
          margin: 0 auto;
          padding: 15px 15px 100px;
        }

        .bg-layer-pooplog {
          position: fixed;
          inset: 0;
          background: radial-gradient(#e6ceb6 15%, transparent 16%);
          background-size: 20px 20px;
          opacity: 0.5;
          z-index: 0;
          pointer-events: none;
        }

        .calendar-card {
          background: #fff;
          border: 3px solid #3e2723;
          border-radius: 20px;
          padding: 15px;
          box-shadow: 6px 6px 0 #3e2723;
          margin-bottom: 25px;
          overflow: hidden;
        }

        .calendar-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 15px;
        }

        .month-info {
          text-align: center;
        }

        .month-title {
          font-family: "Titan One", cursive;
          font-size: 1.3rem;
          margin: 0;
          text-transform: capitalize;
          line-height: 1;
        }

        .month-stats {
          font-size: 0.75rem;
          font-weight: 800;
          color: #8d6e63;
          margin-top: 4px;
        }

        .cal-nav-btn {
          background: var(--bg);
          border: 2px solid #3e2723;
          border-radius: 10px;
          width: 36px;
          height: 36px;
          display: grid;
          place-items: center;
          cursor: pointer;
          box-shadow: 0 3px 0 rgba(62, 39, 35, 0.2);
          color: #3e2723;
          transition: 0.1s;
        }

        .cal-nav-btn:active {
          transform: translateY(3px);
          box-shadow: none;
        }

        .weekdays-grid {
          display: grid;
          grid-template-columns: repeat(7, 1fr);
          text-align: center;
          margin-bottom: 8px;
        }

        .weekday {
          font-size: 0.7rem;
          font-weight: 900;
          color: #8d6e63;
          text-transform: uppercase;
        }

        .days-grid {
          display: grid;
          grid-template-columns: repeat(7, 1fr);
          gap: 6px;
          transition:
            transform 0.2s ease-out,
            opacity 0.2s;
        }

        .day-cell {
          aspect-ratio: 1;
          background: #fff;
          border: 2px solid #e0e0e0;
          border-radius: 12px;
          position: relative;
          cursor: pointer;
          user-select: none;
          transition: all 0.1s;
        }

        .day-cell.placeholder {
          background: transparent;
          border-color: transparent;
          cursor: default;
        }

        .day-cell.active-day {
          box-shadow: 0 4px 0 #d7ccc8;
        }

        .day-cell.active-day:active {
          transform: translateY(4px);
          box-shadow: none;
        }

        .day-cell.selected {
          background: #3e2723;
          border-color: #3e2723;
          color: #fff;
          box-shadow: inset 0 0 0 2px rgba(255, 255, 255, 0.2);
          transform: translateY(4px);
        }

        .day-num {
          position: absolute;
          top: 4px;
          left: 5px;
          font-weight: 800;
          font-size: 0.85rem;
          line-height: 1;
          z-index: 1;
        }

        .today-badge {
          position: absolute;
          top: -6px;
          left: 50%;
          transform: translateX(-50%);
          background: #3e2723;
          color: #fff;
          font-size: 0.5rem;
          font-weight: 900;
          padding: 2px 6px;
          border-radius: 8px;
          border: 1px solid #fff;
          z-index: 5;
          white-space: nowrap;
        }

        .day-cell.selected .today-badge {
          background: #fff;
          color: #3e2723;
        }

        .loot-counter {
          position: absolute;
          bottom: 3px;
          right: 3px;
          min-width: 22px;
          height: 22px;
          background: #fb8c00;
          color: #fff;
          border-radius: 6px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 0.75rem;
          font-family: "Titan One", cursive;
          border: 2px solid #fff;
          box-shadow: 1px 1px 2px rgba(0, 0, 0, 0.2);
          z-index: 2;
          padding: 0 4px;
          animation: popIn 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
        }

        .loot-counter.fire {
          background: #d32f2f;
        }

        .loot-counter.boss-border {
          border-color: #ffca28;
          box-shadow: 0 0 4px #ffca28;
        }

        .day-cell.selected .loot-counter {
          border-color: #3e2723;
          box-shadow: none;
        }

        @keyframes popIn {
          from {
            transform: scale(0);
          }
          to {
            transform: scale(1);
          }
        }

        .section-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 10px;
        }

        .date-label {
          font-weight: 800;
          font-size: 1.1rem;
          text-transform: capitalize;
        }

        .xp-display {
          background: #ffecb3;
          border: 2px solid #ffca28;
          color: #f57f17;
          padding: 4px 10px;
          border-radius: 12px;
          font-size: 0.85rem;
          font-weight: 900;
          box-shadow: 2px 2px 0 #ffca28;
        }

        .logs-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .log-card {
          background: #fff;
          border: 2px solid #3e2723;
          border-radius: 14px;
          padding: 12px;
          display: flex;
          align-items: center;
          gap: 12px;
          box-shadow: 3px 3px 0 rgba(62, 39, 35, 0.15);
        }

        .log-emoji {
          font-size: 2rem;
        }

        .log-info {
          flex: 1;
        }

        .log-badges {
          display: flex;
          gap: 6px;
          margin-bottom: 4px;
        }

        .badge {
          font-size: 0.7rem;
          padding: 2px 6px;
          border-radius: 4px;
          font-weight: 800;
          border: 1px solid rgba(0, 0, 0, 0.1);
        }

        .badge.cons {
          background: #d7ccc8;
          color: #3e2723;
        }

        .badge.loc {
          background: #c8e6c9;
          color: #1b5e20;
        }

        .log-details {
          font-size: 0.75rem;
          font-weight: 700;
          color: #8d6e63;
        }

        .btn-trash {
          width: 34px;
          height: 34px;
          background: #ffebee;
          border: 2px solid #ef5350;
          color: #ef5350;
          border-radius: 8px;
          display: grid;
          place-items: center;
          cursor: not-allowed;
        }

        .empty-state {
          text-align: center;
          padding: 30px;
          opacity: 0.6;
          font-weight: 700;
        }

        .error {
          background: #ffebee;
          border: 2px solid #ef5350;
          color: #c62828;
          padding: 10px 12px;
          border-radius: 10px;
          font-weight: 800;
          margin-bottom: 14px;
        }

        .confirm-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.45);
          backdrop-filter: blur(4px);
          display: grid;
          place-items: center;
          z-index: 3000;
          padding: 18px;
        }

        .confirm-card {
          background: #fff8e1;
          border: 3px solid #3e2723;
          border-radius: 16px;
          padding: 18px;
          max-width: 360px;
          width: 100%;
          box-shadow: 8px 8px 0 #3e2723;
          text-align: center;
        }

        .confirm-icon {
          font-size: 2rem;
          margin-bottom: 8px;
        }

        .confirm-title {
          font-family: "Titan One", cursive;
          font-size: 1.2rem;
          margin-bottom: 6px;
        }

        .confirm-desc {
          color: #6d4c41;
          font-weight: 800;
          margin-bottom: 14px;
        }

        .confirm-actions {
          display: flex;
          gap: 10px;
        }

        .btn-ghost,
        .btn-danger {
          flex: 1;
          border-radius: 10px;
          padding: 10px 12px;
          font-weight: 900;
          border: 2px solid #3e2723;
          cursor: pointer;
        }

        .btn-ghost {
          background: #fff;
          color: #3e2723;
          box-shadow: 2px 2px 0 #3e2723;
        }

        .btn-danger {
          background: #ffebee;
          color: #c62828;
          border-color: #ef5350;
          box-shadow: 2px 2px 0 #ef5350;
        }

        .btn-ghost:disabled,
        .btn-danger:disabled {
          opacity: 0.6;
          cursor: not-allowed;
          box-shadow: none;
        }

        @media (max-width: 520px) {
          .calendar-card {
            padding: 14px;
          }

          .day-cell {
            font-size: 0.85rem;
          }

          .pooplog-page {
            padding-bottom: env(safe-area-inset-bottom, 20px);
          }
        }
      `}</style>
    </>
  );
}

export default function Page() {
  return (
    <Suspense
      fallback={
        <div style={{ padding: 20, textAlign: "center" }}>Caricamento…</div>
      }
    >
      <PageContent />
    </Suspense>
  );
}
