# Contributing

Thanks for your interest in contributing! This project follows the
[Conventional Commits](https://www.conventionalcommits.org/) specification for
its commit messages. Please keep `git log` clean and consistent with the same
format.

## Commit message format

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

### Types

| Type | When to use |
| --- | --- |
| `feat` | A new feature or user-visible capability |
| `fix` | A bug fix |
| `docs` | Documentation-only changes (README, docs) |
| `test` | Adding or updating tests |
| `refactor` | Code changes that neither fix a bug nor add a feature |
| `style` | Formatting or whitespace; no behavior change |
| `chore` | Tooling, dependency, or build changes |
| `perf` | A performance improvement |
| `ci` | CI configuration or scripts |
| `build` | Build system or external dependency changes |
| `revert` | Reverting a previous commit |

### Rules

- Use the lowercase imperative mood in the description (e.g. `add`, `fix`,
  `update`), not past tense (`added`, `fixed`).
- Keep the subject line under ~72 characters.
- Use an empty line between the subject and the body.
- Add a scope in parentheses when it improves clarity, e.g.
  `feat(config): support per-model overrides`.

### Examples

```
feat: add OpenRouter service tier support for pi

Injects OpenRouter's `service_tier` parameter for configured models so users
can control the cost/latency trade-off per model.
```

```
fix(config): handle missing config file gracefully

Loading a non-existent config now returns defaults instead of throwing.
```

```
test: verify command registration and payload injection
```

### Verifying your message

Use [`commitlint`](https://commitlint.js.org/) locally (no hook required):

```bash
npx --yes @commitlint/cli --from HEAD~1 --to HEAD
```

or check a single message:

```bash
npx --yes @commitlint/cli --verbose
```

## Development

```bash
npm install
npm test         # run the unit tests (node:test + tsx)
npm run typecheck
```

See [`README.md`](./README.md) for usage and configuration details.
