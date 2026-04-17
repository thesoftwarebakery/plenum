// Stub for ext:deno_node/internal/timers.mjs
var kTimerId = Symbol("kTimerId");
var kDestroy = Symbol("kDestroy");

function Timeout() {
  this[kTimerId] = 0;
}
Timeout.prototype.ref = function() { return this; };
Timeout.prototype.unref = function() { return this; };
Timeout.prototype.hasRef = function() { return false; };

function getActiveTimer() {
  return undefined;
}

export { Timeout, kTimerId, getActiveTimer, kDestroy };
