import { useCallback, useLayoutEffect, useRef } from 'react';

/**
 * A function that keeps its identity across renders and always runs the
 * latest `fn`. The canvas's item nodes are memoized and take these, so a
 * re-render of the stage doesn't re-render every item, which also rebound
 * each one's Konva event handlers. For event handlers only: called during
 * render, it would still run the previous `fn`.
 */
export function useStableCallback<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R {
  const latest = useRef(fn);
  useLayoutEffect(() => {
    latest.current = fn;
  });
  return useCallback((...args: A) => latest.current(...args), []);
}
