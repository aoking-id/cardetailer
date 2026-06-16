const bcrypt = require('bcryptjs');
const { getDb } = require('./_lib/db');
const { requireAuth } = require('./_lib/auth');
const { loadUserById, loadAllUsers, setUserBranches } = require('./_lib/users');
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
    if (!caller || caller.role !== 'admin') return forbidden('Admin only');

    if (event.httpMethod === 'GET') {
      const users = await loadAllUsers();
      return ok({ users });
    }

    if (event.httpMethod === 'POST') {
      const body = parseBody(event);
      const username = (body.username || '').toLowerCase().trim();
      const password = body.password || '';
      const fullName = (body.full_name || body.fullName || '').trim() || null;
      const role = body.role;
      const branchIds = Array.isArray(body.branch_ids) ? body.branch_ids.map(Number) : [];

      if (!username || !password) return badRequest('Username and password required');
      if (password.length < 4) return badRequest('Password too short');
      if (!['admin', 'cs', 'detailer'].includes(role)) return badRequest('Invalid role');
      if (role !== 'admin' && !branchIds.length) {
        return badRequest('Non-admin users need at least one branch');
      }

      const sql = getDb();
      const existing = await sql`SELECT id FROM users WHERE username = ${username}`;
      if (existing.length) return badRequest('Username already taken');

      const hash = await bcrypt.hash(password, 10);
      const rows = await sql`
        INSERT INTO users (username, password_hash, full_name, role, is_active)
        VALUES (${username}, ${hash}, ${fullName}, ${role}, true)
        RETURNING id, username, full_name, role, is_active, created_at
      `;
      const user = rows[0];
      if (branchIds.length) {
        await setUserBranches(user.id, branchIds);
      }

      const full = await loadUserById(user.id);
      return created({ user: full });
    }

    return badRequest('Method not allowed');
  } catch (err) {
    return serverError(err, 'Users request failed');
  }
};
