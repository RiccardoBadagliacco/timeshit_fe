"use client";

import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useSearchParams } from "next/navigation";
import { useHeaderState } from "@/components/HeaderContext";

import AchievementToast from "@/components/AchievementToast";
import LoaderOverlay from "@/components/LoaderOverlay";
import XpToast from "@/components/XpToast";
import { AchievementCard, XpToastPayload } from "@/types/gamification";

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
type Progress = {
  xp_total?: number;
  level?: number;
  xp_in_level?: number;
  xp_for_next?: number;
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
type ConfettiPiece = {
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
  vx: number;
  vy: number;
  grav: number;
};

type GeoReading = {
  lat: number;
  lng: number;
  accuracy?: number;
  timestamp?: number;
};

const apiBaseEnv = (process.env.NEXT_PUBLIC_API_BASE || "").replace(/\/$/, "");

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

const colors = ["#f44336", "#2196f3", "#ffeb3b", "#4caf50", "#ff9800"];
const BUILD_TAG = process.env.NEXT_PUBLIC_BUILD_TAG || "dev";
const STORAGE_USERNAME_KEY = "ts_username";
const STORAGE_UID_KEY = "ts_uid";

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
    streak_days?: number;
    best_combo?: number;
    consistency_counts?: Record<string, number>;
    size_counts?: Record<string, number>;
    location_counts?: Record<string, number>;
  };
  achievements?: { id: string }[];
};

function getTelegram() {
  if (typeof window === "undefined") return null;

  return (window as any).Telegram?.WebApp || null;
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

  const describeCondition = (key: string, target: number) => {
    if (key === "total_poops") return "Log totali";
    if (key === "daily_streak") return "Streak di giorni";
    if (key === "poops_in_one_day") return "Log nello stesso giorno";
    if (key.startsWith("type_")) {
      const slug = key.replace("type_", "");
      const label = config.consistency?.[slug]?.label || slug;
      return label;
    }
    if (key.startsWith("size_")) {
      const slug = key.replace("size_", "");
      const label = config.size?.[slug]?.label || slug;
      return label;
    }
    if (key.startsWith("loc_")) {
      const slug = key.replace("loc_", "");
      const label = config.location?.[slug]?.label || slug;
      return label;
    }
    if (key.startsWith("weekend")) return "Log nel weekend";
    if (key.startsWith("unique_locations")) return "Location uniche";

    return `Obiettivo (${target})`;
  };

  const enriched = defs
    .filter((ach) => !ach.hidden || unlocked.has(ach.id))
    .map((ach) => {
      let progress: AchievementCard["progress"] | undefined;
      if (ach.condition && stats) {
        for (const [key, rawTarget] of Object.entries(ach.condition)) {
          if (typeof rawTarget !== "number" || rawTarget <= 0) continue;
          const current = resolveMetric(key);
          if (current === undefined) continue;
          const pct = Math.max(0, Math.min(100, (current / rawTarget) * 100));
          progress = {
            current,
            target: rawTarget,
            pct,
            label: describeCondition(key, rawTarget),
          };
          break;
        }
      }

      const unlockedNow = unlocked.has(ach.id);
      if (progress && unlockedNow) {
        progress = { ...progress, current: progress.target, pct: 100 };
      }

      return {
        id: ach.id,
        title: ach.title || ach.label || ach.id,
        emoji: ach.emoji || "🏆",
        description: ach.description,
        unlocked: unlockedNow,
        year: ach.year,
        hidden: ach.hidden,
        condition: ach.condition,
        progress,
      };
    });

  return enriched;
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

  // Prefer env override (es. https://my-api.example.com)
  if (apiBaseEnv) return coerceBaseForHttps(normalizeBase(apiBaseEnv));
  if (typeof window === "undefined") return "";
  const { origin, port } = window.location;

  // In dev (Next port 3000/3001) puntiamo al backend 8000.
  if (port === "3000" || port === "3001") {
    return origin.replace(`:${port}`, ":8000");
  }

  // In produzione usa path relativo per evitare mixed-content e CORS.
  return "";
}

function buildApiUrl(path: string, base?: string) {
  const apiBase = coerceBaseForHttps(normalizeBase(base ?? resolveApiBase()));

  return `${apiBase}${path}`;
}

function Home() {
  const searchParams = useSearchParams();
  const debugMode = searchParams.get("debug") === "1";

  const [config, setConfig] = useState<GameConfig | null>(null);
  const [playerName, setPlayerName] = useState("Loading...");
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
  const [user, setUser] = useState<UserInfo | null>(null);
  const [loading, setLoading] = useState(true);

  const [selection, setSelection] = useState({
    type: "",
    size: "",
    loc: "",
  });
  const [isReady, setIsReady] = useState(false);
  const [achievements, setAchievements] = useState<AchievementCard[]>([]);
  const [unlockedIds, setUnlockedIds] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [recentAch, setRecentAch] = useState<AchievementCard[]>([]);
  const [xpToast, setXpToast] = useState<XpToastPayload | null>(null);
  const { updateHeader } = useHeaderState();

  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [stuck, setStuck] = useState(false);

  const [geoData, setGeoData] = useState<GeoReading | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [geoLoading, setGeoLoading] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const confettiRef = useRef<ConfettiPiece[]>([]);
  const animRef = useRef<number | null>(null);

  const xpPerc = useMemo(() => {
    if (!progress || !progress.xp_for_next) return 0;
    const perc =
      ((progress.xp_in_level || 0) / (progress.xp_for_next || 1)) * 100;

    return Math.max(0, Math.min(100, perc));
  }, [progress]);

  useEffect(() => {
    updateHeader({ progress });
  }, [progress, updateHeader]);

  useEffect(() => {
    updateHeader({ playerName });
  }, [playerName, updateHeader]);

  useEffect(() => {
    updateHeader({ photoUrl });
  }, [photoUrl, updateHeader]);

  const resetSelections = () => {
    setSelection({ type: "", size: "", loc: "" });
    setIsReady(false);
    setGeoData(null);
    setGeoError(null);
    setGeoLoading(false);
  };

  useEffect(() => {
    if (!config) return;
    setAchievements(buildAchievements(config, unlockedIds, stats));
  }, [config, unlockedIds, stats]);

  useEffect(() => {
    setIsReady(Boolean(selection.type && selection.size && selection.loc));
  }, [selection]);

  useEffect(() => {
    if (!xpToast) return undefined;
    const timer = window.setTimeout(() => setXpToast(null), 3800);

    return () => window.clearTimeout(timer);
  }, [xpToast]);

  useEffect(() => {
    const tg = getTelegram();
    if (!tg) return;

    const updateAppHeight = () => {
      const height = Math.max(tg.viewportHeight || 0, window.innerHeight);
      document.documentElement.style.setProperty("--app-height", `${height}px`);
    };

    const doExpand = () => {
      tg.expand?.();
      updateAppHeight();
    };

    tg.ready?.();
    doExpand();
    tg.setHeaderColor?.("#ffffff");
    tg.setBackgroundColor?.("#fff8e1");

    const expandRetry = window.setTimeout(doExpand, 600);

    const handleViewportChange = () => doExpand();
    tg.onEvent?.("viewportChanged", handleViewportChange);

    window.addEventListener("resize", updateAppHeight);
    document.addEventListener("visibilitychange", doExpand);
    return () => {
      window.clearTimeout(expandRetry);
      tg.offEvent?.("viewportChanged", handleViewportChange);
      window.removeEventListener("resize", updateAppHeight);
      document.removeEventListener("visibilitychange", doExpand);
    };
  }, []);

  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;

    if (!canvas) return;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }, []);

  useEffect(() => {
    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);

    return () => {
      window.removeEventListener("resize", resizeCanvas);
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [resizeCanvas]);

  useEffect(() => {
    const loadAll = async () => {
      setError(null);
      setStuck(false);
      setLoading(true);
      const apiBase = resolveApiBase();
      const addLog = (msg: string) => {
        if (debugMode) {
          setLogs((prev) => [
            ...prev.slice(-10),
            `[${new Date().toISOString()}] ${msg}`,
          ]);
        }
        console.log(msg);
      };

      try {
        addLog(`Build tag: ${BUILD_TAG}`);
        addLog(`API base: ${apiBase || "(same origin)"}`);
        const tg = getTelegram();
        let username =
          searchParams.get("username") ||
          (typeof window !== "undefined"
            ? localStorage.getItem(STORAGE_USERNAME_KEY)
            : null) ||
          undefined;
        let uid =
          searchParams.get("uid") ||
          (typeof window !== "undefined"
            ? localStorage.getItem(STORAGE_UID_KEY)
            : null) ||
          undefined;
        const nameParam = searchParams.get("name") || undefined;

        const tgUser = tg?.initDataUnsafe?.user;

        if (tgUser) {
          if (!uid) uid = String(tgUser.id);
          if (!username) username = tgUser.username || undefined;
          if (tgUser.photo_url) setPhotoUrl(tgUser.photo_url);
        }

        const fallbackName = username ? `@${username}` : nameParam || "Player";

        setPlayerName(fallbackName);
        if (typeof window !== "undefined") {
          if (username) localStorage.setItem(STORAGE_USERNAME_KEY, username);
          if (uid) localStorage.setItem(STORAGE_UID_KEY, uid);
        }

        // Carica configurazione di gioco (endpoint dedicato) con log del body in caso di parse error
        try {
          const cfgRes = await fetch(buildApiUrl("/gaming-config", apiBase), {
            cache: "no-store",
            mode: "cors",
          });

          addLog(`GET /gaming-config -> ${cfgRes.status}`);
          const cfgText = await cfgRes.text();

          if (!cfgRes.ok)
            throw new Error(`HTTP ${cfgRes.status} body: ${cfgText}`);
          try {
            const cfg = JSON.parse(cfgText) as GameConfig;

            setConfig(cfg);
          } catch (parseErr) {
            throw new Error(
              `Config JSON parse error: ${String(parseErr)} body: ${cfgText.slice(0, 200)}`,
            );
          }
        } catch (err) {
          console.warn("Config load failed", err);
          setError("Config non disponibile");
          addLog(`Config error: ${String(err)}`);
        }

        if (!uid && !username) {
          setError("Nessun username/uid fornito");
          addLog("Stop: nessun uid/username");

          return;
        }

        const qs = uid
          ? `uid=${encodeURIComponent(uid)}`
          : `username=${encodeURIComponent(username as string)}`;
        const userUrl = buildApiUrl(`/webapp/userinfo?${qs}`, apiBase);

        try {
          const res = await fetch(userUrl, { cache: "no-store" });

          addLog(`GET ${userUrl} -> ${res.status}`);
          const userText = await res.text();

          if (!res.ok) throw new Error(`HTTP ${res.status} body: ${userText}`);
          let data: UserInfoResponse;

          try {
            data = JSON.parse(userText) as UserInfoResponse;
          } catch (parseErr) {
            throw new Error(
              `Userinfo JSON parse error: ${String(parseErr)} body: ${userText.slice(0, 200)}`,
            );
          }

          if (data.game_config) {
            setConfig((prev) => prev || data.game_config || null);
          }

          if (data.user) {
            setUser(data.user);
            setPlayerName(
              data.user.username
                ? `@${data.user.username}`
                : data.user.name || fallbackName || "Player",
            );
            if (data.user.photo_url) {
              setPhotoUrl((prev) => prev || data.user?.photo_url || null);
            }
          }

          if (data.progress) setProgress(data.progress);

          if (data.user?.id) {
            const statsRes = await fetch(
              buildApiUrl(`/user/${data.user.id}/stats`, apiBase),
              { cache: "no-store" },
            );

            addLog(`GET /user/${data.user.id}/stats -> ${statsRes.status}`);
            if (statsRes.ok) {
              const statsText = await statsRes.text();
              let statsData: UserStatsResponse;

              try {
                statsData = JSON.parse(statsText) as UserStatsResponse;
              } catch (parseErr) {
                throw new Error(
                  `Stats JSON parse error: ${String(parseErr)} body: ${statsText.slice(0, 200)}`,
                );
              }
              if (statsData.progress) setProgress(statsData.progress);
              const st = statsData.stats || {};

              setStats({
                today: st.poops_today ?? data.stats?.poops_today ?? 0,
                total:
                  st.total_poops ??
                  st.poops_total ??
                  data.stats?.total_poops ??
                  0,
                streak: st.streak_days ?? 0,
                combo: st.best_combo ?? 0,
                consistencyCounts:
                  st.consistency_counts ||
                  data.stats?.consistency_counts ||
                  stats.consistencyCounts,
                sizeCounts:
                  st.size_counts || data.stats?.size_counts || stats.sizeCounts,
                locationCounts:
                  st.location_counts ||
                  data.stats?.location_counts ||
                  stats.locationCounts,
              });
              const unlocked = new Set<string>(
                (statsData.achievements || []).map((a) => a.id),
              );

              setUnlockedIds(unlocked);
            } else if (data.stats) {
              setStats({
                today: data.stats.poops_today ?? 0,
                total:
                  data.stats.total_poops ??
                  data.stats.poops_total ??
                  data.stats.total ??
                  0,
                streak: data.stats.streak_days ?? 0,
                combo: data.stats.best_combo ?? 0,
                consistencyCounts:
                  data.stats.consistency_counts || stats.consistencyCounts,
                sizeCounts: data.stats.size_counts || stats.sizeCounts,
                locationCounts:
                  data.stats.location_counts || stats.locationCounts,
              });
            }
          }
        } catch (err) {
          console.warn("Errore userinfo", err);
          setError("Impossibile caricare i dati utente");
          setPlayerName("Offline");
          addLog(`Userinfo error: ${String(err)}`);
        }
      } finally {
        setLoading(false);
      }
    };

    loadAll();

    return () => {};
  }, [searchParams]);

  useEffect(() => {
    if (config) {
      setStuck(false);

      return undefined;
    }
    const timer = window.setTimeout(() => {
      setStuck(true);
      setLoading(false);
    }, 5000);

    return () => window.clearTimeout(timer);
  }, [config]);

  const animateConfetti = useCallback(() => {
    const canvas = canvasRef.current;

    if (!canvas) return;
    const ctx = canvas.getContext("2d");

    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    confettiRef.current.forEach((p, i) => {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += p.grav;
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x, p.y, p.w, p.h);
      if (p.y > canvas.height) confettiRef.current.splice(i, 1);
    });

    if (confettiRef.current.length) {
      animRef.current = requestAnimationFrame(animateConfetti);
    }
  }, []);

  const fireConfetti = useCallback(() => {
    const pieces: ConfettiPiece[] = [];

    for (let i = 0; i < 80; i += 1) {
      pieces.push({
        x: window.innerWidth / 2,
        y: window.innerHeight / 2,
        w: Math.random() * 10 + 5,
        h: Math.random() * 10 + 5,
        color: colors[Math.floor(Math.random() * colors.length)],
        vx: (Math.random() - 0.5) * 20,
        vy: (Math.random() - 0.5) * 20 - 5,
        grav: 0.2,
      });
    }
    confettiRef.current = pieces;
    animateConfetti();
  }, [animateConfetti]);

  const handleSelect = (group: "type" | "size" | "loc", value: string) => {
    const tg = getTelegram();

    if (tg?.HapticFeedback) tg.HapticFeedback.impactOccurred("light");
    setSelection((prev) => ({ ...prev, [group]: value }));
    if (group === "loc") {
      setGeoError(null);
    }
  };

  const geolocationCfg = config?.geolocation;
  const geoSupported = useMemo(
    () => typeof navigator !== "undefined" && Boolean(navigator.geolocation),
    [],
  );
  const geoBlockedSet = useMemo(() => {
    const blocked = new Set<string>([
      "home",
      "work",
      ...(geolocationCfg?.blocked_locations || []),
    ]);

    return blocked;
  }, [geolocationCfg]);
  const geoAllowedSet = useMemo(
    () => new Set<string>(geolocationCfg?.allowed_locations || []),
    [geolocationCfg],
  );
  const shouldCaptureGeo = useMemo(() => {
    if (!geolocationCfg?.enabled) return false;
    if (!geoSupported) return false;
    if (!selection.loc) return false;
    if (geoBlockedSet.has(selection.loc)) return false;
    if (geoAllowedSet.size > 0) return geoAllowedSet.has(selection.loc);

    return selection.loc !== "home" && selection.loc !== "work";
  }, [
    geolocationCfg,
    geoSupported,
    selection.loc,
    geoBlockedSet,
    geoAllowedSet,
  ]);

  useEffect(() => {
    if (!shouldCaptureGeo) {
      setGeoData(null);
      setGeoError(null);
      setGeoLoading(false);
    }
  }, [shouldCaptureGeo]);

  const requestGeolocation = () => {
    if (!geolocationCfg?.enabled) return;
    if (!geoSupported || !navigator.geolocation) {
      setGeoError("Geolocalizzazione non supportata dal dispositivo.");

      return;
    }
    setGeoLoading(true);
    setGeoError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGeoData({
          lat: Number(pos.coords.latitude.toFixed(6)),
          lng: Number(pos.coords.longitude.toFixed(6)),
          accuracy: pos.coords.accuracy
            ? Math.round(pos.coords.accuracy)
            : undefined,
          timestamp: pos.timestamp,
        });
        setGeoLoading(false);
      },
      (err) => {
        setGeoError(err.message || "Impossibile ottenere la posizione.");
        setGeoLoading(false);
      },
      {
        enableHighAccuracy: geolocationCfg?.accuracy === "high",
        maximumAge: 0,
        timeout: 8000,
      },
    );
  };

  const startFlush = async () => {
    if (!isReady || !user || !config || saving) return;
    setSaving(true);

    const tg = getTelegram();
    const submission = { ...selection };
    const payload = {
      user_id: user.id,
      consistency: submission.type,
      size: submission.size,
      location: submission.loc,
      note: undefined,
      ...(shouldCaptureGeo && geoData
        ? { lat: geoData.lat, lng: geoData.lng, accuracy: geoData.accuracy }
        : {}),
    };

    try {
      const res = await fetch(buildApiUrl("/poop"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      fireConfetti();
      const xpFillPercent = data.progress?.xp_for_next
        ? ((data.progress?.xp_in_level || 0) /
            (data.progress?.xp_for_next || 1)) *
          100
        : xpPerc;

      setXpToast({
        delta: data.xp_gain || 0,
        level: data.progress?.level ?? progress?.level,
        fillPercent: xpFillPercent,
      });

      if (data.progress) setProgress(data.progress);
      if (data.stats) {
        setStats((prev) => ({
          today: prev.today + 1,
          total:
            data.stats.total_poops ??
            data.stats.poops_total ??
            data.stats.total ??
            prev.total,
          streak: data.stats.streak_days ?? prev.streak,
          combo: data.stats.best_combo ?? prev.combo,
          consistencyCounts:
            data.stats.consistency_counts || prev.consistencyCounts,
          sizeCounts: data.stats.size_counts || prev.sizeCounts,
          locationCounts: data.stats.location_counts || prev.locationCounts,
        }));
      } else {
        setStats((prev) => {
          const nextConsistency = { ...(prev.consistencyCounts || {}) };
          const nextSize = { ...(prev.sizeCounts || {}) };
          const nextLocation = { ...(prev.locationCounts || {}) };

          if (submission.type) {
            nextConsistency[submission.type] =
              (nextConsistency[submission.type] || 0) + 1;
          }
          if (submission.size) {
            nextSize[submission.size] = (nextSize[submission.size] || 0) + 1;
          }
          if (submission.loc) {
            nextLocation[submission.loc] =
              (nextLocation[submission.loc] || 0) + 1;
          }

          return {
            ...prev,
            today: prev.today + 1,
            total: prev.total + 1,
            consistencyCounts: nextConsistency,
            sizeCounts: nextSize,
            locationCounts: nextLocation,
          };
        });
      }

      const newUnlocked = new Set(unlockedIds);
      const newlyUnlocked: AchievementDef[] = data.unlocked_achievements || [];

      newlyUnlocked.forEach((a) => newUnlocked.add(a.id));
      setUnlockedIds(newUnlocked);
      setAchievements(buildAchievements(config, newUnlocked));
      if (newlyUnlocked.length) {
        setRecentAch(
          newlyUnlocked.map((a) => ({
            id: a.id,
            title: a.title || a.label || a.id,
            emoji: a.emoji || "🏆",
            description: a.description,
            year: a.year,
            unlocked: true,
          })),
        );
      }

      resetSelections();
      if (tg?.HapticFeedback) tg.HapticFeedback.notificationOccurred("success");
    } catch (err) {
      console.error("Errore nel salvataggio", err);
      setError("Errore durante il salvataggio");
    } finally {
      setSaving(false);
    }
  };

  const renderGrid = (
    entries: Record<string, OptionCfg> | undefined,
    group: "type" | "size" | "loc",
  ) => {
    if (!entries)
      return (
        <p style={{ color: "#8d6e63", margin: "8px 0" }}>Caricamento...</p>
      );

    return Object.entries(entries).map(([key, cfg]) => (
      <div
        key={`${group}-${key}`}
        className={`card ${selection[group] === key ? "selected" : ""}`}
        onClick={() => handleSelect(group, key)}
      >
        <span className="emoji">{cfg.emoji || "❔"}</span>
        <span>{cfg.label || key}</span>
      </div>
    ));
  };

  const selectedLocationLabel =
    selection.loc && config?.location?.[selection.loc]?.label
      ? config.location[selection.loc]?.label || selection.loc
      : selection.loc;

  const closeAchToast = () => setRecentAch([]);

  return (
    <>
      <div aria-hidden className="bg-layer-home" />
      <canvas ref={canvasRef} id="confettiCanvas" />

      <XpToast xp={xpToast} />

      {error ? (
        <p style={{ color: "#b71c1c", fontWeight: 800 }}>{error}</p>
      ) : null}
      {stuck ? (
        <p style={{ color: "#b71c1c", fontWeight: 800 }}>
          Timeout nel caricamento. Controlla rete/HTTPS e prova a ricaricare con
          un cache-bust diverso.
        </p>
      ) : null}
      {!config ? (
        <p style={{ color: "#8d6e63", fontWeight: 800 }}>
          Caricamento config...
        </p>
      ) : (
        <>
          <div className="pocket-stats">
            <div className="score-pill score-today">
              <span className="pill-label">Oggi</span>
              <span className="pill-value" id="countToday">
                {stats.today}
              </span>
            </div>
            <div className="score-pill score-total">
              <span className="pill-label">Totale</span>
              <span className="pill-value" id="countTotal">
                {stats.total}
              </span>
            </div>
          </div>

          <h2>Consistenza</h2>
          <div className="grid" id="typeGrid">
            {renderGrid(config.consistency, "type")}
          </div>

          <h2>Quantità</h2>
          <div className="grid" id="sizeGrid">
            {renderGrid(config.size, "size")}
          </div>

          <h2>Location</h2>
          <div className="grid" id="locGrid">
            {renderGrid(config.location, "loc")}
          </div>

          {shouldCaptureGeo ? (
            <div aria-live="polite" className="geo-panel">
              <div className="geo-row">
                <div className="geo-title">
                  <span className="geo-dot-mini" />
                  <span>{selectedLocationLabel || "Posizione"}</span>
                </div>
                <button
                  className="geo-btn"
                  disabled={geoLoading}
                  onClick={requestGeolocation}
                >
                  {geoLoading ? "Rilevo…" : geoData ? "Aggiorna" : "Posizione"}
                </button>
              </div>
              <div className="geo-line">
                {geoData ? (
                  <>
                    <span>
                      {geoData.lat.toFixed(5)}, {geoData.lng.toFixed(5)}
                    </span>
                    {geoData.accuracy ? (
                      <span className="geo-accuracy">±{geoData.accuracy}m</span>
                    ) : null}
                  </>
                ) : (
                  <span className="geo-hint-inline">
                    Coordinate non ancora inserite
                  </span>
                )}
              </div>
              {geoError ? <div className="geo-error">{geoError}</div> : null}
            </div>
          ) : null}

          <div className="dock">
            <div
              className={`action ${isReady && config ? "ready" : ""}`}
              id="mainBtn"
              onClick={startFlush}
            >
              FLUSH IT! 🚽
            </div>
          </div>
        </>
      )}

      <AchievementToast items={recentAch} onClose={closeAchToast} />

      <LoaderOverlay
        emoji="🧻"
        show={loading}
        subtitle="Tieni il naso chiuso: stiamo lucidando la plancia di comando!"
        title="Carichiamo i tuoi dati"
      />

      <LoaderOverlay
        emoji="🚀"
        show={saving}
        subtitle="Stiamo spedendo la tua epica flushata al quartier generale…"
        title="Flush in corso"
      />

      <div className="build-footer" role="contentinfo">
        <div className="build-chip">
          <span aria-hidden className="build-dot" />
          <span>Build {BUILD_TAG}</span>
        </div>
      </div>

      <style global jsx>{`
        * {
          box-sizing: border-box;
          user-select: none;
          -webkit-tap-highlight-color: transparent;
        }

        html,
        body,
        #__next {
          height: 100%;
        }

        header {
          display: flex;
          gap: 12px;
          align-items: stretch;
          margin-bottom: 20px;
          position: relative;
          z-index: 10;
        }

        .status-panel {
          flex: 1;
          background: var(--panel);
          border: var(--border-width) solid var(--brown);
          border-radius: var(--border-radius);
          padding: 8px 12px;
          display: flex;
          align-items: center;
          gap: 12px;
          box-shadow: 0px 6px 0px rgba(78, 52, 46, 0.2);
        }

        .avatar {
          width: 50px;
          height: 50px;
          border: var(--border-width) solid var(--brown);
          background: linear-gradient(135deg, #fff3e0 0%, #ffe0b2 100%);
          border-radius: 14px;
          font-size: 1.8rem;
          display: flex;
          justify-content: center;
          align-items: center;
          animation: bounce 2s infinite ease-in-out;
          flex-shrink: 0;
          overflow: hidden;
        }

        .avatar img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        @keyframes bounce {
          0%,
          100% {
            transform: translateY(0);
          }
          50% {
            transform: translateY(-3px);
          }
        }

        .stats {
          flex: 1;
          display: flex;
          flex-direction: column;
          justify-content: center;
          min-width: 0;
        }

        .name {
          font-family: "Titan One";
          font-size: 1.1rem;
          line-height: 1;
          margin-bottom: 6px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .xp-row {
          display: flex;
          align-items: center;
          gap: 8px;
          width: 100%;
        }

        .xp-container {
          flex: 1;
          height: 14px;
          background: #3e2723;
          border-radius: 10px;
          padding: 2px;
        }

        .xp-fill {
          height: 100%;
          width: 0%;
          background: linear-gradient(90deg, #a5d6a7, #66bb6a);
          border-radius: 6px;
          transition: width 0.6s ease;
        }

        .level-badge {
          background: var(--accent);
          color: #fff;
          font-family: "Titan One";
          font-size: 0.8rem;
          padding: 3px 6px;
          border: 2px solid var(--brown);
          border-radius: 8px;
          white-space: nowrap;
          text-shadow: 1px 1px 0 rgba(0, 0, 0, 0.2);
          box-shadow: 1px 2px 0 rgba(0, 0, 0, 0.1);
        }

        .menu-btn {
          width: 60px;
          background: #fff9c4;
          border: var(--border-width) solid var(--brown);
          border-radius: var(--border-radius);
          display: flex;
          justify-content: center;
          align-items: center;
          font-size: 1.8rem;
          cursor: pointer;
          box-shadow: 0px 6px 0px rgba(78, 52, 46, 0.2);
          transition: 0.1s;
          flex-shrink: 0;
        }

        .menu-btn:active {
          transform: translateY(4px);
          box-shadow: 0px 2px 0px rgba(78, 52, 46, 0.2);
        }

        .pocket-stats {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
          margin-bottom: 18px;
        }

        .score-pill {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          padding: 10px 12px;
          border: 3px solid var(--brown);
          border-radius: 14px;
          background: #fff;
          box-shadow: 0px 3px 0px rgba(78, 52, 46, 0.15);
        }

        .score-pill.score-today {
          background: linear-gradient(135deg, #eef6ff 0%, #ffffff 70%);
          border-color: #1565c0;
        }

        .score-pill.score-total {
          background: linear-gradient(135deg, #eef9ef 0%, #ffffff 70%);
          border-color: #2e7d32;
        }

        .pill-label {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-weight: 800;
          text-transform: uppercase;
          color: #5d4037;
          font-size: 0.8rem;
        }

        .pill-value {
          font-family: "Titan One";
          font-size: 1.6rem;
          color: #2e1b14;
        }

        h2 {
          margin-top: 25px;
          font-family: "Titan One";
          color: var(--brown);
          margin-bottom: 10px;
          font-size: 1.3rem;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        h2::before {
          content: "";
          display: block;
          width: 10px;
          height: 10px;
          background: var(--brown);
          border-radius: 50%;
        }

        .grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 10px;
        }

        .card {
          background: var(--panel);
          text-align: center;
          border: var(--border-width) solid var(--brown);
          border-radius: 16px;
          padding: 15px 5px;
          cursor: pointer;
          box-shadow: 0px 4px 0px var(--brown);
          transition: 0.1s;
        }

        .card:active {
          transform: translateY(4px);
          box-shadow: none;
        }

        .card .emoji {
          font-size: 2rem;
          display: block;
          margin-bottom: 5px;
        }

        .card span:last-child {
          font-weight: 800;
          font-size: 0.8rem;
        }

        .card.selected {
          background: #fff3e0;
          border-color: var(--accent-dark);
          transform: translateY(4px);
          box-shadow: none;
          position: relative;
        }

        .card.selected::after {
          content: "✔";
          position: absolute;
          top: -8px;
          right: -8px;
          background: var(--green);
          color: white;
          border: 2px solid var(--brown);
          border-radius: 50%;
          width: 20px;
          height: 20px;
          font-size: 0.7rem;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .geo-panel {
          margin-top: 12px;
          background: var(--panel);
          border: var(--border-width) solid var(--brown);
          border-radius: 14px;
          padding: 10px 12px;
          box-shadow: 0px 4px 0px rgba(78, 52, 46, 0.15);
        }

        .geo-row {
          display: flex;
          align-items: center;
          gap: 10px;
          justify-content: space-between;
          flex-wrap: wrap;
        }

        .geo-title {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          font-weight: 900;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          font-size: 0.85rem;
          color: #3e2723;
        }

        .geo-dot-mini {
          width: 10px;
          height: 10px;
          border-radius: 50%;
          background: var(--accent-dark);
          box-shadow: 0 0 0 3px rgba(245, 124, 0, 0.25);
        }

        .geo-btn {
          background: var(--blue);
          color: white;
          font-weight: 800;
          border: 3px solid var(--brown);
          border-radius: 12px;
          padding: 8px 12px;
          cursor: pointer;
          box-shadow: 0px 4px 0px var(--brown);
          transition: 0.1s;
          font-size: 0.9rem;
        }

        .geo-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
          box-shadow: none;
          transform: none;
        }

        .geo-btn:active {
          transform: translateY(2px);
          box-shadow: 0px 1px 0px var(--brown);
        }

        .geo-line {
          margin-top: 6px;
          display: flex;
          align-items: center;
          gap: 8px;
          font-weight: 800;
          font-size: 0.88rem;
          color: #2e1b14;
        }

        .geo-accuracy {
          color: #5d4037;
          font-weight: 800;
          font-size: 0.85rem;
        }

        .geo-hint-inline {
          color: #795548;
          font-weight: 800;
          font-size: 0.85rem;
        }

        .geo-error {
          margin-top: 6px;
          color: #b71c1c;
          font-weight: 800;
          font-size: 0.9rem;
        }

        .dock {
          margin-top: 30px;
          display: flex;
          justify-content: center;
          position: sticky;
          bottom: 20px;
          z-index: 50;
        }

        .action {
          width: 90%;
          max-width: 400px;
          padding: 15px;
          border-radius: 20px;
          border: 4px solid #9e9e9e;
          background: #e0e0e0;
          color: #9e9e9e;
          font-family: "Titan One";
          font-size: 1.6rem;
          text-align: center;
          box-shadow: 0px 6px 0px #757575;
          pointer-events: none;
          transition: all 0.3s;
        }

        .action.ready {
          background: linear-gradient(to bottom, #ff7043, #f4511e);
          border-color: var(--brown);
          color: white;
          box-shadow: 0px 8px 0px var(--brown);
          pointer-events: auto;
          cursor: pointer;
          animation: pulse 2s infinite;
        }

        .action.ready:active {
          transform: translateY(6px);
          box-shadow: 0px 2px 0px var(--brown);
        }

        .build-footer {
          margin-top: 22px;
          display: flex;
          justify-content: center;
        }

        .build-chip {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 8px 12px;
          border-radius: 999px;
          border: 2px solid var(--brown);
          background: rgba(255, 255, 255, 0.92);
          color: #5d4037;
          font-weight: 800;
          font-size: 0.85rem;
          box-shadow: 0px 3px 0px rgba(0, 0, 0, 0.15);
          letter-spacing: 0.2px;
        }

        .build-dot {
          width: 10px;
          height: 10px;
          border-radius: 50%;
          background: var(--accent-dark);
          box-shadow: 0 0 0 3px rgba(245, 124, 0, 0.25);
        }

        @keyframes pulse {
          0% {
            transform: scale(1);
          }
          50% {
            transform: scale(1.03);
          }
          100% {
            transform: scale(1);
          }
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
          z-index: -1;
          pointer-events: none;
        }

        #confettiCanvas {
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          pointer-events: none;
          z-index: 999;
        }

        @media (max-width: 480px) {
          .grid {
            grid-template-columns: repeat(2, 1fr);
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
      <Home />
    </Suspense>
  );
}
