# New Feature Checklist

Use this before implementing a new feature. Ensures nothing is forgotten.

## Phase 1: Discovery (before writing code)

Search the codebase for existing patterns:

1. **Components** — Grep `src/app/components/` for similar UI elements. Reuse before creating new ones.
2. **Hooks** — Check `src/app/hooks/` for existing logic (e.g., `usePhotoUpload` for any photo form).
3. **Utilities** — Check `src/lib/constants.ts`, `src/lib/utils.ts`, `src/lib/queries.ts` for existing helpers.
4. **Shared shells** — For admin action forms, use `AdminActionFormShell`. For datetime inputs, use `DateTimePicker`.
5. **Similar pages** — Find the closest existing page to the new feature and follow its exact patterns.

Report what you found and propose a plan.

## Phase 2: Implementation checklist

After approval, verify each point during implementation:

- [ ] All visible strings use `useTranslations()` / `getTranslations()` — keys added to both `de.json` AND `en.json`
- [ ] Form state uses `saving` (not `loading`), errors use `FormError` component or styled error card
- [ ] All `fetch()` calls wrapped in `try/catch` with `res.ok` check and user feedback
- [ ] Validation uses constants from `src/lib/constants.ts` — no inline magic numbers
- [ ] New shared components go in `src/app/components/`, not inline in pages
- [ ] API routes use `requireAdminApi()` or `auth()` guard from `src/lib/authGuards.ts`
- [ ] No `any` types — use existing types from `src/lib/utils.ts` (`AnforderungStatus`, `VerifikationStatus`, etc.)
- [ ] Images use `size-*` for squares, no `h-screen` (use `h-dvh`), no arbitrary `z-*`

## Phase 3: Finalize

- [ ] `npx tsc --noEmit` passes
- [ ] Version bumped in `package.json`
- [ ] Changelog entry added to `src/data/changelog.json` (same commit as changes)
- [ ] Commit message follows pattern: `type: description` where type is `feat`, `fix`, `ui`, `security`, `perf`, or `chore`
