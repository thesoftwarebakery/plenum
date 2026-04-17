import { GenericContainer } from 'testcontainers';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export async function setup(): Promise<void> {
  if (process.env.CI) return;
  const contextDir = resolve(__dirname, '../..');
  console.log('Building opengateway:latest image...');
  await GenericContainer.fromDockerfile(contextDir).build('opengateway:latest', { deleteOnExit: false });
  console.log('Image built.');
}
