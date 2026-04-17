exports.onRequest = async function onRequest(req) {
  const resp = await fetch(`http://${req.options.externalHost}/token`);
  const body = await resp.json();
  return {
    action: "continue",
    headers: {
      ...req.headers,
      "x-token": body.token,
    },
  };
};
