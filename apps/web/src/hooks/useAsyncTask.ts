import { useCallback, useState } from "react";

export type AsyncTaskState = { running: boolean; error: string | null };

export function useAsyncTask() {
  const [state, setState] = useState<AsyncTaskState>({ running: false, error: null });
  const run = useCallback(async <T,>(operation: () => Promise<T>) => {
    setState({ running: true, error: null });
    try {
      const result = await operation();
      setState({ running: false, error: null });
      return result;
    } catch (error) {
      setState({ running: false, error: error instanceof Error ? error.message : "Request failed" });
      return undefined;
    }
  }, []);
  const clearError = useCallback(() => setState((current) => ({ ...current, error: null })), []);
  return { ...state, run, clearError };
}
