const { getDb } = require('./_lib/db');
const { requireAuth } = require('./_lib/auth');
const { loadUserById } = require('./_lib/users');
const { getRouteId } = require('./_lib/route-id');
const { mapJob } = require('./_lib/map-job');
const {
  handleOptions,
  parseBody,
  badRequest,
  forbidden,
  notFound,
  conflict,
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

    if (caller.role !== 'detailer') {
      return forbidden('Only detailers can finish a clean');
    }

    const jobId = getRouteId(event, 'jobs');
    if (!Number.isFinite(jobId) || jobId <= 0) return badRequest('Job id required');

    const body = parseBody(event);
    const afterNotes = body.after_notes ? String(body.after_notes).trim() || null : null;

    const sql = getDb();
    const rows = await sql`SELECT * FROM jobs WHERE id = ${jobId}`;
    if (!rows.length) return notFound('Job not found');

    const job = rows[0];

    if (job.status !== 'in_progress') {
      return conflict('Job is not in progress');
    }

    if (job.detailer_id !== caller.id) {
      return forbidden('You can only finish jobs you started');
    }

    const updated = await sql`
      UPDATE jobs SET
        status = 'done',
        after_notes = ${afterNotes},
        finished_at = now()
      WHERE id = ${jobId} AND status = 'in_progress' AND detailer_id = ${caller.id}
      RETURNING *
    `;

    if (!updated.length) {
      return conflict('Job could not be finished');
    }

    return ok({ job: mapJob(updated[0]) });
  } catch (err) {
    return serverError(err, 'Failed to finish clean');
  }
};
