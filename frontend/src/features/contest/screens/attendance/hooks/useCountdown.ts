import { useEffect, useState } from "react";

export function useCountdown(seconds: number, active: boolean): number {
  const [remaining, setRemaining] = useState(seconds);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sync remaining when active/seconds change
    setRemaining(seconds);
    if (!active) return undefined;
    const timer = window.setInterval(() => {
      setRemaining((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [active, seconds]);

  return remaining;
}
