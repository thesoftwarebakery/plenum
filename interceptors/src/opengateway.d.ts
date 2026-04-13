/**
 * Type definitions for the OpenGateway interceptor runtime.
 *
 * These APIs are available as globals inside the gateway's JS sandbox.
 * They are NOT standard Web APIs and are NOT part of the Deno CLI.
 *
 * Standard Web Platform APIs (fetch, crypto, URL, TextEncoder, etc.) are
 * available as globals per the WinterTC minimum common API.
 */

declare namespace OpenGateway {
  /** Permission-checked environment variable access. */
  namespace env {
    /**
     * Read an environment variable by name.
     *
     * Requires the variable name to be listed in the interceptor's
     * `allowed_env_vars` permission set.
     *
     * @returns The value, or `undefined` if the variable is not set.
     * @throws If the variable name is not in the allowed list.
     */
    function get(key: string): string | undefined;
  }

  /**
   * Read a file from the filesystem as a UTF-8 string.
   *
   * The path must fall under one of the interceptor's `allowed_read_paths`
   * permission prefixes.
   *
   * @returns The file contents as a string.
   * @throws If the path is not permitted or the file cannot be read.
   */
  function readFile(path: string): string;
}
