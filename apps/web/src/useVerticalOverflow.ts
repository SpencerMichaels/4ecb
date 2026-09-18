import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useState,
  type RefObject,
} from "react";

type VerticalOverflowElement = Pick<
  HTMLElement,
  "clientHeight" | "scrollHeight"
>;

export function hasVerticalOverflow(element: VerticalOverflowElement): boolean {
  return element.scrollHeight > element.clientHeight;
}

export function observeVerticalOverflow(
  container: HTMLElement,
  content: Element | null,
  onChange: (overflowing: boolean) => void,
  ResizeObserverType:
    typeof ResizeObserver | undefined = globalThis.ResizeObserver,
): () => void {
  const measure = () => onChange(hasVerticalOverflow(container));
  measure();

  if (ResizeObserverType === undefined) return () => undefined;

  const observer = new ResizeObserverType(measure);
  observer.observe(container);
  if (content !== null && content !== container) observer.observe(content);

  return () => observer.disconnect();
}

export function useVerticalOverflow(
  containerRef: RefObject<HTMLElement | null>,
  contentRef: RefObject<Element | null>,
): boolean {
  const [overflowing, setOverflowing] = useState(false);
  const measure = useCallback(() => {
    const container = containerRef.current;
    if (container !== null) setOverflowing(hasVerticalOverflow(container));
  }, [containerRef]);

  // React-driven changes such as filtering and disclosure happen before this
  // measurement. ResizeObserver covers later layout and viewport changes.
  useLayoutEffect(() => {
    measure();
  });

  useEffect(() => {
    const container = containerRef.current;
    if (container === null) return undefined;
    return observeVerticalOverflow(
      container,
      contentRef.current,
      setOverflowing,
    );
  }, [containerRef, contentRef]);

  return overflowing;
}
