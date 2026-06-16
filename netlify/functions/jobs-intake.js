const { getDb } = require('./_lib/db');
const { requireAuth } = require('./_lib/auth');
const { loadUserById, userCanAccessBranch } = require('./_lib/users');
const { getRouteId } = require('./_lib/route-id');
const { mapJob } = require('./_lib/map-job');
const {
  handleOptions,
  parseBody,
  badRequest,
  forbidden,
  notFound,
  ok,
  serverError,
} = require('./_lib/response');

async function sortOrderForPriority(sql, branchId, jobId, priority) {
  if (priority === 'high') {
    const minRows = await sql`
      SELECT MIN(sort_order) AS min_order FROM jobs
      WHERE branch_id = ${branchId} AND status = 'awaiting_wash' AND priority = 'high'
        AND id <> ${jobId}
    `;
    const minOrder = minRows[0].min_order;
    return minOrder != null ? minOrder - 1 : 0;
  }
  const maxRows = await sql`
    SELECT COALESCE(MAX(sort_order), 0)::int AS max_order FROM jobs
    WHERE branch_id = ${branchId} AND status = 'awaiting_wash' AND priority = 'normal'
      AND id <> ${jobId}
  `;
  return maxRows[0].max_order + 1;
}

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
    if (!caller) return forbidden('User not found');

    if (caller.role !== 'cs' && caller.role !== 'admin') {
      return forbidden('Only Customer Service or admin can edit check-ins');
    }

    const jobId = getRouteId(event, 'jobs');
    if (!Number.isFinite(jobId) || jobId <= 0) return badRequest('Job id required');

    const body = parseBody(event);
    const sql = getDb();
    const rows = await sql`SELECT * FROM jobs WHERE id = ${jobId}`;
    if (!rows.length) return notFound('Job not found');

    const job = rows[0];
    if (job.status !== 'awaiting_wash') {
      return badRequest('Check-in can only be edited while awaiting wash');
    }

    if (!userCanAccessBranch(caller, job.branch_id)) {
      return forbidden('You do not have access to this branch');
    }

    const rego = (body.rego || '').toUpperCase().trim();
    if (!rego) return badRequest('Rego required');

    const acriss = body.acriss_group ? String(body.acriss_group).toUpperCase().trim() : null;
    const fuel = body.fuel_eighths != null && body.fuel_eighths !== ''
      ? Number(body.fuel_eighths)
      : null;
    const mileage = body.mileage != null && body.mileage !== ''
      ? Number(body.mileage)
      : null;
    const returnedAt = body.returned_at || job.returned_at;
    let priority = (body.priority || job.priority || 'normal').toLowerCase();
    if (priority !== 'high' && priority !== 'normal') {
      return badRequest('priority must be "high" or "normal"');
    }

    let sortOrder = job.sort_order;
    if (priority !== job.priority) {
      sortOrder = await sortOrderForPriority(sql, job.branch_id, jobId, priority);
    }

    const updated = await sql`
      UPDATE jobs SET
        rego = ${rego},
        acriss_group = ${acriss},
        fuel_eighths = ${fuel},
        mileage = ${mileage},
        returned_at = ${returnedAt},
        priority = ${priority},
        sort_order = ${sortOrder}
      WHERE id = ${jobId} AND status = 'awaiting_wash'
      RETURNING *
    `;

    if (!updated.length) return notFound('Job not found');
    return ok({ job: mapJob(updated[0]) });
  } catch (err) {
    return serverError(err, 'Failed to update check-in');
  }
};
