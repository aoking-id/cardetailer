const { requireAuth } = require('./_lib/auth');
const { loadUserById } = require('./_lib/users');
const { handleOptions, unauthorized, ok, serverError } = require('./_lib/response');

exports.handler = async (event) => {
  const options = handleOptions(event);
  if (options) return options;

  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const auth = requireAuth(event);
    if (auth.error) return auth.error;

    const user = await loadUserById(auth.payload.sub);
    if (!user || !user.is_active) {
      return unauthorized('User not found or inactive');
    }

    return ok({ user });
  } catch (err) {
    return serverError(err, 'Failed to load profile');
  }
};
