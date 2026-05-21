/**
 * Authenticated fetch wrapper for Brand Architect AI Pro.
 *
 * ALWAYS use apiFetch / apiPost instead of raw fetch() for API calls so that:
 *   - JWT auth token is included automatically
 *   - Credentials (cookies) are always sent
 *   - BASE_URL is handled correctly in all Replit environments
 *
 * Usage:
 *   import { apiFetch, apiPost } from "@/lib/apiFetch";
 *
 *   const res = await apiFetch("/api/jobs/123");
 *   const res = await apiPost("/api/posts/1/generate-image", { customPrompt: "..." });
 *
 * To add a global header or interceptor, modify buildHeaders() below —
 * every call picks it up automatically without touching individual call sites.
 */

import { getAuthToken } from "@/contexts/AuthContext";

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

function buildHeaders(extra?: HeadersInit): Record<string, string> {
  const token = getAuthToken();
  const auth: Record<string, string> = token
    ? { Authorization: `Bearer ${token}` }
    : {};
  const extraRecord: Record<string, string> =
    extra instanceof Headers
      ? Object.fromEntries(extra.entries())
      : (extra as Record<string, string> | undefined) ?? {};
  return { ...auth, ...extraRecord };
}

/**
 * Drop-in replacement for fetch() that prepends BASE, injects auth, and
 * sends credentials on every request.
 *
 * @param path    - Relative path starting with /api/... (or full URL)
 * @param options - Standard RequestInit options (merged, not replaced)
 */
export async function apiFetch(
  path: string,
  options: RequestInit = {},
): Promise<Response> {
  const url = path.startsWith("http") ? path : `${BASE}${path}`;
  return fetch(url, {
    ...options,
    credentials: "include",
    headers: buildHeaders(options.headers),
  });
}

/**
 * Convenience helper for JSON POST requests.
 * Automatically sets Content-Type: application/json and serializes the body.
 */
export async function apiPost<T = unknown>(
  path: string,
  body: T,
  options: Omit<RequestInit, "method" | "body"> = {},
): Promise<Response> {
  return apiFetch(path, {
    ...options,
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers as Record<string, string> | undefined ?? {}),
    },
    body: JSON.stringify(body),
  });
}
