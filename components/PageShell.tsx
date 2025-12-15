"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

export function PageShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [transitioning, setTransitioning] = useState(false);
  const previousPath = useRef<string | null>(null);

  useEffect(() => {
    let timer: number | undefined;

    if (previousPath.current && previousPath.current !== pathname) {
      setTransitioning(true);
      timer = window.setTimeout(() => setTransitioning(false), 400);
    }

    previousPath.current = pathname;

    return () => {
      if (timer) window.clearTimeout(timer);
    };
  }, [pathname]);

  return (
    <main key={pathname} className="page-content">
      {children}
      {transitioning ? (
        <div aria-hidden="true" className="page-loading">
          <div className="page-loading__pulse" />
          <div className="page-loading__text">Caricamento...</div>
        </div>
      ) : null}
    </main>
  );
}
