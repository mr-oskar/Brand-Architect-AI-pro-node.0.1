/**
 * useLocalStorage — synced state backed by localStorage.
 *
 * Works exactly like useState but persists the value across page reloads.
 * Handles SSR-safe reads, JSON serialisation, and storage errors gracefully.
 *
 * @param key           localStorage key.
 * @param initialValue  Default value if key doesn't exist yet.
 * @returns             [storedValue, setValue] — same API as useState.
 *
 * @example
 *   const [theme, setTheme] = useLocalStorage("theme", "dark");
 *   const [draft, setDraft] = useLocalStorage<Partial<Brand>>("brand-draft", {});
 */
import { useCallback, useState } from "react";

export function useLocalStorage<T>(
  key: string,
  initialValue: T,
): [T, (value: T | ((prev: T) => T)) => void] {
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      const item = window.localStorage.getItem(key);
      return item !== null ? (JSON.parse(item) as T) : initialValue;
    } catch {
      return initialValue;
    }
  });

  const setValue = useCallback(
    (value: T | ((prev: T) => T)) => {
      setStoredValue((prev) => {
        const next = typeof value === "function" ? (value as (p: T) => T)(prev) : value;
        try {
          window.localStorage.setItem(key, JSON.stringify(next));
        } catch {
          // localStorage full or unavailable — state still updates in memory
        }
        return next;
      });
    },
    [key],
  );

  return [storedValue, setValue];
}
