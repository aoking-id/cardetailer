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

exports.handler = async (event) => {
  const options = handleOptions(event);
  if (options) return options;

  if (event.httpMethod !== 'POST') {
    return badRequest('Method not allowed');
  }

  try {
    const auth = requireAuth(event);
    if (auth.error) return auth.error;

    const caller = await loadUserById(auth.payload.sub);
    if (!caller) return forbidden('User not found');

    if (caller.role !== 'admin' && caller.role !== 'cs') {
      return forbidden('Only admin or customer service can change priority');
    }

    const jobId = getRouteId(event, 'jobs');
    if (!Number.isFinite(jobId) || jobId <= 0) return badRequest('Job id required');

    const body = parseBody(event);
    const priority = (body.priority || '').toLowerCase();
    if (priority !== 'high' && priority !== 'normal') {
      return badRequest('priority must be "high" or "normal"');
    }

    const sql = getDb();
    const rows = await sql`SELECT * FROM jobs WHERE id = ${jobId}`;
    if (!rows.length) return notFound('Job not found');

    const job = rows[0];
    if (job.status !== 'awaiting_wash') {
      return badRequest('Priority can only be changed while awaiting wash');
    }

    if (!userCanAccessBranch(caller, job.branch_id)) {
      return forbidden('You do not have access to this branch');
    }

    let sortOrder;
    if (priority === 'high') {
      const minRows = await sql`
        SELECT MIN(sort_order) AS min_order FROM jobs
        WHERE branch_id = ${job.branch_id} AND status = 'awaiting_wash' AND priority = 'high'
          AND id <> ${jobId}
      `;
      const minOrder = minRows[0].min_order;
      sortOrder = minOrder != null ? minOrder - 1 : 0;
    } else {
      const maxRows = await sql`
        SELECT COALESCE(MAX(sort_order), 0)::int AS max_order FROM jobs
        WHERE branch_id = ${job.branch_id} AND status = 'awaiting_wash' AND priority = 'normal'
          AND id <> ${jobId}
      `;
      sortOrder = maxRows[0].max_order + 1;
    }

    const updated = await sql`
      UPDATE jobs SET priority = ${priority}, sort_order = ${sortOrder}
      WHERE id = ${jobId} AND status = 'awaiting_wash'
      RETURNING *
    `;

    if (!updated.length) return notFound('Job not found');
    return ok({ job: mapJob(updated[0]) });
  } catch (err) {
    return serverError(err, 'Failed to update priority');
  }
};
