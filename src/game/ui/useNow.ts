import { useEffect, useState } from "react";

/** Re-renders on an interval and returns performance.now(); for countdown UIs. */
export function useNow(intervalMs = 100) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((x) => x + 1), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return performance.now();
}
