export interface StubMapping {
  request: {
    method: string;
    urlPath: string;
  };
  response: {
    status: number;
    body?: string;
    jsonBody?: unknown;
    headers?: Record<string, string>;
  };
}

export class WireMockClient {
  private adminUrl: string;

  constructor(adminUrl: string) {
    this.adminUrl = adminUrl;
  }

  async stubFor(mapping: StubMapping): Promise<void> {
    const resp = await fetch(`${this.adminUrl}/mappings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(mapping),
    });
    if (!resp.ok) {
      const body = await resp.text();
      throw new Error(`WireMock stubFor failed (${resp.status}): ${body}`);
    }
    await resp.body?.cancel();
  }

  async reset(): Promise<void> {
    const resp = await fetch(`${this.adminUrl}/mappings`, {
      method: "DELETE",
    });
    if (!resp.ok) {
      const body = await resp.text();
      throw new Error(`WireMock reset failed (${resp.status}): ${body}`);
    }
    await resp.body?.cancel();
  }

  async getRequests(): Promise<WireMockRequest[]> {
    const resp = await fetch(`${this.adminUrl}/requests`);
    if (!resp.ok) {
      const body = await resp.text();
      throw new Error(`WireMock getRequests failed (${resp.status}): ${body}`);
    }
    const data = await resp.json() as { requests: WireMockRequest[] };
    return data.requests;
  }

  async resetRequests(): Promise<void> {
    const resp = await fetch(`${this.adminUrl}/requests`, {
      method: "DELETE",
    });
    if (!resp.ok) {
      const body = await resp.text();
      throw new Error(`WireMock resetRequests failed (${resp.status}): ${body}`);
    }
    await resp.body?.cancel();
  }
}

export interface WireMockRequest {
  request: {
    method: string;
    url: string;
    headers: Record<string, string>;
    body?: string;
  };
}
