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

    const updated = await sql`
      UPDATE jobs SET priority = ${priority}
      WHERE id = ${jobId} AND status = 'awaiting_wash'
      RETURNING *
    `;

    if (!updated.length) return notFound('Job not found');
    return ok({ job: mapJob(updated[0]) });
  } catch (err) {
    return serverError(err, 'Failed to update priority');
  }
};
