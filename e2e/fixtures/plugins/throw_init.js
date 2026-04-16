export function init(options) {
  throw new Error("deliberate init failure for testing");
}

export function handle(input) {
  return { status: 200, headers: {}, body: null };
}
