#!/usr/bin/env node
/**
 * Secret scan (PRD v2 section 13, rule N1).
 * Fails when something shaped like a provider key, bearer token or connection
 * string with credentials is committed outside the env example.
 */
import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const SKIP = new Set(['node_modules', '.git', 'dist', 'build', 'coverage', '.data']);

const PATTERNS = [
  { name: 'railradar-style api key', re: /\brr_[a-z0-9]{20,}\b/i },
  { name: 'bearer literal', re: /Bearer\s+[A-Za-z0-9._-]{24,}/ },
  { name: 'postgres url with password', re: /postgres(ql)?:\/\/[^\s:@]+:[^\s:@]+@/ },
  { name: 'aws access key', re: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: 'private key block', re: /-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
];

const ALLOW = [/\.example$/, /scan-secrets\.mjs$/, /\.md$/, /fixtures\//];

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (entry.isFile()) yield full;
  }
}

const findings = [];
for await (const file of walk(ROOT)) {
  const rel = relative(ROOT, file);
  if (ALLOW.some((a) => a.test(rel))) continue;
  if (rel.endsWith('.pdf') || rel.endsWith('.png') || rel.endsWith('.jpg')) continue;
  let text;
  try {
    text = await readFile(file, 'utf8');
  } catch {
    continue;
  }
  for (const { name, re } of PATTERNS) {
    if (re.test(text)) findings.push(`${rel}: possible ${name}`);
  }
}

if (findings.length) {
  console.error('Secret scan failed:\n' + findings.map((f) => '  - ' + f).join('\n'));
  process.exit(1);
}
console.log('Secret scan: clean');
