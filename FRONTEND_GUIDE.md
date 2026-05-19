# Frontend Guide — Brand Architect AI Pro

> **Stack:** React 19 · Vite 7 · TypeScript · Tailwind CSS 4 · TanStack Query · Wouter
> **Entry point:** `artifacts/brand-os/src/main.tsx`
> **Port:** 5000

---

## Folder Map

```
artifacts/brand-os/src/
├── main.tsx               ← DOM mount point (renders <App />)
├── App.tsx                ← Root: providers, router, auth guard, lazy route setup
├── index.css              ← Tailwind base + global CSS variables
│
├── types/
│   └── index.ts           ← Shared TypeScript types (AuthUser, BrandKit, JobProgress, …)
│
├── lib/
│   ├── constants.ts       ← App-wide constants (limits, keys, platform list, intervals)
│   ├── apiError.ts        ← extractApiError(), notifyError(), notifySuccess()
│   ├── colorExtractor.ts  ← Canvas-based color extraction from logo images
│   └── utils.ts           ← cn() — Tailwind class merger (clsx + tailwind-merge)
│
├── hooks/
│   ├── use-toast.ts       ← Toast notification hook (shadcn/ui pattern)
│   ├── useDebounce.ts     ← Debounce value for search inputs
│   ├── useLocalStorage.ts ← localStorage-backed useState
│   └── useJobPoller.ts    ← Poll GET /api/jobs/:id until job done/failed
│
├── contexts/
│   ├── AuthContext.tsx    ← User session (signIn, signUp, signOut, refresh, user state)
│   └── SiteSettingsContext.tsx ← Public settings (maintenance mode, feature flags)
│
├── components/
│   ├── Layout.tsx         ← App shell: sidebar, nav, user menu
│   ├── ImageLightbox.tsx  ← Full-screen image viewer
│   ├── ScheduleCampaignDialog.tsx ← Campaign schedule dialog
│   └── ui/                ← Atomic UI (shadcn/ui): Button, Input, Card, Dialog, …
│
└── pages/                 ← One file per route (lazy-loaded in App.tsx)
    ├── LandingPage.tsx    → /         (when logged out)
    ├── SignIn.tsx         → /sign-in
    ├── SignUp.tsx         → /sign-up
    ├── Dashboard.tsx      → /         (when logged in)
    ├── BrandWizard.tsx    → /brands/new
    ├── BrandEdit.tsx      → /brands/:id/edit
    ├── BrandKit.tsx       → /brands/:id
    ├── CampaignList.tsx   → /brands/:id/campaigns
    ├── CampaignBriefPage.tsx → /brands/:id/campaigns/new
    ├── CampaignWorkspace.tsx → /campaigns/:id
    └── not-found.tsx      → * (404)
```

---

## Shared Libraries (Monorepo)

```
lib/
├── api-spec/              ← OpenAPI 3.0 spec (source of truth for all API types)
│   └── openapi.yaml
├── api-client-react/      ← Auto-generated TanStack Query hooks (DO NOT edit manually)
│   └── src/generated/
│       ├── api.ts         ← All hook functions (useListBrands, useGetCampaign, …)
│       └── api.schemas.ts ← Auto-generated TypeScript interfaces
└── api-zod/               ← Auto-generated Zod schemas for validation
    └── src/generated/
```

> **Regenerate after changing openapi.yaml:**
> ```bash
> pnpm --filter @workspace/api-spec run codegen
> ```

---

## Key Patterns

### 1. Adding a new page / route

```tsx
// Step 1: Create artifacts/brand-os/src/pages/MyFeature.tsx
export default function MyFeature() {
  return <div>...</div>;
}

// Step 2: Register in App.tsx (lazy import + route)
const MyFeature = lazy(() => import("@/pages/MyFeature"));

// Inside ProtectedAppShell (for authenticated routes):
<Route path="/my-feature" component={MyFeature} />

// Step 3: Link to it from anywhere
import { Link } from "wouter";
<Link href="/my-feature">Go to feature</Link>
```

---

### 2. Calling an API endpoint

**Option A — Auto-generated hook (preferred for GET requests):**
```tsx
import { useListBrands } from "@workspace/api-client-react";

function MyComponent() {
  const { data, isLoading, error } = useListBrands();
  if (isLoading) return <Spinner />;
  return <div>{data?.map(b => <div key={b.id}>{b.companyName}</div>)}</div>;
}
```

**Option B — Mutation hook (for POST/PATCH/DELETE):**
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

  return <button onClick={() => createBrand.mutate({ companyName: "Acme", ... })}>
    Create
  </button>;
}
```

**Option C — Raw fetch (for endpoints not in the OpenAPI spec):**
```tsx
import { getAuthToken } from "@/contexts/AuthContext";
import { extractApiError, notifyError } from "@/lib/apiError";

const res = await fetch("/api/my-endpoint", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${getAuthToken()}`,
  },
  body: JSON.stringify({ ... }),
});
if (!res.ok) {
  const msg = await extractApiError(res);
  notifyError("Something failed", msg);
}
```

---

### 3. Polling a background AI job

```tsx
import { useJobPoller } from "@/hooks/useJobPoller";
import { useState } from "react";

function CampaignGenerator() {
  const [jobId, setJobId] = useState<string | null>(null);
  const job = useJobPoller(jobId, {
    onDone: (result) => console.log("Done!", result),
    onError: (err) => notifyError("Generation failed", err),
  });

  return (
    <div>
      <button onClick={async () => {
        const res = await fetch("/api/brands/1/generate-campaign", { method: "POST", ... });
        const data = await res.json();
        setJobId(data.jobId);
      }}>
        Generate
      </button>

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
}

export function MyWidget({ className, title }: MyWidgetProps) {
  return (
    <div className={cn("rounded-lg border bg-card p-4", className)}>
      <h3 className="font-semibold">{title}</h3>
    </div>
  );
}
```

---

### 5. Adding a new custom hook

```ts
// artifacts/brand-os/src/hooks/useMyHook.ts

/**
 * useMyHook — brief description of what this hook does.
 *
 * @param param  Description of the parameter.
 * @returns      Description of the return value.
 *
 * @example
 *   const value = useMyHook("input");
 */
import { useState, useEffect } from "react";

export function useMyHook(param: string): string {
  const [state, setState] = useState("");
  // ... logic
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

## Routing Rules

| Path pattern | Auth required | Layout |
|---|---|---|
| `/` | No (redirects if logged in) | None / Layout |
| `/sign-in`, `/sign-up` | No | None |
| `/brands/*`, `/campaigns/*` | ✅ Yes | Layout (sidebar) |

Protected routes redirect to `/sign-in` automatically via `ProtectedRoutes` in `App.tsx`.

---

## Path Aliases

| Alias | Resolves to |
|---|---|
| `@/` | `artifacts/brand-os/src/` |
| `@assets/` | `attached_assets/` |
| `@workspace/api-client-react` | `lib/api-client-react/` |

---

## Important Constraints

| Rule | Why |
|---|---|
| `dir="ltr"` always in `index.html` | UI is LTR-only |
| `class="dark"` always in `index.html` | Dark mode only — no light mode |
| Never call `/api/*` directly from a component | Use hooks or lib functions for error handling |
| Never expose secrets via `VITE_*` env vars | They ship to the browser |
