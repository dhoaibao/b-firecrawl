# Frontend Design Standard — Firecrawl Gateway Admin UI

## Product Character

A dark-themed, data-dense administrative dashboard for operating a hybrid Firecrawl API gateway. The UI emphasizes clarity for high-volume audit logs, quick status scanning, and low-friction configuration. The aesthetic is technical and elevated: deep slate surfaces, subtle borders, muted semantic color accents, and restrained motion.

## Audience And Workflows

- **Operators and admins** monitor live gateway traffic, success rates, fallback behavior, and latency.
- **Admins** manage users (create, suspend, block, activate, delete) and API keys (create, revoke).
- **Admins** configure routing policy, inactivity policies, and Firecrawl Cloud API key priority.
- All authenticated pages share a persistent sidebar; the dashboard auto-refreshes every 5 seconds when "Live" is enabled.

## Visual Principles

- **Dark-first, always.** `color-scheme: dark` is enforced; components should not introduce light-mode surfaces.
- **Subtle elevation through borders.** Surfaces are separated by low-opacity white borders (`border-white/[0.06]` to `border-white/[0.08]`) rather than heavy shadows.
- **Muted semantic accents.** Status uses `success`, `warning`, `info`, and `danger` with dedicated muted background and foreground pairs.
- **Compact density.** Tables, metric cards, and filter bars use small text sizes (`text-[11px]` to `text-sm`) and tight padding to fit large datasets.
- **Restrained motion.** Transitions are short (150–300 ms); animations are subtle fades, slides, and pulses. Respect `prefers-reduced-motion`.

## Layout System

- **App shell:** fixed 240 px left sidebar (`w-60`) on desktop; mobile uses a top bar and drawer overlay.
- **Content max-width:** `max-w-[1680px]` centered with `mx-auto`.
- **Content padding:** `px-4 py-4 lg:px-6`.
- **Page header pattern:** icon + title + optional count + right-aligned actions, separated by `mb-6`.
- **Grid conventions:**
  - Metric grid: `grid gap-3 sm:grid-cols-2 xl:grid-cols-5`.
  - Charts: `grid grid-cols-1 gap-4 lg:grid-cols-2`.
  - Filter bar: `grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-4`.
- **Sticky elements:** Dashboard toolbar is sticky top with `bg-surface-2/90 backdrop-blur`.

## Color System

Source of truth is `gateway/admin-ui/src/index.css` using Tailwind CSS v4 `@theme`.

### Base surfaces

| Role | Variable | Value | Usage |
|------|----------|-------|-------|
| Background | `--color-background` | `hsl(230 14% 6%)` | Page background |
| Foreground | `--color-foreground` | `hsl(210 30% 96%)` | Primary text |
| Surface 1 | `--color-surface-1` | `hsl(230 12% 8%)` | Sidebar |
| Surface 2 | `--color-surface-2` | `hsl(230 11% 10%)` | Cards, input backgrounds |
| Surface 3 | `--color-surface-3` | `hsl(230 10% 13%)` | Card headers, table headers |
| Surface 4 | `--color-surface-4` | `hsl(230 9% 16%)` | Elevated headers, hover states |

### shadcn-compatible tokens

`card`, `popover`, `primary`, `secondary`, `muted`, `accent`, `destructive`, `border`, `input`, `ring` are defined and should be used through Tailwind utilities (e.g., `bg-card`, `text-muted-foreground`, `border-input`).

### Semantic palette

| Role | Default | Muted background | Foreground |
|------|---------|------------------|------------|
| Success | `--color-success` | `--color-success-muted` | `--color-success-fg` |
| Warning | `--color-warning` | `--color-warning-muted` | `--color-warning-fg` |
| Info | `--color-info` | `--color-info-muted` | `--color-info-fg` |
| Danger | `--color-danger` | `--color-danger-muted` | `--color-danger-fg` |

Use muted/foreground pairs for badges, pills, alerts, and status indicators.

### Border and focus

- Default border: `border-white/[0.06]`.
- Input border: `border-white/[0.08]`; hover to `border-white/12`.
- Focus ring: `focus:border-ring focus:ring-2 focus:ring-ring/30`.
- Active/selected accent: `bg-white/[0.06]`.

## Typography

- **Primary font:** `Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`.
- **Monospace:** used for counts, latency, API key prefixes, URLs, and status codes.
- **Scale:**
  - Page titles: `text-lg font-semibold`.
  - Card titles: `text-sm font-semibold`.
  - Body/table: `text-sm`.
  - Labels/captions: `text-[11px] font-medium uppercase tracking-wide` or `tracking-wider`.
  - Metric value: `text-[28px] font-semibold`.
- **Line treatments:** `tabular-nums` for numbers; `leading-none` for tight headings; `tracking-tight` for large metric values.

## Spacing And Density

- Default component gap: `gap-4` (16 px) for sections; `gap-2` (8 px) for inline groups.
- Card internal padding: `px-5 py-4` or `px-6 py-6` depending on context.
- Table cell padding: `px-4 py-3`.
- Button sizes:
  - Default: `h-9 px-4`.
  - Small: `h-8 px-3` or `h-7` for table actions.
  - Large: `h-10 px-6`.
- Border radius: `--radius: 0.5rem`. Cards and containers use `rounded-lg`; small elements use `rounded-md`; icons use `rounded-xl` or `rounded-2xl`.

## Components

### Primitive source

Use the components in `gateway/admin-ui/src/components/ui/`. Do not introduce new third-party UI libraries without explicit approval.

- **Button** (`button.tsx`): CVA-based with variants `default | destructive | outline | secondary | ghost | link` and sizes `default | sm | lg | icon`. Includes `active:translate-y-px` and focus ring.
- **Card** (`card.tsx`): `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`. Default card has `gap-6`, `rounded-lg`, `border`, `py-6`, and hover shadow.
- **Table** (`table.tsx`): Wraps a scrollable container; header rows use `bg-surface-3`; rows use `hover:bg-muted/50`.
- **Badge** (`badge.tsx`): Variants include `default`, `secondary`, `destructive`, `outline`, `success`, `warning`, `info`.
- **Select** (`select.tsx`): Radix-based, compact (`h-7` trigger), dark popover surface.
- **Skeleton** (`skeleton.tsx`): Shimmer loader over `bg-[hsl(230_9%_16%)]`.

### Custom components

- **PageLayout** (`PageLayout.tsx`): Standard page wrapper with icon, title, count, and actions.
- **DataTable** (`DataTable.tsx`): Generic typed table with column alignment, custom row hover accent bar, and empty state injection.
- **MetricCard** (`MetricCard.tsx`): Small card with uppercase label, icon badge, large value, and detail text.
- **EmptyState** (`EmptyState.tsx`): Centered state with gradient icon container, title, description, optional action.
- **Pagination** (`Pagination.tsx`): Compact page numbers + first/previous/next/last + page-size selector.
- **FilterBar** (`FilterBar.tsx`): Dashboard-specific filter cluster with preset buttons and compact selects.
- **ConfirmDialog** (`ConfirmDialog.tsx`): Accessible modal with focus trap, escape handling, and danger/warning variants.
- **ToastStack** (`ToastStack.tsx`): Bottom-right fixed stack for success/error toasts.

### Icons

- Use **lucide-react** exclusively. Default icon size is `size-4`; small action icons are `size-3`; page icons are `size-5`.

## Interaction States

- **Hover on cards:** subtle lift via `hover:shadow-[var(--shadow-card-hover)]` and/or background shift.
- **Hover on rows:** `hover:bg-white/[0.03]` or `hover:bg-surface-3`.
- **Buttons:** `transition-all duration-150`, `active:translate-y-px active:shadow-none`.
- **Focus:** visible ring only (`focus-visible:ring-ring/50 focus-visible:ring-[3px]`), no default outlines on inputs.
- **Loading:**
  - Buttons show label change (e.g., "Saving...").
  - Refresh buttons use `animate-spin` on the icon.
  - Page content uses `PageSkeleton` or inline skeletons.
- **Disabled:** `disabled:opacity-50 disabled:pointer-events-none` for buttons; `disabled:opacity-40 disabled:cursor-not-allowed` for pagination.

## Responsive Behavior

- **Mobile first.** Sidebar collapses to a fixed top bar and slide-out drawer below `lg`.
- **Main content** gets `pt-14 lg:pt-0` to clear the mobile top bar.
- **Tables** are wrapped in `overflow-x-auto`; use `min-w-[...]` on inner tables to force horizontal scroll instead of squashing columns.
- **Metrics:** 1 col → 2 col (`sm`) → 5 col (`xl`).
- **Charts:** 1 col → 2 col (`lg`).
- **Filter bar:** 1 col → 2 col (`md`) → 4 col (`lg`).

## Accessibility

- Include a skip link (`skip-link`) as the first focusable element in the route tree.
- Use semantic landmarks: `<main>`, `<nav aria-label="Main">`, `<aside>`.
- Dialogs must trap focus, handle `Escape`, restore focus, and use `role="dialog"`/`aria-modal`.
- Charts need `role="img"` and descriptive `aria-label` text.
- Form inputs need associated `<label>` elements or `aria-label`.
- Respect `prefers-reduced-motion` by disabling animations.
- Focus states must be visible; do not suppress outlines globally.

## Implementation Rules

1. **Use Tailwind CSS v4 `@theme` tokens** in `index.css` for all new colors, shadows, and animations. Avoid hard-coding one-off HSL values in components.
2. **Prefer `cn()` from `@/lib/utils`** for conditional class composition.
3. **Use the `components/ui/*` primitives** for buttons, cards, tables, badges, selects, and skeletons. Extend them rather than duplicating styles.
4. **Custom form inputs are acceptable** when they follow the established pattern: `h-10`, `rounded-lg`, `bg-surface-3`, `border-white/[0.08]`, placeholder `text-muted-foreground`, hover/focus transitions.
5. **Page layout must use `PageLayout`** for consistent title/action/header spacing.
6. **Tables must use `DataTable` or `Table` primitives** and include an `EmptyState` when data is absent.
7. **Loading states:** use `PageSkeleton` for full-page loads, `Skeleton` for partial content, and inline spinner icons for button actions.
8. **Toast feedback:** use `useToast()` for all async success/error feedback instead of inline alerts, except for persistent form-level errors.
9. **Icons:** import from `lucide-react`; do not add new icon sets.
10. **Routes:** pages are lazy-loaded in `App.tsx`; add new pages inside the authenticated layout unless they are public.

## Verification Checklist

Before considering Admin UI work complete:

- [ ] New page uses `PageLayout` and matches existing title/icon/count/action pattern.
- [ ] New components use `cn()` and Tailwind tokens from `index.css`.
- [ ] All buttons use the `Button` primitive (or justified exception documented).
- [ ] Tables use `DataTable` or `Table` primitives and include an `EmptyState`.
- [ ] Loading states are handled with `PageSkeleton`, `Skeleton`, or inline spinners.
- [ ] Async actions show toast feedback via `useToast()`.
- [ ] Focus states and keyboard navigation work; dialogs trap focus and close on `Escape`.
- [ ] Mobile layout does not break: tables scroll horizontally, sidebar collapses, content clears top bar.
- [ ] `npm run lint` and `npm run build` pass in `gateway/admin-ui/`.
- [ ] No new arbitrary HSL values duplicated in components; values come from `@theme` tokens.

## Source Evidence

- Color/theme definitions: `gateway/admin-ui/src/index.css`.
- App shell and routing: `gateway/admin-ui/src/App.tsx`.
- UI primitives: `gateway/admin-ui/src/components/ui/{button,card,table,badge,select,skeleton}.tsx`.
- Layout components: `gateway/admin-ui/src/components/Sidebar.tsx`, `gateway/admin-ui/src/components/PageLayout.tsx`.
- Page implementations: `gateway/admin-ui/src/pages/{Dashboard,ApiKeys,Users,Configure,Login}.tsx`.
- Shared helpers: `gateway/admin-ui/src/lib/utils.ts`, `gateway/admin-ui/src/lib/routing.ts`.
- Feedback components: `gateway/admin-ui/src/components/ToastStack.tsx`, `gateway/admin-ui/src/components/ConfirmDialog.tsx`.
- Data display: `gateway/admin-ui/src/components/DataTable.tsx`, `gateway/admin-ui/src/components/MetricCard.tsx`, `gateway/admin-ui/src/components/MetricsGrid.tsx`.

## Open Questions

- Should the dashboard charts adopt a shared chart component rather than bespoke SVG/CSS bars?
- Should form inputs be migrated to a `components/ui/input.tsx` primitive for consistency?
- Is a light mode required for accessibility or operator preference?
- Should the design system include explicit dark-mode elevation tokens (e.g., shadow intensity per layer) beyond the current ad-hoc shadows?
