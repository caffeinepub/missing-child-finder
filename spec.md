# Missing Child Finder

## Current State
Full-stack app with auth, dashboard, registration, and AI search. All pages exist and mostly render. Key bugs persist despite previous fix attempts.

## Requested Changes (Diff)

### Add
- `isError` and `refetch` returns from `useActor` hook (the single biggest missing fix)

### Modify
- `useActor.ts`: wrap `_initializeAccessControlWithSecret` in try-catch (never throws), return `isError` and `refetch`, add explicit retry (3x with exponential backoff)
- `DashboardPage.tsx`: fix typo "Active Active" -> "Active Cases" in KPI card label
- `useQueries.ts`: guard `useRegisterCase` actor check more robustly; ensure error messages propagate correctly
- `RegisterPage.tsx`: already destructures `isError` and `refetch` from `useActor` -- will work once `useActor` returns them

### Remove
- Nothing removed

## Implementation Plan
1. Fix `useActor.ts` -- root cause of all registration failures
2. Fix DashboardPage typo
3. Verify no other logic bugs remain in registration / search flow
