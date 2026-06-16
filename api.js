(() => {
  const TOKEN_KEY = 'cd_auth_token';

  function getToken() {
    return localStorage.getItem(TOKEN_KEY);
  }

  function setToken(token) {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  }

  async function request(path, opts = {}) {
    const headers = { ...(opts.headers || {}) };
    if (opts.body && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }
    const token = getToken();
    if (token) headers.Authorization = 'Bearer ' + token;

    let res;
    try {
      res = await fetch('/api' + path, { ...opts, headers });
    } catch (err) {
      throw new Error('Network error — check your connection');
    }

    let data = null;
    const text = await res.text();
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error(res.ok ? 'Invalid server response' : (text || 'Request failed'));
      }
    }

    if (!res.ok) {
      throw new Error((data && data.error) || ('Request failed (' + res.status + ')'));
    }
    return data;
  }

  window.api = {
    getToken,
    setToken,
    request,
    login: (username, password) =>
      request('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
    me: () => request('/me'),
    getBranches: () => request('/branches'),
    createBranch: (name) =>
      request('/branches', { method: 'POST', body: JSON.stringify({ name }) }),
    updateBranch: (id, name) =>
      request('/branches/' + id + '?id=' + id, { method: 'PATCH', body: JSON.stringify({ name }) }),
    deleteBranch: (id) =>
      request('/branches/' + id + '?id=' + id, { method: 'DELETE' }),
    getUsers: () => request('/users'),
    createUser: (payload) =>
      request('/users', { method: 'POST', body: JSON.stringify(payload) }),
    updateUser: (id, payload) =>
      request('/users/' + id + '?id=' + id, { method: 'PATCH', body: JSON.stringify(payload) }),
    getJobs: (params = {}) => {
      const qs = new URLSearchParams();
      if (params.branch_id != null) qs.set('branch_id', params.branch_id);
      if (params.status) qs.set('status', params.status);
      const q = qs.toString();
      return request('/jobs' + (q ? '?' + q : ''));
    },
    createJob: (payload) =>
      request('/jobs', { method: 'POST', body: JSON.stringify(payload) }),
    claimJob: (id, notes) =>
      request('/jobs/' + id + '/claim?id=' + id, { method: 'POST', body: JSON.stringify({ notes }) }),
    finishJob: (id, after_notes) =>
      request('/jobs/' + id + '/finish?id=' + id, { method: 'POST', body: JSON.stringify({ after_notes }) }),
    reorderJob: (id, direction) =>
      request('/jobs/' + id + '/reorder?id=' + id, { method: 'POST', body: JSON.stringify({ direction }) }),
    setJobPriority: (id, priority) =>
      request('/jobs/' + id + '/priority?id=' + id, { method: 'POST', body: JSON.stringify({ priority }) }),
    updateJobIntake: (id, payload) =>
      request('/jobs/' + id + '/intake?id=' + id, { method: 'PATCH', body: JSON.stringify(payload) }),
  };
})();
