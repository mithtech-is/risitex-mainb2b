# apps/storefront

**Status:** placeholder. Populated after the backend (Phase 5+) is functional.

This folder will host the Next.js 15 customer-facing site:

- App Router, server components, server actions.
- TailwindCSS + `@risitex/ui` shadcn components.
- Zustand for client state, TanStack Query for server cache.
- React Hook Form + Zod for forms (Zod schemas come from `@risitex/shared`).
- Calls the Medusa backend via its auto-generated SDK or REST.
