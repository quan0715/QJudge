import { useState, useEffect, useRef, type RefObject } from "react";

export function useScrollDirection(ref: RefObject<HTMLElement | null>) {
  const [visible, setVisible] = useState(true);
  const lastY = useRef(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onScroll = () => {
      const y = el.scrollTop;
      if (y < 10) setVisible(true);
      else if (y < lastY.current) setVisible(true);
      else if (y > lastY.current + 5) setVisible(false);
      lastY.current = y;
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [ref]);
  return visible;
}
