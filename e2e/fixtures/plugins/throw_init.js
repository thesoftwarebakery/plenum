exports.init = function init(options) {
  throw new Error("deliberate init failure for testing");
};

exports.handle = function handle(input) {
  return { status: 200, headers: {}, body: null };
};
