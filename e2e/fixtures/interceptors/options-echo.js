globalThis.echoOptions = (input) => {
  const opts = input.options ?? {};
  const optsJson = JSON.stringify(opts);
  return { action: "continue", headers: { "x-interceptor-options": optsJson } };
};