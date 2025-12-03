"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

type OptionCfg = { label: string; emoji?: string; xp?: number };
type AchievementDef = {
  id: string;
  title?: string;
  label?: string;
  emoji?: string;
  description?: string;
};
type GameConfig = {
  base_xp?: number;
  consistency?: Record<string, OptionCfg>;
  size?: Record<string, OptionCfg>;
  location?: Record<string, OptionCfg>;
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
};
type UserInfo = {
  id: number;
  username?: string;
  name?: string;
};
type AchievementCard = {
  id: string;
  title: string;
  emoji: string;
  unlocked: boolean;
  description?: string;
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

const apiBaseEnv = (process.env.NEXT_PUBLIC_API_BASE || "").replace(/\/$/, "");

const DEFAULT_ACH: AchievementDef[] = [
  { id: "first", title: "Prima Cacca", emoji: "💩" },
  { id: "streak3", title: "On Fire (3+ giorni)", emoji: "🔥" },
  { id: "office", title: "Office Master", emoji: "👔" },
  { id: "legend", title: "Poop Legend", emoji: "🏆" },
];

const colors = ["#f44336", "#2196f3", "#ffeb3b", "#4caf50", "#ff9800"];

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
): AchievementCard[] {
  const defs =
    config.achievements && config.achievements.length
      ? config.achievements
      : DEFAULT_ACH;

  return defs.map((ach) => ({
    id: ach.id,
    title: ach.title || ach.label || ach.id,
    emoji: ach.emoji || "🏆",
    description: ach.description,
    unlocked: unlocked.has(ach.id),
  }));
}

function resolveApiBase() {
  // Prefer env override (es. https://my-api.example.com)
  if (apiBaseEnv) return apiBaseEnv;
  if (typeof window === "undefined") return "";
  const { origin, port } = window.location;
  // In dev (Next port 3000/3001) puntiamo al backend 8000.
  if (port === "3000" || port === "3001") {
    return origin.replace(`:${port}`, ":8000");
  }
  // In produzione usa path relativo per evitare mixed-content e CORS.
  return "";
}

function buildApiUrl(path: string) {
  const base = resolveApiBase();
  return `${base}${path}`;
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
  });
  const [user, setUser] = useState<UserInfo | null>(null);

  const [selection, setSelection] = useState({
    type: "",
    size: "",
    loc: "",
  });
  const [lastSubmission, setLastSubmission] = useState({
    type: "",
    size: "",
    loc: "",
  });
  const [isReady, setIsReady] = useState(false);
  const [achievements, setAchievements] = useState<AchievementCard[]>([]);
  const [unlockedIds, setUnlockedIds] = useState<Set<string>>(new Set());
  const [achOpen, setAchOpen] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [modalXp, setModalXp] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [stuck, setStuck] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const confettiRef = useRef<ConfettiPiece[]>([]);
  const animRef = useRef<number | null>(null);

  const xpPerc = useMemo(() => {
    if (!progress || !progress.xp_for_next) return 0;
    const perc =
      ((progress.xp_in_level || 0) / (progress.xp_for_next || 1)) * 100;
    return Math.max(0, Math.min(100, perc));
  }, [progress]);

  const resetSelections = () => {
    setSelection({ type: "", size: "", loc: "" });
    setIsReady(false);
  };

  useEffect(() => {
    if (!config) return;
    setAchievements(buildAchievements(config, unlockedIds));
  }, [config, unlockedIds]);

  useEffect(() => {
    setIsReady(Boolean(selection.type && selection.size && selection.loc));
  }, [selection]);

  useEffect(() => {
    const tg = getTelegram();
    if (!tg) return;
    tg.expand?.();
    tg.setHeaderColor?.("#ffffff");
    tg.setBackgroundColor?.("#fff8e1");
    tg.ready?.();
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
      const addLog = (msg: string) => {
        if (debugMode) {
          setLogs((prev) => [...prev.slice(-10), `[${new Date().toISOString()}] ${msg}`]);
        }
        console.log(msg);
      };
      const tg = getTelegram();
      let username = searchParams.get("username") || undefined;
      let uid = searchParams.get("uid") || undefined;
      const nameParam = searchParams.get("name") || undefined;

      const tgUser = tg?.initDataUnsafe?.user;
      if (tgUser) {
        if (!uid) uid = String(tgUser.id);
        if (!username) username = tgUser.username || undefined;
      }

      const fallbackName = username ? `@${username}` : nameParam || "Player";
      setPlayerName(fallbackName);

      // Carica configurazione di gioco (endpoint dedicato)
      fetch(buildApiUrl("/gaming-config"), { cache: "no-store", mode: "cors" })
        .then(async (res) => {
          addLog(`GET /gaming-config -> ${res.status}`);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const cfg = (await res.json()) as GameConfig;
          setConfig(cfg);
        })
        .catch((err) => {
          console.warn("Config load failed", err);
          setError("Config non disponibile");
          addLog(`Config error: ${String(err)}`);
        });

      if (!uid && !username) {
        setError("Nessun username/uid fornito");
        addLog("Stop: nessun uid/username");
        return;
      }

      const qs = uid
        ? `uid=${encodeURIComponent(uid)}`
        : `username=${encodeURIComponent(username as string)}`;
      const userUrl = buildApiUrl(`/webapp/userinfo?${qs}`);

      try {
        const res = await fetch(userUrl, { cache: "no-store" });
        addLog(`GET ${userUrl} -> ${res.status}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as UserInfoResponse;

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
        }

        if (data.progress) setProgress(data.progress);

        if (data.user?.id) {
          const statsRes = await fetch(
            buildApiUrl(`/user/${data.user.id}/stats`),
            { cache: "no-store" },
          );
          addLog(`GET /user/${data.user.id}/stats -> ${statsRes.status}`);
          if (statsRes.ok) {
            const statsData = (await statsRes.json()) as UserStatsResponse;
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
            });
          }
        }
      } catch (err) {
        console.warn("Errore userinfo", err);
        setError("Impossibile caricare i dati utente");
        setPlayerName("Offline");
        addLog(`Userinfo error: ${String(err)}`);
      }
    };

    loadAll();
    const timer = window.setTimeout(() => {
      if (!config) setStuck(true);
    }, 5000);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const animateConfetti = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !modalOpen) return;
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
  }, [modalOpen]);

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
  };

  const startFlush = async () => {
    if (!isReady || !user || !config) return;

    const tg = getTelegram();
    const submission = { ...selection };
    const payload = {
      user_id: user.id,
      consistency: submission.type,
      size: submission.size,
      location: submission.loc,
      note: undefined,
    };

    try {
      const res = await fetch(buildApiUrl("/poop"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      setModalXp(data.xp_gain || 0);
      setModalOpen(true);
      fireConfetti();

      if (data.progress) setProgress(data.progress);
      if (data.stats) {
        setStats((prev) => ({
          today: prev.today + 1,
          total:
            data.stats.total_poops ??
            data.stats.poops_total ??
            data.stats.total ??
            prev.total,
          streak: prev.streak,
          combo: prev.combo,
        }));
      } else {
        setStats((prev) => ({ ...prev, today: prev.today + 1 }));
      }

      setLastSubmission(submission);
      const newUnlocked = new Set(unlockedIds);
      (data.unlocked_achievements || []).forEach(
        (a: { id: string }) => newUnlocked.add(a.id),
      );
      setUnlockedIds(newUnlocked);
      setAchievements(buildAchievements(config, newUnlocked));

      resetSelections();
      if (tg?.HapticFeedback) tg.HapticFeedback.notificationOccurred("success");
    } catch (err) {
      console.error("Errore nel salvataggio", err);
      setError("Errore durante il salvataggio");
    }
  };

  const closeModal = () => {
    const tg = getTelegram();
    if (tg?.sendData) {
      tg.sendData(JSON.stringify(lastSubmission));
      tg.close?.();
      return;
    }
    setModalOpen(false);
  };

  const renderGrid = (
    entries: Record<string, OptionCfg> | undefined,
    group: "type" | "size" | "loc",
  ) => {
    if (!entries) return <p style={{ color: "#8d6e63", margin: "8px 0" }}>Caricamento...</p>;
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

  return (
    <>
      <canvas ref={canvasRef} id="confettiCanvas" />

      <header>
        <div className="status-panel">
          <div className="avatar">💩</div>
          <div className="stats">
            <div className="name" id="playerName">
              {playerName}
            </div>
            <div className="xp-row">
              <div className="xp-container">
                <div
                  className="xp-fill"
                  id="xpFill"
                  style={{ width: `${xpPerc}%` }}
                />
              </div>
              <div className="level-badge" id="levelBox">
                LVL {progress?.level ?? "?"}
              </div>
            </div>
          </div>
        </div>
        <button className="menu-btn" onClick={() => setAchOpen(true)}>
          🏆
        </button>
      </header>

      {error ? (
        <p style={{ color: "#b71c1c", fontWeight: 800 }}>{error}</p>
      ) : null}
      {stuck ? (
        <p style={{ color: "#b71c1c", fontWeight: 800 }}>
          Timeout nel caricamento. Controlla rete/HTTPS e prova a ricaricare con un cache-bust diverso.
        </p>
      ) : null}
      {debugMode && logs.length ? (
        <div
          style={{
            background: "#000000aa",
            color: "#fff",
            padding: "10px",
            borderRadius: 10,
            fontSize: "0.75rem",
            marginTop: 10,
            maxHeight: 200,
            overflow: "auto",
          }}
        >
          <div style={{ fontWeight: 800, marginBottom: 4 }}>Debug log</div>
          {logs.map((l, i) => (
            <div key={i}>{l}</div>
          ))}
        </div>
      ) : null}

      {!config ? (
        <p style={{ color: "#8d6e63", fontWeight: 800 }}>Caricamento config...</p>
      ) : (
        <>
          <div className="dashboard">
            <div className="score-box">
              <div className="score-label">Oggi</div>
              <div className="score-val today" id="countToday">
                {stats.today}
              </div>
            </div>
            <div className="score-box">
              <div className="score-label">Totale</div>
              <div className="score-val total" id="countTotal">
                {stats.total}
              </div>
            </div>
            <div className="score-box">
              <div className="score-label">Streak Giorni</div>
              <div className="score-val streak" id="streakDays">
                {stats.streak}
              </div>
            </div>
            <div className="score-box">
              <div className="score-label">Miglior Combo</div>
              <div className="score-val combo" id="comboBest">
                {stats.combo}
              </div>
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

          <div className="dock">
            <div
              id="mainBtn"
              className={`action ${isReady && config ? "ready" : ""}`}
              onClick={startFlush}
            >
              FLUSH IT! 🚽
            </div>
          </div>
        </>
      )}

      <div id="modal" style={{ display: modalOpen ? "flex" : "none" }}>
        <div className="modal-box">
          <h1 style={{ fontFamily: "Titan One", color: "#e65100", margin: 0 }}>
            OTTIMO LAVORO!
          </h1>
          <div className="trophy-anim">🚽</div>
          <div id="modalXp">+{modalXp} XP</div>
          <button id="okBtn" className="ok" onClick={closeModal}>
            CONTINUA
          </button>
        </div>
      </div>

      <div
        id="achOverlay"
        style={{ display: achOpen ? "flex" : "none" }}
        aria-hidden={!achOpen}
      >
        <div className="ach-panel">
          <div className="ach-header">
            <h1>Collezione</h1>
            <div style={{ fontSize: "1.5rem" }}>🏆</div>
          </div>
          <div className="ach-grid" id="achGridContainer">
            {achievements.map((ach) => (
              <div
                key={ach.id}
                className={`ach-item ${ach.unlocked ? "unlocked" : "locked"}`}
              >
                <div className="ach-icon">{ach.emoji}</div>
                <div className="ach-name">{ach.title}</div>
              </div>
            ))}
          </div>
          <button className="close-btn" onClick={() => setAchOpen(false)}>
            CHIUDI X
          </button>
        </div>
      </div>

      <style jsx global>{`
        :root {
          --bg: #fff8e1;
          --brown: #4e342e;
          --panel: #ffffff;
          --accent: #ffb74d;
          --accent-dark: #f57c00;
          --green: #66bb6a;
          --green-dark: #388e3c;
          --blue: #42a5f5;
          --blue-dark: #1565c0;
          --red: #ef5350;
          --border-radius: 20px;
          --border-width: 3px;
        }

        * {
          box-sizing: border-box;
          user-select: none;
          -webkit-tap-highlight-color: transparent;
        }

        body {
          font-family: "Nunito", sans-serif;
          margin: 0;
          background-color: var(--bg);
          background-image: radial-gradient(var(--accent) 15%, transparent 16%),
            radial-gradient(var(--accent) 15%, transparent 16%);
          background-size: 20px 20px;
          background-position: 0 0, 10px 10px;
          padding: 20px 15px 120px 15px;
          color: var(--brown);
          overflow-x: hidden;
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

        .dashboard {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 15px;
          margin-bottom: 25px;
        }

        .score-box {
          background: var(--panel);
          border: var(--border-width) solid var(--brown);
          border-radius: 16px;
          padding: 10px;
          text-align: center;
          box-shadow: 0px 4px 0px rgba(78, 52, 46, 0.2);
        }

        .score-label {
          font-size: 0.8rem;
          font-weight: 800;
          text-transform: uppercase;
          color: #8d6e63;
          margin-bottom: 2px;
        }

        .score-val {
          font-family: "Titan One";
          font-size: 2rem;
          line-height: 1;
        }

        .score-val.today {
          color: var(--blue-dark);
          text-shadow: 2px 2px 0px #bbdefb;
        }

        .score-val.total {
          color: var(--green-dark);
          text-shadow: 2px 2px 0px #c8e6c9;
        }

        .score-val.streak {
          color: #fbc02d;
          text-shadow: 2px 2px 0px #fff59d;
        }

        .score-val.combo {
          color: #ab47bc;
          text-shadow: 2px 2px 0px #e1bee7;
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

        #achOverlay {
          position: fixed;
          inset: 0;
          background: rgba(78, 52, 46, 0.95);
          backdrop-filter: blur(5px);
          z-index: 2000;
          display: none;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          animation: fadeIn 0.3s ease;
        }

        @keyframes fadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }

        .ach-panel {
          width: 90%;
          height: 85%;
          background: #fff8e1;
          border: 4px solid var(--brown);
          border-radius: 24px;
          padding: 20px;
          display: flex;
          flex-direction: column;
          box-shadow: 0px 10px 0px rgba(0, 0, 0, 0.4);
          animation: slideDown 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
        }

        @keyframes slideDown {
          from {
            transform: translateY(-50px) scale(0.9);
          }
          to {
            transform: translateY(0) scale(1);
          }
        }

        .ach-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 20px;
          border-bottom: 2px dashed var(--brown);
          padding-bottom: 10px;
        }

        .ach-header h1 {
          margin: 0;
          font-family: "Titan One";
          font-size: 1.8rem;
          color: var(--brown);
        }

        .ach-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
          overflow-y: auto;
          padding-right: 5px;
          flex: 1;
        }

        .ach-grid::-webkit-scrollbar {
          width: 6px;
        }

        .ach-grid::-webkit-scrollbar-thumb {
          background: var(--brown);
          border-radius: 4px;
        }

        .ach-item {
          background: #fff;
          border: 3px solid var(--brown);
          border-radius: 16px;
          padding: 15px 5px;
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          box-shadow: 0px 4px 0px rgba(0, 0, 0, 0.1);
          position: relative;
        }

        .ach-item.locked {
          background: #e0e0e0;
          border-color: #9e9e9e;
          filter: grayscale(1);
          opacity: 0.7;
        }

        .ach-item.locked::after {
          content: "🔒";
          position: absolute;
          top: 5px;
          right: 5px;
        }

        .ach-item.unlocked {
          background: #fff9c4;
          border-color: var(--accent-dark);
          box-shadow: 0px 4px 0px var(--accent-dark);
        }

        .ach-icon {
          font-size: 2.5rem;
          margin-bottom: 5px;
        }

        .ach-name {
          font-weight: 800;
          font-size: 0.9rem;
          line-height: 1.2;
        }

        .close-btn {
          margin-top: 15px;
          background: var(--red);
          color: white;
          font-family: "Titan One";
          border: 3px solid var(--brown);
          border-radius: 12px;
          padding: 10px;
          font-size: 1.2rem;
          cursor: pointer;
          box-shadow: 0px 4px 0px var(--brown);
          text-align: center;
        }

        .close-btn:active {
          transform: translateY(4px);
          box-shadow: none;
        }

        #modal {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.8);
          display: none;
          justify-content: center;
          align-items: center;
          z-index: 3000;
        }

        .modal-box {
          background: white;
          border: 4px solid var(--brown);
          border-radius: 24px;
          padding: 30px;
          text-align: center;
          width: 85%;
          max-width: 350px;
          box-shadow: 0px 10px 0px var(--accent);
          animation: pop 0.4s ease;
        }

        @keyframes pop {
          from {
            transform: scale(0.5);
          }
          to {
            transform: scale(1);
          }
        }

        .trophy-anim {
          font-size: 5rem;
          margin: 10px 0;
          animation: wiggle 2s infinite;
        }

        @keyframes wiggle {
          0%,
          100% {
            transform: rotate(0deg);
          }
          25% {
            transform: rotate(-5deg);
          }
          75% {
            transform: rotate(5deg);
          }
        }

        #modalXp {
          font-size: 2rem;
          font-family: "Titan One";
          color: var(--green-dark);
          margin-bottom: 20px;
        }

        .ok {
          width: 100%;
          padding: 12px;
          font-size: 1.4rem;
          font-family: "Titan One";
          background: var(--green);
          border: 3px solid var(--brown);
          border-radius: 14px;
          color: white;
          box-shadow: 0px 5px 0px var(--brown);
        }

        .ok:active {
          transform: translateY(5px);
          box-shadow: none;
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
      `}</style>
    </>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<div style={{ padding: 20, textAlign: "center" }}>Caricamento…</div>}>
      <Home />
    </Suspense>
  );
}
