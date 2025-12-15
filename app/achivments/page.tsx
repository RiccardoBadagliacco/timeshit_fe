"use client";

import type { Progress } from "@/types/progress";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

import LoaderOverlay from "@/components/LoaderOverlay";
import { AchievementCard } from "@/types/gamification";

type OptionCfg = { label: string; emoji?: string; xp?: number };
type GeoRules = {
  home_behavior?: string;
  require_location_for_lat_lng?: boolean;
};
type GeolocationConfig = {
  enabled?: boolean;
  accuracy?: "high" | "balanced" | "low" | string;
  store_coordinates?: boolean;
  fields?: string[];
  allowed_locations?: string[];
  blocked_locations?: string[];
  rules?: GeoRules;
  xp_bonus?: { new_place?: number; far_from_home?: number };
  distance_thresholds?: { far_from_home_km?: number };
};
type AchievementDef = {
  id: string;
  title?: string;
  label?: string;
  emoji?: string;
  description?: string;
  year?: number;
  condition?: Record<string, unknown>;
  hidden?: boolean;
};
type GameConfig = {
  base_xp?: number;
  consistency?: Record<string, OptionCfg>;
  size?: Record<string, OptionCfg>;
  location?: Record<string, OptionCfg>;
  geolocation?: GeolocationConfig;
  achievements?: AchievementDef[];
};
type Stats = {
  today: number;
  total: number;
  streak: number;
  combo: number;
  consistencyCounts?: Record<string, number>;
  sizeCounts?: Record<string, number>;
  locationCounts?: Record<string, number>;
};
type UserInfo = {
  id: number;
  username?: string;
  name?: string;
  photo_url?: string;
};
type UserInfoResponse = {
  user?: UserInfo;
  progress?: Progress;
  stats?: {
    poops_today?: number;
    poops_total?: number;
    total_poops?: number;
    total?: number;
    streak_days?: number;
    best_combo?: number;
    consistency_counts?: Record<string, number>;
    size_counts?: Record<string, number>;
    location_counts?: Record<string, number>;
  };
  achievements?: { id: string }[];
  game_config?: GameConfig;
};
type UserStatsResponse = {
  progress?: Progress;
  stats?: {
    total_poops?: number;
    poops_total?: number;
    poops_today?: number;
    total?: number;
    streak_days?: number;
    best_combo?: number;
    consistency_counts?: Record<string, number>;
    size_counts?: Record<string, number>;
    location_counts?: Record<string, number>;
  };
  achievements?: { id: string }[];
};

const apiBaseEnv = (process.env.NEXT_PUBLIC_API_BASE || "").replace(/\/$/, "");
const STORAGE_USERNAME_KEY = "ts_username";
const STORAGE_UID_KEY = "ts_uid";

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

const DEFAULT_ACH: AchievementDef[] = [
  { id: "first", title: "Prima Cacca", emoji: "💩" },
  { id: "streak3", title: "On Fire (3+ giorni)", emoji: "🔥" },
  { id: "office", title: "Office Master", emoji: "👔" },
  { id: "legend", title: "Poop Legend", emoji: "🏆" },
];

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

function buildApiUrl(path: string, base?: string) {
  const apiBase = coerceBaseForHttps(normalizeBase(base ?? resolveApiBase()));

  return `${apiBase}${path}`;
}

function buildAchievements(
  config: GameConfig,
  unlocked: Set<string>,
  stats?: Stats | null,
): AchievementCard[] {
  const defs =
    config.achievements && config.achievements.length
      ? config.achievements
      : DEFAULT_ACH;

  const resolveMetric = (key: string): number | undefined => {
    if (!stats) return undefined;
    if (key === "total_poops") return stats.total ?? 0;
    if (key === "daily_streak") return stats.streak ?? 0;
    if (key === "poops_in_one_day") return stats.combo ?? 0;
    if (key.startsWith("type_")) {
      const slug = key.replace("type_", "");

      return stats.consistencyCounts?.[slug] ?? 0;
    }
    if (key.startsWith("size_")) {
      const slug = key.replace("size_", "");

      return stats.sizeCounts?.[slug] ?? 0;
    }
    if (key.startsWith("loc_")) {
      const slug = key.replace("loc_", "");

      return stats.locationCounts?.[slug] ?? 0;
    }

    return undefined;
  };

  const resolveLabel = (key: string, target: number) => {
    if (key === "total_poops") return "Log totali";
    if (key === "daily_streak") return "Streak di giorni";
    if (key === "poops_in_one_day") return "Log nello stesso giorno";
    if (key.startsWith("type_")) {
      const slug = key.replace("type_", "");

      return config.consistency?.[slug]?.label || slug;
    }
    if (key.startsWith("size_")) {
      const slug = key.replace("size_", "");

      return config.size?.[slug]?.label || slug;
    }
    if (key.startsWith("loc_")) {
      const slug = key.replace("loc_", "");

      return config.location?.[slug]?.label || slug;
    }

    return key.startsWith("weekend")
      ? "Log nel weekend"
      : key.startsWith("unique_locations")
        ? "Location uniche"
        : `Obiettivo (${target})`;
  };

  return defs.map((ach) => {
    let progress: AchievementCard["progress"];

    if (ach.condition && stats) {
      for (const [key, target] of Object.entries(ach.condition)) {
        if (typeof target !== "number" || target <= 0) continue;
        const current = resolveMetric(key);

        if (typeof current === "undefined") continue;
        const pct = Math.max(0, Math.min(100, (current / target) * 100));

        progress = {
          current,
          target,
          pct,
          label: resolveLabel(key, target),
        };
        break;
      }
    }

    const unlockedCard = unlocked.has(ach.id);
    const isHiddenLocked = ach.hidden && !unlockedCard;

    if (progress && unlockedCard) {
      progress = { ...progress, current: progress.target, pct: 100 };
    }

    return {
      id: ach.id,
      title: isHiddenLocked ? "??? Segreto" : ach.title || ach.label || ach.id,
      emoji: isHiddenLocked ? "❔" : ach.emoji || "🏆",
      description: isHiddenLocked
        ? "Obiettivo nascosto. Sbloccalo per scoprire di cosa si tratta."
        : ach.description,
      unlocked: unlockedCard,
      year: ach.year,
      hidden: ach.hidden,
      condition: ach.condition,
      progress: isHiddenLocked ? undefined : progress,
    };
  });
}

function PageContent() {
  const searchParams = useSearchParams();

  const [config, setConfig] = useState<GameConfig | null>(null);
  const [playerName, setPlayerName] = useState("Player");
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [stats, setStats] = useState<Stats>({
    today: 0,
    total: 0,
    streak: 0,
    combo: 0,
    consistencyCounts: {},
    sizeCounts: {},
    locationCounts: {},
  });
  const [achievements, setAchievements] = useState<AchievementCard[]>([]);
  const [unlockedIds, setUnlockedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "unlocked" | "locked">("all");
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);

      const apiBase = resolveApiBase();
      const storedUsername =
        typeof window !== "undefined"
          ? localStorage.getItem(STORAGE_USERNAME_KEY)
          : null;
      const storedUid =
        typeof window !== "undefined"
          ? localStorage.getItem(STORAGE_UID_KEY)
          : null;
      let username =
        searchParams.get("username") || storedUsername || undefined;
      let uid = searchParams.get("uid") || storedUid || undefined;
      const nameParam = searchParams.get("name") || undefined;

      try {
        const cfgRes = await fetch(buildApiUrl("/gaming-config", apiBase), {
          cache: "no-store",
          mode: "cors",
        });
        const cfgText = await cfgRes.text();

        if (!cfgRes.ok) throw new Error(`HTTP ${cfgRes.status} ${cfgText}`);
        const cfg = JSON.parse(cfgText) as GameConfig;

        setConfig(cfg);
      } catch (cfgErr) {
        console.warn("Config load failed", cfgErr);
        setError("Config non disponibile");
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
        const userUrl = buildApiUrl(`/webapp/userinfo?${qs}`, apiBase);
        const res = await fetch(userUrl, { cache: "no-store" });
        const body = await res.text();

        if (!res.ok) throw new Error(`HTTP ${res.status} ${body}`);
        const data = JSON.parse(body) as UserInfoResponse;

        const fallbackName = username ? `@${username}` : nameParam || "Player";

        if (data.user) {
          setPlayerName(
            data.user.username
              ? `@${data.user.username}`
              : data.user.name || fallbackName,
          );
          if (data.user.photo_url) setPhotoUrl(data.user.photo_url);
        } else {
          setPlayerName(fallbackName);
        }

        if (typeof window !== "undefined") {
          if (username) localStorage.setItem(STORAGE_USERNAME_KEY, username);
          if (uid) localStorage.setItem(STORAGE_UID_KEY, uid);
        }

        if (data.progress) setProgress(data.progress);

        const userStats = data.stats;

        if (userStats) {
          setStats((prev) => ({
            ...prev,
            today: userStats.poops_today ?? 0,
            total: userStats.total_poops ?? userStats.poops_total ?? 0,
            streak: userStats.streak_days ?? 0,
            combo: userStats.best_combo ?? 0,
            consistencyCounts:
              userStats.consistency_counts || prev.consistencyCounts,
            sizeCounts: userStats.size_counts || prev.sizeCounts,
            locationCounts: userStats.location_counts || prev.locationCounts,
          }));
        }

        const unlocked = new Set<string>(
          (data.achievements || []).map((a) => a.id),
        );

        if (data.user?.id) {
          const statsRes = await fetch(
            buildApiUrl(`/user/${data.user.id}/stats`, apiBase),
            { cache: "no-store" },
          );
          const statsText = await statsRes.text();

          if (statsRes.ok) {
            const statsData = JSON.parse(statsText) as UserStatsResponse;

            if (statsData.progress) setProgress(statsData.progress);
            const st = statsData.stats || {};

            setStats((prev) => ({
              ...prev,
              total:
                st.total_poops ??
                st.poops_total ??
                prev.total ??
                data.stats?.total ??
                0,
              today: st.poops_today ?? prev.today,
              streak: st.streak_days ?? prev.streak,
              combo: st.best_combo ?? prev.combo,
              consistencyCounts:
                st.consistency_counts || data.stats?.consistency_counts,
              sizeCounts: st.size_counts || data.stats?.size_counts,
              locationCounts: st.location_counts || data.stats?.location_counts,
            }));
            statsData.achievements?.forEach((a) => unlocked.add(a.id));
          } else {
            console.warn("Stats fallback", statsRes.status, statsText);
          }
        }

        if (data.game_config) {
          setConfig((prev) => prev || data.game_config || null);
        }

        setUnlockedIds(unlocked);
      } catch (err) {
        console.warn("Achievements page load failed", err);
        setError("Impossibile caricare i dati utente");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [searchParams]);

  useEffect(() => {
    if (!config) return;
    setAchievements(buildAchievements(config, unlockedIds, stats));
  }, [config, unlockedIds, stats]);

  const unlockedCount = useMemo(
    () => achievements.filter((ach) => ach.unlocked).length,
    [achievements],
  );

  const filteredAchievements = useMemo(() => {
    if (filter === "unlocked") return achievements.filter((a) => a.unlocked);
    if (filter === "locked") return achievements.filter((a) => !a.unlocked);

    return achievements;
  }, [achievements, filter]);

  const handleFilter = (val: "all" | "unlocked" | "locked") => {
    setFilter(val);
  };

  const handleCardClick = (ach: AchievementCard) => {
    if (ach.unlocked) setToast(`🏆 Hai sbloccato "${ach.title}"`);
    else if (ach.hidden) setToast("🤫 Obiettivo segreto: continua a giocare!");
    else setToast(`💪 Continua!`);
    setTimeout(() => setToast(null), 2600);
  };

  const progressPct = (ach: AchievementCard) =>
    ach.progress ? Math.min(100, ach.progress.pct) : 0;

  return (
    <>
      <div aria-hidden className="bg-layer-home" />
      <main className="v2-page">
        <div className="hero">
          <div className="avatar-container">
            {photoUrl ? (
              <img alt="" className="avatar" src={photoUrl} />
            ) : (
              <div className="avatar placeholder">💩</div>
            )}
            <div className="rank-badge">👑</div>
          </div>
          <h1 className="player-name">{playerName}</h1>
          <div className="player-level">
            Livello {progress?.level ?? "?"} • Poop Master
          </div>
        </div>

        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-val">{stats.total}</div>
            <div className="stat-label">Log totali</div>
          </div>
          <div className="stat-card">
            <div className="stat-val" style={{ color: "#e65100" }}>
              {unlockedCount}/{achievements.length}
            </div>
            <div className="stat-label">Sbloccati</div>
          </div>
        </div>

        <div className="filter-container">
          <div className="segmented-control">
            <button
              className={`segment-btn ${filter === "all" ? "active" : ""}`}
              type="button"
              onClick={() => handleFilter("all")}
            >
              Tutti
            </button>
            <button
              className={`segment-btn ${filter === "unlocked" ? "active" : ""}`}
              type="button"
              onClick={() => handleFilter("unlocked")}
            >
              Sbloccati
            </button>
            <button
              className={`segment-btn ${filter === "locked" ? "active" : ""}`}
              type="button"
              onClick={() => handleFilter("locked")}
            >
              Da fare
            </button>
          </div>
        </div>

        <div className="achievements-list">
          {error ? (
            <div className="empty">Errore: {error}</div>
          ) : filteredAchievements.length ? (
            filteredAchievements.map((ach) => (
              <div
                key={ach.id}
                className={`card ${ach.unlocked ? "unlocked" : "locked"} ${
                  ach.hidden && !ach.unlocked ? "secret" : ""
                }`}
                onClick={() => handleCardClick(ach)}
              >
                <div className="card-header">
                  <div className="card-icon">{ach.emoji}</div>
                  <div
                    className={`status-pill ${
                      ach.hidden
                        ? "pill-secret"
                        : ach.unlocked
                          ? "pill-unlocked"
                          : "pill-locked"
                    }`}
                  >
                    {ach.hidden
                      ? "Segreto"
                      : ach.unlocked
                        ? "Completato"
                        : "In corso"}
                  </div>
                </div>
                <h3 className="card-title">
                  {ach.hidden && !ach.unlocked ? "??? Segreto" : ach.title}
                </h3>
                <p className="card-desc">
                  {ach.hidden && !ach.unlocked
                    ? "Descrizione nascosta top secret"
                    : ach.description ||
                      "Nuovo badge aggiunto alla collezione."}
                </p>
                {ach.progress ? (
                  <div className="progress-container">
                    <div className="progress-labels">
                      <span>{ach.progress.label}</span>
                      <span className="prog-val">
                        {Math.min(ach.progress.current, ach.progress.target)} /{" "}
                        {ach.progress.target}
                      </span>
                    </div>
                    <div className="progress-track">
                      <div
                        className="progress-fill"
                        style={{ width: `${progressPct(ach)}%` }}
                      />
                    </div>
                  </div>
                ) : null}
              </div>
            ))
          ) : (
            <div className="empty">Nessun risultato 🕸️</div>
          )}
        </div>

        {toast ? <div className="toast show">{toast}</div> : null}

        <LoaderOverlay
          emoji="🚀"
          show={loading}
          subtitle="Carico la collezione..."
          title="Hall of Flush"
        />

        <style jsx>{`
          :global(body) {
            background: var(--bg);
            background-image: none;
            padding: 20px 15px 120px;
            font-family: "Nunito", sans-serif;
            overflow-x: hidden;
          }

          .v2-page {
            font-family: "Nunito", sans-serif;
            color: #3e2723;
            padding-bottom: calc(80px + env(safe-area-inset-bottom, 20px));
            position: relative;
            z-index: 1;
          }

          .bg-layer-home {
            position: fixed;
            inset: 0;
            background:
              radial-gradient(var(--accent) 15%, transparent 16%),
              radial-gradient(var(--accent) 15%, transparent 16%);
            background-color: var(--bg);
            background-position:
              0 0,
              10px 10px;
            background-size: 20px 20px;
            background-repeat: repeat;
            z-index: 0;
            pointer-events: none;
          }

          .hero {
            padding: 20px 16px;
            text-align: center;
          }

          .avatar-container {
            position: relative;
            width: 80px;
            height: 80px;
            margin: 0 auto 12px;
          }

          .avatar {
            width: 100%;
            height: 100%;
            border-radius: 50%;
            border: 3px solid #3e2723;
            object-fit: cover;
            background: #fff;
          }

          .avatar.placeholder {
            display: grid;
            place-items: center;
            font-size: 2rem;
          }

          .rank-badge {
            position: absolute;
            bottom: -5px;
            right: -5px;
            background: #ffb74d;
            border: 2px solid #3e2723;
            border-radius: 50%;
            width: 32px;
            height: 32px;
            display: grid;
            place-items: center;
            font-size: 16px;
          }

          .player-name {
            font-family: "Titan One", cursive;
            font-size: 1.8rem;
            margin-bottom: 4px;
            letter-spacing: 0.5px;
          }

          .player-level {
            font-size: 0.95rem;
            color: #6d4c41;
            background: rgba(255, 255, 255, 0.5);
            display: inline-block;
            padding: 4px 12px;
            border-radius: 20px;
            font-weight: 700;
            border: 1px solid rgba(62, 39, 35, 0.1);
          }

          .stats-grid {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 12px;
            padding: 0 16px 12px;
          }

          .stat-card {
            background: #fff;
            border: 2px solid #3e2723;
            border-radius: 14px;
            padding: 12px;
            box-shadow: 3px 3px 0 #3e2723;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 4px;
          }

          .stat-val {
            font-family: "Titan One", cursive;
            font-size: 1.4rem;
          }

          .stat-label {
            font-size: 0.8rem;
            font-weight: 700;
            color: #6d4c41;
            text-transform: uppercase;
          }

          .filter-container {
            position: sticky;
            top: calc(60px + env(safe-area-inset-top, 0px));
            z-index: 150;
            background: rgba(255, 251, 240, 0.96);
            backdrop-filter: blur(12px);
            padding: 12px 16px;
            margin-bottom: 12px;
            border: 2px solid rgba(62, 39, 35, 0.12);
            border-radius: 16px;
            box-shadow: 0 12px 30px rgba(62, 39, 35, 0.12);
            isolation: isolate;
          }

          .filter-container::after {
            content: "";
            position: absolute;
            left: 0;
            right: 0;
            bottom: -14px;
            height: 14px;
            background: linear-gradient(
              to bottom,
              rgba(255, 251, 240, 0.85),
              rgba(255, 251, 240, 0)
            );
            pointer-events: none;
          }

          .segmented-control {
            background: #eee;
            border: 2px solid #3e2723;
            border-radius: 12px;
            padding: 4px;
            display: flex;
          }

          .segment-btn {
            flex: 1;
            border: none;
            background: transparent;
            padding: 8px 0;
            border-radius: 8px;
            font-weight: 800;
            font-size: 0.9rem;
            color: #757575;
            cursor: pointer;
            transition: all 0.2s ease;
          }

          .segment-btn.active {
            background: #fff;
            color: #3e2723;
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
            border: 1px solid #ddd;
          }

          .achievements-list {
            padding: 0 16px 24px;
            display: flex;
            flex-direction: column;
            gap: 16px;
          }

          .card {
            background: #fff;
            border: 2px solid #3e2723;
            border-radius: 14px;
            padding: 16px;
            box-shadow: 3px 3px 0 #3e2723;
            position: relative;
            overflow: hidden;
            transition: transform 0.1s;
          }

          .card:active {
            transform: scale(0.98);
          }

          .card.locked {
            background: #f0f0f0;
            border-color: #9e9e9e;
            box-shadow: 3px 3px 0 #9e9e9e;
          }

          .card.secret {
            background: repeating-linear-gradient(
              45deg,
              #f3e5f5,
              #f3e5f5 10px,
              #e1bee7 10px,
              #e1bee7 20px
            );
            border-style: dashed;
          }

          .card-header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            margin-bottom: 8px;
          }

          .card-icon {
            font-size: 2.5rem;
            line-height: 1;
            filter: drop-shadow(2px 2px 0 rgba(0, 0, 0, 0.1));
          }

          .status-pill {
            font-size: 0.75rem;
            padding: 4px 8px;
            border-radius: 99px;
            font-weight: 800;
            text-transform: uppercase;
            border: 1px solid rgba(0, 0, 0, 0.1);
          }

          .pill-unlocked {
            background: #c8e6c9;
            color: #1b5e20;
          }
          .pill-locked {
            background: #e0e0e0;
            color: #616161;
          }
          .pill-secret {
            background: #fff;
            color: #4a148c;
            border-color: #4a148c;
          }

          .card-title {
            font-size: 1.1rem;
            margin-bottom: 4px;
            color: #3e2723;
          }

          .card.locked .card-title,
          .card.locked .card-desc {
            color: #757575;
          }

          .card-desc {
            font-size: 0.9rem;
            color: #6d4c41;
            line-height: 1.4;
            margin-bottom: 12px;
          }

          .progress-container {
            margin-top: 8px;
          }

          .progress-labels {
            display: flex;
            justify-content: space-between;
            font-size: 0.75rem;
            font-weight: 800;
            margin-bottom: 4px;
          }

          .progress-track {
            height: 12px;
            background: #ffe0b2;
            border-radius: 99px;
            border: 2px solid #3e2723;
            overflow: hidden;
          }

          .progress-fill {
            height: 100%;
            background: repeating-linear-gradient(
              45deg,
              #ffb74d,
              #ffb74d 8px,
              #ffa726 8px,
              #ffa726 16px
            );
            width: 0%;
            transition: width 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
            border-right: 2px solid #3e2723;
          }

          .card.locked .progress-track {
            background: #e0e0e0;
            border-color: #9e9e9e;
          }
          .card.locked .progress-fill {
            background: #bdbdbd;
            border-color: #9e9e9e;
          }

          .toast {
            position: fixed;
            bottom: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: #323232;
            color: #fff;
            padding: 12px 20px;
            border-radius: 30px;
            font-weight: 700;
            font-size: 0.9rem;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
            z-index: 200;
            width: max-content;
            max-width: 90%;
            text-align: center;
          }

          .empty {
            padding: 40px 0;
            text-align: center;
            color: #999;
            font-weight: 700;
          }

          @media (max-width: 720px) {
            .segmented-control {
              border-width: 2px;
            }
          }
        `}</style>
      </main>
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
