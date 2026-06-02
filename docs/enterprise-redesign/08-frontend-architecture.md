# المرحلة الثامنة: معمارية الـ Frontend (Next.js 15)

## 1. هيكل المشروع

```
frontend/
├── app/                              # Next.js App Router
│   ├── (auth)/                       # Auth layout group
│   │   ├── sign-in/
│   │   │   └── page.tsx
│   │   ├── sign-up/
│   │   │   └── page.tsx
│   │   ├── forgot-password/
│   │   │   └── page.tsx
│   │   └── layout.tsx                # Auth layout (centered card)
│   │
│   ├── (app)/                        # Main app layout group
│   │   ├── layout.tsx                # Sidebar + nav layout
│   │   ├── dashboard/
│   │   │   └── page.tsx
│   │   ├── brands/
│   │   │   ├── page.tsx              # Brand list
│   │   │   ├── new/
│   │   │   │   └── page.tsx          # Brand wizard
│   │   │   └── [id]/
│   │   │       ├── page.tsx          # Brand Kit view
│   │   │       ├── edit/
│   │   │       │   └── page.tsx
│   │   │       └── campaigns/
│   │   │           ├── page.tsx      # Campaign list
│   │   │           └── new/
│   │   │               └── page.tsx  # New campaign brief
│   │   ├── campaigns/
│   │   │   └── [id]/
│   │   │       └── page.tsx          # Campaign workspace
│   │   ├── settings/
│   │   │   ├── page.tsx              # General settings
│   │   │   ├── billing/
│   │   │   │   └── page.tsx
│   │   │   ├── team/
│   │   │   │   └── page.tsx
│   │   │   └── api-keys/
│   │   │       └── page.tsx
│   │   └── admin/                    # Admin section
│   │       ├── layout.tsx            # Admin-only guard
│   │       ├── page.tsx              # Admin dashboard
│   │       ├── users/
│   │       │   └── page.tsx
│   │       ├── organizations/
│   │       │   └── page.tsx
│   │       ├── ai-providers/
│   │       │   └── page.tsx
│   │       ├── plans/
│   │       │   └── page.tsx
│   │       ├── usage/
│   │       │   └── page.tsx
│   │       └── settings/
│   │           └── page.tsx
│   │
│   ├── api/                          # API Routes (BFF)
│   │   ├── auth/[...nextauth]/
│   │   │   └── route.ts
│   │   └── upload/
│   │       └── route.ts
│   │
│   ├── layout.tsx                    # Root layout
│   ├── page.tsx                      # Landing page (public)
│   ├── not-found.tsx
│   ├── error.tsx
│   └── loading.tsx
│
├── components/
│   ├── ui/                           # Atomic UI (shadcn/ui)
│   │   ├── button.tsx
│   │   ├── input.tsx
│   │   ├── card.tsx
│   │   ├── dialog.tsx
│   │   ├── drawer.tsx
│   │   ├── select.tsx
│   │   ├── toast.tsx
│   │   ├── badge.tsx
│   │   ├── progress.tsx
│   │   ├── avatar.tsx
│   │   ├── skeleton.tsx
│   │   └── ...
│   │
│   ├── layout/
│   │   ├── AppSidebar.tsx
│   │   ├── Header.tsx
│   │   ├── BreadcrumbNav.tsx
│   │   ├── UserMenu.tsx
│   │   └── NotificationsDropdown.tsx
│   │
│   ├── brand/
│   │   ├── BrandCard.tsx
│   │   ├── BrandWizard.tsx
│   │   ├── BrandKitDisplay.tsx
│   │   ├── ColorPalette.tsx
│   │   ├── LogoUploader.tsx
│   │   └── BrandStats.tsx
│   │
│   ├── campaign/
│   │   ├── CampaignCard.tsx
│   │   ├── CampaignBriefForm.tsx
│   │   ├── CampaignWorkspace.tsx
│   │   ├── PostCard.tsx
│   │   ├── PostEditor.tsx
│   │   └── CampaignProgress.tsx
│   │
│   ├── image/
│   │   ├── ImageGenDialog.tsx
│   │   ├── ImageHistory.tsx
│   │   ├── ModelSelector.tsx
│   │   └── SizeSelector.tsx
│   │
│   ├── billing/
│   │   ├── PlanCard.tsx
│   │   ├── CreditDisplay.tsx
│   │   ├── BillingHistory.tsx
│   │   └── UpgradePrompt.tsx
│   │
│   ├── admin/
│   │   ├── UserTable.tsx
│   │   ├── AIProviderCard.tsx
│   │   ├── UsageChart.tsx
│   │   └── SystemStats.tsx
│   │
│   └── shared/
│       ├── JobProgressBar.tsx
│       ├── EmptyState.tsx
│       ├── ErrorBoundary.tsx
│       ├── ConfirmDialog.tsx
│       ├── DataTable.tsx
│       └── PageHeader.tsx
│
├── hooks/
│   ├── useAuth.ts                    # Auth state & actions
│   ├── useOrganization.ts            # Current org context
│   ├── useJobPoller.ts               # Poll job until done
│   ├── useCredits.ts                 # Credit balance
│   ├── useToast.ts                   # Toast notifications
│   ├── useDebounce.ts
│   ├── useLocalStorage.ts
│   └── useMediaQuery.ts
│
├── stores/                           # Zustand global state
│   ├── auth-store.ts
│   ├── org-store.ts
│   └── ui-store.ts
│
├── lib/
│   ├── api/
│   │   ├── client.ts                 # Axios/fetch wrapper
│   │   ├── auth.ts                   # Auth API calls
│   │   ├── brands.ts                 # Brand API calls
│   │   ├── campaigns.ts
│   │   ├── posts.ts
│   │   └── billing.ts
│   ├── constants.ts                  # App constants
│   ├── utils.ts                      # Utility functions
│   ├── validators.ts                 # Zod schemas
│   └── cn.ts                         # Class merger
│
├── types/
│   ├── api.ts                        # API response types
│   ├── domain.ts                     # Domain models
│   └── ui.ts                         # UI-specific types
│
├── styles/
│   └── globals.css
│
├── public/
│   ├── fonts/
│   └── images/
│
├── middleware.ts                     # Next.js middleware (auth)
├── next.config.ts
├── tailwind.config.ts
├── tsconfig.json
└── package.json
```

---

## 2. State Management Strategy

### 2.1 Server State (TanStack Query v5)

```typescript
// lib/api/brands.ts

export const brandKeys = {
  all: ['brands'] as const,
  lists: () => [...brandKeys.all, 'list'] as const,
  list: (filters: BrandFilters) => [...brandKeys.lists(), filters] as const,
  details: () => [...brandKeys.all, 'detail'] as const,
  detail: (id: number) => [...brandKeys.details(), id] as const,
  stats: (id: number) => [...brandKeys.detail(id), 'stats'] as const,
}

// hooks/useBrands.ts

export function useBrands(filters?: BrandFilters) {
  return useQuery({
    queryKey: brandKeys.list(filters ?? {}),
    queryFn: () => api.brands.list(filters),
    staleTime: 5 * 60 * 1000,        // 5 min
    gcTime: 10 * 60 * 1000,           // 10 min
  })
}

export function useBrand(id: number) {
  return useQuery({
    queryKey: brandKeys.detail(id),
    queryFn: () => api.brands.get(id),
    staleTime: 5 * 60 * 1000,
  })
}

export function useGenerateBrandKit() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: (brandId: number) => api.brands.generateKit(brandId),
    onSuccess: (data, brandId) => {
      queryClient.invalidateQueries({ queryKey: brandKeys.detail(brandId) })
    },
  })
}
```

### 2.2 Global State (Zustand)

```typescript
// stores/auth-store.ts

interface AuthState {
  user: User | null
  token: string | null
  isLoading: boolean
  
  setUser: (user: User | null) => void
  setToken: (token: string | null) => void
  logout: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: typeof window !== 'undefined' 
    ? localStorage.getItem('access_token') 
    : null,
  isLoading: true,
  
  setUser: (user) => set({ user }),
  setToken: (token) => {
    if (token) localStorage.setItem('access_token', token)
    else localStorage.removeItem('access_token')
    set({ token })
  },
  logout: () => {
    localStorage.removeItem('access_token')
    set({ user: null, token: null })
  },
}))

// stores/org-store.ts

interface OrgState {
  currentOrg: Organization | null
  setCurrentOrg: (org: Organization) => void
}

export const useOrgStore = create<OrgState>(persist(
  (set) => ({
    currentOrg: null,
    setCurrentOrg: (org) => set({ currentOrg: org }),
  }),
  { name: 'current-org' }
))
```

---

## 3. API Client

```typescript
// lib/api/client.ts

import axios from 'axios'
import { useAuthStore } from '@/stores/auth-store'

export const apiClient = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || '/api',
  timeout: 30_000,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true,   // for HttpOnly refresh_token cookie
})

// Request interceptor: attach access token
apiClient.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// Response interceptor: auto-refresh on 401
apiClient.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config
    
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true
      try {
        const { data } = await axios.post('/api/auth/refresh', {}, {
          withCredentials: true,
        })
        useAuthStore.getState().setToken(data.access_token)
        original.headers.Authorization = `Bearer ${data.access_token}`
        return apiClient(original)
      } catch {
        useAuthStore.getState().logout()
        window.location.href = '/sign-in'
      }
    }
    
    return Promise.reject(error)
  }
)
```

---

## 4. Auth Middleware (Next.js)

```typescript
// middleware.ts

import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify } from 'jose'

const PUBLIC_PATHS = [
  '/', '/sign-in', '/sign-up', '/forgot-password',
  '/api/auth', '/api/public-settings',
]

const ADMIN_PATHS = ['/admin']

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  
  // Allow public paths
  if (PUBLIC_PATHS.some(p => pathname.startsWith(p))) {
    return NextResponse.next()
  }
  
  // Check access token
  const token = req.headers.get('Authorization')?.split(' ')[1]
    || req.cookies.get('access_token')?.value
  
  if (!token) {
    return NextResponse.redirect(new URL('/sign-in', req.url))
  }
  
  try {
    const payload = await jwtVerify(
      token, 
      new TextEncoder().encode(process.env.JWT_SECRET!)
    )
    
    // Admin guard
    if (ADMIN_PATHS.some(p => pathname.startsWith(p))) {
      if (payload.payload.role !== 'admin') {
        return NextResponse.redirect(new URL('/dashboard', req.url))
      }
    }
    
    return NextResponse.next()
  } catch {
    return NextResponse.redirect(new URL('/sign-in', req.url))
  }
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
```

---

## 5. Component Design System

### Design Tokens

```typescript
// tailwind.config.ts

export default {
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        card: 'hsl(var(--card))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        // ... shadcn/ui design tokens
      },
      fontFamily: {
        sans: ['Inter Variable', 'sans-serif'],
        mono: ['JetBrains Mono Variable', 'monospace'],
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      animation: {
        'fade-in': 'fade-in 0.3s ease-out',
        'slide-up': 'slide-up 0.3s ease-out',
        'pulse-soft': 'pulse-soft 2s ease-in-out infinite',
      },
    },
  },
}
```

### Loading States Pattern

```typescript
// components/brand/BrandCard.tsx

export function BrandCard({ brand }: { brand: Brand }) {
  return (
    <Card className="group hover:shadow-md transition-shadow">
      <CardHeader>
        <div className="flex items-center gap-3">
          {brand.logo_url ? (
            <Image src={brand.logo_url} alt={brand.company_name} 
                   width={40} height={40} className="rounded-lg" />
          ) : (
            <BrandAvatar name={brand.company_name} />
          )}
          <div>
            <CardTitle className="text-sm">{brand.company_name}</CardTitle>
            <CardDescription>{brand.industry}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <BrandKitStatus kit={brand.brand_kit} />
      </CardContent>
    </Card>
  )
}

// Skeleton loading state
export function BrandCardSkeleton() {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <Skeleton className="h-10 w-10 rounded-lg" />
          <div className="space-y-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-24" />
          </div>
        </div>
      </CardHeader>
    </Card>
  )
}
```

---

## 6. Job Polling Hook

```typescript
// hooks/useJobPoller.ts

interface UseJobPollerOptions {
  onComplete?: (result: JobResult) => void
  onError?: (error: string) => void
  onProgress?: (progress: number, step: string) => void
  intervalMs?: number
  maxRetries?: number
}

export function useJobPoller(
  jobId: string | null,
  options: UseJobPollerOptions = {}
) {
  const { intervalMs = 2000, maxRetries = 150 } = options
  const [retries, setRetries] = useState(0)
  
  return useQuery({
    queryKey: ['job', jobId],
    queryFn: () => api.jobs.get(jobId!),
    enabled: !!jobId,
    refetchInterval: (data) => {
      const status = data?.state?.data?.status
      if (status === 'completed' || status === 'failed') return false
      if (retries >= maxRetries) return false
      return intervalMs
    },
    select: (data) => {
      // Side effects based on status
      if (data.status === 'completed') {
        options.onComplete?.(data.result)
      } else if (data.status === 'failed') {
        options.onError?.(data.error || 'Job failed')
      } else if (data.progress) {
        options.onProgress?.(data.progress, data.step || '')
      }
      return data
    },
  })
}
```

---

## 7. Error Handling

```typescript
// lib/error-handler.ts

export function extractApiError(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data
    if (data?.message) return data.message
    if (data?.detail) return String(data.detail)
    
    const statusMessages: Record<number, string> = {
      400: 'Invalid request',
      401: 'Session expired. Please sign in again.',
      402: 'Insufficient credits',
      403: 'You don\'t have permission for this action',
      404: 'Not found',
      429: 'Too many requests. Please wait a moment.',
      500: 'Server error. Please try again.',
      503: 'AI service temporarily unavailable',
    }
    return statusMessages[error.response?.status ?? 500] ?? 'Unknown error'
  }
  return String(error)
}

// Global error boundary
export function GlobalErrorBoundary({ children }: PropsWithChildren) {
  return (
    <ErrorBoundary
      FallbackComponent={ErrorFallback}
      onError={(error) => {
        console.error(error)
        Sentry.captureException(error)
      }}
    >
      {children}
    </ErrorBoundary>
  )
}
```

---

## 8. Performance Optimizations

```typescript
// next.config.ts

const config: NextConfig = {
  // Image optimization
  images: {
    domains: ['your-s3-bucket.s3.amazonaws.com'],
    formats: ['image/avif', 'image/webp'],
  },
  
  // Bundle optimization
  experimental: {
    optimizePackageImports: ['lucide-react', '@radix-ui/react-icons'],
  },
  
  // Compression
  compress: true,
  
  // Cache headers
  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [
          { key: 'Cache-Control', value: 'no-store' },
        ],
      },
      {
        source: '/_next/static/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
    ]
  },
}

// Lazy loading of heavy components
const ImageGenDialog = dynamic(
  () => import('@/components/image/ImageGenDialog'),
  { loading: () => <DialogSkeleton /> }
)

const CampaignWorkspace = dynamic(
  () => import('@/components/campaign/CampaignWorkspace'),
  { loading: () => <WorkspaceSkeleton /> }
)
```
