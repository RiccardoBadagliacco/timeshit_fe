"use client";

import type { Progress } from "@/types/progress";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

type HeaderState = {
  playerName: string;
  progress: Progress | null;
  photoUrl: string | null;
};

type HeaderContextValue = {
  state: HeaderState;
  updateHeader: (payload: Partial<HeaderState>) => void;
};

const defaultState: HeaderState = {
  playerName: "Loading...",
  progress: null,
  photoUrl: null,
};

const HeaderContext = createContext<HeaderContextValue | undefined>(undefined);

export function HeaderProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<HeaderState>(defaultState);
  const updateHeader = useCallback((payload: Partial<HeaderState>) => {
    setState((prev) => ({ ...prev, ...payload }));
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const storedUsername = localStorage.getItem("ts_username");

    if (!storedUsername) return;

    const normalized = storedUsername.startsWith("@")
      ? storedUsername
      : `@${storedUsername}`;

    updateHeader({ playerName: normalized });
  }, [updateHeader]);

  const value = useMemo(() => ({ state, updateHeader }), [state, updateHeader]);

  return (
    <HeaderContext.Provider value={value}>{children}</HeaderContext.Provider>
  );
}

export function useHeaderState() {
  const context = useContext(HeaderContext);

  if (!context) {
    throw new Error("useHeaderState must be used within HeaderProvider");
  }

  return context;
}
