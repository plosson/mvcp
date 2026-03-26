#!/usr/bin/env bun
import { Command } from 'commander';
import { homedir } from 'os';
import { join, resolve } from 'path';
import { existsSync, renameSync, readdirSync } from 'fs';

declare const BUILD_VERSION: string | undefined;

function getVersion(): string {
  if (typeof BUILD_VERSION !== 'undefined') {
    return BUILD_VERSION;
  }
  return require('../package.json').version;
}

/** Encode a directory path the way Claude Code does: replace / with - */
function encodePath(dirPath: string): string {
  const absolute = resolve(dirPath);
  return absolute.replace(/\//g, '-');
}

/** Decode an encoded path back to the original directory path */
function decodePath(encoded: string): string {
  // Encoded paths start with - (from the leading /)
  // e.g. -Users-foo-bar -> /Users/foo/bar
  return encoded.replace(/-/g, '/');
}

function getProjectsDir(): string {
  return join(homedir(), '.claude', 'projects');
}

const program = new Command();

program
  .name('mvcp')
  .description('Move Claude Code project history when you relocate a project directory')
  .version(getVersion());

program
  .command('mv')
  .description('Rename project history from old path to new path')
  .argument('<old-path>', 'Original project directory path')
  .argument('<new-path>', 'New project directory path')
  .option('-n, --dry-run', 'Show what would be done without making changes')
  .action((oldPath: string, newPath: string, opts: { dryRun?: boolean }) => {
    const projectsDir = getProjectsDir();

    if (!existsSync(projectsDir)) {
      console.error(`Claude projects directory not found: ${projectsDir}`);
      process.exit(1);
    }

    const oldEncoded = encodePath(oldPath);
    const newEncoded = encodePath(newPath);
    const oldDir = join(projectsDir, oldEncoded);
    const newDir = join(projectsDir, newEncoded);

    if (!existsSync(oldDir)) {
      console.error(`Project history not found: ${oldDir}`);
      console.error(`\nEncoded path: ${oldEncoded}`);
      console.error(`\nUse 'mvcp ls' to see existing project histories.`);
      process.exit(1);
    }

    if (existsSync(newDir)) {
      console.error(`Target already exists: ${newDir}`);
      console.error(`\nRemove it first if you want to overwrite.`);
      process.exit(1);
    }

    if (opts.dryRun) {
      console.log('Dry run — no changes made.\n');
      console.log(`From: ${oldDir}`);
      console.log(`  To: ${newDir}`);
      return;
    }

    renameSync(oldDir, newDir);
    console.log(`Moved project history:\n`);
    console.log(`  ${oldPath}`);
    console.log(`  → ${newPath}`);
  });

program
  .command('ls')
  .description('List all Claude Code project histories')
  .action(() => {
    const projectsDir = getProjectsDir();

    if (!existsSync(projectsDir)) {
      console.error(`Claude projects directory not found: ${projectsDir}`);
      process.exit(1);
    }

    const entries = readdirSync(projectsDir, { withFileTypes: true })
      .filter(e => e.isDirectory())
      .map(e => e.name)
      .sort();

    if (entries.length === 0) {
      console.log('No project histories found.');
      return;
    }

    for (const entry of entries) {
      const decoded = decodePath(entry);
      console.log(`${decoded}`);
    }
  });

program.parse();
