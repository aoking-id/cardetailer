/** Resolve :id from query string or original request path (Netlify redirects). */
function getRouteId(event, segment) {
  const qs = event.queryStringParameters || {};
  if (qs.id != null && qs.id !== '') return Number(qs.id);

  const headers = event.headers || {};
  const original =
    headers['x-netlify-original-path'] ||
    headers['X-Netlify-Original-Path'] ||
    headers['x-forwarded-uri'] ||
    '';

  const sources = [original, event.rawPath, event.path, event.rawUrl || ''].filter(Boolean);
  const pattern = new RegExp('/' + segment + '/(\\d+)');

  for (const src of sources) {
    const m = String(src).match(pattern);
    if (m) return Number(m[1]);
  }

  return NaN;
}

module.exports = { getRouteId };
