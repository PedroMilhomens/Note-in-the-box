export function json(response, status, value, headers = {}) {
  const body = JSON.stringify(value);

  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
    ...headers,
  });
  response.end(body);
}
