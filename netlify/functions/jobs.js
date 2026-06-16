const { getDb } = require('./_lib/db');
const { requireAuth } = require('./_lib/auth');
const {
  loadUserById,
  loadUsersByIds,
  allowedBranchIds,
  userCanAccessBranch,
} = require('./_lib/users');
const { mapJob } = require('./_lib/map-job');
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
      const params = event.queryStringParameters || {};
      const branchFilter = params.branch_id ? Number(params.branch_id) : null;
      const statusFilter = params.status || null;
      const allowed = allowedBranchIds(caller);

      let rows;
      if (allowed === null) {
        if (branchFilter && statusFilter) {
          rows = await sql`
            SELECT * FROM jobs WHERE branch_id = ${branchFilter} AND status = ${statusFilter}
            ORDER BY sort_order NULLS LAST, returned_at
          `;
        } else if (branchFilter) {
          rows = await sql`
            SELECT * FROM jobs WHERE branch_id = ${branchFilter}
            ORDER BY sort_order NULLS LAST, returned_at DESC
          `;
        } else if (statusFilter) {
          rows = await sql`
            SELECT * FROM jobs WHERE status = ${statusFilter}
            ORDER BY sort_order NULLS LAST, returned_at
          `;
        } else {
          rows = await sql`
            SELECT * FROM jobs ORDER BY returned_at DESC NULLS LAST
          `;
        }
      } else {
        if (!allowed.length) return ok({ jobs: [], users: [] });
        if (branchFilter && !allowed.includes(branchFilter)) {
          return forbidden('You do not have access to this branch');
        }
        const ids = branchFilter ? [branchFilter] : allowed;
        if (statusFilter) {
          rows = await sql`
            SELECT * FROM jobs
            WHERE branch_id = ANY(${ids}) AND status = ${statusFilter}
            ORDER BY sort_order NULLS LAST, returned_at
          `;
        } else {
          rows = await sql`
            SELECT * FROM jobs
            WHERE branch_id = ANY(${ids})
            ORDER BY returned_at DESC NULLS LAST
          `;
        }
      }

      const jobs = rows.map(mapJob);
      const userIdSet = new Set();
      for (const j of jobs) {
        if (j.intake_by) userIdSet.add(j.intake_by);
        if (j.detailer_id) userIdSet.add(j.detailer_id);
      }
      const users = await loadUsersByIds([...userIdSet]);

      return ok({ jobs, users });
    }

    if (event.httpMethod === 'POST') {
      if (caller.role !== 'cs' && caller.role !== 'admin') {
        return forbidden('Only Customer Service or admin can check in vehicles');
      }

      const body = parseBody(event);
      const rego = (body.rego || '').toUpperCase().trim();
      const branchId = Number(body.branch_id);
      if (!rego) return badRequest('Rego required');
      if (!branchId) return badRequest('Branch required');

      if (!userCanAccessBranch(caller, branchId)) {
        return forbidden('You do not have access to this branch');
      }

      const acriss = body.acriss_group ? String(body.acriss_group).toUpperCase().trim() : null;
      const fuel = body.fuel_eighths != null && body.fuel_eighths !== ''
        ? Number(body.fuel_eighths)
        : null;
      const mileage = body.mileage != null && body.mileage !== ''
        ? Number(body.mileage)
        : null;
      const returnedAt = body.returned_at || new Date().toISOString();
      let priority = (body.priority || 'normal').toLowerCase();
      if (priority !== 'high' && priority !== 'normal') {
        return badRequest('priority must be "high" or "normal"');
      }

      let sortOrder;
      if (priority === 'high') {
        const minRows = await sql`
          SELECT MIN(sort_order) AS min_order FROM jobs
          WHERE branch_id = ${branchId} AND status = 'awaiting_wash' AND priority = 'high'
        `;
        const minOrder = minRows[0].min_order;
        sortOrder = minOrder != null ? minOrder - 1 : 0;
      } else {
        const maxRows = await sql`
          SELECT COALESCE(MAX(sort_order), 0)::int AS max_order
          FROM jobs
          WHERE branch_id = ${branchId} AND status = 'awaiting_wash' AND priority = 'normal'
        `;
        sortOrder = maxRows[0].max_order + 1;
      }

      const rows = await sql`
        INSERT INTO jobs (
          rego, branch_id, acriss_group, fuel_eighths, mileage,
          intake_by, returned_at, status, sort_order, priority
        ) VALUES (
          ${rego}, ${branchId}, ${acriss}, ${fuel}, ${mileage},
          ${caller.id}, ${returnedAt}, 'awaiting_wash', ${sortOrder}, ${priority}
        )
        RETURNING *
      `;

      return created({ job: mapJob(rows[0]) });
    }

    return badRequest('Method not allowed');
  } catch (err) {
    return serverError(err, 'Jobs request failed');
  }
};
