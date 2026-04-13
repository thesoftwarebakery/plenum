export function onResponse(_response) {
  return {
    action: "continue",
    status: 203,
    headers: { "x-added-by-interceptor": "yes", "x-remove-me": null },
  };
}
