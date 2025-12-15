"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FeatureGroup, Map, PopupEvent } from "leaflet";
import "leaflet/dist/leaflet.css";

import { useHeaderState } from "@/components/HeaderContext";

type RawPoop = {
  id: number;
  user_id: number;
  consistency: string;
  size: string;
  location: string;
  note?: string | null;
  xp_awarded: number;
  lat: number;
  lng: number;
  accuracy?: number;
  created_at: string;
};

type PoopWithUser = {
  poop: RawPoop;
  username: string;
};

type Cluster = {
  lat: number;
  lng: number;
  poops: PoopWithUser[];
};

const CONFIG: {
  consistency: Record<string, { label: string; emoji: string }>;
  size: Record<string, { label: string; emoji: string }>;
} = {
  consistency: {
    normal: { label: "Normale", emoji: "🙂" },
    liquid: { label: "Liquida", emoji: "🌊" },
    hard: { label: "Dura", emoji: "🪨" },
    spicy: { label: "Piccante", emoji: "🌶️" },
    soft: { label: "Soft", emoji: "🌸" },
  },
  size: {
    small: { label: "Piccola", emoji: "🤏" },
    medium: { label: "Media", emoji: "👌" },
    large: { label: "Enorme", emoji: "🐘" },
    XL: { label: "Extra Large", emoji: "💪" },
  },
};

const GEO_API = "https://timeshit-be.onrender.com/poops/geolocated?limit=500";

export default function GeoPoopPage() {
  const { state } = useHeaderState();
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const mapContainer = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Map | null>(null);
  const groupRef = useRef<FeatureGroup | null>(null);
  const leafletRef = useRef<typeof import("leaflet") | null>(null);
  const leafletLoaderRef = useRef<Promise<typeof import("leaflet")> | null>(null);

  const loadLeaflet = useCallback(() => {
    if (!leafletLoaderRef.current) {
      leafletLoaderRef.current = import("leaflet").then((mod) => {
        leafletRef.current = mod;
        return mod;
      });
    }
    return leafletLoaderRef.current;
  }, []);

  const totalLogs = useMemo(
    () => clusters.reduce((acc, cluster) => acc + cluster.poops.length, 0),
    [clusters],
  );

  const getEmoji = (type: string, size: string) => {
    if (type === "spicy") return CONFIG.consistency.spicy.emoji;
    if (CONFIG.size[size]) return CONFIG.size[size].emoji;
    if (CONFIG.consistency[type]) return CONFIG.consistency[type].emoji;

    return "💩";
  };

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleString("it-IT", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  useEffect(() => {
    const controller = new AbortController();

    fetch(GEO_API, { signal: controller.signal })
      .then((res) => res.json())
      .then((data: Cluster[]) => {
        setClusters(
          data.map((item) => ({
            lat: item.lat,
            lng: item.lng,
            poops: item.poops.map((entry) => ({
              poop: entry.poop,
              username: entry.username,
            })),
          })),
        );
      })
      .catch(() => {});

    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !mapContainer.current) return;

    const container = mapContainer.current;
    if (!container) return;

    let isCancelled = false;
    let handlePopup: ((event: PopupEvent) => void) | null = null;

    loadLeaflet().then((L) => {
      if (isCancelled) return;

      if (!mapRef.current) {
        mapRef.current = L.map(container, {
          zoomControl: false,
        }).setView([42.5, 12.5], 6);

        L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}{r}.png", {
          attribution: "&copy; OpenStreetMap &copy; CARTO",
          maxZoom: 20,
        }).addTo(mapRef.current);

        L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}{r}.png", {
          subdomains: "abcd",
          maxZoom: 20,
          opacity: 0.7,
        }).addTo(mapRef.current);
      }

      if (!groupRef.current) {
        groupRef.current = L.featureGroup().addTo(mapRef.current);
      }

      const group = groupRef.current;
      group.clearLayers();

      clusters.forEach((cluster) => {
        const entries = cluster.poops;
        const primary = entries[0];
        const poopEmoji = "💩";
        const iconHtml =
          entries.length === 1
            ? `<div class="custom-marker">${poopEmoji}</div>`
            : `<div class="custom-counter"><span class="counter-num">${entries.length}</span></div>`;

        const icon = L.divIcon({
          className: "custom-div-icon",
          html: iconHtml,
          iconSize: [46, 46],
          iconAnchor: [23, 46],
          popupAnchor: [0, -48],
        });

        const payload = encodeURIComponent(JSON.stringify(entries));

        const locationLabel = primary.poop.location || "Posizione sconosciuta";
        const popup = `
          <div class="popup-card">
            <div class="popup-header">
              <span class="header-emoji">${poopEmoji}</span>
              ${locationLabel}
            </div>
            <div class="popup-body">
              <div class="popup-user">Utente: ${primary.username || "Anonimo"}</div>
              <span class="popup-emoji">${poopEmoji}</span>
              <div class="popup-details">
                ${CONFIG.consistency[primary.poop.consistency]?.label || primary.poop.consistency} •
                ${CONFIG.size[primary.poop.size]?.label || primary.poop.size}
              </div>
              <div class="popup-slider" data-poops="${payload}" data-count="${entries.length}">
                <button class="popup-nav" data-direction="prev" aria-label="Prev">‹</button>
                <div class="popup-slide"></div>
                <button class="popup-nav" data-direction="next" aria-label="Next">›</button>
              </div>
              <div class="popup-date">${formatDate(primary.poop.created_at)}</div>
            </div>
          </div>
        `;

        const marker = L.marker([cluster.lat, cluster.lng], { icon }).bindPopup(popup);
        marker.addTo(group);
      });

      if (group.getLayers().length) {
        mapRef.current!.fitBounds(group.getBounds(), { padding: [50, 50] });
      }

      handlePopup = (event: PopupEvent) => {
        const popupEl = event.popup.getElement();
        if (!popupEl) return;
        const slider = popupEl.querySelector<HTMLElement>(".popup-slider");
        const slideArea = popupEl.querySelector<HTMLElement>(".popup-slide");
        if (!slider || !slideArea) return;

        let entries: PoopWithUser[] = [];
        try {
          entries = JSON.parse(decodeURIComponent(slider.dataset.poops || ""));
        } catch (err) {
          return;
        }

        if (!entries.length) return;

        slider.dataset.count = String(entries.length);

        let currentIndex = 0;

        const renderSlide = () => {
          const entry = entries[currentIndex];
          slideArea.innerHTML = `
            ${entry.poop.note ? `<div class="popup-note">“${entry.poop.note}”</div>` : ""}
          `;
          const dateEl = popupEl.querySelector<HTMLElement>(".popup-date");
          if (dateEl) {
            dateEl.textContent = formatDate(entry.poop.created_at);
          }
        };

        renderSlide();

        const navButtons = Array.from(slider.querySelectorAll<HTMLButtonElement>(".popup-nav"));
        const handlers: { btn: HTMLButtonElement; handler: () => void }[] = [];

        navButtons.forEach((btn) => {
          const handler = () => {
            currentIndex =
              btn.dataset.direction === "next"
                ? (currentIndex + 1) % entries.length
                : (currentIndex - 1 + entries.length) % entries.length;
            renderSlide();
          };
          btn.addEventListener("click", handler);
          btn.addEventListener("touchend", handler);
          handlers.push({ btn, handler });
        });

        event.popup.once("remove", () => {
          handlers.forEach(({ btn, handler }) => {
            btn.removeEventListener("click", handler);
            btn.removeEventListener("touchend", handler);
          });
        });
      };

      mapRef.current?.on("popupopen", handlePopup);
    });

    return () => {
      isCancelled = true;
      if (handlePopup && mapRef.current) {
        mapRef.current.off("popupopen", handlePopup);
      }
      groupRef.current?.clearLayers();
    };
  }, [clusters, loadLeaflet]);

  const centerOnMe = () => {
    if (!mapRef.current) return;
    if (!("geolocation" in navigator)) {
      alert("Geolocalizzazione non supportata");

      return;
    }

    if (!leafletRef.current) {
      loadLeaflet().then(() => centerOnMe());
      return;
    }

    const L = leafletRef.current;

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;

        const meIcon = L.divIcon({
          className: "",
          html: `<div class="me-marker"></div>`,
          iconSize: [26, 26],
          iconAnchor: [13, 13],
        });

        L.marker([lat, lng], { icon: meIcon })
          .addTo(mapRef.current!)
          .bindPopup("Sei qui!")
          .openPopup();

        mapRef.current!.setView([lat, lng], 15);
      },
      (err) => {
        alert(`Impossibile trovare la tua posizione: ${err.message}`);
      },
    );
  };

  const fitAll = () => {
    if (!mapRef.current || !groupRef.current) return;
    const group = groupRef.current;

    if (!group.getLayers().length) return;
    mapRef.current.fitBounds(group.getBounds(), { padding: [50, 50] });
  };

  return (
    <div className="geopoop-shell">
      <div aria-hidden className="bg-layer" />
      <div className="map-wrapper">
        <div ref={mapContainer} id="geopoopMap" />
      </div>
      <div className="map-controls">
        <button className="action-btn secondary" type="button" onClick={centerOnMe}>
          📍 Io
        </button>
        <button className="action-btn" type="button" onClick={fitAll}>
          🌍 Tutti
        </button>
      </div>

      {/* eslint-disable-next-line react/no-unknown-property */}
      <style jsx>{`
        :global(:root) {
          --brown: #5d4037;
          --bg: #fff8e1;
          --panel: #ffffff;
          --accent: #ffccbc;
          --accent-dark: #f4511e;
          --blue: #42a5f5;
          --green: #66bb6a;
          --border-width: 4px;
        }

        :global(*) {
          box-sizing: border-box;
          -webkit-tap-highlight-color: transparent;
        }

        :global(body) {
          background-color: var(--bg);
        }

        .geopoop-shell {
          min-height: calc(100vh - 80px);
          position: relative;
          display: flex;
          flex-direction: column;
        }

        .bg-layer {
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
          opacity: 0.4;
          pointer-events: none;
        }

        .map-wrapper {
          flex: 1;
          position: relative;
          overflow: hidden;
          background: #a5d6a7;
          min-height: calc(100vh - 150px);
        }

        #geopoopMap {
          width: 100%;
          height: 100%;
          min-height: inherit;
          z-index: 1;
        }

        :global(.leaflet-tile-pane) {
          filter: saturate(1.8) contrast(1.1) brightness(1.05);
        }

        .map-wrapper::after {
          content: "";
          position: absolute;
          inset: 0;
          box-shadow: inset 0 0 40px rgba(93, 64, 55, 0.4);
          pointer-events: none;
          z-index: 900;
        }

        .map-controls {
          position: absolute;
          bottom: 30px;
          left: 50%;
          transform: translateX(-50%);
          z-index: 1001;
          display: flex;
          gap: 15px;
          width: 90%;
          max-width: 420px;
        }

        .action-btn {
          flex: 1;
          background: #ffeb3b;
          color: var(--brown);
          font-family: "Titan One", cursive;
          font-size: 1.1rem;
          text-transform: uppercase;
          padding: 15px;
          border: var(--border-width) solid var(--brown);
          border-radius: 20px;
          cursor: pointer;
          box-shadow: 0px 6px 0px var(--brown);
          text-align: center;
          transition: transform 0.1s, box-shadow 0.1s;
        }

        .action-btn.secondary {
          background: #fff;
        }

        .map-controls .action-btn:active {
          transform: translateY(6px);
          box-shadow: 0px 0 0 var(--brown);
        }

        :global(.custom-marker) {
          width: 46px;
          height: 46px;
          background: white;
          border: 3px solid var(--brown);
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1.8rem;
          line-height: 1;
          box-shadow: 0px 4px 0px rgba(0, 0, 0, 0.3);
          animation: marker-bounce 2.2s infinite ease-in-out;
          text-shadow: 0 1px 0 rgba(0, 0, 0, 0.1);
        }

        :global(.custom-counter) {
          width: 46px;
          height: 46px;
          border-radius: 50%;
          border: 3px solid var(--brown);
          background: linear-gradient(135deg, #fff, #ffe7ce);
          display: flex;
          align-items: center;
          justify-content: center;
          flex-direction: column;
          gap: 2px;
          font-weight: 900;
          color: var(--brown);
          box-shadow: 0px 4px 0 rgba(0, 0, 0, 0.3);
          text-shadow: 0 1px 0 rgba(255, 255, 255, 0.5);
          animation: marker-bounce 2.2s infinite ease-in-out;
        }

        :global(.custom-counter .counter-num) {
          font-size: 1rem;
        }

        @keyframes marker-bounce {
          0%,
          100% {
            transform: translateY(0);
          }
          50% {
            transform: translateY(-6px);
          }
        }

        :global(.leaflet-popup-content-wrapper) {
          border: none;
          border-radius: 26px;
          box-shadow: 10px 10px 0px rgba(0, 0, 0, 0.25);
          padding: 0;
          overflow: visible;
          background: transparent;
        }

        :global(.leaflet-popup-tip) {
          background: var(--brown);
          width: 20px;
          height: 20px;
          margin-top: -10px;
          box-shadow: none;
        }

        :global(.leaflet-popup-content) {
          margin: 0;
          width: 250px !important;
          background: transparent;
        }

        :global(.leaflet-popup-close-button) {
          width: 36px;
          height: 36px;
          border-radius: 50%;
          background: linear-gradient(135deg, #fff8e1, #ffe082);
          border: 3px solid var(--brown);
          padding: 0;
          box-shadow: 0px 5px 0px rgba(0, 0, 0, 0.3);
          top: 12px;
          right: 12px;
          transition: transform 0.1s ease;
        }

        :global(.leaflet-popup-close-button:hover) {
          transform: translateY(-1px) scale(1.08);
        }

        :global(.leaflet-popup-close-button::before),
        :global(.leaflet-popup-close-button::after) {
          content: "";
          position: absolute;
          left: 50%;
          top: 50%;
          width: 16px;
          height: 2px;
          background: var(--brown);
          transform-origin: center;
          border-radius: 2px;
        }

        :global(.leaflet-popup-close-button::before) {
          transform: translate(-50%, -50%) rotate(45deg);
        }

        :global(.leaflet-popup-close-button::after) {
          transform: translate(-50%, -50%) rotate(-45deg);
        }

        :global(.popup-card) {
          background: var(--panel);
          border-radius: 20px;
          border: 4px solid var(--brown);
          box-shadow: inset 0 0 15px rgba(0, 0, 0, 0.08),
            0 10px 0px rgba(0, 0, 0, 0.2);
          overflow: hidden;
        }

        :global(.popup-header) {
          background: var(--accent-dark);
          padding: 14px;
          border-bottom: 4px solid var(--brown);
          font-family: "Titan One", cursive;
          font-size: 1rem;
          color: #fff;
          text-align: center;
          text-shadow: 2px 2px 0px rgba(0, 0, 0, 0.2);
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
        }

        :global(.header-emoji) {
          font-size: 1.2rem;
        }

        :global(.popup-body) {
          padding: 16px;
          text-align: center;
          background: #fff8f0;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        :global(.popup-emoji) {
          font-size: 3rem;
          display: block;
          margin-bottom: 4px;
          filter: drop-shadow(0px 3px 0px rgba(0, 0, 0, 0.1));
        }

        :global(.popup-details) {
          font-size: 0.95rem;
          color: var(--brown);
          font-weight: 800;
          background: linear-gradient(135deg, #fff, #ffe7ce);
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 6px 14px;
          border-radius: 999px;
          border: 2px solid #d8b89a;
          margin-bottom: 4px;
          box-shadow: inset 0 0 8px rgba(255, 255, 255, 0.6);
        }

        :global(.popup-note) {
          font-size: 0.85rem;
          color: #5d4037;
          font-style: italic;
          background: #fff3e0;
          border-radius: 10px;
          padding: 6px 10px;
          border: 2px solid #f4c794;
        }

        :global(.popup-slider) {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 6px;
          margin-top: 4px;
        }

        :global(.popup-nav) {
          width: 38px;
          height: 38px;
          border-radius: 50%;
          border: 3px solid var(--brown);
          background: radial-gradient(circle, #fff 0%, #ffe7ce 60%, #ffd0a6 100%);
          font-size: 1.1rem;
          font-weight: 900;
          color: var(--brown);
          cursor: pointer;
          box-shadow: 0 5px 0 rgba(0, 0, 0, 0.25);
          transition: transform 0.15s ease, box-shadow 0.15s ease;
        }

        :global(.popup-nav:hover) {
          transform: translateY(-2px);
          box-shadow: 0 7px 0 rgba(0, 0, 0, 0.3);
        }

        :global(.popup-nav:active) {
          transform: translateY(2px);
          box-shadow: 0 3px 0 rgba(0, 0, 0, 0.2);
        }

        :global(.popup-slide) {
          flex: 1;
          min-height: 32px;
          border-radius: 12px;
          background: transparent;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 700;
          color: var(--brown);
        }

        :global(.popup-slider[data-count="1"]) :global(.popup-nav) {
          display: none;
        }

        .popup-date {
          font-size: 0.75rem;
          color: #888;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 1px;
        }

        :global(.leaflet-control-attribution) {
          font-size: 9px;
          background: rgba(255, 255, 255, 0.7) !important;
          border-top-left-radius: 10px;
        }
      `}</style>
    </div>
  );
}
