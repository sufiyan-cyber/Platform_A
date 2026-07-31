"use client";

import * as React from "react";
import { useStore } from "zustand";
import type { Campaign } from "@/campaigns/types";
import type { BuildState } from "@/server/builds";
import { createBuildStore, type BuildStore, type BuildStoreState } from "@/store/build-store";

const BuildStoreContext = React.createContext<BuildStore | null>(null);

export function BuildStoreProvider({
  campaign,
  build,
  children,
}: {
  campaign: Campaign;
  build: BuildState;
  children: React.ReactNode;
}) {
  // `useState` with a lazy initialiser (not `useRef`) so the store is created
  // exactly once per mount, including under StrictMode double-invocation.
  const [store] = React.useState(() => createBuildStore(campaign, build));

  return <BuildStoreContext.Provider value={store}>{children}</BuildStoreContext.Provider>;
}

export function useBuildStore<T>(selector: (state: BuildStoreState) => T): T {
  const store = React.useContext(BuildStoreContext);
  if (!store) {
    throw new Error("useBuildStore must be used inside <BuildStoreProvider>.");
  }
  return useStore(store, selector);
}

/** Escape hatch for imperative calls outside render (timers, event handlers). */
export function useBuildStoreApi(): BuildStore {
  const store = React.useContext(BuildStoreContext);
  if (!store) {
    throw new Error("useBuildStoreApi must be used inside <BuildStoreProvider>.");
  }
  return store;
}
