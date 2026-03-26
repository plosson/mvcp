import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdirSync, rmSync, existsSync, writeFileSync, readFileSync, symlinkSync, chmodSync } from 'fs';
import { join, resolve } from 'path';
import { tmpdir } from 'os';
import { encodePath, decodePath, mv, ls } from './lib';

let testRoot: string;
let projectsDir: string;
let workDir: string;

beforeEach(() => {
  testRoot = join(tmpdir(), `mvcp-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  projectsDir = join(testRoot, 'claude-projects');
  workDir = join(testRoot, 'work');
  mkdirSync(projectsDir, { recursive: true });
  mkdirSync(workDir, { recursive: true });
});

afterEach(() => {
  // restore permissions before cleanup in case we chmod'd
  try { chmodSync(testRoot, 0o755); } catch {}
  rmSync(testRoot, { recursive: true, force: true });
});

function createProject(name: string): string {
  const dir = join(workDir, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'test.txt'), 'hello');
  return dir;
}

function createHistory(projectPath: string): string {
  const encoded = encodePath(projectPath);
  const dir = join(projectsDir, encoded);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'history.json'), '{"conversations":[]}');
  return dir;
}

// ---- encodePath edge cases ----

describe('encodePath adversarial', () => {
  test('paths with hyphens produce ambiguous encoding', () => {
    // /tmp/my-project and /tmp/my/project encode differently
    const withHyphen = encodePath('/tmp/my-project');
    const withSlash = encodePath('/tmp/my/project');
    // Both produce -tmp-my-project — this is a known Claude Code limitation
    expect(withHyphen).toBe(withSlash);
  });

  test('paths with spaces', () => {
    const encoded = encodePath('/home/user/my project/app');
    expect(encoded).toBe('-home-user-my project-app');
  });

  test('paths with special characters', () => {
    const encoded = encodePath('/home/user/proj@2.0/src');
    expect(encoded).toBe('-home-user-proj@2.0-src');
  });

  test('paths with unicode', () => {
    const encoded = encodePath('/home/user/проект/app');
    expect(encoded).toBe('-home-user-проект-app');
  });

  test('trailing slashes are normalized by resolve', () => {
    const a = encodePath('/tmp/project/');
    const b = encodePath('/tmp/project');
    expect(a).toBe(b);
  });

  test('double slashes are normalized by resolve', () => {
    const a = encodePath('/tmp//project');
    const b = encodePath('/tmp/project');
    expect(a).toBe(b);
  });

  test('dot segments are resolved', () => {
    const a = encodePath('/tmp/foo/../bar');
    const b = encodePath('/tmp/bar');
    expect(a).toBe(b);
  });

  test('empty string resolves to cwd', () => {
    const encoded = encodePath('');
    expect(encoded).toBe(resolve('').replace(/\//g, '-'));
  });
});

// ---- mv adversarial ----

describe('mv adversarial', () => {
  test('same source and target path', () => {
    const path = createProject('same');
    createHistory(path);

    // target exists because it IS the source
    const result = mv(path, path, { projectsDir });
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.projectMoved).toBe(false);
  });

  test('source is a file, not a directory', () => {
    const filePath = join(workDir, 'not-a-dir.txt');
    writeFileSync(filePath, 'i am a file');
    const newPath = join(workDir, 'moved');

    // renameSync works on files too — should it?
    // Currently the tool doesn't distinguish files from dirs
    const result = mv(filePath, newPath, { projectsDir });
    expect(result.projectMoved).toBe(true);
    expect(existsSync(newPath)).toBe(true);
    // The moved "project" is actually a file
    expect(readFileSync(newPath, 'utf-8')).toBe('i am a file');
  });

  test('source is a symlink', () => {
    const realDir = createProject('real');
    const linkPath = join(workDir, 'link-to-real');
    symlinkSync(realDir, linkPath);
    const newPath = join(workDir, 'link-moved');

    const result = mv(linkPath, newPath, { projectsDir });
    expect(result.projectMoved).toBe(true);
    // The symlink itself was moved, original dir still exists
    expect(existsSync(realDir)).toBe(true);
  });

  test('target parent directory does not exist', () => {
    const oldPath = createProject('deep-target');
    const newPath = join(workDir, 'nonexistent', 'parent', 'project');

    const result = mv(oldPath, newPath, { projectsDir });
    expect(result.errors.some(m => m.includes('Target parent directory does not exist'))).toBe(true);
    expect(result.projectMoved).toBe(false);
    // Source untouched
    expect(existsSync(oldPath)).toBe(true);
  });

  test('moving to a path that is a file (not dir)', () => {
    const oldPath = createProject('src-proj');
    const targetFile = join(workDir, 'i-am-a-file');
    writeFileSync(targetFile, 'blocking');

    const result = mv(oldPath, targetFile, { projectsDir });
    expect(result.errors.some(m => m.includes('already exists'))).toBe(true);
    expect(result.projectMoved).toBe(false);
    // Original untouched
    expect(existsSync(oldPath)).toBe(true);
  });

  test('path traversal with ..', () => {
    const oldPath = createProject('victim');
    // Attacker tries to escape workDir
    const newPath = join(workDir, '..', '..', 'escaped');

    const result = mv(oldPath, newPath, { projectsDir });
    // It should work (resolve normalizes it) but the project ends up outside workDir
    if (result.projectMoved) {
      const resolvedNew = resolve(newPath);
      expect(existsSync(resolvedNew)).toBe(true);
      rmSync(resolvedNew, { recursive: true });
    }
  });

  test('very long path names', () => {
    const longName = 'a'.repeat(200);
    const oldPath = createProject(longName);
    const newPath = join(workDir, 'b'.repeat(200));

    const result = mv(oldPath, newPath, { projectsDir });
    // Should succeed on most filesystems (255 char limit per component)
    expect(result.projectMoved).toBe(true);
  });

  test('path with newlines in name', () => {
    const weirdName = 'project\nwith\nnewlines';
    const oldPath = createProject(weirdName);
    const newPath = join(workDir, 'cleaned-up');

    const result = mv(oldPath, newPath, { projectsDir });
    expect(result.projectMoved).toBe(true);
    expect(existsSync(newPath)).toBe(true);
  });

  test('project moves but history rename fails — partial state', () => {
    const oldPath = createProject('partial');
    // Create history dir, then make projectsDir read-only so rename fails
    createHistory(oldPath);
    const newPath = join(workDir, 'partial-moved');

    // Make projectsDir read-only to prevent history rename
    chmodSync(projectsDir, 0o555);

    // This will move the project but fail on history
    // The function should throw since renameSync throws
    let threw = false;
    try {
      mv(oldPath, newPath, { projectsDir });
    } catch {
      threw = true;
    }

    // Restore permissions for cleanup
    chmodSync(projectsDir, 0o755);

    if (threw) {
      // Project was moved but history wasn't — inconsistent state
      // This is a real bug: project moved, then history rename throws,
      // leaving things half-done
      expect(existsSync(newPath)).toBe(true);
      expect(existsSync(oldPath)).toBe(false);
    }
  });

  test('concurrent move — source disappears between check and rename', () => {
    // Simulate race: create project, then remove it after existsSync but before renameSync
    // We can't truly test races, but we can verify behavior when source is removed
    const oldPath = join(workDir, 'ghost');
    const newPath = join(workDir, 'ghost-moved');

    // Neither exists
    const result = mv(oldPath, newPath, { projectsDir });
    expect(result.errors.some(m => m.includes('Nothing to move'))).toBe(true);
  });

  test('source and target encode to the same history path', () => {
    // /work/a-b and /work/a/b encode the same way
    // Both become the same encoded string in the history dir
    const path1 = join(workDir, 'a-b');
    const path2 = join(workDir, 'a', 'b');
    mkdirSync(path1, { recursive: true });
    createHistory(path1);

    // Target parent /work/a doesn't exist, so parent check catches it
    const result = mv(path1, path2, { projectsDir });
    expect(result.errors.some(m => m.includes('Target parent directory does not exist'))).toBe(true);
    expect(result.projectMoved).toBe(false);
    // Source untouched
    expect(existsSync(path1)).toBe(true);
  });

  test('source and target encode to same history when parent exists', () => {
    // Create both /work/a-b and /work/a/ so target parent exists
    const path1 = join(workDir, 'a-b');
    const path2 = join(workDir, 'a', 'b');
    mkdirSync(path1, { recursive: true });
    mkdirSync(join(workDir, 'a'), { recursive: true });
    createHistory(path1);

    // Now the history collision should be detected
    const result = mv(path1, path2, { projectsDir });
    expect(result.errors.some(m => m.includes('Target Claude history already exists'))).toBe(true);
    expect(result.projectMoved).toBe(false);
  });

  test('moving into a subdirectory of itself', () => {
    const parent = createProject('parent-proj');
    const child = join(parent, 'subdir', 'moved-here');

    // Parent of target doesn't exist — caught by parent check
    const result = mv(parent, child, { projectsDir });
    expect(result.errors.some(m => m.includes('Target parent directory does not exist'))).toBe(true);
    expect(result.projectMoved).toBe(false);
    expect(existsSync(parent)).toBe(true);
  });
});

// ---- ls adversarial ----

describe('ls adversarial', () => {
  test('projectsDir is a file, not a directory', () => {
    const fakePath = join(testRoot, 'not-a-dir');
    writeFileSync(fakePath, 'i am a file');

    // readdirSync will throw on a file
    let threw = false;
    try {
      ls(fakePath);
    } catch {
      threw = true;
    }
    // existsSync returns true for files, so it passes the check
    // but readdirSync will throw
    expect(threw).toBe(true);
  });

  test('projectsDir contains symlinks to directories', () => {
    const realDir = join(testRoot, 'real-history');
    mkdirSync(realDir, { recursive: true });
    symlinkSync(realDir, join(projectsDir, '-tmp-linked-project'));

    const result = ls(projectsDir);
    // Symlinks to dirs should appear in listing
    expect(result.entries.length).toBe(1);
  });

  test('projectsDir with broken symlink', () => {
    symlinkSync('/nonexistent/target', join(projectsDir, '-tmp-broken'));

    // Broken symlinks: withFileTypes isDirectory() returns false for broken symlinks
    const result = ls(projectsDir);
    expect(result.entries.length).toBe(0);
  });

  test('projectsDir with mixed files and directories', () => {
    createHistory(join(workDir, 'proj1'));
    createHistory(join(workDir, 'proj2'));
    writeFileSync(join(projectsDir, 'random-file'), 'noise');
    writeFileSync(join(projectsDir, '.DS_Store'), 'apple junk');

    const result = ls(projectsDir);
    expect(result.entries.length).toBe(2);
  });
});
