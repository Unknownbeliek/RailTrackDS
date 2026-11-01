#!/usr/bin/env node
/** Writes apps/web/src/styles/tokens.css from the token source. */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cssVariables } from './build-css';

const HERE = dirname(fileURLToPath(import.meta.url));
const target = resolve(HERE, '../../../apps/web/src/styles/tokens.css');

mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, cssVariables(), 'utf8');
console.log(`Wrote ${target}`);
