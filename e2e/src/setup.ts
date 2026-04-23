import { GenericContainer } from 'testcontainers';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateTestCerts, cleanupTestCerts, type TestCerts } from './certs';

const __dirname = dirname(fileURLToPath(import.meta.url));

let certs: TestCerts | undefined;

export async function setup(): Promise<void> {
  // Build the gateway Docker image (skipped in CI where it is pre-built).
  if (!process.env.CI) {
    const contextDir = resolve(__dirname, '../..');
    console.log('Building plenum:latest image...');
    await GenericContainer.fromDockerfile(contextDir).build('plenum:latest', { deleteOnExit: false });
    console.log('Image built.');
  }

  // Generate fresh TLS test certificates. The cert dir is stored in
  // PLENUM_TEST_CERT_DIR, which is inherited by vitest worker forks.
  console.log('Generating TLS test certificates...');
  certs = generateTestCerts();
  console.log(`TLS certs written to ${certs.dir}`);
}

export async function teardown(): Promise<void> {
  if (certs) {
    cleanupTestCerts(certs);
  }
}
