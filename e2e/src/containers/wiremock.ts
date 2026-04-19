import { GenericContainer, type StartedTestContainer, type StartedNetwork, Wait } from 'testcontainers';

export interface WiremockContainer {
  container: StartedTestContainer;
  baseUrl: string;
  adminUrl: string;
}

export async function startWiremock(opts: {
  network: StartedNetwork;
  alias?: string;
}): Promise<WiremockContainer> {
  const alias = opts.alias ?? 'wiremock';

  const container = await new GenericContainer('wiremock/wiremock:3x')
    .withExposedPorts(8080)
    .withNetwork(opts.network)
    .withNetworkAliases(alias)
    .withWaitStrategy(Wait.forListeningPorts())
    .start();

  const host = container.getHost();
  const port = container.getMappedPort(8080);
  const baseUrl = `http://${host}:${port}`;

  return {
    container,
    baseUrl,
    adminUrl: `${baseUrl}/__admin`,
  };
}
