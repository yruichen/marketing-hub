import { cp, mkdir } from 'node:fs/promises';
import path from 'node:path';

const source = path.resolve('..', 'frontend', 'dist');
const destination = path.resolve('dist', 'renderer');

await mkdir(destination, { recursive: true });
await cp(source, destination, { recursive: true, force: true });
