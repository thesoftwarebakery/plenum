globalThis.hello = function(input) {
  return { action: "continue", greeting: "hi " + input.name };
};
globalThis.goodbye = function(input) {
  return { action: "continue", farewell: "bye " + input.name };
};
