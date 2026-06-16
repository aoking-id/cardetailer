const bcrypt = require('bcryptjs');
const { getDb } = require('./_lib/db');
const { requireAuth } = require('./_lib/auth');
const { loadUserById, setUserBranches } = require('./_lib/users');
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

  if (event.httpMethod !== 'PATCH') {
    return badRequest('Method not allowed');
  }

  try {
    const auth = requireAuth(event);
    if (auth.error) return auth.error;

    const caller = await loadUserById(auth.payload.sub);
    if (!caller || caller.role !== 'admin') return forbidden('Admin only');

    const userId = getRouteId(event, 'users');
    if (!Number.isFinite(userId) || userId <= 0) return badRequest('User id required');

    const target = await loadUserById(userId);
    if (!target) return notFound('User not found');

    const body = parseBody(event);
    const role = body.role !== undefined ? body.role : target.role;
    const isActive = body.is_active !== undefined ? Boolean(body.is_active) : target.is_active;
    const branchIds = body.branch_ids !== undefined
      ? body.branch_ids.map(Number)
      : target.branch_ids;
    const newPassword = body.password || '';

    if (!['admin', 'cs', 'detailer'].includes(role)) return badRequest('Invalid role');
    if (role !== 'admin' && !branchIds.length) {
      return badRequest('Non-admin users need at least one branch');
    }

    const sql = getDb();
    if (newPassword) {
      if (newPassword.length < 4) return badRequest('Password too short');
      const hash = await bcrypt.hash(newPassword, 10);
      await sql`
        UPDATE users SET role = ${role}, is_active = ${isActive}, password_hash = ${hash}
        WHERE id = ${userId}
      `;
    } else {
      await sql`
        UPDATE users SET role = ${role}, is_active = ${isActive}
        WHERE id = ${userId}
      `;
    }

    await setUserBranches(userId, role === 'admin' ? [] : branchIds);

    const updated = await loadUserById(userId);
    return ok({ user: updated });
  } catch (err) {
    return serverError(err, 'User update failed');
  }
};
