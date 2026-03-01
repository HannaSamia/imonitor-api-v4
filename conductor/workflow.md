# Development Workflow

## TDD Policy

**Moderate** — Tests are encouraged but do not block implementation.

- Write tests for all services and business logic.
- Unit tests should mock database calls (DB is behind SDQ — no direct access).
- E2E tests should verify endpoint behavior matches v3.
- Tests are expected for complex logic, not required for simple CRUD wiring.
- Flag any tests requiring manual verification against live DB in MANUAL_TESTING.md.

## Commit Strategy

**Conventional Commits** — All commits follow the conventional commit format:

| Prefix | Usage |
|--------|-------|
| `feat:` | New feature or endpoint |
| `fix:` | Bug fix |
| `refactor:` | Code restructuring without behavior change |
| `chore:` | Dependencies, config, tooling |
| `test:` | Adding or updating tests |
| `docs:` | Documentation changes |

Example: `feat: add TypeORM entities matching iMonitorV3_1 schema`

All commits include: `Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>`

## Branch Strategy

| Pattern | Usage |
|---------|-------|
| `main` | Production-ready code |
| `migration/phase-X-description` | Phase-level branches |
| `migration/phase-X.Y-description` | Sub-task branches |

Rules:
- Never commit directly to `main`.
- Always start from an up-to-date `main` (`git pull origin main`).
- Merge to `main` before starting next phase.
- Tag milestones: `v0.X.0-migration-phaseX`.

## Verification Checkpoints

**After each task completion:**
- Verify the task's deliverables are functional.
- Run relevant tests.
- Confirm no regressions in previously completed work.
- Commit and push before moving to next task.

## Task Lifecycle

```
pending → in_progress → completed
```

1. **pending**: Task is defined but not started.
2. **in_progress**: Actively being worked on.
3. **completed**: All deliverables met, tests pass, committed.

## Code Review Requirements

- Self-review is acceptable for migration tasks.
- PR summaries should describe what changed, what was tested, and any breaking changes.
- Flag any changes that require manual DB verification.

## Git Workflow (Mandatory)

1. `git checkout main && git pull origin main`
2. `git checkout -b migration/phase-X-description`
3. Implement and commit frequently
4. `git push origin <branch>`
5. Merge to main (fast-forward or merge commit)
6. Tag milestone if phase complete
7. Start next phase from updated main
