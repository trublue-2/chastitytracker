# Pre-Commit Check

Run all quality checks before committing. Fix any issues found.

## Steps

1. **TypeScript** — Run `npx tsc --noEmit` and fix all type errors
2. **i18n** — Grep changed `.tsx` files for hardcoded German strings in JSX (strings not from `useTranslations` / `getTranslations`). Flag any violations.
3. **Imports** — Check that no unused imports exist in changed files
4. **Constants** — Check that no magic numbers or inline validation logic was added that should use `src/lib/constants.ts` (`validatePassword`, `parseOrgasmusArtBase`, `PASSWORD_MIN_LENGTH`, `BCRYPT_MAX_BYTES`, etc.)
5. **Error handling** — Check that all `fetch()` calls in changed client components have `try/catch` and `res.ok` checks
6. **Changelog** — If this is a feature or fix commit, verify that `src/data/changelog.json` and `package.json` version were updated in the same staged changes

## Output

Report results as a checklist:
- ✅ or ❌ per check
- For failures: show the file, line, and what to fix
- Fix all issues automatically where possible
