export function onRequest(_request) {
  fetch("http://example.com");
  return { action: "continue" };
}
