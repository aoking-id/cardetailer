(() => {
  const K_SESSION = 'cd_session';
  const ALL_BRANCHES = -1;

  const load = (k, fallback) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fallback; } catch { return fallback; } };
  const save = (k, v) => localStorage.setItem(k, JSON.stringify(v));

  let branches = [];
  let users = [];
  let jobs = [];
  let session = load(K_SESSION, null);
  let me = null;
  let loading = false;
  let loadError = '';

  const getUser = (id) => users.find(u => u.id === id) || null;
  const getBranch = (id) => branches.find(b => b.id === id) || null;
  const currentUser = () => me;
  const activeBranchId = () => session ? session.active_branch_id : null;

  const $ = (sel) => document.querySelector(sel);
  const escapeHtml = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const fmtDate = (iso) => iso ? new Date(iso).toLocaleString() : '—';
  const durationMins = (startIso, endIso) => {
    if (!startIso) return '';
    const start = new Date(startIso);
    const end = endIso ? new Date(endIso) : new Date();
    const mins = Math.max(0, Math.round((end - start) / 60000));
    if (mins < 60) return mins + 'm';
    return Math.floor(mins/60) + 'h ' + (mins % 60) + 'm';
  };
  const fmtMinutes = (mins) => {
    if (mins == null || !isFinite(mins)) return '—';
    const m = Math.round(mins);
    if (m < 60) return m + 'm';
    return Math.floor(m/60) + 'h ' + (m % 60) + 'm';
  };
  const statusBadge = (s) => s === 'done' ? '<span class="badge clean">Clean</span>' : '<span class="badge dirty">Dirty</span>';
  const branchName = (id) => { const b = getBranch(id); return b ? b.name : '—'; };
  const showBranchCol = () => {
    if (activeBranchId() === ALL_BRANCHES) return true;
    const u = currentUser();
    return u && (u.role === 'admin' || (u.branch_ids || []).length > 1);
  };

  function mergeUsers(extra) {
    for (const u of extra || []) {
      if (!users.some(x => x.id === u.id)) users.push(u);
    }
  }

  function setLoading(on) {
    loading = on;
    document.body.classList.toggle('is-loading', on);
    const banner = $('#app-banner');
    if (!me) { banner.style.display = 'none'; return; }
    banner.style.display = '';
    if (on) {
      banner.innerHTML = '<strong>Loading…</strong>';
    } else if (loadError) {
      banner.innerHTML = '<strong>Error:</strong> ' + escapeHtml(loadError);
    } else {
      banner.style.display = 'none';
    }
  }

  async function loadAllData() {
    setLoading(true);
    loadError = '';
    try {
      const [branchRes, jobRes] = await Promise.all([
        api.getBranches(),
        api.getJobs(),
      ]);
      branches = branchRes.branches || [];
      jobs = jobRes.jobs || [];
      users = me && me.role === 'admin' ? [] : (me ? [me] : []);
      mergeUsers(jobRes.users || []);
      if (me && me.role === 'admin') {
        const userRes = await api.getUsers();
        users = userRes.users || [];
      }
    } catch (err) {
      loadError = err.message || 'Failed to load data';
      throw err;
    } finally {
      setLoading(false);
    }
  }

  async function loadJobsOnly() {
    const jobRes = await api.getJobs();
    jobs = jobRes.jobs || [];
    mergeUsers(jobRes.users || []);
  }

  async function refreshAll() {
    try {
      await loadAllData();
      renderAll();
    } catch {
      renderAll();
    }
  }

  // ===== Login =====
  $('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('#login-error');
    err.textContent = '';
    const username = $('#li-username').value.toLowerCase().trim();
    const password = $('#li-password').value;
    const btn = e.target.querySelector('button[type=submit]');
    btn.disabled = true;
    try {
      const result = await api.login(username, password);
      api.setToken(result.token);
      me = result.user;
      const initialBranch = me.role === 'admin' ? ALL_BRANCHES : me.branch_ids[0];
      session = { user_id: me.id, active_branch_id: initialBranch };
      save(K_SESSION, session);
      await enterApp();
    } catch (ex) {
      err.textContent = ex.message || 'Login failed';
    } finally {
      btn.disabled = false;
    }
  });

  $('#signout').addEventListener('click', () => {
    api.setToken(null);
    session = null;
    me = null;
    localStorage.removeItem(K_SESSION);
    location.reload();
  });

  $('#refresh').addEventListener('click', () => refreshAll());

  $('#branch-switcher').addEventListener('change', (e) => {
    session.active_branch_id = Number(e.target.value);
    save(K_SESSION, session);
    renderAll();
  });

  async function enterApp() {
    const u = currentUser();
    if (!u) return;
    await loadAllData();
    $('#screen-auth').style.display = 'none';
    $('#screen-app').style.display = '';
    document.body.classList.toggle('role-detailer', u.role === 'detailer');
    const rolePill = '<span class="role-pill ' + (u.role === 'admin' ? 'admin' : '') + '">' + u.role + '</span>';
    $('#who').innerHTML = escapeHtml(u.full_name || u.username) + ' ' + rolePill;

    const pill = $('#branch-pill'), switcher = $('#branch-switcher');
    if (u.role === 'admin') {
      pill.style.display = 'none';
      switcher.style.display = '';
      switcher.innerHTML = ['<option value="' + ALL_BRANCHES + '">All branches</option>',
        ...branches.map(b => '<option value="' + b.id + '">' + escapeHtml(b.name) + '</option>')].join('');
      switcher.value = String(session.active_branch_id);
    } else {
      const myBranches = (u.branch_ids || []).map(getBranch).filter(Boolean);
      if (myBranches.length <= 1) {
        pill.style.display = '';
        switcher.style.display = 'none';
        pill.textContent = myBranches[0] ? myBranches[0].name : '— no branch —';
      } else {
        pill.style.display = 'none';
        switcher.style.display = '';
        switcher.innerHTML = myBranches.map(b => '<option value="' + b.id + '">' + escapeHtml(b.name) + '</option>').join('');
        if (!myBranches.some(b => b.id === session.active_branch_id)) {
          session.active_branch_id = myBranches[0].id;
          save(K_SESSION, session);
        }
        switcher.value = String(session.active_branch_id);
      }
    }

    if (u.role === 'cs') {
      $('#cs-form').style.display = '';
      $('#non-cs-note').style.display = 'none';
      const nowLocal = new Date(Date.now() - new Date().getTimezoneOffset()*60000).toISOString().slice(0,16);
      $('#i-time').value = nowLocal;
    } else {
      $('#cs-form').style.display = 'none';
      $('#non-cs-note').style.display = '';
    }

    const isAdmin = u.role === 'admin';
    $('#nav-admin').style.display = isAdmin ? '' : 'none';
    $('#nav-dashboard').style.display = isAdmin ? '' : 'none';

    if (isAdmin) showView('dashboard'); else showView('washlist');
    renderAll();
  }

  // ===== Nav & Help =====
  let lastView = 'washlist';

  function showHelp() {
    $('#screen-help').style.display = '';
    $('#help-back').textContent = me ? 'Back to app' : 'Back to login';
    if (me) {
      $('#nav-dashboard').classList.remove('active');
      $('#nav-washlist').classList.remove('active');
      $('#nav-checkin').classList.remove('active');
      $('#nav-admin').classList.remove('active');
      $('#nav-help').classList.add('active');
    }
    window.scrollTo(0, 0);
  }

  function hideHelp() {
    $('#screen-help').style.display = 'none';
    if (me) showView(lastView);
    else $('#screen-auth').style.display = '';
  }

  $('#auth-help').addEventListener('click', () => {
    $('#screen-auth').style.display = 'none';
    showHelp();
  });
  $('#help-back').addEventListener('click', hideHelp);
  $('#nav-help').addEventListener('click', showHelp);

  const viewDash = $('#view-dashboard'), viewWash = $('#view-washlist'), viewCheck = $('#view-checkin'), viewAdmin = $('#view-admin');
  function showView(name) {
    lastView = name;
    viewDash.style.display  = name === 'dashboard' ? '' : 'none';
    viewWash.style.display  = name === 'washlist' ? '' : 'none';
    viewCheck.style.display = name === 'checkin' ? '' : 'none';
    viewAdmin.style.display = name === 'admin' ? '' : 'none';
    $('#nav-dashboard').classList.toggle('active', name === 'dashboard');
    $('#nav-washlist').classList.toggle('active', name === 'washlist');
    $('#nav-checkin').classList.toggle('active', name === 'checkin');
    $('#nav-admin').classList.toggle('active', name === 'admin');
    $('#nav-help').classList.remove('active');
    if (name === 'dashboard') renderDashboard();
    if (name === 'admin') renderAdmin();
  }
  $('#nav-dashboard').addEventListener('click', () => showView('dashboard'));
  $('#nav-washlist').addEventListener('click', () => { showView('washlist'); refreshAll(); });
  $('#nav-checkin').addEventListener('click', () => { showView('checkin'); refreshAll(); });
  $('#nav-admin').addEventListener('click', () => showView('admin'));

  // ===== Check-in form =====
  $('#intake-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const user = currentUser();
    if (!user || user.role !== 'cs') return;
    const branchId = activeBranchId();
    if (!branchId || branchId === ALL_BRANCHES) return;
    const err = $('#intake-error');
    err.textContent = '';
    const ok = $('#intake-success');
    ok.textContent = '';
    const rego = $('#i-rego').value.toUpperCase().trim();
    if (!rego) { err.textContent = 'Rego required'; return; }
    const acriss = ($('#i-acriss').value || '').toUpperCase().trim() || null;
    const fuelRaw = $('#i-fuel').value;
    const fuel = fuelRaw === '' ? null : Number(fuelRaw);
    const mileageRaw = $('#i-mileage').value;
    const mileage = mileageRaw === '' ? null : Number(mileageRaw);
    const timeRaw = $('#i-time').value;
    const returned_at = timeRaw ? new Date(timeRaw).toISOString() : new Date().toISOString();
    const priority = $('#i-priority').checked ? 'high' : 'normal';

    try {
      await api.createJob({
        rego, branch_id: branchId, acriss_group: acriss,
        fuel_eighths: fuel, mileage, returned_at, priority,
      });
      $('#intake-form').reset();
      const nowLocal = new Date(Date.now() - new Date().getTimezoneOffset()*60000).toISOString().slice(0,16);
      $('#i-time').value = nowLocal;
      ok.textContent = 'Checked in at ' + branchName(branchId) + '. Added to wash queue.';
      setTimeout(() => ok.textContent = '', 2500);
      await refreshAll();
    } catch (ex) {
      err.textContent = ex.message || 'Check-in failed';
    }
  });

  function branchScoped(jobsList) {
    const bid = activeBranchId();
    if (bid === ALL_BRANCHES) return jobsList.slice();
    return jobsList.filter(j => j.branch_id === bid);
  }

  // ===== Render =====
  function washHeadHtml() {
    const branchHeader = showBranchCol() ? '<th>Branch</th>' : '';
    return '<tr>' + branchHeader + '<th></th><th>Rego</th><th>ACRISS</th><th>Checked-in</th><th>Waiting</th><th>Logged by</th><th></th><th>Status</th></tr>';
  }
  function ipHeadHtml() {
    const branchHeader = showBranchCol() ? '<th>Branch</th>' : '';
    return '<tr>' + branchHeader + '<th>Rego</th><th>Detailer</th><th>Started</th><th>Elapsed</th><th>Notes</th><th></th><th>Status</th></tr>';
  }
  function doneHeadHtml() {
    const branchHeader = showBranchCol() ? '<th>Branch</th>' : '';
    return '<tr>' + branchHeader + '<th>Rego</th><th>ACRISS</th><th>Checked-in</th><th>Intake by</th><th>Detailer</th><th>Started</th><th>Finished</th><th>Duration</th><th>Notes</th><th>Status</th></tr>';
  }
  function checkinHeadHtml() {
    const branchHeader = showBranchCol() ? '<th>Branch</th>' : '';
    const user = currentUser();
    const editHeader = user && (user.role === 'cs' || user.role === 'admin') ? '<th>Actions</th>' : '';
    return '<tr>' + branchHeader + '<th>Rego</th><th>ACRISS</th><th>Fuel</th><th>Mileage</th><th>Check-in time</th><th>Logged by</th><th>Status</th>' + editHeader + '</tr>';
  }

  function isoToLocalInput(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  }

  function renderAll() {
    $('#wash-head').innerHTML    = washHeadHtml();
    $('#ip-head').innerHTML      = ipHeadHtml();
    $('#done-head').innerHTML    = doneHeadHtml();
    $('#checkin-head').innerHTML = checkinHeadHtml();
    renderWashQueue();
    renderInProgress();
    renderCompleted();
    renderCheckins();
    if (viewDash.style.display !== 'none') renderDashboard();
  }

  const branchCell = (j) => showBranchCol() ? '<td>' + escapeHtml(branchName(j.branch_id)) + '</td>' : '';

  function priorityRank(j) {
    return j.priority === 'high' ? 0 : 1;
  }

  function washSortKey(j) {
    if (j.sort_order != null) return j.sort_order;
    return j.returned_at ? new Date(j.returned_at).getTime() / 1000 : 0;
  }

  function washQueueSort(a, b) {
    const pr = priorityRank(a) - priorityRank(b);
    if (pr !== 0) return pr;
    return washSortKey(a) - washSortKey(b);
  }

  const PRIORITY_STAR = '<img src="assets/priority-star.png" alt="Priority" class="priority-star" />';

  function renderWashQueue() {
    const body = $('#wash-body');
    const rows = branchScoped(jobs).filter(j => j.status === 'awaiting_wash')
      .sort(washQueueSort);
    $('#wash-count').textContent = '(' + rows.length + ')';
    if (!rows.length) { body.innerHTML = '<tr><td colspan="99" class="muted">Wash queue is empty.</td></tr>'; return; }
    const user = currentUser();
    const isDet = user && user.role === 'detailer';
    const isStaff = user && (user.role === 'admin' || user.role === 'cs');
    body.innerHTML = rows.map((j) => {
      const intake = getUser(j.intake_by);
      const intakeLabel = escapeHtml(intake ? (intake.full_name || intake.username) : '—');
      const detCanClaim = isDet && user.branch_ids && user.branch_ids.includes(j.branch_id);
      const isHigh = j.priority === 'high';
      const priorityCell = '<td class="priority-col">' + (isHigh ? PRIORITY_STAR : '') + '</td>';
      const actionParts = [];
      if (isStaff) {
        actionParts.push('<button class="secondary tiny edit-intake" type="button">Edit</button>');
        if (isHigh) {
          actionParts.push(
            '<button class="secondary tiny priority-toggle on" type="button" title="Clear priority" data-priority="normal">Clear</button>'
          );
        } else {
          actionParts.push(
            '<button class="priority-toggle" type="button" title="Mark priority" data-priority="high">' + PRIORITY_STAR + '</button>'
          );
        }
      }
      if (detCanClaim) {
        actionParts.push('<button class="success claim-btn" type="button">Start clean</button>');
      } else if (!isStaff) {
        actionParts.push('<span class="muted">—</span>');
      }
      const action = actionParts.length
        ? '<div class="inline-actions">' + actionParts.join('') + '</div>'
        : '<span class="muted">—</span>';
      return '<tr data-job-id="' + j.id + '"' + (isHigh ? ' class="priority-row"' : '') + '>'
        + branchCell(j)
        + priorityCell
        + '<td><strong>' + escapeHtml(j.rego) + '</strong></td>'
        + '<td>' + escapeHtml(j.acriss_group || '—') + '</td>'
        + '<td>' + escapeHtml(fmtDate(j.returned_at)) + '</td>'
        + '<td>' + durationMins(j.returned_at) + '</td>'
        + '<td>' + intakeLabel + '</td>'
        + '<td>' + action + '</td>'
        + '<td>' + statusBadge(j.status) + '</td>'
        + '</tr>';
    }).join('');
    body.querySelectorAll('.claim-btn').forEach((btn) => btn.addEventListener('click', (e) => openClaimRow(e.currentTarget.closest('tr'))));
    body.querySelectorAll('.edit-intake').forEach((btn) => btn.addEventListener('click', (e) => openIntakeEdit(e.currentTarget.closest('tr'))));
    body.querySelectorAll('.priority-toggle').forEach((btn) => btn.addEventListener('click', (e) => togglePriority(e.currentTarget.closest('tr'), e.currentTarget.getAttribute('data-priority'))));
  }

  async function togglePriority(row, priority) {
    const id = Number(row.getAttribute('data-job-id'));
    try {
      await api.setJobPriority(id, priority);
      await refreshAll();
    } catch (ex) {
      loadError = ex.message || 'Could not update urgent flag';
      setLoading(false);
    }
  }

  function renderInProgress() {
    const body = $('#ip-body');
    const rows = branchScoped(jobs).filter(j => j.status === 'in_progress')
      .sort((a,b) => (b.started_at||'').localeCompare(a.started_at||''));
    $('#ip-count').textContent = '(' + rows.length + ')';
    if (!rows.length) { body.innerHTML = '<tr><td colspan="99" class="muted">No jobs in progress.</td></tr>'; return; }
    const user = currentUser();
    const isDet = user && user.role === 'detailer';
    body.innerHTML = rows.map((j) => {
      const det = getUser(j.detailer_id);
      const label = escapeHtml(det ? (det.full_name || det.username) : '—');
      const detCanFinish = isDet && user.id === j.detailer_id;
      const action = detCanFinish ? '<button class="success finish-btn" type="button">Finish</button>' : '<span class="muted">—</span>';
      return '<tr data-job-id="' + j.id + '">'
        + branchCell(j)
        + '<td><strong>' + escapeHtml(j.rego) + '</strong></td>'
        + '<td>' + label + '</td>'
        + '<td>' + escapeHtml(fmtDate(j.started_at)) + '</td>'
        + '<td>' + durationMins(j.started_at) + '</td>'
        + '<td>' + escapeHtml(j.notes || '') + '</td>'
        + '<td>' + action + '</td>'
        + '<td>' + statusBadge(j.status) + '</td>'
        + '</tr>';
    }).join('');
    body.querySelectorAll('.finish-btn').forEach((btn) => btn.addEventListener('click', (e) => openFinishRow(e.currentTarget.closest('tr'))));
  }

  let completedRows = [];
  function renderCompleted() {
    const body = $('#done-body');
    const rego = $('#f-rego').value.toUpperCase().trim();
    const det  = $('#f-detailer').value.toLowerCase().trim();
    const from = $('#f-from').value ? new Date($('#f-from').value) : null;
    const to   = $('#f-to').value   ? new Date($('#f-to').value)   : null;
    if (to) to.setDate(to.getDate() + 1);

    let rows = branchScoped(jobs).filter(j => j.status === 'done')
      .sort((a,b) => (b.finished_at||'').localeCompare(a.finished_at||''));
    if (rego) rows = rows.filter(j => j.rego.includes(rego));
    if (det)  rows = rows.filter(j => { const u = getUser(j.detailer_id); return u && u.username.includes(det); });
    if (from) rows = rows.filter(j => new Date(j.finished_at || j.returned_at) >= from);
    if (to)   rows = rows.filter(j => new Date(j.finished_at || j.returned_at) <  to);

    completedRows = rows;
    $('#done-count').textContent = '(' + rows.length + ')';
    if (!rows.length) { body.innerHTML = '<tr><td colspan="99" class="muted">No completed jobs.</td></tr>'; return; }
    body.innerHTML = rows.map(j => {
      const detU = getUser(j.detailer_id); const ink = getUser(j.intake_by);
      const notesText = j.after_notes || j.notes || '';
      return '<tr>'
        + branchCell(j)
        + '<td><strong>' + escapeHtml(j.rego) + '</strong></td>'
        + '<td>' + escapeHtml(j.acriss_group || '—') + '</td>'
        + '<td>' + escapeHtml(fmtDate(j.returned_at)) + '</td>'
        + '<td>' + escapeHtml(ink ? (ink.full_name || ink.username) : '—') + '</td>'
        + '<td>' + escapeHtml(detU ? (detU.full_name || detU.username) : '—') + '</td>'
        + '<td>' + escapeHtml(fmtDate(j.started_at)) + '</td>'
        + '<td>' + escapeHtml(fmtDate(j.finished_at)) + '</td>'
        + '<td>' + (j.finished_at ? durationMins(j.started_at, j.finished_at) : '—') + '</td>'
        + '<td>' + escapeHtml(notesText) + '</td>'
        + '<td>' + statusBadge(j.status) + '</td>'
        + '</tr>';
    }).join('');
  }

  let checkinRows = [];
  function renderCheckins() {
    const body = $('#checkin-body');
    const rows = branchScoped(jobs).filter(j => j.intake_by != null)
      .sort((a,b) => (b.returned_at||'').localeCompare(a.returned_at||''));
    checkinRows = rows;
    $('#checkin-count').textContent = '(' + rows.length + ')';
    const user = currentUser();
    const isStaff = user && (user.role === 'cs' || user.role === 'admin');
    if (!rows.length) { body.innerHTML = '<tr><td colspan="99" class="muted">No check-ins yet.</td></tr>'; return; }
    body.innerHTML = rows.map(j => {
      const ink = getUser(j.intake_by);
      const editCell = isStaff
        ? '<td>' + (j.status === 'awaiting_wash'
          ? '<button class="secondary tiny edit-intake" type="button">Edit</button>'
          : '<span class="muted" title="Only editable while waiting to clean">—</span>') + '</td>'
        : '';
      return '<tr data-job-id="' + j.id + '">'
        + branchCell(j)
        + '<td><strong>' + escapeHtml(j.rego) + '</strong></td>'
        + '<td>' + escapeHtml(j.acriss_group || '—') + '</td>'
        + '<td>' + (j.fuel_eighths == null ? '—' : j.fuel_eighths + '/8') + '</td>'
        + '<td>' + (j.mileage == null ? '—' : Number(j.mileage).toLocaleString()) + '</td>'
        + '<td>' + escapeHtml(fmtDate(j.returned_at)) + '</td>'
        + '<td>' + escapeHtml(ink ? (ink.full_name || ink.username) : '—') + '</td>'
        + '<td>' + escapeHtml(intakeStatusLabel(j.status)) + '</td>'
        + editCell
        + '</tr>';
    }).join('');
    body.querySelectorAll('.edit-intake').forEach((btn) => btn.addEventListener('click', (e) => openIntakeEdit(e.currentTarget.closest('tr'))));
  }

  function intakeStatusLabel(status) {
    if (status === 'awaiting_wash') return 'Waiting to clean';
    if (status === 'in_progress') return 'In progress';
    if (status === 'done') return 'Completed';
    return status || '—';
  }

  function openIntakeEdit(row) {
    if (row.nextElementSibling && row.nextElementSibling.classList.contains('checkin-edit-row')) return;
    const id = Number(row.getAttribute('data-job-id'));
    const j = jobs.find((x) => x.id === id);
    if (!j) return;
    const frag = $('#checkin-edit-template').content.cloneNode(true);
    row.parentNode.insertBefore(frag, row.nextSibling);
    const tr = row.nextElementSibling;
    tr.querySelector('.edit-rego').value = j.rego;
    tr.querySelector('.edit-acriss').value = j.acriss_group || '';
    tr.querySelector('.edit-fuel').value = j.fuel_eighths == null ? '' : j.fuel_eighths;
    tr.querySelector('.edit-mileage').value = j.mileage == null ? '' : j.mileage;
    tr.querySelector('.edit-time').value = isoToLocalInput(j.returned_at);
    tr.querySelector('.edit-priority').checked = j.priority === 'high';
    tr.querySelector('.cancel-checkin').addEventListener('click', () => tr.remove());
    tr.querySelector('.save-checkin').addEventListener('click', async () => {
      const errSlot = tr.querySelector('.checkin-save-error');
      const btn = tr.querySelector('.save-checkin');
      errSlot.textContent = '';
      const rego = tr.querySelector('.edit-rego').value.toUpperCase().trim();
      if (!rego) { errSlot.textContent = 'Rego required'; return; }
      const acriss = (tr.querySelector('.edit-acriss').value || '').toUpperCase().trim() || null;
      const fuelRaw = tr.querySelector('.edit-fuel').value;
      const fuel = fuelRaw === '' ? null : Number(fuelRaw);
      const mileageRaw = tr.querySelector('.edit-mileage').value;
      const mileage = mileageRaw === '' ? null : Number(mileageRaw);
      const timeRaw = tr.querySelector('.edit-time').value;
      const returned_at = timeRaw ? new Date(timeRaw).toISOString() : j.returned_at;
      const priority = tr.querySelector('.edit-priority').checked ? 'high' : 'normal';
      btn.disabled = true;
      try {
        await api.updateJobIntake(id, {
          rego, acriss_group: acriss, fuel_eighths: fuel, mileage, returned_at, priority,
        });
        await refreshAll();
      } catch (ex) {
        errSlot.textContent = ex.message || 'Save failed';
        btn.disabled = false;
      }
    });
  }

  // ===== Claim & Finish =====
  function openClaimRow(row) {
    if (row.nextElementSibling && row.nextElementSibling.classList.contains('claim-row')) return;
    const frag = $('#claim-row-template').content.cloneNode(true);
    row.parentNode.insertBefore(frag, row.nextSibling);
    const tr = row.nextElementSibling;
    const errSlot = document.createElement('div');
    errSlot.className = 'error claim-error';
    tr.querySelector('.row').appendChild(errSlot);
    tr.querySelector('.cancel-claim').addEventListener('click', () => tr.remove());
    tr.querySelector('.confirm-claim').addEventListener('click', async () => {
      const id = Number(row.getAttribute('data-job-id'));
      const notes = tr.querySelector('.claim-notes').value.trim() || null;
      const btn = tr.querySelector('.confirm-claim');
      errSlot.textContent = '';
      btn.disabled = true;
      try {
        await api.claimJob(id, notes);
        await refreshAll();
      } catch (ex) {
        errSlot.textContent = ex.message || 'Failed to start clean';
        btn.disabled = false;
      }
    });
  }

  function openFinishRow(row) {
    if (row.nextElementSibling && row.nextElementSibling.classList.contains('finish-row')) return;
    const frag = $('#finish-row-template').content.cloneNode(true);
    row.parentNode.insertBefore(frag, row.nextSibling);
    const tr = row.nextElementSibling;
    const errSlot = document.createElement('div');
    errSlot.className = 'error finish-error';
    tr.querySelector('.row').appendChild(errSlot);
    tr.querySelector('.cancel-finish').addEventListener('click', () => tr.remove());
    tr.querySelector('.confirm-finish').addEventListener('click', async () => {
      const id = Number(row.getAttribute('data-job-id'));
      const after = tr.querySelector('.after-notes').value.trim() || null;
      const btn = tr.querySelector('.confirm-finish');
      errSlot.textContent = '';
      btn.disabled = true;
      try {
        await api.finishJob(id, after);
        await refreshAll();
      } catch (ex) {
        errSlot.textContent = ex.message || 'Failed to finish';
        btn.disabled = false;
      }
    });
  }

  const AUTO_REFRESH_MS = 90000;

  function shouldPauseAutoRefresh() {
    if (document.hidden) return true;
    if (document.querySelector('.claim-row, .finish-row, .checkin-edit-row')) return true;
    const el = document.activeElement;
    if (el && el.matches('input, textarea, select')) return true;
    return false;
  }

  async function refreshLive() {
    if (!me || loading) return;
    if (shouldPauseAutoRefresh()) return;
    try {
      await loadJobsOnly();
      renderWashQueue();
      renderInProgress();
      if (viewDash.style.display !== 'none') renderDashboardKpis();
    } catch {
      // background tick — leave current data on screen
    }
  }

  setInterval(refreshLive, AUTO_REFRESH_MS);

  // ===== Filters / CSVs / seed =====
  $('#filter-form').addEventListener('submit', (e) => { e.preventDefault(); renderCompleted(); });
  $('#clear-btn').addEventListener('click', () => { $('#filter-form').reset(); renderCompleted(); });

  const csvCell = (v) => { const s = String(v==null?'':v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g,'""') + '"' : s; };
  function downloadCsv(filename, header, rows) {
    const csv = [header, ...rows].map(r => r.map(csvCell).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; a.click();
  }

  $('#csv-btn').addEventListener('click', () => {
    if (!completedRows.length) return;
    const header = ['branch','rego','acriss','check_in_time','intake_by','detailer','started_at','finished_at','duration_minutes','notes','status'];
    const rows = completedRows.map(j => {
      const detU = getUser(j.detailer_id); const ink = getUser(j.intake_by);
      const dur = (j.started_at && j.finished_at) ? Math.round((new Date(j.finished_at) - new Date(j.started_at)) / 60000) : '';
      return [branchName(j.branch_id), j.rego, j.acriss_group||'', j.returned_at||'', ink?(ink.full_name||ink.username):'', detU?(detU.full_name||detU.username):'', j.started_at||'', j.finished_at||'', dur, (j.after_notes||j.notes||''), 'Clean'];
    });
    const bid = activeBranchId();
    const tag = bid === ALL_BRANCHES ? 'all' : branchName(bid).replace(/\s+/g,'-');
    downloadCsv('car-detailer-completed-' + tag + '-' + new Date().toISOString().slice(0,10) + '.csv', header, rows);
  });

  $('#checkin-csv-btn').addEventListener('click', () => {
    if (!checkinRows.length) return;
    const header = ['branch','rego','acriss','fuel','mileage','check_in_time','logged_by'];
    const rows = checkinRows.map(j => {
      const ink = getUser(j.intake_by);
      return [branchName(j.branch_id), j.rego, j.acriss_group||'', j.fuel_eighths==null?'':j.fuel_eighths, j.mileage==null?'':j.mileage, j.returned_at||'', ink?(ink.full_name||ink.username):''];
    });
    const bid = activeBranchId();
    const tag = bid === ALL_BRANCHES ? 'all' : branchName(bid).replace(/\s+/g,'-');
    downloadCsv('car-detailer-checkins-' + tag + '-' + new Date().toISOString().slice(0,10) + '.csv', header, rows);
  });

  $('#seed-btn').addEventListener('click', () => {
    alert('Sample data seeding is not available in server mode. Use Admin to create users and Check-In to add jobs.');
  });

  // ===== Dashboard =====
  let chart7day = null, chartBranches = null;
  function isToday(d) {
    if (!d) return false;
    const a = new Date(d); const now = new Date();
    return a.getFullYear() === now.getFullYear() && a.getMonth() === now.getMonth() && a.getDate() === now.getDate();
  }
  function dayKey(d) {
    const a = new Date(d);
    return a.getFullYear() + '-' + String(a.getMonth()+1).padStart(2,'0') + '-' + String(a.getDate()).padStart(2,'0');
  }
  function shortDay(d) {
    const a = new Date(d);
    return a.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' });
  }

  function renderDashboardKpis() {
    const scoped = branchScoped(jobs);

    const todayCheckins = scoped.filter(j => isToday(j.returned_at)).length;
    const waiting = scoped.filter(j => j.status === 'awaiting_wash').length;
    const inProg = scoped.filter(j => j.status === 'in_progress').length;
    const cleanedToday = scoped.filter(j => j.status === 'done' && isToday(j.finished_at)).length;

    $('#kpi-checkin').textContent = todayCheckins;
    $('#kpi-checkin-sub').textContent = scoped.length + ' total in scope';
    $('#kpi-waiting').textContent = waiting;
    const oldestWait = [...scoped.filter(j => j.status === 'awaiting_wash')].sort(washQueueSort)[0];
    $('#kpi-waiting-sub').textContent = waiting && oldestWait ? 'oldest: ' + durationMins(oldestWait.returned_at) : '';
    $('#kpi-inprog').textContent = inProg;
    const longestIp = [...scoped.filter(j => j.status === 'in_progress')].sort((a,b)=>(a.started_at||'').localeCompare(b.started_at||''))[0];
    $('#kpi-inprog-sub').textContent = inProg && longestIp ? 'longest: ' + durationMins(longestIp.started_at) : '';
    $('#kpi-cleaned').textContent = cleanedToday;
    $('#kpi-cleaned-sub').textContent = '';

    const pending = scoped.filter(j => j.status !== 'done' && j.returned_at);
    const now = new Date();
    if (pending.length) {
      const avgWaitMins = pending.reduce((acc,j) => acc + (now - new Date(j.returned_at)) / 60000, 0) / pending.length;
      $('#kpi-avgwait').textContent = fmtMinutes(avgWaitMins);
    } else $('#kpi-avgwait').textContent = '—';

    const todayDone = scoped.filter(j => j.status === 'done' && isToday(j.finished_at) && j.started_at && j.finished_at);
    if (todayDone.length) {
      const avgWash = todayDone.reduce((acc,j) => acc + (new Date(j.finished_at) - new Date(j.started_at)) / 60000, 0) / todayDone.length;
      $('#kpi-avgwash').textContent = fmtMinutes(avgWash);
    } else $('#kpi-avgwash').textContent = '—';
  }

  function renderDashboardCharts() {
    const scoped = branchScoped(jobs);
    const labels = []; const checkinsByDay = []; const completionsByDay = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const key = dayKey(d);
      labels.push(shortDay(d));
      checkinsByDay.push(scoped.filter(j => j.returned_at && dayKey(j.returned_at) === key).length);
      completionsByDay.push(scoped.filter(j => j.status === 'done' && j.finished_at && dayKey(j.finished_at) === key).length);
    }
    const ctx7 = document.getElementById('chart-7day').getContext('2d');
    if (chart7day) chart7day.destroy();
    chart7day = new Chart(ctx7, {
      type: 'bar',
      data: { labels, datasets: [
        { label: 'Check-ins', data: checkinsByDay, backgroundColor: '#0ea5e9' },
        { label: 'Completed', data: completionsByDay, backgroundColor: '#16a34a' },
      ]},
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } },
                 scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } }
    });

    const labelsB = []; const queueB = []; const ipB = []; const doneB = [];
    branches.forEach(b => {
      labelsB.push(b.name);
      queueB.push(jobs.filter(j => j.branch_id === b.id && j.status === 'awaiting_wash').length);
      ipB.push(jobs.filter(j => j.branch_id === b.id && j.status === 'in_progress').length);
      doneB.push(jobs.filter(j => j.branch_id === b.id && j.status === 'done' && isToday(j.finished_at)).length);
    });
    const ctxB = document.getElementById('chart-branches').getContext('2d');
    if (chartBranches) chartBranches.destroy();
    chartBranches = new Chart(ctxB, {
      type: 'bar',
      data: { labels: labelsB, datasets: [
        { label: 'Awaiting',    data: queueB, backgroundColor: '#f59e0b' },
        { label: 'In progress', data: ipB,    backgroundColor: '#d97706' },
        { label: 'Done today',  data: doneB,  backgroundColor: '#16a34a' },
      ]},
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } },
                 scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true, ticks: { precision: 0 } } } }
    });
  }

  function renderDashboard() {
    renderDashboardKpis();
    renderDashboardCharts();
  }

  // ===== ADMIN management =====
  function renderAdmin() { renderAdminBranches(); renderAdminUsers(); }

  function renderAdminBranches() {
    const body = $('#admin-branches-body');
    if (!branches.length) { body.innerHTML = '<tr><td colspan="6" class="muted">No branches yet.</td></tr>'; return; }
    body.innerHTML = branches.map(b => {
      const userCount = users.filter(u => (u.branch_ids||[]).includes(b.id)).length;
      const jobCount = jobs.filter(j => j.branch_id === b.id).length;
      const aw = jobs.filter(j => j.branch_id === b.id && j.status === 'awaiting_wash').length;
      const ip = jobs.filter(j => j.branch_id === b.id && j.status === 'in_progress').length;
      return '<tr data-branch-id="' + b.id + '">'
        + '<td><strong>' + escapeHtml(b.name) + '</strong></td>'
        + '<td>' + userCount + '</td><td>' + jobCount + '</td><td>' + aw + '</td><td>' + ip + '</td>'
        + '<td class="inline-actions">'
        +   '<button class="secondary tiny rename-branch" type="button">Rename</button>'
        +   '<button class="danger tiny delete-branch" type="button" ' + (jobCount ? 'disabled title="Cannot delete: has jobs"' : '') + '>Delete</button>'
        + '</td>'
        + '</tr>';
    }).join('');
    body.querySelectorAll('.rename-branch').forEach(btn => btn.addEventListener('click', (e) => openBranchEdit(e.currentTarget.closest('tr'))));
    body.querySelectorAll('.delete-branch').forEach(btn => btn.addEventListener('click', async (e) => {
      const row = e.currentTarget.closest('tr');
      const id = Number(row.getAttribute('data-branch-id'));
      const b = getBranch(id);
      if (!confirm('Delete branch "' + b.name + '"?')) return;
      $('#branch-error').textContent = '';
      try {
        await api.deleteBranch(id);
        if (activeBranchId() === id) {
          session.active_branch_id = me.role === 'admin' ? ALL_BRANCHES : (me.branch_ids[0] || ALL_BRANCHES);
          save(K_SESSION, session);
        }
        await refreshAll();
        renderAdmin();
        await enterApp();
      } catch (ex) {
        $('#branch-error').textContent = ex.message || 'Delete failed';
      }
    }));
  }

  function openBranchEdit(row) {
    if (row.nextElementSibling && row.nextElementSibling.classList.contains('edit-row')) return;
    const id = Number(row.getAttribute('data-branch-id'));
    const b = getBranch(id);
    const frag = $('#branch-edit-template').content.cloneNode(true);
    row.parentNode.insertBefore(frag, row.nextSibling);
    const tr = row.nextElementSibling;
    tr.querySelector('.edit-bname').value = b.name;
    tr.querySelector('.cancel-bname').addEventListener('click', () => tr.remove());
    tr.querySelector('.save-bname').addEventListener('click', async () => {
      const name = tr.querySelector('.edit-bname').value.trim();
      const err = tr.querySelector('.bsave-error');
      err.textContent = '';
      if (!name) { err.textContent = 'Name required'; return; }
      try {
        await api.updateBranch(id, name);
        await refreshAll();
        renderAdmin();
        await enterApp();
      } catch (ex) {
        err.textContent = ex.message || 'Save failed';
      }
    });
  }

  $('#branch-add-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('#branch-error');
    err.textContent = '';
    const name = $('#ba-name').value.trim();
    if (!name) { err.textContent = 'Name required'; return; }
    try {
      await api.createBranch(name);
      $('#ba-name').value = '';
      await refreshAll();
      renderAdmin();
      await enterApp();
    } catch (ex) {
      err.textContent = ex.message || 'Add failed';
    }
  });

  function renderAdminUsers() {
    const body = $('#admin-users-body');
    $('#admin-user-count').textContent = '(' + users.length + ')';
    if (!users.length) { body.innerHTML = '<tr><td colspan="6" class="muted">No users yet.</td></tr>'; return; }
    body.innerHTML = users.map(u => {
      const branchChips = (u.branch_ids||[]).map(id => '<span class="branch-chip">' + escapeHtml(branchName(id)) + '</span>').join('') || '<span class="muted">—</span>';
      const status = u.is_active === false ? '<span class="badge inactive">Inactive</span>' : '<span class="badge clean">Active</span>';
      return '<tr data-user-id="' + u.id + '">'
        + '<td><strong>' + escapeHtml(u.username) + '</strong></td>'
        + '<td>' + escapeHtml(u.full_name || '—') + '</td>'
        + '<td><span class="badge role ' + (u.role === 'admin' ? 'admin' : '') + '">' + u.role + '</span></td>'
        + '<td>' + branchChips + '</td>'
        + '<td>' + status + '</td>'
        + '<td><button class="secondary tiny edit-user" type="button">Edit</button></td>'
        + '</tr>';
    }).join('');
    body.querySelectorAll('.edit-user').forEach(btn => btn.addEventListener('click', (e) => openUserEdit(e.currentTarget.closest('tr'))));
  }

  function openUserEdit(row) {
    if (row.nextElementSibling && row.nextElementSibling.classList.contains('edit-row')) return;
    const id = Number(row.getAttribute('data-user-id'));
    const u = getUser(id);
    const frag = $('#user-edit-template').content.cloneNode(true);
    row.parentNode.insertBefore(frag, row.nextSibling);
    const tr = row.nextElementSibling;
    tr.querySelector('.edit-role').value = u.role;
    tr.querySelector('.edit-active').value = String(u.is_active !== false);
    const branchBox = tr.querySelector('.edit-branches');
    branchBox.innerHTML = branches.map(b => '<label><input type="checkbox" value="' + b.id + '" ' + ((u.branch_ids||[]).includes(b.id) ? 'checked' : '') + ' /> ' + escapeHtml(b.name) + '</label>').join('');
    tr.querySelector('.cancel-user').addEventListener('click', () => tr.remove());
    tr.querySelector('.save-user').addEventListener('click', async () => {
      const err = tr.querySelector('.save-error');
      err.textContent = '';
      const role = tr.querySelector('.edit-role').value;
      const newPassword = tr.querySelector('.edit-password').value;
      const isActive = tr.querySelector('.edit-active').value === 'true';
      const branch_ids = Array.from(branchBox.querySelectorAll('input[type=checkbox]:checked')).map(cb => Number(cb.value));
      if (role !== 'admin' && !branch_ids.length) { err.textContent = 'Non-admin users need at least one branch'; return; }
      const payload = { role, is_active: isActive, branch_ids };
      if (newPassword) {
        if (newPassword.length < 4) { err.textContent = 'Password too short'; return; }
        payload.password = newPassword;
      }
      try {
        await api.updateUser(id, payload);
        await refreshAll();
        renderAdmin();
      } catch (ex) {
        err.textContent = ex.message || 'Save failed';
      }
    });
  }

  function renderNewUserBranches() {
    $('#nu-branches').innerHTML = branches.map(b => '<label><input type="checkbox" value="' + b.id + '" /> ' + escapeHtml(b.name) + '</label>').join('');
  }
  $('#new-user-btn').addEventListener('click', () => {
    $('#new-user-block').style.display = '';
    renderNewUserBranches();
    $('#nu-error').textContent = '';
  });
  $('#nu-cancel').addEventListener('click', () => {
    $('#new-user-block').style.display = 'none';
    ['nu-fullname','nu-username','nu-password'].forEach(id => $('#' + id).value = '');
    $('#nu-role').value = 'cs';
  });
  $('#nu-save').addEventListener('click', async () => {
    const err = $('#nu-error');
    err.textContent = '';
    const fullname = $('#nu-fullname').value.trim();
    const username = $('#nu-username').value.toLowerCase().trim();
    const password = $('#nu-password').value;
    const role = $('#nu-role').value;
    const branch_ids = Array.from($('#nu-branches').querySelectorAll('input[type=checkbox]:checked')).map(cb => Number(cb.value));
    if (!username || !password) { err.textContent = 'Username and password required'; return; }
    if (password.length < 4) { err.textContent = 'Password too short'; return; }
    if (role !== 'admin' && !branch_ids.length) { err.textContent = 'Non-admin users need at least one branch'; return; }
    try {
      await api.createUser({
        username, password, full_name: fullname || null, role, branch_ids,
      });
      $('#nu-cancel').click();
      await refreshAll();
      renderAdmin();
    } catch (ex) {
      err.textContent = ex.message || 'Create failed';
    }
  });

  // ===== Boot =====
  (async () => {
    if (!api.getToken()) return;
    try {
      const result = await api.me();
      me = result.user;
      session = load(K_SESSION, null) || { user_id: me.id, active_branch_id: me.role === 'admin' ? ALL_BRANCHES : me.branch_ids[0] };
      save(K_SESSION, session);
      await enterApp();
    } catch {
      api.setToken(null);
      localStorage.removeItem(K_SESSION);
    }
  })();
})();
