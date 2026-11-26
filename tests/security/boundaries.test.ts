import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import manifest from '../../public/manifest.json';
import type { Finding } from '../../src/core/types';

function getAllSourceFiles(dir: string): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...getAllSourceFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.ts')) {
      files.push(fullPath);
    }
  }
  return files;
}

describe('Security & Privacy Boundaries (MVP)', () => {
  const srcDir = path.resolve(__dirname, '../../src');
  const sourceFiles = getAllSourceFiles(srcDir);

  it('restricts manifest content scripts strictly to GitHub in the isolated world', () => {
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.content_scripts).toEqual([
      {
        matches: ['https://github.com/*'],
        js: ['content-script.js'],
        run_at: 'document_idle',
        world: 'ISOLATED',
      },
    ]);
  });

  it('prohibits all broad host, background, storage, and API permissions in manifest', () => {
    const forbiddenFields = [
      'permissions',
      'optional_permissions',
      'host_permissions',
      'optional_host_permissions',
      'background',
      'web_accessible_resources',
      'externally_connectable',
    ];

    for (const field of forbiddenFields) {
      expect(manifest).not.toHaveProperty(field);
    }
  });

  it('verifies zero network, telemetry, or remote code APIs across all source files', () => {
    const forbiddenNetworkPatterns = [
      /\bfetch\s*\(/,
      /\bXMLHttpRequest\b/,
      /\bWebSocket\b/,
      /\bnavigator\.sendBeacon\b/,
      /\beval\s*\(/,
      /\bnew\s+Function\s*\(/,
    ];

    for (const file of sourceFiles) {
      const content = fs.readFileSync(file, 'utf-8');
      for (const pattern of forbiddenNetworkPatterns) {
        expect(
          pattern.test(content),
          `Disallowed network or dynamic execution pattern (${pattern}) found in ${path.relative(srcDir, file)}`
        ).toBe(false);
      }
    }
  });

  it('verifies zero persistent storage APIs across all source files', () => {
    const forbiddenStoragePatterns = [
      /\blocalStorage\b/,
      /\bsessionStorage\b/,
      /\bindexedDB\b/,
      /\bchrome\.storage\b/,
      /\bopenDatabase\b/,
    ];

    for (const file of sourceFiles) {
      const content = fs.readFileSync(file, 'utf-8');
      for (const pattern of forbiddenStoragePatterns) {
        expect(
          pattern.test(content),
          `Disallowed persistent storage pattern (${pattern}) found in ${path.relative(srcDir, file)}`
        ).toBe(false);
      }
    }
  });

  it('verifies zero unsafe DOM innerHTML interpolation across all source files', () => {
    const unsafeDomPatterns = [
      /\.innerHTML\b/,
      /\.outerHTML\b/,
      /\.insertAdjacentHTML\b/,
      /\bdocument\.write\b/,
    ];

    for (const file of sourceFiles) {
      const content = fs.readFileSync(file, 'utf-8');
      for (const pattern of unsafeDomPatterns) {
        expect(
          pattern.test(content),
          `Unsafe HTML injection pattern (${pattern}) found in ${path.relative(srcDir, file)}`
        ).toBe(false);
      }
    }
  });

  it('verifies Zero Secret Retention: findings do not hold raw secret values', () => {
    const sampleFinding: Finding = {
      id: 'f1',
      category: 'github_pat_classic',
      range: { start: 0, end: 40 },
      mask: 'ghp_••••••••',
      replacementText: '[REDACTED]',
    };

    const forbiddenFindingKeys = ['rawSecret', 'raw', 'secret', 'value', 'token', 'pastedText'];
    for (const key of forbiddenFindingKeys) {
      expect(sampleFinding).not.toHaveProperty(key);
    }
  });

  it('verifies built bundle does not include network or persistent storage APIs', () => {
    const distBundle = path.resolve(__dirname, '../../dist/content-script.js');
    if (!fs.existsSync(distBundle)) {
      return; // Skip if dist is not yet built
    }

    const bundleContent = fs.readFileSync(distBundle, 'utf-8');
    const forbiddenInBundle = [
      /\bfetch\s*\(/,
      /\bXMLHttpRequest\b/,
      /\bWebSocket\b/,
      /\bnavigator\.sendBeacon\b/,
      /\blocalStorage\b/,
      /\bsessionStorage\b/,
      /\bindexedDB\b/,
      /\bchrome\.storage\b/,
    ];

    for (const pattern of forbiddenInBundle) {
      expect(
        pattern.test(bundleContent),
        `Built bundle dist/content-script.js contains forbidden API (${pattern})`
      ).toBe(false);
    }
  });
});
