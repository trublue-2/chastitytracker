# Security Policy

## Reporting a vulnerability

**Please report privately, not through a public issue or pull request.**

Use GitHub's private vulnerability reporting:
[**Report a vulnerability**](https://github.com/trublue-2/chastitytracker/security/advisories/new)

That channel is private between you and the maintainer. Nothing you write there
becomes public unless we publish an advisory together.

If you cannot use it, email `info@trublue.ch` instead.

## If your finding involves personal data in this repository

This deserves its own note, because the obvious fix makes things worse.

If you find committed files containing personal data — photos, uploads,
credentials, anything that should not be public — **please do not open a pull
request that deletes them.**

A pull request is permanent. GitHub keeps `refs/pull/<n>/head` forever, so the
data stays reachable through the pull request even after the files are removed
from the branch and the history is rewritten. The pull request title and
description also become a public, searchable description of exactly what was
exposed and where, and the diff view renders the removed files as previews.
Removing all of that afterwards requires a support request to GitHub and takes
days.

So: report it privately through the link above. Name the paths, and I will
handle the removal. It is genuinely helpful to be told — just not in the open.

## Scope

In scope:

- The application in this repository (authentication, authorization, upload
  handling, API routes, the MCP server)
- Data exposure: files or endpoints reachable without the authentication they
  should require
- The Docker image and the deployment workflow in `.github/workflows/`

Out of scope:

- Third-party instances run by other people. This is self-hosted software; if
  you found something on someone else's deployment, report it here and I will
  notify operators, but do not test against installations you do not own.
- Findings that require an already-compromised admin account
- Missing hardening headers without a demonstrated impact

## What to expect

- Acknowledgement within a few days
- An assessment and a plan, or an explanation why something is not a problem
- Credit in the changelog when a report leads to a fix, unless you prefer
  otherwise

## Supported versions

Only the current release receives fixes. This is a small self-hosted project
without long-term branches — run the latest image (`:latest`).
