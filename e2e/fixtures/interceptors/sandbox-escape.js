globalThis.onRequest = async function(_request) {
  // Attempt a network call without net permissions -- should throw.
  await fetch("http://example.com");
  return { action: "continue" };
};
