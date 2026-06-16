const { getDb } = require('./_lib/db');
const { requireAuth } = require('./_lib/auth');
const { loadUserById } = require('./_lib/users');
const {
  handleOptions,
  parseBody,
  badRequest,
  forbidden,
  notFound,
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
    if (!caller || caller.role !== 'admin') {
      return forbidden('Admin only');
    }

    const jobId = Number(event.queryStringParameters?.id);
    if (!jobId) return badRequest('Job id required');

    const body = parseBody(event);
    const direction = body.direction;
    if (direction !== 'up' && direction !== 'down') {
      return badRequest('direction must be "up" or "down"');
    }

    const sql = getDb();
    const rows = await sql`SELECT * FROM jobs WHERE id = ${jobId}`;
    if (!rows.length) return notFound('Job not found');

    const job = rows[0];
    if (job.status !== 'awaiting_wash') {
      return badRequest('Only awaiting-wash jobs can be reordered');
    }

    const queue = await sql`
      SELECT id, sort_order FROM jobs
      WHERE branch_id = ${job.branch_id} AND status = 'awaiting_wash'
      ORDER BY sort_order NULLS LAST, returned_at
    `;

    const idx = queue.findIndex((j) => j.id === jobId);
    if (idx < 0) return notFound('Job not in queue');

    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= queue.length) {
      return ok({ job: mapJob(job) });
    }

    const current = queue[idx];
    const neighbor = queue[swapIdx];

    let currentOrder = current.sort_order;
    let neighborOrder = neighbor.sort_order;

    if (currentOrder == null || neighborOrder == null) {
      queue.forEach((j, i) => {
        j.sort_order = i + 1;
      });
      currentOrder = queue[idx].sort_order;
      neighborOrder = queue[swapIdx].sort_order;
    }

    await sql`
      UPDATE jobs SET sort_order = ${neighborOrder} WHERE id = ${current.id}
    `;
    await sql`
      UPDATE jobs SET sort_order = ${currentOrder} WHERE id = ${neighbor.id}
    `;

    const updated = await sql`SELECT * FROM jobs WHERE id = ${jobId}`;
    return ok({ job: mapJob(updated[0]) });
  } catch (err) {
    return serverError(err, 'Failed to reorder job');
  }
};
