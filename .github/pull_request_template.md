<!--
Pull requests without this information will not be reviewed.
One concern per pull request: a dependency bump, a refactor and a behaviour change are three PRs.
-->

## Purpose

Why is this change needed? What problem does it solve?

## What it changes

What exactly is different afterwards — for users, for operators, in the code?
List every change in behaviour, however small (rounding, ordering, defaults, error handling).
A refactor must say explicitly that behaviour is unchanged, and how that was checked.

## How it was tested

Commands run, cases tried, platforms (Docker amd64/arm64, iOS, Android) if relevant.

## Checklist

- [ ] One concern only; based on the current `main`
- [ ] No behaviour change hidden in a refactor or dependency commit
- [ ] `npm test` and `npm run build` pass
