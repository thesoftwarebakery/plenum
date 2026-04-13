((globalThis) => {
  const core = globalThis.Deno.core;

  // OpenGateway.env.get(key) -> string | undefined
  // Requires env permission for the key.
  //
  // OpenGateway.readFile(path) -> string
  // Requires read permission for the path.
  globalThis.OpenGateway = {
    env: {
      get(key) {
        return core.ops.op_read_env(key);
      }
    },
    readFile(path) {
      return core.ops.op_read_file(path);
    }
  };

})(globalThis);
