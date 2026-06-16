const jwt = require('jsonwebtoken');
const { unauthorized } = require('./response');

const TOKEN_TTL = '7d';

function getSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET is not configured');
  return secret;
}

function signToken(user) {
  return jwt.sign(
    { sub: user.id, username: user.username, role: user.role },
    getSecret(),
    { expiresIn: TOKEN_TTL }
  );
}

function verifyToken(token) {
  return jwt.verify(token, getSecret());
}

function getBearerToken(event) {
  const header = event.headers.authorization || event.headers.Authorization || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : null;
}

function requireAuth(event) {
  const token = getBearerToken(event);
  if (!token) return { error: unauthorized('Missing authorization token') };
  try {
    const payload = verifyToken(token);
    return { payload };
  } catch (err) {
    console.error(err);
    return { error: unauthorized('Invalid or expired token') };
  }
}

function publicUser(row, branchIds = []) {
  return {
    id: row.id,
    username: row.username,
    full_name: row.full_name,
    role: row.role,
    is_active: row.is_active,
    branch_ids: branchIds,
    created_at: row.created_at,
  };
}

module.exports = {
  signToken,
  verifyToken,
  getBearerToken,
  requireAuth,
  publicUser,
};
