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
    priority: row.priority || 'normal',
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

module.exports = { mapJob };
