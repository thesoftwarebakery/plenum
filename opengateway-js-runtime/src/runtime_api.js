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

})(globalThis);
