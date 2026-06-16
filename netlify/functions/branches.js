const { getDb } = require('./_lib/db');
const { requireAuth } = require('./_lib/auth');
const { loadUserById } = require('./_lib/users');
const {
  handleOptions,
  parseBody,
  badRequest,
  forbidden,
  ok,
  created,
  serverError,
} = require('./_lib/response');

exports.handler = async (event) => {
  const options = handleOptions(event);
  if (options) return options;

  try {
    const auth = requireAuth(event);
    if (auth.error) return auth.error;

    const caller = await loadUserById(auth.payload.sub);
    if (!caller) return forbidden('User not found');

    const sql = getDb();

    if (event.httpMethod === 'GET') {
      const branches = await sql`SELECT id, name, created_at FROM branches ORDER BY name`;
      return ok({ branches });
    }

    if (event.httpMethod === 'POST') {
      if (caller.role !== 'admin') return forbidden('Admin only');
      const body = parseBody(event);
      const name = (body.name || '').trim();
      if (!name) return badRequest('Name required');

      const existing = await sql`SELECT id FROM branches WHERE lower(name) = lower(${name})`;
      if (existing.length) return badRequest('Branch already exists');

      const rows = await sql`
        INSERT INTO branches (name) VALUES (${name})
        RETURNING id, name, created_at
      `;
      return created({ branch: rows[0] });
    }

    return badRequest('Method not allowed');
  } catch (err) {
    return serverError(err, 'Branches request failed');
  }
};
