# mvcp

Move a project directory **and** its Claude Code conversation history in one command.

Claude Code stores conversation history in `~/.claude/projects/` using encoded directory paths (slashes replaced with hyphens). When you move a project, the history gets orphaned. `mvcp` fixes that — it moves both the project directory and the associated history.

## Install

```bash
# Install globally (recommended)
npm install -g @plosson/mvcp

# Or run without installing
npx @plosson/mvcp <old-path> <new-path>
```

## Usage

```bash
# Move a project and its Claude Code history
mvcp /home/user/old/location/myapp /home/user/new/location/myapp

# Preview what would happen without making changes
mvcp --dry-run /old/path /new/path

# List all Claude Code project histories
mvcp ls
```

## What it does

Given `mvcp /old/path /new/path`, it will:

1. Move `/old/path` → `/new/path` (if source exists and target doesn't)
2. Move the Claude Code history directory to match (same conditions)

If the project was already moved manually, `mvcp` will still move just the history. If there's no history, it will still move just the project.

## How Claude Code encodes paths

```
/home/user/projects/myapp → -home-user-projects-myapp
```

These encoded directories live in `~/.claude/projects/`. The `mvcp ls` command shows all of them decoded back to readable paths.
