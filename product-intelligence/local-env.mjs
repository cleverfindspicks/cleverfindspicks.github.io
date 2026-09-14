import { readFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';

export async function localEnvironment() {
  const file = await readFile(new URL('../.env.local', import.meta.url), 'utf8').catch(() => '');
  return { ...parseEnv(file), ...process.env };
}
