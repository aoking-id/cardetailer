const { getDb } = require('./db');
const { publicUser } = require('./auth');

async function loadUserBranchIds(userId) {
  const sql = getDb();
  const rows = await sql`
    SELECT branch_id FROM user_branches WHERE user_id = ${userId}
  `;
  return rows.map((r) => r.branch_id);
}

async function setUserBranches(userId, branchIds) {
  const sql = getDb();
  await sql`DELETE FROM user_branches WHERE user_id = ${userId}`;
  for (const branchId of branchIds) {
    await sql`
      INSERT INTO user_branches (user_id, branch_id) VALUES (${userId}, ${branchId})
    `;
  }
}

async function loadUserById(userId) {
  const sql = getDb();
  const rows = await sql`
    SELECT id, username, full_name, role, is_active, created_at
    FROM users WHERE id = ${userId}
  `;
  if (!rows.length) return null;
  const branchIds = await loadUserBranchIds(userId);
  return publicUser(rows[0], branchIds);
}

async function loadUserByUsername(username) {
  const sql = getDb();
  const rows = await sql`
    SELECT id, username, password_hash, full_name, role, is_active, created_at
    FROM users WHERE username = ${username}
  `;
  if (!rows.length) return null;
  const branchIds = await loadUserBranchIds(rows[0].id);
  return { ...rows[0], branch_ids: branchIds };
}

async function loadAllUsers() {
  const sql = getDb();
  const users = await sql`
    SELECT id, username, full_name, role, is_active, created_at
    FROM users ORDER BY username
  `;
  const branches = await sql`SELECT user_id, branch_id FROM user_branches`;
  const byUser = {};
  for (const row of branches) {
    if (!byUser[row.user_id]) byUser[row.user_id] = [];
    byUser[row.user_id].push(row.branch_id);
  }
  return users.map((u) => publicUser(u, byUser[u.id] || []));
}

async function loadUsersByIds(ids) {
  if (!ids.length) return [];
  const sql = getDb();
  const users = await sql`
    SELECT id, username, full_name, role, is_active, created_at
    FROM users WHERE id = ANY(${ids})
  `;
  return users.map((u) => publicUser(u, []));
}

function userCanAccessBranch(user, branchId) {
  if (user.role === 'admin') return true;
  return (user.branch_ids || []).includes(branchId);
}

function allowedBranchIds(user) {
  if (user.role === 'admin') return null;
  return user.branch_ids || [];
}

module.exports = {
  loadUserById,
  loadUserByUsername,
  loadAllUsers,
  loadUsersByIds,
  loadUserBranchIds,
  setUserBranches,
  userCanAccessBranch,
  allowedBranchIds,
};
