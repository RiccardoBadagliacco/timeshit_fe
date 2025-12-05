"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, ChevronLeft, ChevronRight, Trophy } from "lucide-react";

import LoaderOverlay from "@/components/LoaderOverlay";

type PoopEntry = {
  id: number;
  user_id: number;
  consistency: string;
  size: string;
  location: string;
  xp_awarded: number;
  created_at: string;
};
type BucketUser = {
  user_id: number;
  username?: string | null;
  name?: string | null;
  photo_url?: string | null;
  total_poops: number;
  total_xp: number;
  mass_tons?: number;
  poops: PoopEntry[];
};
type BucketResponse = {
  year: number;
  total_mass_tons?: number;
  users: BucketUser[];
};

const MIN_YEAR = 2025;
const CURRENT_YEAR = new Date().getFullYear();
const TARGET_TONS = 1;
const apiBaseEnv = (process.env.NEXT_PUBLIC_API_BASE || "").replace(/\/$/, "");
const KG_PER_TON = 1000;
const MILESTONES = [
  { pct: 10, label: "gatto", icon: "🐱" }, // ~4-5kg
  { pct: 20, label: "cane", icon: "🐶" }, // ~10-15kg
  { pct: 30, label: "uomo", icon: "🧍" }, // ~70kg
  { pct: 40, label: "maiale", icon: "🐖" }, // ~120kg
  { pct: 50, label: "motore", icon: "⚙️" }, // ~200kg
  { pct: 60, label: "macchina", icon: "🚗" }, // ~1t
  { pct: 70, label: "autobus", icon: "🚌" }, // ~12t
  { pct: 80, label: "camion", icon: "🚛" }, // ~18t
  { pct: 90, label: "treno", icon: "🚆" }, // ~40t+
  { pct: 100, label: "balena", icon: "🐋" }, // 1T target simbolico
];

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

function formatUserName(u: BucketUser) {
  if (u.username) return `@${u.username}`;
  if (u.name) return u.name;
  return `User ${u.user_id}`;
}

function massTonsFromPoops(count: number) {
  // Stima: 180g per log => 0.00018 tonnellate
  return count * 0.00018;
}

function userMassTons(u: BucketUser) {
  return u.mass_tons ?? massTonsFromPoops(u.total_poops);
}

function seedNumberFromString(str: string) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i += 1) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return (h >>> 0) || 1;
}

function mulberry32(seed: number) {
  let t = seed;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), t | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function formatKg(massTons: number, fractionDigits = 3) {
  const kg = massTons * KG_PER_TON;

  return kg.toLocaleString("it-IT", {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
}

function PageContent() {
  const searchParams = useSearchParams();
  const [bucket, setBucket] = useState<BucketResponse | null>(null);
  const [year, setYear] = useState<number>(Math.max(MIN_YEAR, CURRENT_YEAR));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const apiBase =
      searchParams.get("api") ||
      searchParams.get("api_base") ||
      searchParams.get("apiBase");

    const loadBucket = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          buildApiUrl(`/poopbucket?year=${year}`, apiBase),
          { cache: "no-store" },
        );
        const text = await res.text();
        if (!res.ok) throw new Error(`HTTP ${res.status} ${text}`);
        const data = JSON.parse(text) as BucketResponse;
        setBucket(data);
      } catch (err) {
        console.warn("Bucket load failed", err);
        setError("Impossibile caricare il PoopBucket");
      } finally {
        setLoading(false);
      }
    };

    loadBucket();
  }, [year, searchParams]);

  const leaderboard = useMemo(() => {
    if (!bucket) return [];
    return [...bucket.users].sort(
      (a, b) => userMassTons(b) - userMassTons(a) || b.total_poops - a.total_poops,
    );
  }, [bucket]);

  const globalPoops = useMemo(
    () => leaderboard.reduce((sum, u) => sum + u.total_poops, 0),
    [leaderboard],
  );
  const globalWeightTons = useMemo(() => {
    if (bucket && typeof bucket.total_mass_tons === "number") {
      return bucket.total_mass_tons;
    }
    return leaderboard.reduce(
      (sum, u) => sum + (u.mass_tons ?? massTonsFromPoops(u.total_poops)),
      0,
    );
  }, [bucket, leaderboard]);

  const percentToTarget = useMemo(
    () => ((globalWeightTons / TARGET_TONS) * 100 || 0),
    [globalWeightTons],
  );

  const fillPct = useMemo(() => {
    if (globalWeightTons <= 0) return 0;
    const pct = percentToTarget;
    if (pct > 100) return 100;
    if (pct < 0) return 0;
    return pct;
  }, [globalWeightTons, percentToTarget]);

  const debrisItems = useMemo(() => {
    const emojis = ["💩", "🪵", "🪨", "🍘", "🌑"];
    const count = Math.min(8, Math.max(2, Math.floor(fillPct / 10)));
    const seedStr = `${year}-${fillPct.toFixed(2)}-${leaderboard.length}`;
    const rand = mulberry32(seedNumberFromString(seedStr));
    return Array.from({ length: count }).map((_, idx) => ({
      key: `d-${idx}-${fillPct.toFixed(1)}`,
      icon: emojis[idx % emojis.length],
      bottom: rand() * 80 + 5,
      left: rand() * 80 + 10,
      scale: rand() * 0.5 + 0.8,
      rotate: rand() * 360,
    }));
  }, [fillPct, leaderboard.length, year]);

  return (
    <>
      <div aria-hidden className="bg-layer" />
      <main className="bucket-page">
        <div className="container">
          <nav className="navbar">
            <Link className="nav-btn" href="/">
              <ArrowLeft size={18} />
            </Link>
            <div className="nav-title">PoopBucket</div>
            <div className="nav-btn">
              <Trophy size={16} />
            </div>
          </nav>

          <div className="year-switch">
            <button
              aria-label="Anno precedente"
              disabled={year <= MIN_YEAR}
              onClick={() => setYear((y) => Math.max(MIN_YEAR, y - 1))}
              type="button"
            >
              <ChevronLeft size={16} />
            </button>
            <div className="year-label">{year}</div>
            <button
              aria-label="Anno successivo"
              disabled={year >= CURRENT_YEAR}
              onClick={() => setYear((y) => Math.min(CURRENT_YEAR, y + 1))}
              type="button"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          <div className="silo-wrapper">
            <div className="tank-header">
              <div>
                <div className="stat-lbl">Totale {year}</div>
                <div className="stat-val">{formatKg(globalWeightTons)} kg</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div className="stat-lbl">Target</div>
                <div className="stat-val">{TARGET_TONS}T</div>
              </div>
            </div>

              <div className="titan-tank">
                <div className="tank-glare" />

                <div className="milestones">
                  {[...MILESTONES].reverse().map(({ pct, label, icon }) => {
                    const active = percentToTarget >= pct;
                    return (
                      <div
                        key={label}
                        className={`ms ${active ? "active" : ""}`}
                        data-t={pct}
                      >
                        <span className="ms-icon">
                          <span className="ms-emoji" aria-hidden>
                            {icon}
                          </span>
                          {label}
                        </span>
                      </div>
                    );
                  })}
                </div>

              <div
                className="liquid"
                style={{
                  height: `${fillPct}%`,
                }}
              >
                <div className="debris-layer">
                  {debrisItems.map((d) => (
                    <div
                      key={d.key}
                      className="debris"
                      style={{
                        left: `${d.left}%`,
                        bottom: `${d.bottom}%`,
                        transform: `scale(${d.scale}) rotate(${d.rotate}deg)`,
                      }}
                    >
                      {d.icon}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

              <div className="stats-row">
                <div className="mini-stat">
                  <div className="mini-val">{globalPoops.toLocaleString()}</div>
                  <div className="mini-lbl">Log Totali</div>
                </div>
                <div className="mini-stat">
                  <div className="mini-val">{formatKg(globalWeightTons)} kg</div>
                  <div className="mini-lbl">Massa Stimata</div>
                </div>
            <div className="mini-stat">
              <div className="mini-val">{leaderboard.length}</div>
              <div className="mini-lbl">Partecipanti</div>
            </div>
          </div>

          <div className="rankings">
            {error ? (
              <div className="error">{error}</div>
            ) : leaderboard.length ? (
              <>
                <div className="lb-title">
                  Classifica <span className="badge-count">{leaderboard.length}</span>
                </div>

                <div className="podium">
                  {[
                    { user: leaderboard[1], rank: 2 },
                    { user: leaderboard[0], rank: 1 },
                    { user: leaderboard[2], rank: 3 },
                  ]
                    .filter((slot) => slot.user)
                    .map(({ user: u, rank }) => {
                      if (!u) return null;
                      const mass = userMassTons(u);
                      const massKg = (mass || 0) * KG_PER_TON;
                      const pct =
                        globalWeightTons > 0
                          ? ((mass / globalWeightTons) * 100).toFixed(1)
                          : "0.0";
                      return (
                        <div className={`p-col rk-${rank}`} key={u.user_id}>
                          <div className="p-avatar">
                            {u.photo_url ? (
                              <img
                                alt={formatUserName(u)}
                                src={u.photo_url}
                              />
                            ) : (
                              "💩"
                            )}
                          </div>
                          <div className="p-block">
                            <div className="p-name">{formatUserName(u)}</div>
                            <div className="p-val">
                              {massKg.toLocaleString("it-IT", {
                                minimumFractionDigits: 3,
                                maximumFractionDigits: 3,
                              })}{" "}
                              kg
                            </div>
                            <div className="p-pct">{pct}%</div>
                          </div>
                        </div>
                      );
                    })}
                </div>

                <div className="list-wrap">
                  {leaderboard.slice(3).map((u, idx) => {
                    const rank = idx + 4;
                    const mass = userMassTons(u);
                    const massKg = (mass || 0) * KG_PER_TON;
                    const pct =
                      globalWeightTons > 0
                        ? ((mass / globalWeightTons) * 100).toFixed(1)
                        : "0.0";
                    const leaderMass = userMassTons(leaderboard[0] || u);
                    const barPct =
                      leaderMass > 0 ? Math.min(100, (mass / leaderMass) * 100) : 0;
                    const avatar =
                      u.username?.[0] ||
                      u.name?.[0] ||
                      (u.photo_url ? "🖼️" : "💩");

                    return (
                      <div className="row-card" key={u.user_id}>
                        <div className="rk-num">#{rank}</div>
                        <div className="row-av">{avatar}</div>
                        <div className="row-info">
                          <div className="row-head">
                            <span>{formatUserName(u)}</span>
                            <span style={{ color: "var(--accent)" }}>
                              {massKg.toLocaleString("it-IT", {
                                minimumFractionDigits: 3,
                                maximumFractionDigits: 3,
                              })}{" "}
                              kg
                            </span>
                          </div>
                          <div className="row-sub">
                            <div className="bar-bg">
                              <div
                                className="bar-fill"
                                style={{ width: `${barPct}%` }}
                              />
                            </div>
                            <div className="percent-badge">{pct}%</div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <div className="empty">Nessun dato per l&apos;anno selezionato</div>
            )}
          </div>
        </div>
      </main>

      <LoaderOverlay
        emoji="🏗️"
        show={loading}
        subtitle="Stiamo riempiendo il silo..."
        title="PoopBucket"
      />

      <style jsx>{`
        :global(:root) {
          --bg: #fffbf0;
          --accent: #3e2723;
          --primary: #8d6e63;
          --liquid-main: #795548;
          --liquid-light: #a1887f;
          --gold: #ffca28;
          --silver: #eceff1;
          --bronze: #d7ccc8;
        }

        :global(body) {
          background: var(--bg);
          margin: 0;
          padding: 0;
          font-family: "Nunito", sans-serif;
          overflow-x: hidden;
          min-height: 100vh;
        }

        .bg-layer {
          position: fixed;
          inset: 0;
          background: radial-gradient(#d7ccc8 15%, transparent 16%);
          background-size: 20px 20px;
          opacity: 0.4;
          z-index: 0;
          pointer-events: none;
        }

        .bucket-page {
          position: relative;
          z-index: 1;
        }

        .container {
          max-width: 600px;
          margin: 0 auto;
          padding: 15px 15px 60px;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .navbar {
          position: sticky;
          top: 0;
          z-index: 10;
          background: rgba(255, 251, 240, 0.95);
          backdrop-filter: blur(10px);
          padding: 12px 0;
          display: flex;
          align-items: center;
          justify-content: space-between;
          border-bottom: 2px solid rgba(62, 39, 35, 0.1);
        }

        .nav-btn {
          background: #fff;
          border: 2px solid var(--accent);
          border-radius: 8px;
          width: 36px;
          height: 36px;
          display: grid;
          place-items: center;
          box-shadow: 2px 2px 0 var(--accent);
          color: var(--accent);
        }

        .nav-title {
          font-family: "Titan One", cursive;
          font-size: 1.1rem;
          color: #5d4037;
          text-transform: uppercase;
        }

        .year-switch {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          margin-bottom: 8px;
        }

        .year-switch button {
          background: #fff;
          border: 2px solid var(--accent);
          border-radius: 10px;
          width: 36px;
          height: 36px;
          display: grid;
          place-items: center;
          box-shadow: 2px 2px 0 var(--accent);
          cursor: pointer;
          color: var(--accent);
        }

        .year-switch button:disabled {
          opacity: 0.4;
          cursor: not-allowed;
          box-shadow: none;
        }

        .year-label {
          font-family: "Titan One", cursive;
          font-size: 1.2rem;
          color: var(--accent);
        }

        .silo-wrapper {
          position: relative;
          margin-bottom: 32px;
        }

        .tank-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
          margin-bottom: 8px;
          padding: 0 10px;
        }

        .stat-lbl {
          font-size: 0.7rem;
          font-weight: 800;
          text-transform: uppercase;
          color: var(--primary);
        }

        .stat-val {
          font-family: "Titan One", cursive;
          font-size: 1.4rem;
          line-height: 1;
        }

        .titan-tank {
          position: relative;
          height: 420px;
          width: 100%;
          background: rgba(255, 255, 255, 0.6);
          border: 5px solid var(--accent);
          border-radius: 40px;
          overflow: hidden;
          box-shadow:
            inset 10px 0 30px rgba(0, 0, 0, 0.05),
            6px 6px 0 var(--accent);
        }

        .tank-glare {
          position: absolute;
          top: 20px;
          left: 15px;
          width: 12px;
          height: 80%;
          background: linear-gradient(
            to bottom,
            rgba(255, 255, 255, 0.9),
            rgba(255, 255, 255, 0.1)
          );
          border-radius: 10px;
          z-index: 20;
          pointer-events: none;
        }

        .milestones {
          position: absolute;
          top: 0;
          bottom: 0;
          right: 10px;
          width: 50px;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          padding: 30px 0;
          z-index: 10;
          pointer-events: none;
        }

        .ms {
          position: relative;
          height: 16px;
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: flex-end;
        }

        .ms::after {
          content: "";
          width: 12px;
          height: 3px;
          background: rgba(0, 0, 0, 0.2);
          border-radius: 2px;
        }

        .ms-icon {
          position: absolute;
          right: 20px;
          font-size: 0.75rem;
          font-weight: 800;
          text-transform: uppercase;
          transform: scale(0.9);
          opacity: 0.5;
          color: var(--accent);
          transition: 0.3s;
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }

        .ms-emoji {
          font-size: 1rem;
        }

        .ms.active .ms-icon {
          transform: scale(1.05);
          opacity: 1;
        }

        .ms.active::after {
          background: var(--gold);
        }

        .liquid {
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          height: 0%;
          background: var(--liquid-main);
          transition: height 1.2s cubic-bezier(0.34, 1.56, 0.64, 1);
          z-index: 5;
          box-shadow: inset 0 -30px 60px rgba(0, 0, 0, 0.3);
        }

        .liquid::before,
        .liquid::after {
          content: "";
          position: absolute;
          width: 200%;
          height: 60px;
          top: -25px;
          left: -50%;
          border-radius: 50%;
        }

        .liquid::before {
          background: var(--liquid-main);
          transform: scaleX(1.1);
        }

        .liquid::after {
          background: var(--liquid-light);
          opacity: 0.6;
          top: -35px;
          transform: scaleX(1.2);
        }

        .debris-layer {
          position: absolute;
          inset: 0;
          overflow: hidden;
          pointer-events: none;
        }

        .debris {
          position: absolute;
          font-size: 1.5rem;
          filter: drop-shadow(0 2px 2px rgba(0, 0, 0, 0.3));
          pointer-events: none;
        }

        .stats-row {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 10px;
          margin-bottom: 12px;
        }

        .mini-stat {
          background: #fff;
          border: 2px solid var(--accent);
          border-radius: 12px;
          padding: 10px;
          text-align: center;
          box-shadow: 2px 2px 0 rgba(62, 39, 35, 0.2);
        }

        .mini-val {
          font-family: "Titan One", cursive;
          font-size: 1.1rem;
          color: var(--accent);
        }

        .mini-lbl {
          font-size: 0.65rem;
          font-weight: 800;
          text-transform: uppercase;
          color: var(--primary);
          margin-top: 2px;
        }

        .rankings {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .lb-title {
          font-family: "Titan One", cursive;
          font-size: 1.2rem;
          margin-bottom: 10px;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .badge-count {
          background: var(--accent);
          color: #fff;
          font-size: 0.7rem;
          padding: 2px 8px;
          border-radius: 12px;
        }

        .podium {
          display: flex;
          align-items: flex-end;
          justify-content: center;
          gap: 8px;
          margin-bottom: 30px;
          height: 180px;
        }

        .p-col {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: flex-end;
          position: relative;
        }

        .p-col.rk-1 {
          height: 100%;
          z-index: 10;
        }

        .p-col.rk-2 {
          height: 85%;
        }

        .p-col.rk-3 {
          height: 70%;
        }

        .p-avatar {
          width: 54px;
          height: 54px;
          background: #fff;
          border: 3px solid var(--accent);
          border-radius: 50%;
          display: grid;
          place-items: center;
          font-size: 1.8rem;
          position: absolute;
          top: -27px;
          z-index: 2;
          box-shadow: 0 4px 0 rgba(0, 0, 0, 0.1);
          overflow: hidden;
        }

        .p-avatar img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          border-radius: 50%;
          display: block;
        }

        .rk-1 .p-avatar {
          width: 70px;
          height: 70px;
          top: -35px;
          font-size: 2.2rem;
          border-color: #ffb300;
        }

        .p-block {
          width: 100%;
          height: 100%;
          border: 3px solid var(--accent);
          border-bottom: none;
          border-radius: 12px 12px 0 0;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: flex-end;
          padding-bottom: 10px;
          box-shadow: 4px 4px 0 rgba(0, 0, 0, 0.1);
          background: #fff;
        }

        .rk-1 .p-block {
          background: var(--gold);
        }

        .rk-2 .p-block {
          background: var(--silver);
        }

        .rk-3 .p-block {
          background: var(--bronze);
        }

        .p-name {
          font-weight: 800;
          font-size: 0.8rem;
          color: var(--accent);
          margin-bottom: 2px;
          text-align: center;
        }

        .p-val {
          font-family: "Titan One", cursive;
          font-size: 1.1rem;
          line-height: 1;
          text-align: center;
        }

        .p-pct {
          font-size: 0.75rem;
          font-weight: 800;
          color: rgba(62, 39, 35, 0.7);
          background: rgba(255, 255, 255, 0.3);
          padding: 2px 6px;
          border-radius: 6px;
          margin-top: 4px;
        }

        .list-wrap {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .row-card {
          background: #fff;
          border: 2px solid var(--accent);
          border-radius: 12px;
          padding: 10px;
          display: flex;
          align-items: center;
          gap: 12px;
          box-shadow: 3px 3px 0 rgba(62, 39, 35, 0.1);
        }

        .rk-num {
          font-family: "Titan One", cursive;
          width: 25px;
          text-align: center;
          color: var(--primary);
        }

        .row-av {
          font-size: 1.4rem;
        }

        .row-info {
          flex: 1;
        }

        .row-head {
          display: flex;
          justify-content: space-between;
          font-weight: 800;
          font-size: 0.9rem;
          margin-bottom: 4px;
        }

        .row-sub {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 0.7rem;
          color: #8d6e63;
        }

        .bar-bg {
          width: 70%;
          height: 6px;
          background: #eee;
          border-radius: 4px;
          overflow: hidden;
          border: 1px solid rgba(0, 0, 0, 0.1);
        }

        .bar-fill {
          height: 100%;
          background: var(--primary);
          width: 0%;
          border-radius: 4px;
        }

        .percent-badge {
          font-weight: 800;
          background: #efebe9;
          padding: 2px 6px;
          border-radius: 6px;
          border: 1px solid rgba(0, 0, 0, 0.1);
        }

        .empty {
          text-align: center;
          padding: 20px 10px;
          font-weight: 800;
          color: #8d6e63;
        }

        .error {
          background: #ffebee;
          border: 2px solid #ef5350;
          color: #c62828;
          padding: 10px 12px;
          border-radius: 10px;
          font-weight: 800;
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
