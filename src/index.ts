#!/usr/bin/env bun
import { Command } from 'commander';
import { homedir } from 'os';
import { join } from 'path';
import { mv, ls } from './lib';

declare const BUILD_VERSION: string | undefined;

function getVersion(): string {
  if (typeof BUILD_VERSION !== 'undefined') {
    return BUILD_VERSION;
  }
  return require('../package.json').version;
}

function getProjectsDir(): string {
  return join(homedir(), '.claude', 'projects');
}

const program = new Command();

program
  .name('mvcp')
  .description('Move a project directory and its Claude Code history')
  .version(getVersion())
  .argument('<old-path>', 'Original project directory path')
  .argument('<new-path>', 'New project directory path')
  .option('-n, --dry-run', 'Show what would be done without making changes')
  .option('-l, --list', 'List all Claude Code project histories')
  .action((oldPath: string, newPath: string, opts: { dryRun?: boolean }) => {
    const result = mv(oldPath, newPath, {
      dryRun: opts.dryRun,
      projectsDir: getProjectsDir(),
    });

    for (const msg of result.errors) {
      console.error(msg);
    }
    if (result.errors.length > 0) {
      process.exit(1);
    }

    for (const msg of result.messages) {
      console.log(msg);
    }
  });

program
  .command('ls')
  .description('List all Claude Code project histories')
  .action(() => {
    const result = ls(getProjectsDir());

    for (const msg of result.errors) {
      console.error(msg);
    }
    if (result.errors.length > 0) {
      process.exit(1);
    }

    if (result.entries.length === 0) {
      console.log('No project histories found.');
      return;
    }

    for (const entry of result.entries) {
      console.log(entry);
    }
  });

program.parse();
