import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { APP_VERSION } from '../../src/version';

function collectFiles(dir: string): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectFiles(fullPath));
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }
  return files;
}

describe('v1.0.0 release alignment & CI guardrails', () => {
  it('aligns APP_VERSION, package.json version, and config.xml widget version to 1.0.0', () => {
    expect(APP_VERSION).toBe('1.0.0');

    const pkgRaw = fs.readFileSync(path.resolve('package.json'), 'utf8');
    const pkg = JSON.parse(pkgRaw) as { version: string; scripts?: Record<string, string> };
    expect(pkg.version).toBe('1.0.0');
    expect(pkg.scripts?.build).toContain('tsconfig.json');
    expect(pkg.scripts?.build).toContain('tsconfig.node.json');

    const configXml = fs.readFileSync(path.resolve('config.xml'), 'utf8');
    const versionMatch = configXml.match(/<widget\b[^>]*\bversion="([^"]+)"/);
    expect(versionMatch?.[1]).toBe('1.0.0');

    const gitignore = fs.readFileSync(path.resolve('.gitignore'), 'utf8');
    expect(gitignore.split(/\r?\n/)).toContain('*.sha256');
  });

  it('defines .github/workflows/ci-and-release.yml with zero-gap, dual-tsc, test, build, and .wgt release steps', () => {
    const workflowPath = path.resolve('.github/workflows/ci-and-release.yml');
    expect(fs.existsSync(workflowPath)).toBe(true);

    const workflow = fs.readFileSync(workflowPath, 'utf8');
    expect(workflow).toContain('grep -rn "gap-" src/');
    expect(workflow).toContain('tsconfig.json');
    expect(workflow).toContain('tsconfig.node.json');
    expect(workflow).toContain('npm test');
    expect(workflow).toContain('npm run build');
    expect(workflow).toContain('package:wgt');
    expect(workflow).toContain('kadr.wgt.sha256');
    expect(workflow).toContain('softprops/action-gh-release@v2');
  });

  it('contains zero gap- substrings across every file under src/', () => {
    const srcRoot = path.resolve('src');
    const files = collectFiles(srcRoot);
    expect(files.length).toBeGreaterThan(0);

    const offenders = files
      .filter((filePath) => fs.readFileSync(filePath, 'utf8').includes('gap-'))
      .map((filePath) => path.relative(process.cwd(), filePath));

    expect(offenders).toEqual([]);
  });
});
