# Contributing

## Development Setup

See `README.md` for Quick Start instructions (Docker and local).

## Branch & Commit Conventions

- Branch from `main`: `feature/<short-description>`, `fix/<short-description>`
- Commit messages: imperative mood, e.g. `Fix blockchain ABI path resolution`

## Testing Requirements

Before opening a pull request, run the relevant test suite(s) for any code you changed:

| Area | Command |
|---|---|
| Backend | `cd backend && npm test` |
| Frontend | `cd frontend && npm run lint` |
| AI Service | `cd ai-service && pytest` |
| Blockchain | `cd blockchain && npm test` |
| PDF Service | `cd pdf-service && node tests/test.js` |

All backend unit tests (`tests/unit/`) must pass (42/42 baseline). New backend modules should include a corresponding `*.validation.js` (Zod schemas) and `*.controller.js` for consistency with existing modules.

## Code Style

- Backend/Frontend: ESLint configs are provided (`npm run lint` / `npm run lint:fix`)
- No `TODO`/`FIXME`/`PLACEHOLDER` comments in code intended for merge — open an issue instead and reference it.

## Environment Variables

Never commit real secrets. Update the relevant `.env.example` file (and the root consolidated `.env.example`) whenever a new environment variable is introduced, and add it to `backend/src/config/env.js`'s Zod schema if backend-consumed.

## Pull Request Checklist

- [ ] Tests pass locally
- [ ] No new TODOs/placeholders introduced
- [ ] `.env.example` files updated if new env vars added
- [ ] `RELEASE_MANIFEST.md` updated if files were added/removed/moved
