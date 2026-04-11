import { GenericContainer } from "testcontainers";
import { resolve, dirname, fromFileUrl } from "@std/path";

if (!Deno.env.get("CI")) {
  const contextDir = resolve(dirname(fromFileUrl(import.meta.url)), "../..");
  console.log("Building opengateway:latest image...");
  await GenericContainer.fromDockerfile(contextDir).build(
    "opengateway:latest",
    { deleteOnExit: false },
  );
  console.log("Image built.");
}

Deno.exit(0);
