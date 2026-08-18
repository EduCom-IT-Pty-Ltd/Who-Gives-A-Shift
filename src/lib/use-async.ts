"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface AsyncState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  reload: () => void;
  setData: (next: T) => void;
}

/**
 * Loads a value whenever `deps` change. Out-of-order responses are discarded by
 * sequence number, so quickly paging between pay periods cannot render stale
 * data over fresh data.
 */
export function useAsync<T>(loader: () => Promise<T>, deps: unknown[]): AsyncState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);
  const sequence = useRef(0);

  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  useEffect(() => {
    const current = ++sequence.current;
    setLoading(true);
    setError(null);

    loaderRef
      .current()
      .then((result) => {
        if (sequence.current === current) {
          setData(result);
          setLoading(false);
        }
      })
      .catch((e: unknown) => {
        if (sequence.current === current) {
          setError(e instanceof Error ? e.message : "Something went wrong");
          setLoading(false);
        }
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  return { data, error, loading, reload, setData };
}
