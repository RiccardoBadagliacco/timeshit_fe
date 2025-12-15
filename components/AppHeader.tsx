"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarDays,
  Home as HomeIcon,
  Menu,
  MapPin,
  Trophy,
} from "lucide-react";
import { useMemo, useState } from "react";

import { useHeaderState } from "@/components/HeaderContext";

const navLinks = [
  { key: "wc", label: "WC", href: "/", Icon: HomeIcon },
  { key: "pooplog", label: "PoopLog", href: "/pooplog", Icon: CalendarDays },
  { key: "poopbucket", label: "Poopbucket", href: "/poopbucket", Icon: Trophy },
  {
    key: "achievements",
    label: "Achievements",
    href: "/achivments",
    Icon: Trophy,
  },
  { key: "geopoop", label: "GeoPoop", href: "/geopoop", Icon: MapPin },
];

const getActiveSection = (pathname: string | null) => {
  if (!pathname) return "wc";
  if (pathname === "/classifiche") return "classifiche";
  if (pathname.startsWith("/pooplog")) return "pooplog";
  if (pathname.startsWith("/poopbucket")) return "poopbucket";
  if (pathname.startsWith("/achivments")) return "achievements";
  if (pathname.startsWith("/geopoop")) return "geopoop";
  if (pathname === "/") return "wc";

  return "wc";
};

export const AppHeader = () => {
  const pathname = usePathname();
  const { state } = useHeaderState();
  const [menuOpen, setMenuOpen] = useState(false);

  const xpPercent = useMemo(() => {
    const xpForNext = state.progress?.xp_for_next ?? 0;

    if (!xpForNext) return 0;
    const fill = ((state.progress?.xp_in_level ?? 0) / xpForNext) * 100;

    return Math.max(0, Math.min(100, fill));
  }, [state.progress]);

  const activeSection = useMemo(() => getActiveSection(pathname), [pathname]);

  return (
    <>
      <header className="app-header">
        <div className="status-panel">
          <div className={`avatar ${state.photoUrl ? "with-photo" : ""}`}>
            {state.photoUrl ? <img alt="" src={state.photoUrl} /> : "💩"}
          </div>
          <div className="stats">
            <div className="name">{state.playerName}</div>
            <div className="xp-row">
              <div className="xp-container">
                <div className="xp-fill" style={{ width: `${xpPercent}%` }} />
              </div>
              <div className="level-badge">
                LVL {state.progress?.level ?? "?"}
              </div>
            </div>
          </div>
        </div>
        <button
          aria-label="Menu"
          className="menu-btn"
          onClick={() => setMenuOpen(true)}
        >
          <Menu size={26} />
        </button>
      </header>

      {menuOpen ? (
        <div
          aria-hidden={!menuOpen}
          aria-label="Menu di navigazione"
          className="nav-overlay"
          role="dialog"
        >
          <div className="nav-panel">
            <div className="nav-header">
              <div className="nav-logo">💩</div>
              <button
                aria-label="Chiudi menu"
                className="nav-close"
                onClick={() => setMenuOpen(false)}
              >
                ✕
              </button>
            </div>
            <div className="nav-items">
              {navLinks.map(({ key, label, href, Icon }) => (
                <Link
                  key={key}
                  className={`nav-item ${activeSection === key ? "active" : ""}`}
                  href={href}
                  onClick={() => setMenuOpen(false)}
                >
                  <Icon size={18} /> {label}
                </Link>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {/* eslint-disable-next-line react/no-unknown-property */}
      <style global jsx>{`
        header.app-header {
          display: flex;
          gap: 12px;
          align-items: stretch;
          margin-bottom: 20px;
          position: sticky;
          top: 20px;
          z-index: 1000;
          background: var(--bg);
          width: 100%;
          box-sizing: border-box;
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

        .avatar.with-photo img {
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

        .nav-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.65);
          backdrop-filter: blur(3px);
          display: flex;
          justify-content: flex-end;
          z-index: 2000;
        }

        .nav-panel {
          width: 78%;
          max-width: 340px;
          background: #fff8e1;
          border-left: 4px solid var(--brown);
          box-shadow: -6px 0 20px rgba(0, 0, 0, 0.25);
          padding: 16px;
          display: flex;
          flex-direction: column;
          gap: 12px;
          animation: slideIn 0.25s ease;
        }

        .nav-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .nav-logo {
          width: 46px;
          height: 46px;
          border-radius: 12px;
          border: 3px solid var(--brown);
          background: radial-gradient(circle at 30% 30%, #fffdf5, #ffc178);
          display: grid;
          place-items: center;
          font-size: 1.6rem;
          box-shadow: 0px 3px 0px rgba(0, 0, 0, 0.15);
        }

        .nav-close {
          background: #fff;
          border: 2px solid var(--brown);
          border-radius: 12px;
          width: 36px;
          height: 36px;
          display: grid;
          place-items: center;
          font-weight: 800;
          cursor: pointer;
          box-shadow: 0px 3px 0px rgba(0, 0, 0, 0.2);
        }

        .nav-close:active {
          transform: translateY(2px);
          box-shadow: 0px 1px 0px rgba(0, 0, 0, 0.2);
        }

        .nav-items {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .nav-item {
          display: flex;
          align-items: center;
          gap: 10px;
          border: 2px solid var(--brown);
          background: linear-gradient(120deg, #fff9c4, #ffe0b2);
          border-radius: 14px;
          padding: 12px;
          font-weight: 800;
          color: #3e2723;
          box-shadow: 0px 4px 0px rgba(0, 0, 0, 0.1);
          cursor: pointer;
          font-size: 1rem;
          justify-content: flex-start;
        }

        .nav-item:active {
          transform: translateY(2px);
          box-shadow: 0px 2px 0px rgba(0, 0, 0, 0.15);
        }

        .nav-item.active {
          border-color: #3e2723;
          background: linear-gradient(120deg, #ffb74d, #ff9800);
          box-shadow: 0px 4px 0px rgba(62, 39, 35, 0.2);
        }

        @keyframes slideIn {
          from {
            transform: translateX(100%);
          }
          to {
            transform: translateX(0);
          }
        }

        @media (max-width: 480px) {
          .nav-panel {
            width: 90%;
          }
        }
      `}</style>
    </>
  );
};
