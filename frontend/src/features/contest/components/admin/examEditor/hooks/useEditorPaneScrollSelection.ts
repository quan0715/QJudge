import { useCallback, useEffect, useRef, type Dispatch, type SetStateAction } from "react";

/**
 * Scrollable admin content pane: keep sidebar selection in sync with the card nearest the pane's
 * vertical center. Skips updates during programmatic scroll-into-view and Reorder drag sessions.
 */
export function useEditorPaneScrollSelection(
  selectedId: string | null,
  setSelectedId: Dispatch<SetStateAction<string | null>>,
  itemsKey: string,
) {
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const editorPaneRef = useRef<HTMLDivElement>(null);
  const programmaticScrollRef = useRef(false);
  const reorderPointerDepthRef = useRef(0);

  const onReorderPointerSessionChange = useCallback((delta: 1 | -1) => {
    reorderPointerDepthRef.current = Math.max(0, reorderPointerDepthRef.current + delta);
  }, []);

  const onCardRoot = useCallback((id: string, el: HTMLDivElement | null) => {
    if (el) cardRefs.current.set(id, el);
    else cardRefs.current.delete(id);
  }, []);

  useEffect(() => {
    const pane = editorPaneRef.current;
    if (!pane || !itemsKey) return;

    let ticking = false;
    const handleScroll = () => {
      if (programmaticScrollRef.current) return;
      if (reorderPointerDepthRef.current > 0) return;
      if (ticking) return;
      ticking = true;

      requestAnimationFrame(() => {
        ticking = false;
        const paneRect = pane.getBoundingClientRect();
        const paneCenterY = paneRect.top + paneRect.height / 2;

        let closestId: string | null = null;
        let closestDist = Infinity;

        for (const [id, el] of cardRefs.current) {
          const rect = el.getBoundingClientRect();
          const cardCenterY = rect.top + rect.height / 2;
          const dist = Math.abs(cardCenterY - paneCenterY);
          if (dist < closestDist) {
            closestDist = dist;
            closestId = id;
          }
        }

        if (closestId && closestId !== selectedId) {
          setSelectedId(closestId);
        }
      });
    };

    pane.addEventListener("scroll", handleScroll, { passive: true });
    return () => pane.removeEventListener("scroll", handleScroll);
  }, [itemsKey, selectedId, setSelectedId]);

  const handleSelect = useCallback(
    (id: string) => {
      setSelectedId(id);
      const el = cardRefs.current.get(id);
      if (el) {
        programmaticScrollRef.current = true;
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        setTimeout(() => {
          programmaticScrollRef.current = false;
        }, 600);
      }
    },
    [setSelectedId],
  );

  return {
    editorPaneRef,
    cardRefs,
    programmaticScrollRef,
    reorderPointerDepthRef,
    onReorderPointerSessionChange,
    handleSelect,
    onCardRoot,
  };
}
