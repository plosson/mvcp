# mvcp

Move Claude Code project history when you relocate a project directory.

Claude Code stores conversation history in `~/.claude/projects/` using encoded directory paths (slashes replaced with hyphens). When you move a project, the history gets orphaned. `mvcp` fixes that.

## Install

```bash
# npm
npm install -g @plosson/mvcp

# or run directly
npx @plosson/mvcp mv /old/path /new/path
```

## Usage

### Move project history

```bash
# After moving your project from /home/user/old/project to /home/user/new/project
mvcp mv /home/user/old/project /home/user/new/project
```

### Dry run

```bash
mvcp mv --dry-run /old/path /new/path
```

### List all project histories

```bash
mvcp ls
```

## How it works

Claude Code encodes directory paths by replacing `/` with `-`:

```
/home/user/projects/myapp → -home-user-projects-myapp
```

These are stored in `~/.claude/projects/`. When you move a project, `mvcp` renames the history directory to match the new location.
