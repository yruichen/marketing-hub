import { rm } from 'node:fs/promises';
import path from 'node:path';

const generatedDirectories = [path.resolve('dist'), path.resolve('out')];
for (const directory of generatedDirectories) {
  await rm(directory, { recursive: true, force: true });
}
