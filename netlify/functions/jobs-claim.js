const { getDb } = require('./_lib/db');
const { requireAuth } = require('./_lib/auth');
const { loadUserById, userCanAccessBranch } = require('./_lib/users');
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

function mapJob(row) {
  return {
    id: row.id,
    rego: row.rego,
    branch_id: row.branch_id,
    acriss_group: row.acriss_group,
    fuel_eighths: row.fuel_eighths,
    mileage: row.mileage,
    service_type: row.service_type,
    status: row.status,
    intake_by: row.intake_by,
    detailer_id: row.detailer_id,
    notes: row.notes,
    after_notes: row.after_notes,
    returned_at: row.returned_at,
    started_at: row.started_at,
    finished_at: row.finished_at,
    sort_order: row.sort_order,
    created_at: row.created_at,
  };
}

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
      return forbidden('Only detailers can start a clean');
    }

    const jobId = Number(event.queryStringParameters?.id);
    if (!jobId) return badRequest('Job id required');

    const body = parseBody(event);
    const notes = body.notes ? String(body.notes).trim() || null : null;

    const sql = getDb();
    const rows = await sql`SELECT * FROM jobs WHERE id = ${jobId}`;
    if (!rows.length) return notFound('Job not found');

    const job = rows[0];

    if (job.status !== 'awaiting_wash') {
      return conflict('Job is not awaiting wash');
    }

    if (!userCanAccessBranch(caller, job.branch_id)) {
      return forbidden('You are not assigned to this branch');
    }

    const updated = await sql`
      UPDATE jobs SET
        status = 'in_progress',
        detailer_id = ${caller.id},
        service_type = 'Wash',
        notes = ${notes},
        started_at = now()
      WHERE id = ${jobId} AND status = 'awaiting_wash'
      RETURNING *
    `;

    if (!updated.length) {
      return conflict('Job was already claimed by someone else');
    }

    return ok({ job: mapJob(updated[0]) });
  } catch (err) {
    return serverError(err, 'Failed to start clean');
  }
};
