import { useState, useEffect } from "react";

export function useCountdownTo(endTime: string | null | undefined) {
  const [remaining, setRemaining] = useState<number | null>(null);
  useEffect(() => {
    if (!endTime) return;
    const calc = () => {
      const diff = Math.max(0, Math.floor((new Date(endTime).getTime() - Date.now()) / 1000));
      setRemaining(diff);
      return diff;
    };
    calc();
    const id = setInterval(() => {
      if (calc() <= 0) clearInterval(id);
    }, 1000);
    return () => clearInterval(id);
  }, [endTime]);

  const r = remaining ?? 0;
  const hh = String(Math.floor(r / 3600)).padStart(2, "0");
  const mm = String(Math.floor((r % 3600) / 60)).padStart(2, "0");
  const ss = String(r % 60).padStart(2, "0");
  return { remaining, display: r >= 3600 ? `${hh}:${mm}:${ss}` : `${mm}:${ss}` };
}
