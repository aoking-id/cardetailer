const bcrypt = require('bcryptjs');
const { loadUserByUsername } = require('./_lib/users');
const { signToken, publicUser } = require('./_lib/auth');
const {
  handleOptions,
  parseBody,
  badRequest,
  unauthorized,
  ok,
  serverError,
} = require('./_lib/response');

exports.handler = async (event) => {
  const options = handleOptions(event);
  if (options) return options;

  if (event.httpMethod !== 'POST') {
    return badRequest('Method not allowed');
  }

  try {
    const body = parseBody(event);
    const username = (body.username || '').toLowerCase().trim();
    const password = body.password || '';

    if (!username || !password) {
      return badRequest('Username and password required');
    }

    const user = await loadUserByUsername(username);
    if (!user) {
      return unauthorized('Invalid credentials');
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return unauthorized('Invalid credentials');
    }

    if (!user.is_active) {
      return unauthorized('Account deactivated. Contact admin.');
    }

    if (user.role !== 'admin' && (!user.branch_ids || !user.branch_ids.length)) {
      return unauthorized('No branches assigned. Contact admin.');
    }

    const token = signToken(user);
    const { password_hash, ...safeUser } = user;

    return ok({
      token,
      user: publicUser(safeUser, user.branch_ids),
    });
  } catch (err) {
    return serverError(err, 'Login failed');
  }
};
