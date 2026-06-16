const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
};

function json(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    body: JSON.stringify(body),
  };
}

function ok(body) {
  return json(200, body);
}

function created(body) {
  return json(201, body);
}

function badRequest(message) {
  return json(400, { error: message });
}

function unauthorized(message = 'Unauthorized') {
  return json(401, { error: message });
}

function forbidden(message = 'Forbidden') {
  return json(403, { error: message });
}

function notFound(message = 'Not found') {
  return json(404, { error: message });
}

function conflict(message) {
  return json(409, { error: message });
}

function serverError(err, fallback = 'Server error') {
  console.error(err);
  const message = err && err.message ? err.message : fallback;
  return json(500, { error: message });
}

function handleOptions(event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS_HEADERS, body: '' };
  }
  return null;
}

function parseBody(event) {
  if (!event.body) return {};
  try {
    return JSON.parse(event.body);
  } catch {
    throw new Error('Invalid JSON body');
  }
}

module.exports = {
  CORS_HEADERS,
  json,
  ok,
  created,
  badRequest,
  unauthorized,
  forbidden,
  notFound,
  conflict,
  serverError,
  handleOptions,
  parseBody,
};
