import { readFile } from 'node:fs/promises';
import { scoreCandidate } from './scoring.mjs';

const path = process.argv[2];
if (!path) throw new Error('Usage: node product-intelligence/prepublish-check.mjs <candidate.json>');
const candidate = JSON.parse(await readFile(path, 'utf8'));
const result = scoreCandidate(candidate);
console.log(JSON.stringify(result, null, 2));
if (result.decision !== 'keep') process.exitCode = 1;
