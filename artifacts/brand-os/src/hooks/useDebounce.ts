/**
 * useDebounce — delays updating a value until after a specified wait period.
 *
 * Use this to avoid firing expensive operations (API searches, filter queries)
 * on every keystroke.
 *
 * @param value  The value to debounce.
 * @param delay  Delay in milliseconds (default: 300ms).
 * @returns      The debounced value, updated only after `delay` ms of no changes.
 *
 * @example
 *   const [query, setQuery] = useState("");
 *   const debouncedQuery = useDebounce(query, 400);
 *
 *   useEffect(() => {
 *     if (debouncedQuery) fetchResults(debouncedQuery);
 *   }, [debouncedQuery]);
 */
import { useEffect, useState } from "react";

export function useDebounce<T>(value: T, delay = 300): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
}
