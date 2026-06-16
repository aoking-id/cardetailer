const { getDb } = require('./_lib/db');
const { requireAuth } = require('./_lib/auth');
const { loadUserById } = require('./_lib/users');
const { getRouteId } = require('./_lib/route-id');
const {
  handleOptions,
  parseBody,
  badRequest,
  forbidden,
  notFound,
  ok,
  serverError,
} = require('./_lib/response');

exports.handler = async (event) => {
  const options = handleOptions(event);
  if (options) return options;

  try {
    const auth = requireAuth(event);
    if (auth.error) return auth.error;

    const caller = await loadUserById(auth.payload.sub);
    if (!caller || caller.role !== 'admin') return forbidden('Admin only');

    const branchId = getRouteId(event, 'branches');
    if (!Number.isFinite(branchId) || branchId <= 0) return badRequest('Branch id required');

    const sql = getDb();

    if (event.httpMethod === 'PATCH') {
      const body = parseBody(event);
      const name = (body.name || '').trim();
      if (!name) return badRequest('Name required');

      const existing = await sql`
        SELECT id FROM branches WHERE lower(name) = lower(${name}) AND id <> ${branchId}
      `;
      if (existing.length) return badRequest('Another branch already uses that name');

      const rows = await sql`
        UPDATE branches SET name = ${name} WHERE id = ${branchId}
        RETURNING id, name, created_at
      `;
      if (!rows.length) return notFound('Branch not found');
      return ok({ branch: rows[0] });
    }

    if (event.httpMethod === 'DELETE') {
      const jobCount = await sql`
        SELECT count(*)::int AS count FROM jobs WHERE branch_id = ${branchId}
      `;
      if (jobCount[0].count > 0) {
        return badRequest('Cannot delete branch: it has jobs');
      }

      const rows = await sql`DELETE FROM branches WHERE id = ${branchId} RETURNING id`;
      if (!rows.length) return notFound('Branch not found');
      return ok({ deleted: true });
    }

    return badRequest('Method not allowed');
  } catch (err) {
    return serverError(err, 'Branch update failed');
  }
};
