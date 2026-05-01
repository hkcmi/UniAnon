const state = {
  token: localStorage.getItem('unianon:token') || '',
  user: null,
  spaces: [],
  posts: [],
  cases: [],
  auditLog: [],
  activeSpaceId: 'public'
};

const elements = {
  sessionLine: document.querySelector('#sessionLine'),
  logoutButton: document.querySelector('#logoutButton'),
  authPanel: document.querySelector('#authPanel'),
  authStatus: document.querySelector('#authStatus'),
  requestLinkForm: document.querySelector('#requestLinkForm'),
  verifyForm: document.querySelector('#verifyForm'),
  emailInput: document.querySelector('#emailInput'),
  tokenInput: document.querySelector('#tokenInput'),
  nicknamePanel: document.querySelector('#nicknamePanel'),
  nicknameForm: document.querySelector('#nicknameForm'),
  nicknameInput: document.querySelector('#nicknameInput'),
  nicknameStatus: document.querySelector('#nicknameStatus'),
  refreshButton: document.querySelector('#refreshButton'),
  spaceList: document.querySelector('#spaceList'),
  composerPanel: document.querySelector('#composerPanel'),
  activeSpaceLabel: document.querySelector('#activeSpaceLabel'),
  postForm: document.querySelector('#postForm'),
  postContent: document.querySelector('#postContent'),
  postList: document.querySelector('#postList'),
  caseList: document.querySelector('#caseList'),
  moderationPanel: document.querySelector('#moderationPanel'),
  auditRefreshButton: document.querySelector('#auditRefreshButton'),
  banForm: document.querySelector('#banForm'),
  banUserHashInput: document.querySelector('#banUserHashInput'),
  banReasonInput: document.querySelector('#banReasonInput'),
  moderationStatus: document.querySelector('#moderationStatus'),
  auditLogList: document.querySelector('#auditLogList'),
  postTemplate: document.querySelector('#postTemplate'),
  caseTemplate: document.querySelector('#caseTemplate'),
  auditTemplate: document.querySelector('#auditTemplate')
};

function authHeaders() {
  return state.token ? { authorization: `Bearer ${state.token}` } : {};
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      ...authHeaders(),
      ...(options.body ? { 'content-type': 'application/json' } : {}),
      ...(options.headers || {})
    }
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.message || payload.error || 'Request failed.');
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload;
}

function formatTime(value) {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value));
}

function setStatus(element, message) {
  element.textContent = message || '';
}

function updateSessionView() {
  const signedIn = Boolean(state.user);
  const canModerate = Boolean(state.user?.roles.includes('moderator') || state.user?.roles.includes('system_admin'));
  elements.authPanel.classList.toggle('hidden', signedIn);
  elements.logoutButton.classList.toggle('hidden', !signedIn);
  elements.composerPanel.classList.toggle('hidden', !signedIn || !state.user.nickname);
  elements.nicknamePanel.classList.toggle('hidden', !signedIn || Boolean(state.user.nickname));
  elements.moderationPanel.classList.toggle('hidden', !canModerate);

  if (!signedIn) {
    elements.sessionLine.textContent = 'Not signed in';
    return;
  }

  const nickname = state.user.nickname || 'nickname required';
  elements.sessionLine.textContent = `${nickname} - ${state.user.domain_group} - trust ${state.user.trust_level}`;
}

function shortHash(value) {
  if (!value) {
    return 'none';
  }

  if (value.length <= 14) {
    return value;
  }

  return `${value.slice(0, 8)}...${value.slice(-6)}`;
}

function renderSpaces() {
  elements.spaceList.replaceChildren();

  for (const space of state.spaces) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'space-button';
    button.classList.toggle('active', space.id === state.activeSpaceId);
    button.textContent = `${space.name}${space.allowed_domains.length ? ` (${space.allowed_domains.join(', ')})` : ''}`;
    button.addEventListener('click', async () => {
      state.activeSpaceId = space.id;
      elements.activeSpaceLabel.textContent = space.name;
      renderSpaces();
      await loadPosts();
    });
    elements.spaceList.append(button);
  }
}

function renderPosts() {
  elements.postList.replaceChildren();

  if (state.posts.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'muted';
    empty.textContent = 'No posts in this space.';
    elements.postList.append(empty);
    return;
  }

  for (const post of state.posts) {
    const node = elements.postTemplate.content.firstElementChild.cloneNode(true);
    node.querySelector('.post-author').textContent = post.nickname;
    node.querySelector('.post-time').textContent = formatTime(post.created_at);
    node.querySelector('.post-content').textContent = post.content;

    const reportButton = node.querySelector('.report-post');
    reportButton.classList.toggle('hidden', !state.user || !state.user.nickname);
    reportButton.addEventListener('click', async () => {
      await reportTarget('post', post.id);
    });

    const comments = node.querySelector('.comment-list');
    for (const comment of post.comments) {
      const item = document.createElement('div');
      item.className = 'comment';
      const author = document.createElement('strong');
      author.textContent = comment.nickname;
      const content = document.createElement('span');
      content.textContent = comment.content;
      item.append(author, content);
      comments.append(item);
    }

    const commentForm = node.querySelector('.comment-form');
    const commentInput = node.querySelector('.comment-input');
    commentForm.classList.toggle('hidden', !state.user || !state.user.nickname);
    commentForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      await api(`/posts/${post.id}/comments`, {
        method: 'POST',
        body: JSON.stringify({ content: commentInput.value })
      });
      commentInput.value = '';
      await loadPosts();
    });

    elements.postList.append(node);
  }
}

function renderCases() {
  elements.caseList.replaceChildren();

  if (!state.user) {
    const note = document.createElement('p');
    note.className = 'muted';
    note.textContent = 'Sign in to view cases.';
    elements.caseList.append(note);
    return;
  }

  if (state.user.trust_level < 2) {
    const note = document.createElement('p');
    note.className = 'muted';
    note.textContent = 'Trusted users can view cases.';
    elements.caseList.append(note);
    return;
  }

  if (state.cases.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'muted';
    empty.textContent = 'No cases.';
    elements.caseList.append(empty);
    return;
  }

  for (const moderationCase of state.cases) {
    const node = elements.caseTemplate.content.firstElementChild.cloneNode(true);
    node.querySelector('.case-title').textContent = `${moderationCase.target_type} ${moderationCase.target_id}`;
    node.querySelector('.case-status').textContent = moderationCase.status;
    node.querySelector('.case-reports').textContent = String(moderationCase.report_weight);
    node.querySelector('.case-violation').textContent = String(moderationCase.violation_weight);
    node.querySelector('.case-dismiss').textContent = String(moderationCase.dismiss_weight);

    const actions = node.querySelector('.case-actions');
    actions.classList.toggle('hidden', moderationCase.status !== 'open');
    node.querySelector('.vote-violation').addEventListener('click', async () => {
      await vote(moderationCase.id, 'violation', 'hide_content');
    });
    node.querySelector('.vote-dismiss').addEventListener('click', async () => {
      await vote(moderationCase.id, 'dismiss', 'none');
    });
    elements.caseList.append(node);
  }
}

function renderAuditLog() {
  elements.auditLogList.replaceChildren();

  if (!state.user?.roles.includes('moderator') && !state.user?.roles.includes('system_admin')) {
    return;
  }

  if (state.auditLog.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'muted';
    empty.textContent = 'No audit events.';
    elements.auditLogList.append(empty);
    return;
  }

  for (const event of state.auditLog) {
    const node = elements.auditTemplate.content.firstElementChild.cloneNode(true);
    node.querySelector('.audit-operation').textContent = event.operation;
    node.querySelector('.audit-time').textContent = formatTime(event.created_at);
    node.querySelector('.audit-actor').textContent = shortHash(event.actor_hash);
    node.querySelector('.audit-target').textContent = shortHash(event.target_hash || event.target_id);
    node.querySelector('.audit-reason').textContent = event.reason;
    elements.auditLogList.append(node);
  }
}

async function loadMe() {
  if (!state.token) {
    state.user = null;
    updateSessionView();
    return;
  }

  try {
    const payload = await api('/me');
    state.user = payload.user;
  } catch {
    state.token = '';
    state.user = null;
    localStorage.removeItem('unianon:token');
  }
  updateSessionView();
}

async function loadSpaces() {
  const payload = await api('/spaces');
  state.spaces = payload.spaces;
  if (!state.spaces.some((space) => space.id === state.activeSpaceId)) {
    state.activeSpaceId = state.spaces[0]?.id || 'public';
  }
  const activeSpace = state.spaces.find((space) => space.id === state.activeSpaceId);
  elements.activeSpaceLabel.textContent = activeSpace?.name || state.activeSpaceId;
  renderSpaces();
}

async function loadPosts() {
  const payload = await api(`/posts?space_id=${encodeURIComponent(state.activeSpaceId)}`);
  state.posts = payload.posts;
  renderPosts();
}

async function loadCases() {
  if (!state.user || state.user.trust_level < 2) {
    state.cases = [];
    renderCases();
    return;
  }

  try {
    const payload = await api('/governance/cases');
    state.cases = payload.cases;
  } catch {
    state.cases = [];
  }
  renderCases();
}

async function loadAuditLog() {
  if (!state.user?.roles.includes('moderator') && !state.user?.roles.includes('system_admin')) {
    state.auditLog = [];
    renderAuditLog();
    return;
  }

  try {
    const payload = await api('/moderation/audit-log');
    state.auditLog = payload.audit_log;
  } catch {
    state.auditLog = [];
  }
  renderAuditLog();
}

async function refreshAll() {
  await loadMe();
  await loadSpaces();
  await loadPosts();
  await loadCases();
  await loadAuditLog();
}

async function reportTarget(targetType, targetId) {
  try {
    const payload = await api('/reports', {
      method: 'POST',
      body: JSON.stringify({
        target_type: targetType,
        target_id: targetId,
        reason: 'Reported from local UI'
      })
    });
    if (payload.case) {
      await loadCases();
    }
  } catch (error) {
    alert(error.payload?.message || error.payload?.error || error.message);
  }
}

async function vote(caseId, decision, action) {
  try {
    await api(`/governance/cases/${caseId}/votes`, {
      method: 'POST',
      body: JSON.stringify({ decision, action })
    });
    await loadPosts();
    await loadCases();
  } catch (error) {
    alert(error.payload?.message || error.payload?.error || error.message);
  }
}

elements.requestLinkForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  setStatus(elements.authStatus, 'Requesting...');
  try {
    const payload = await api('/auth/request-link', {
      method: 'POST',
      body: JSON.stringify({ email: elements.emailInput.value })
    });
    if (payload.token) {
      elements.tokenInput.value = payload.token;
      setStatus(elements.authStatus, 'Token received.');
    } else {
      setStatus(elements.authStatus, 'Magic link sent.');
    }
  } catch (error) {
    setStatus(elements.authStatus, error.payload?.message || error.payload?.error || error.message);
  }
});

elements.verifyForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  setStatus(elements.authStatus, 'Verifying...');
  try {
    const payload = await api('/auth/verify', {
      method: 'POST',
      body: JSON.stringify({ token: elements.tokenInput.value })
    });
    state.token = payload.session_token;
    state.user = payload.user;
    localStorage.setItem('unianon:token', state.token);
    setStatus(elements.authStatus, '');
    await refreshAll();
  } catch (error) {
    setStatus(elements.authStatus, error.payload?.message || error.payload?.error || error.message);
  }
});

elements.nicknameForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  setStatus(elements.nicknameStatus, 'Saving...');
  try {
    const payload = await api('/users/nickname', {
      method: 'POST',
      body: JSON.stringify({ nickname: elements.nicknameInput.value })
    });
    state.user = payload.user;
    setStatus(elements.nicknameStatus, '');
    await refreshAll();
  } catch (error) {
    setStatus(elements.nicknameStatus, error.payload?.message || error.payload?.error || error.message);
  }
});

elements.postForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  await api('/posts', {
    method: 'POST',
    body: JSON.stringify({
      space_id: state.activeSpaceId,
      content: elements.postContent.value
    })
  });
  elements.postContent.value = '';
  await loadPosts();
});

elements.banForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  setStatus(elements.moderationStatus, 'Banning...');
  try {
    await api('/moderation/ban', {
      method: 'POST',
      body: JSON.stringify({
        user_hash: elements.banUserHashInput.value,
        reason: elements.banReasonInput.value
      })
    });
    elements.banUserHashInput.value = '';
    elements.banReasonInput.value = '';
    setStatus(elements.moderationStatus, 'User banned.');
    await loadAuditLog();
  } catch (error) {
    setStatus(elements.moderationStatus, error.payload?.message || error.payload?.error || error.message);
  }
});

elements.logoutButton.addEventListener('click', async () => {
  state.token = '';
  state.user = null;
  state.cases = [];
  localStorage.removeItem('unianon:token');
  await refreshAll();
});

elements.refreshButton.addEventListener('click', refreshAll);
elements.auditRefreshButton.addEventListener('click', loadAuditLog);

refreshAll().catch((error) => {
  console.error(error);
});
