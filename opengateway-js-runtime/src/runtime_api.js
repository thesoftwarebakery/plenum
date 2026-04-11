((globalThis) => {
  // Deno.env.get(key) -> string | undefined
  // Requires env permission for the key.
  const Deno = globalThis.Deno || {};
  Deno.env = {
    get(key) {
      return Deno.core.ops.op_read_env(key);
    }
  };
  globalThis.Deno = Deno;

  // readFile(path) -> string
  // Requires read permission for the path.
  globalThis.readFile = function(path) {
    return Deno.core.ops.op_read_file(path);
  };

  // fetch(url, options?) -> Promise<Response-like>
  // Synchronous under the hood (ureq blocks). Supports GET and POST.
  // Only the host needs to be in net permissions.
  globalThis.fetch = function(url, opts) {
    const method = (opts && opts.method) || 'GET';
    const body = (opts && opts.body) || '';
    try {
      const result = Deno.core.ops.op_fetch(url, method, body);
      return Promise.resolve({
        ok: result.status >= 200 && result.status < 300,
        status: result.status,
        headers: new Map(Object.entries(result.headers || {})),
        text() { return Promise.resolve(result.body); },
        json() { return Promise.resolve(JSON.parse(result.body)); }
      });
    } catch (e) {
      return Promise.reject(e);
    }
  };
})(globalThis);
