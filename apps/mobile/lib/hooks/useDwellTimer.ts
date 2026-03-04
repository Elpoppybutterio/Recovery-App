import { AppState, type AppStateStatus } from "react-native";
import { useEffect, useMemo, useRef, useState } from "react";

type UseDwellTimerOptions = {
  requiredSeconds: number;
  isActive?: boolean;
  resetOnInactive?: boolean;
  resetKey?: string | number | null;
};

type UseDwellTimerResult = {
  secondsVisible: number;
  isEligible: boolean;
  progressSeconds: number;
};

const TICK_MS = 250;

export function useDwellTimer(options: UseDwellTimerOptions): UseDwellTimerResult {
  const { requiredSeconds, isActive = true, resetOnInactive = true, resetKey = null } = options;
  const [appState, setAppState] = useState<AppStateStatus>(AppState.currentState);
  const [elapsedMs, setElapsedMs] = useState(0);
  const elapsedMsRef = useRef(0);
  const activeStartedAtRef = useRef<number | null>(null);

  const appIsForeground = appState === "active";
  const ticking = isActive && appIsForeground;

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      setAppState(nextState);
    });
    return () => {
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    if (!isActive && resetOnInactive) {
      activeStartedAtRef.current = null;
      elapsedMsRef.current = 0;
      setElapsedMs(0);
    }
  }, [isActive, resetOnInactive]);

  useEffect(() => {
    activeStartedAtRef.current = null;
    elapsedMsRef.current = 0;
    setElapsedMs(0);
  }, [resetKey]);

  useEffect(() => {
    if (ticking) {
      if (activeStartedAtRef.current === null) {
        activeStartedAtRef.current = Date.now();
      }
      const intervalId = setInterval(() => {
        const startedAt = activeStartedAtRef.current;
        if (startedAt === null) {
          return;
        }
        const liveElapsed = elapsedMsRef.current + Math.max(0, Date.now() - startedAt);
        setElapsedMs(liveElapsed);
      }, TICK_MS);

      return () => {
        clearInterval(intervalId);
        const startedAt = activeStartedAtRef.current;
        if (startedAt !== null) {
          const delta = Math.max(0, Date.now() - startedAt);
          elapsedMsRef.current += delta;
          setElapsedMs(elapsedMsRef.current);
          activeStartedAtRef.current = null;
        }
      };
    }

    const startedAt = activeStartedAtRef.current;
    if (startedAt !== null) {
      const delta = Math.max(0, Date.now() - startedAt);
      elapsedMsRef.current += delta;
      setElapsedMs(elapsedMsRef.current);
      activeStartedAtRef.current = null;
    }

    return undefined;
  }, [ticking]);

  const progressSeconds = useMemo(() => Math.floor(elapsedMs / 1000), [elapsedMs]);
  const threshold = Math.max(1, Math.floor(requiredSeconds));
  const isEligible = progressSeconds >= threshold;

  return {
    secondsVisible: Math.min(progressSeconds, threshold),
    isEligible,
    progressSeconds,
  };
}
