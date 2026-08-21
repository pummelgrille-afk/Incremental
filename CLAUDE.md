# CLAUDE.md

Project guidance for Claude Code working in this repository.

## Repository

- Remote: `origin` → https://github.com/pummelgrille-afk/Incremental.git
- Default branch: `main`

## Git workflow rules

### Commit messages

Use [Conventional Commits](https://www.conventionalcommits.org/). Every commit
message must start with one of these types:

| Type        | Use for                                                        |
|-------------|----------------------------------------------------------------|
| `feat:`     | A new feature or user-facing capability                         |
| `fix:`      | A bug fix                                                       |
| `docs:`     | Documentation only (README, comments, this file)                |
| `refactor:` | Code change that neither fixes a bug nor adds a feature         |
| `chore:`    | Tooling, config, dependencies, build scripts, housekeeping      |

Format:

```
<type>: <short imperative summary, lowercase, no trailing period>

<optional body explaining what and why, wrapped at ~72 chars>
```

Examples:

```
feat: add prestige multiplier to resource tick
fix: prevent negative balance when buying max upgrades
docs: document the save-file format
chore: add .gitignore for node build output
```

An optional scope is fine when it clarifies things: `feat(ui): ...`.

### Pushing

**Always ask for explicit confirmation before running `git push`.** Never push
automatically, never as part of a larger batch of commands, and never because a
task "seems finished". Show what is about to be pushed — branch, target remote,
and the commits involved — then wait for a clear yes.

Committing locally does not require this confirmation; pushing does.

### Secrets — never commit

Do not commit, stage, or write into tracked files any of the following:

- `.env` files of any kind (`.env`, `.env.local`, `.env.production`, ...)
- API keys, access tokens, client secrets, session cookies
- Private keys and certificates (`*.pem`, `*.key`, `*.pfx`, `id_rsa`)
- Cloud credential files (`.aws/credentials`, service-account JSON)
- Database connection strings containing passwords

Before every commit:

1. Confirm a `.gitignore` exists and covers common secret and build files.
   If it is missing, create one before committing.
2. Review the staged diff (`git diff --cached`) for anything that looks like a
   credential, even inside example or test files.
3. If a secret is spotted, stop and tell the user rather than committing.

Use a committed `.env.example` with placeholder values to document required
environment variables — never the real `.env`.

If a secret was already committed, treat it as compromised: tell the user to
rotate it, and do not assume that removing it in a later commit is sufficient,
since it remains in git history.
