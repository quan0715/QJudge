import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type {
  PageContextSegment,
  PageContextSegmentType,
} from "@/core/types/chatbot.types";

const SEGMENT_ORDER: readonly PageContextSegmentType[] = [
  "classroom",
  "contest",
  "problem",
];
const NO_SEGMENTS: readonly PageContextSegment[] = [];

type PublishSegment = (segment: PageContextSegment) => () => void;
type SegmentRegistry = Partial<Record<PageContextSegmentType, PageContextSegment>>;

const PublishContext = createContext<PublishSegment | null>(null);
const SegmentsContext = createContext<readonly PageContextSegment[]>(NO_SEGMENTS);

/** Collects where the user currently is so assistive features can describe it. */
export function PageContextProvider({ children }: { children: ReactNode }) {
  const [registry, setRegistry] = useState<SegmentRegistry>({});

  const publish = useCallback<PublishSegment>((segment) => {
    setRegistry((current) => ({ ...current, [segment.type]: segment }));
    return () =>
      setRegistry((current) => {
        if (current[segment.type] !== segment) return current;
        const next = { ...current };
        delete next[segment.type];
        return next;
      });
  }, []);

  const segments = useMemo(() => {
    const ordered = SEGMENT_ORDER.flatMap((type) => registry[type] ?? []);
    return ordered.length > 0 ? ordered : NO_SEGMENTS;
  }, [registry]);

  return (
    <PublishContext.Provider value={publish}>
      <SegmentsContext.Provider value={segments}>{children}</SegmentsContext.Provider>
    </PublishContext.Provider>
  );
}

/** Registers one level of the current location; pass null when it does not apply. */
export function usePublishPageContext(segment: PageContextSegment | null): void {
  const publish = useContext(PublishContext);
  const key = segment ? JSON.stringify(segment) : null;
  useEffect(() => {
    if (!publish || key === null) return;
    return publish(JSON.parse(key) as PageContextSegment);
  }, [publish, key]);
}

export function usePageContextSegments(): readonly PageContextSegment[] {
  return useContext(SegmentsContext);
}
