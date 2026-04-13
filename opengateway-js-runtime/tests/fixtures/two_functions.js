export function hello(input) {
  return { action: "continue", greeting: "hi " + input.name };
}

export function goodbye(input) {
  return { action: "continue", farewell: "bye " + input.name };
}
