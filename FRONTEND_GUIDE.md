# Frontend Guide — Brand Architect AI Pro

> **Stack:** React 19 · Vite 7 · TypeScript · Tailwind CSS 4 · TanStack Query · Wouter
> **Entry point:** `artifacts/brand-os/src/main.tsx`
> **Port:** 5000
>
> **Related:** [DOCUMENTATION.md](./DOCUMENTATION.md) · [BACKEND_GUIDE.md](./BACKEND_GUIDE.md)

---

## Folder Map

```
artifacts/brand-os/src/
├── main.tsx                   ← DOM mount point — renders <App />
├── App.tsx                    ← Root: QueryClient, providers, router, auth guard, lazy routes
├── index.css                  ← Tailwind base + CSS variables (dark mode only)
│
├── types/
│   └── index.ts               ← Shared TypeScript types (AuthUser, BrandKit, JobProgress, …)
│
├── lib/
│   ├── constants.ts           ← App-wide constants (platform list, limits, intervals)
│   ├── apiFetch.ts            ← Authenticated fetch wrapper (adds Authorization: Bearer header)
│   ├── apiError.ts            ← extractApiError(), notifyError(), notifySuccess()
│   ├── colorExtractor.ts      ← Canvas-based color extraction from logo images
│   └── utils.ts               ← cn() — Tailwind class merger (clsx + tailwind-merge)
│
├── hooks/
│   ├── use-toast.ts           ← Toast notification hook (shadcn/ui pattern)
│   ├── useDebounce.ts         ← Debounce a value for search inputs
│   ├── useLocalStorage.ts     ← localStorage-backed useState
│   └── useJobPoller.ts        ← Poll GET /api/jobs/:id until job done/failed
│
├── contexts/
│   ├── AuthContext.tsx         ← User session (signIn, signUp, signOut, refresh, user state)
│   └── SiteSettingsContext.tsx ← Public settings (maintenance mode, feature flags)
│
├── components/
│   ├── Layout.tsx              ← App shell: sidebar, nav, user menu, admin section
│   ├── PostCard.tsx            ← Post card in CampaignWorkspace
│   ├── ImageGenDialog.tsx      ← Image generation dialog (generates + shows result)
│   ├── ImageLightbox.tsx       ← Full-screen image viewer
│   ├── ScheduleCampaignDialog.tsx ← Campaign schedule dialog
│   └── ui/                    ← Atomic UI (shadcn/ui): Button, Input, Card, Dialog, Badge…
│
└── pages/                     ← One file per route (lazy-loaded in App.tsx)
    ├── LandingPage.tsx        → /           (when logged out)
    ├── SignIn.tsx             → /sign-in
    ├── SignUp.tsx             → /sign-up
    ├── AppHome.tsx            → /           (when logged in — redirects to dashboard)
    ├── Dashboard.tsx          → /dashboard
    ├── BrandWizard.tsx        → /brands/new
    ├── BrandEdit.tsx          → /brands/:id/edit
    ├── BrandKit.tsx           → /brands/:id
    ├── CampaignList.tsx       → /brands/:id/campaigns
    ├── CampaignBriefPage.tsx  → /brands/:id/campaigns/new
    ├── CampaignWorkspace.tsx  → /campaigns/:id
    ├── AdminApiKeys.tsx       → /admin/api-keys  (admin users only)
    └── not-found.tsx          → * (404)
```

---

## Shared Libraries (Monorepo)

```
lib/
├── api-spec/openapi.yaml        ← OpenAPI 3.0 spec (source of truth for codegen)
├── api-client-react/src/        ← Auto-generated TanStack Query hooks (Orval)
│   └── generated/api.ts         ← useListBrands, useGetBrand, useCreateBrand, …
└── api-zod/src/                 ← Auto-generated Zod validation schemas
    └── generated/
```

> **After changing `openapi.yaml`, regenerate:**
> ```bash
> pnpm --filter @workspace/api-spec run codegen
> ```
> Never edit `api-client-react/src/generated/` or `api-zod/src/generated/` manually.

---

## Path Aliases

| Alias | Resolves to |
|---|---|
| `@/` | `artifacts/brand-os/src/` |
| `@assets/` | `attached_assets/` |
| `@workspace/api-client-react` | `lib/api-client-react/src/` |
| `@workspace/api-zod` | `lib/api-zod/src/` |

---

## Routing Rules

| Path pattern | Auth | Component |
|---|---|---|
| `/` | No | `LandingPage` (logged out) / `AppHome` (logged in) |
| `/sign-in`, `/sign-up` | No | `SignIn`, `SignUp` |
| `/dashboard` | ✅ Yes | `Dashboard` |
| `/brands/*` | ✅ Yes | `BrandWizard`, `BrandEdit`, `BrandKit`, `CampaignList`, `CampaignBriefPage` |
| `/campaigns/*` | ✅ Yes | `CampaignWorkspace` |
| `/admin/*` | ✅ Admin | `AdminApiKeys` (checks `user.role === "admin"` in component) |

Protected routes redirect to `/sign-in` automatically via `ProtectedRoutes` in `App.tsx`.

---

## Key Patterns

### 1. Adding a new page / route

```tsx
// Step 1: Create artifacts/brand-os/src/pages/MyFeature.tsx
export default function MyFeature() {
  return <div className="max-w-3xl mx-auto px-6 py-8">...</div>;
}

// Step 2: Register in App.tsx (lazy import + route)
const MyFeature = lazy(() => import("@/pages/MyFeature"));

// Inside ProtectedAppShell (authenticated routes):
<Route path="/my-feature" component={MyFeature} />

// Step 3: Link to it from Layout.tsx (NavItem) or anywhere else
import { Link } from "wouter";
<Link href="/my-feature">Go to feature</Link>
```

---

### 2. Calling an API endpoint

**Option A — Auto-generated hook (preferred for GET requests in spec):**
```tsx
import { useListBrands, getListBrandsQueryKey } from "@workspace/api-client-react";

function MyComponent() {
  const { data, isLoading, error } = useListBrands({
    query: { staleTime: 1000 * 60 * 2, queryKey: getListBrandsQueryKey() },
  });
  if (isLoading) return <Loader2 className="animate-spin" />;
  return <div>{(Array.isArray(data) ? data : []).map(b => ...)}</div>;
}
```

**Option B — Mutation hook (POST/PATCH/DELETE in spec):**
```tsx
import { useCreateBrand } from "@workspace/api-client-react";
import { notifyError, notifySuccess } from "@/lib/apiError";

function MyForm() {
  const createBrand = useCreateBrand({
    mutation: {
      onSuccess: () => notifySuccess("Brand created!"),
      onError: (err) => notifyError("Failed to create brand", err),
    },
  });
  return (
    <button onClick={() => createBrand.mutate({ companyName: "Acme" })}>
      Create
    </button>
  );
}
```

**Option C — `apiFetch` (for admin endpoints or endpoints not in the spec):**
```tsx
import { apiFetch } from "@/lib/apiFetch";
import { notifyError, notifySuccess, extractApiError } from "@/lib/apiError";

async function doSomething() {
  const res = await apiFetch("/api/admin/api-keys/openai", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apiKey: "sk-..." }),
  });
  if (!res.ok) {
    const msg = await extractApiError(res, "Operation failed");
    notifyError("Failed", msg);
    return;
  }
  const data = await res.json();
  notifySuccess("Done", data.message);
}
```

> **Always use `apiFetch` (not raw `fetch`)** for authenticated requests. It automatically adds the `Authorization: Bearer <token>` header from the current session.

---

### 3. Polling a background AI job

```tsx
import { useJobPoller } from "@/hooks/useJobPoller";
import { apiFetch } from "@/lib/apiFetch";
import { notifyError } from "@/lib/apiError";
import { useState } from "react";

function CampaignGenerator({ brandId }: { brandId: number }) {
  const [jobId, setJobId] = useState<string | null>(null);

  const job = useJobPoller(jobId, {
    onDone: (result) => {
      console.log("Campaign ready:", result);
      setJobId(null);
    },
    onError: (err) => {
      notifyError("Generation failed", err);
      setJobId(null);
    },
  });

  async function start() {
    const res = await apiFetch(`/api/brands/${brandId}/campaign-brief-job`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brief: "..." }),
    });
    const data = await res.json();
    setJobId(data.jobId);
  }

  return (
    <div>
      <button onClick={start} disabled={!!jobId}>Generate</button>
      {job.status === "running" && (
        <p>Step {job.progress}/{job.total}: {job.step}</p>
      )}
    </div>
  );
}
```

---

### 4. Adding a reusable UI component

```tsx
// artifacts/brand-os/src/components/MyWidget.tsx
import { cn } from "@/lib/utils";

interface MyWidgetProps {
  className?: string;
  title: string;
  children?: React.ReactNode;
}

export function MyWidget({ className, title, children }: MyWidgetProps) {
  return (
    <div className={cn("rounded-xl border bg-card p-4", className)}>
      <h3 className="text-sm font-semibold text-foreground mb-2">{title}</h3>
      {children}
    </div>
  );
}
```

---

### 5. Adding a new custom hook

```ts
// artifacts/brand-os/src/hooks/useMyHook.ts

/**
 * useMyHook — brief description.
 * @param param  What it does.
 * @returns      What it returns.
 * @example
 *   const value = useMyHook("input");
 */
import { useState, useEffect } from "react";

export function useMyHook(param: string): string {
  const [state, setState] = useState("");
  useEffect(() => {
    // ... logic
  }, [param]);
  return state;
}
```

---

### 6. Adding a new TypeScript type

```ts
// artifacts/brand-os/src/types/index.ts

/** Description of what this type represents. */
export interface MyNewType {
  id: string;
  label: string;
  isActive: boolean;
}
```

Import anywhere: `import type { MyNewType } from "@/types";`

---

### 7. Admin-only pages

```tsx
// Any admin-only page should check role in the component:
import { useAuth } from "@/contexts/AuthContext";

export default function MyAdminPage() {
  const { user } = useAuth();

  if (user?.role !== "admin") {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-muted-foreground">Access denied.</p>
      </div>
    );
  }

  return <div>Admin content...</div>;
}
```

Add the route in `App.tsx`:
```tsx
const MyAdminPage = lazy(() => import("@/pages/MyAdminPage"));
// Inside ProtectedAppShell:
<Route path="/admin/my-page" component={MyAdminPage} />
```

Add nav link in `Layout.tsx` inside the `{isAdmin && ...}` section:
```tsx
<NavItem href="/admin/my-page" icon={Shield} label="My Page" onClick={closeMobile} />
```

---

## Important Constraints

| Rule | Why |
|---|---|
| `dir="ltr"` always in `index.html` | UI is LTR-only, no RTL |
| `class="dark"` always in `index.html` | Dark mode only — no light mode toggle |
| Never hardcode `http://localhost:8080` in components | Use relative `/api/*` paths — Vite proxies them |
| Always use `apiFetch` for authenticated calls | Adds Bearer token; raw `fetch()` will get 401 |
| Never expose secrets via `VITE_*` env vars | They ship to the browser |
| Don't edit `lib/api-client-react/src/generated/` | Auto-generated — changes will be overwritten |

---

## State Management

| Concern | Tool |
|---|---|
| Server data (brands, campaigns, posts) | TanStack Query (`useListBrands`, etc.) |
| Auth session | `AuthContext` (wraps localStorage + JWT) |
| Site settings | `SiteSettingsContext` (wraps `/api/public-settings`) |
| UI state (dialogs, forms) | Local `useState` in each page/component |
| Toast notifications | `notifySuccess()` / `notifyError()` from `@/lib/apiError` |
| Local persistence | `useLocalStorage` hook |
