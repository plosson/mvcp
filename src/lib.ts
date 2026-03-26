import { resolve, dirname } from 'path';
import { join } from 'path';
import { existsSync, renameSync, readdirSync, statSync, lstatSync } from 'fs';

/** Encode a directory path the way Claude Code does: replace / with - */
export function encodePath(dirPath: string): string {
  const absolute = resolve(dirPath);
  return absolute.replace(/\//g, '-');
}

/** Decode an encoded path back to the original directory path */
export function decodePath(encoded: string): string {
  return encoded.replace(/-/g, '/');
}

export interface MvResult {
  projectMoved: boolean;
  historyMoved: boolean;
  messages: string[];
  errors: string[];
}

export interface MvOptions {
  dryRun?: boolean;
  projectsDir: string;
}

export function mv(oldPath: string, newPath: string, opts: MvOptions): MvResult {
  const resolvedOld = resolve(oldPath);
  const resolvedNew = resolve(newPath);

  const { projectsDir, dryRun } = opts;
  const hasProjectsDir = existsSync(projectsDir);

  const oldEncoded = encodePath(oldPath);
  const newEncoded = encodePath(newPath);
  const oldHistoryDir = hasProjectsDir ? join(projectsDir, oldEncoded) : null;
  const newHistoryDir = hasProjectsDir ? join(projectsDir, newEncoded) : null;

  const result: MvResult = {
    projectMoved: false,
    historyMoved: false,
    messages: [],
    errors: [],
  };

  const canMoveProject = existsSync(resolvedOld) && !existsSync(resolvedNew);
  const canMoveHistory = oldHistoryDir && existsSync(oldHistoryDir) && newHistoryDir && !existsSync(newHistoryDir);

  // Validate: at least one thing to move
  if (!existsSync(resolvedOld) && (!oldHistoryDir || !existsSync(oldHistoryDir))) {
    result.errors.push(`Nothing to move:`);
    result.errors.push(`  Project directory not found: ${resolvedOld}`);
    result.errors.push(`  Claude history not found: ${oldHistoryDir}`);
    return result;
  }

  // Validate: target parent directory exists
  const targetParent = dirname(resolvedNew);
  if (!existsSync(targetParent)) {
    result.errors.push(`Target parent directory does not exist: ${targetParent}`);
    return result;
  }

  // Validate: targets don't already exist
  if (existsSync(resolvedNew)) {
    result.errors.push(`Target project directory already exists: ${resolvedNew}`);
    return result;
  }
  if (newHistoryDir && existsSync(newHistoryDir)) {
    result.errors.push(`Target Claude history already exists: ${newHistoryDir}`);
    return result;
  }

  if (dryRun) {
    result.messages.push('Dry run — no changes made.');
  }

  // Move project directory
  if (canMoveProject) {
    if (!dryRun) {
      renameSync(resolvedOld, resolvedNew);
      result.projectMoved = true;
    }
    result.messages.push(`Project: ${resolvedOld} → ${resolvedNew}`);
  } else if (!existsSync(resolvedOld)) {
    result.messages.push(`Skipped project (source not found): ${resolvedOld}`);
  }

  // Move Claude history
  if (canMoveHistory) {
    if (!dryRun) {
      renameSync(oldHistoryDir, newHistoryDir);
      result.historyMoved = true;
    }
    result.messages.push(`History: ${oldHistoryDir} → ${newHistoryDir}`);
  } else if (!hasProjectsDir) {
    result.messages.push(`Skipped Claude history (${projectsDir} not found)`);
  } else if (oldHistoryDir && !existsSync(oldHistoryDir)) {
    result.messages.push(`No Claude history found for this project`);
  }

  return result;
}

export interface LsResult {
  entries: string[];
  errors: string[];
}

export function ls(projectsDir: string): LsResult {
  if (!existsSync(projectsDir)) {
    return { entries: [], errors: [`Claude projects directory not found: ${projectsDir}`] };
  }

  const entries = readdirSync(projectsDir, { withFileTypes: true })
    .filter(e => {
      if (e.isDirectory()) return true;
      // Follow symlinks to check if they point to directories
      if (e.isSymbolicLink()) {
        try {
          return statSync(join(projectsDir, e.name)).isDirectory();
        } catch {
          return false; // broken symlink
        }
      }
      return false;
    })
    .map(e => decodePath(e.name))
    .sort();

  return { entries, errors: [] };
}
