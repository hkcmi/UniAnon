const state = {
  token: localStorage.getItem('unianon:token') || '',
  user: null,
  spaces: [],
  posts: [],
  cases: [],
  appeals: [],
  approvals: [],
  adminUsers: [],
  metrics: null,
  auditLog: [],
  publicAuditLog: [],
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
  appealList: document.querySelector('#appealList'),
  governanceStatus: document.querySelector('#governanceStatus'),
  moderationPanel: document.querySelector('#moderationPanel'),
  auditRefreshButton: document.querySelector('#auditRefreshButton'),
  spaceForm: document.querySelector('#spaceForm'),
  spaceNameInput: document.querySelector('#spaceNameInput'),
  spaceDomainsInput: document.querySelector('#spaceDomainsInput'),
  roleManagement: document.querySelector('#roleManagement'),
  roleForm: document.querySelector('#roleForm'),
  roleUserHashInput: document.querySelector('#roleUserHashInput'),
  roleSelect: document.querySelector('#roleSelect'),
  roleActionSelect: document.querySelector('#roleActionSelect'),
  adminUserList: document.querySelector('#adminUserList'),
  approvalList: document.querySelector('#approvalList'),
  metricsList: document.querySelector('#metricsList'),
  banForm: document.querySelector('#banForm'),
  banUserHashInput: document.querySelector('#banUserHashInput'),
  banReasonInput: document.querySelector('#banReasonInput'),
  moderationStatus: document.querySelector('#moderationStatus'),
  auditLogList: document.querySelector('#auditLogList'),
  publicAuditLogList: document.querySelector('#publicAuditLogList'),
  postTemplate: document.querySelector('#postTemplate'),
  caseTemplate: document.querySelector('#caseTemplate'),
  appealTemplate: document.querySelector('#appealTemplate'),
  approvalTemplate: document.querySelector('#approvalTemplate'),
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

function canModerate() {
  return Boolean(state.user?.roles.includes('moderator') || state.user?.roles.includes('system_admin'));
}

function canManageRoles() {
  return Boolean(state.user?.roles.includes('system_admin'));
}

function updateSessionView() {
  const signedIn = Boolean(state.user);
  elements.authPanel.classList.toggle('hidden', signedIn);
  elements.logoutButton.classList.toggle('hidden', !signedIn);
  elements.composerPanel.classList.toggle('hidden', !signedIn || !state.user.nickname);
  elements.nicknamePanel.classList.toggle('hidden', !signedIn || Boolean(state.user.nickname));
  elements.moderationPanel.classList.toggle('hidden', !canModerate());
  elements.roleManagement.classList.toggle('hidden', !canManageRoles());

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

function targetSummary(target) {
  if (!target) {
    return 'Target unavailable.';
  }

  if (target.type === 'user') {
    return `User ${target.user?.nickname || target.id} - ${target.user?.domain_group || 'unknown domain'}`;
  }

  return `${target.type} by ${target.author_nickname || 'unknown'}: ${target.content_excerpt || 'No content preview.'}`;
}

function resolutionSummary(resolution) {
  if (!resolution) {
    return '';
  }

  return `${resolution.decision || 'resolved'} / ${resolution.action || 'none'} - ${resolution.reason || 'no reason'}`;
}

function renderEvidenceList(container, items, emptyText, renderItem) {
  container.replaceChildren();
  if (!items || items.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'muted';
    empty.textContent = emptyText;
    container.append(empty);
    return;
  }

  for (const item of items) {
    const row = document.createElement('div');
    row.className = 'evidence-item';
    row.textContent = renderItem(item);
    container.append(row);
  }
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
      const commentHead = document.createElement('div');
      commentHead.className = 'comment-head';
      const author = document.createElement('strong');
      author.textContent = comment.nickname;
      const reportCommentButton = document.createElement('button');
      reportCommentButton.type = 'button';
      reportCommentButton.className = 'secondary mini-button';
      reportCommentButton.textContent = 'Report';
      reportCommentButton.classList.toggle('hidden', !state.user || !state.user.nickname);
      reportCommentButton.addEventListener('click', async () => {
        await reportTarget('comment', comment.id);
      });
      const content = document.createElement('span');
      content.textContent = comment.content;
      commentHead.append(author, reportCommentButton);
      item.append(commentHead, content);
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
    node.querySelector('.case-threshold').textContent = String(moderationCase.approval_threshold);
    node.querySelector('.case-jurors').textContent = String(moderationCase.juror_count);
    node.querySelector('.case-accused').textContent = moderationCase.accused?.nickname || shortHash(moderationCase.accused_hash);
    node.querySelector('.case-target').textContent = targetSummary(moderationCase.target);
    node.querySelector('.case-resolution').textContent = resolutionSummary(moderationCase.resolution);
    renderEvidenceList(
      node.querySelector('.case-report-list'),
      moderationCase.reports,
      'No report evidence.',
      (report) => `${report.weight} weight from ${report.actor_ref}: ${report.reason}`
    );
    renderEvidenceList(
      node.querySelector('.case-vote-list'),
      moderationCase.votes,
      'No jury votes yet.',
      (vote) => `${vote.weight} weight ${vote.decision}${vote.action ? ` / ${vote.action}` : ''} from ${vote.actor_ref}`
    );
    node.querySelector('.case-detail-button').addEventListener('click', async () => {
      await loadCaseDetail(moderationCase.id);
    });

    const actions = node.querySelector('.case-actions');
    actions.classList.toggle('hidden', moderationCase.status !== 'open');
    const actionSelect = node.querySelector('.case-action');
    actionSelect.value = moderationCase.target_type === 'user' ? 'ban_user' : 'hide_content';
    node.querySelector('.vote-violation').addEventListener('click', async () => {
      await vote(moderationCase.id, 'violation', actionSelect.value);
    });
    node.querySelector('.vote-dismiss').addEventListener('click', async () => {
      await vote(moderationCase.id, 'dismiss', 'none');
    });
    elements.caseList.append(node);
  }
}

function renderAppeals() {
  elements.appealList.replaceChildren();

  if (!state.user || state.user.trust_level < 2) {
    return;
  }

  const heading = document.createElement('h3');
  heading.textContent = 'Appeals';
  elements.appealList.append(heading);

  if (state.appeals.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'muted';
    empty.textContent = 'No appeals.';
    elements.appealList.append(empty);
    return;
  }

  for (const appeal of state.appeals) {
    const node = elements.appealTemplate.content.firstElementChild.cloneNode(true);
    node.querySelector('.appeal-title').textContent = `${appeal.target_type} appeal`;
    node.querySelector('.appeal-status').textContent = appeal.status;
    node.querySelector('.appeal-reason').textContent = appeal.reason || 'No reason provided';
    node.querySelector('.appeal-target-summary').textContent = targetSummary(appeal.target);
    node.querySelector('.appeal-approve').textContent = String(appeal.approve_weight);
    node.querySelector('.appeal-dismiss').textContent = String(appeal.dismiss_weight);
    node.querySelector('.appeal-appellant').textContent = appeal.appellant?.nickname || shortHash(appeal.appellant_hash);
    node.querySelector('.appeal-resolution').textContent = resolutionSummary(appeal.resolution);
    renderEvidenceList(
      node.querySelector('.appeal-vote-list'),
      appeal.votes,
      'No appeal votes yet.',
      (vote) => `${vote.weight} weight ${vote.decision} from ${vote.actor_ref}`
    );
    node.querySelector('.appeal-detail-button').addEventListener('click', async () => {
      await loadAppealDetail(appeal.id);
    });

    const actions = node.querySelector('.appeal-actions');
    actions.classList.toggle('hidden', appeal.status !== 'open');
    node.querySelector('.appeal-approve-button').addEventListener('click', async () => {
      await voteAppeal(appeal.id, 'approve');
    });
    node.querySelector('.appeal-dismiss-button').addEventListener('click', async () => {
      await voteAppeal(appeal.id, 'dismiss');
    });
    elements.appealList.append(node);
  }
}

function renderApprovals() {
  elements.approvalList.replaceChildren();

  if (!canModerate()) {
    return;
  }

  const heading = document.createElement('h3');
  heading.textContent = 'Approvals';
  elements.approvalList.append(heading);

  if (state.approvals.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'muted';
    empty.textContent = 'No approval requests.';
    elements.approvalList.append(empty);
    return;
  }

  for (const approval of state.approvals) {
    const node = elements.approvalTemplate.content.firstElementChild.cloneNode(true);
    const payload = approval.payload || {};
    node.querySelector('.approval-title').textContent = approval.operation.replaceAll('_', ' ');
    node.querySelector('.approval-status').textContent = approval.status;
    node.querySelector('.approval-detail').textContent = approvalDetail(approval);
    node.querySelector('.approval-count').textContent = String(approval.approvals_count);
    node.querySelector('.approval-required').textContent = String(approval.required_approvals);
    node.querySelector('.approval-time').textContent = formatTime(approval.created_at);

    const approveButton = node.querySelector('.approval-approve-button');
    approveButton.classList.toggle(
      'hidden',
      approval.status !== 'open' || (approval.operation === 'change_role' && !canManageRoles())
    );
    approveButton.addEventListener('click', async () => {
      await approveRequest(approval);
    });
    elements.approvalList.append(node);
  }
}

function approvalDetail(approval) {
  const payload = approval.payload || {};
  if (approval.operation === 'create_space') {
    return payload.name
      ? `${payload.name} - ${(payload.allowed_domains || []).join(', ') || 'all verified domains'}`
      : approval.id;
  }

  if (approval.operation === 'change_role') {
    return `${payload.action || 'change'} ${payload.role || 'role'} for ${shortHash(payload.user_hash)}`;
  }

  return approval.id;
}

function renderAdminUsers() {
  elements.adminUserList.replaceChildren();

  if (!canManageRoles()) {
    return;
  }

  if (state.adminUsers.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'muted';
    empty.textContent = 'No users loaded.';
    elements.adminUserList.append(empty);
    return;
  }

  for (const user of state.adminUsers) {
    const item = document.createElement('div');
    item.className = 'user-row';
    const label = document.createElement('span');
    label.textContent = `${user.nickname || '[unset]'} - ${user.domain_group} - ${user.roles.join(', ') || 'member'}`;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'secondary mini-button';
    button.textContent = 'Use';
    button.addEventListener('click', () => {
      elements.roleUserHashInput.value = user.user_hash;
      elements.banUserHashInput.value = user.user_hash;
    });
    item.append(label, button);
    elements.adminUserList.append(item);
  }
}

function metricValue(metric) {
  if (!metric) {
    return '0';
  }

  return metric.suppressed ? metric.range : String(metric.count);
}

function renderMetrics() {
  elements.metricsList.replaceChildren();

  if (!canModerate()) {
    return;
  }

  const heading = document.createElement('h3');
  heading.textContent = 'Metrics';
  elements.metricsList.append(heading);
  const note = document.createElement('p');
  note.className = 'muted';
  note.textContent = '1-9 means the exact count is suppressed.';
  elements.metricsList.append(note);

  const buckets = state.metrics?.buckets || [];
  if (buckets.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'muted';
    empty.textContent = 'No metrics yet.';
    elements.metricsList.append(empty);
    return;
  }

  for (const bucket of buckets.slice(0, 7)) {
    const row = document.createElement('div');
    row.className = 'metric-row';
    row.textContent = `${bucket.date}: posts ${metricValue(bucket.posts_created)}, comments ${metricValue(bucket.comments_created)}, reports ${metricValue(bucket.reports_created)}, cases ${metricValue(bucket.cases_opened)}`;
    elements.metricsList.append(row);
  }
}

function renderAuditLog() {
  elements.auditLogList.replaceChildren();

  if (!canModerate()) {
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

function renderPublicAuditLog() {
  elements.publicAuditLogList.replaceChildren();

  if (state.publicAuditLog.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'muted';
    empty.textContent = 'No public audit events.';
    elements.publicAuditLogList.append(empty);
    return;
  }

  for (const event of state.publicAuditLog.slice(0, 8)) {
    const node = elements.auditTemplate.content.firstElementChild.cloneNode(true);
    node.querySelector('.audit-operation').textContent = event.operation;
    node.querySelector('.audit-time').textContent = formatTime(event.created_at);
    node.querySelector('.audit-actor').textContent = event.actor_ref || 'system';
    node.querySelector('.audit-target').textContent = event.target_ref || event.target_type || 'none';
    node.querySelector('.audit-reason').textContent = event.reason;
    elements.publicAuditLogList.append(node);
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

async function loadCaseDetail(caseId) {
  setStatus(elements.governanceStatus, 'Loading case detail...');
  try {
    const payload = await api(`/governance/cases/${caseId}`);
    const index = state.cases.findIndex((moderationCase) => moderationCase.id === caseId);
    if (index >= 0) {
      state.cases[index] = payload.case;
    } else {
      state.cases.unshift(payload.case);
    }
    renderCases();
    setStatus(elements.governanceStatus, 'Case detail refreshed.');
  } catch (error) {
    setStatus(elements.governanceStatus, error.payload?.message || error.payload?.error || error.message);
  }
}

async function loadAppeals() {
  if (!state.user || state.user.trust_level < 2) {
    state.appeals = [];
    renderAppeals();
    return;
  }

  try {
    const payload = await api('/appeals');
    state.appeals = payload.appeals;
  } catch {
    state.appeals = [];
  }
  renderAppeals();
}

async function loadAppealDetail(appealId) {
  setStatus(elements.governanceStatus, 'Loading appeal detail...');
  try {
    const payload = await api(`/appeals/${appealId}`);
    const index = state.appeals.findIndex((appeal) => appeal.id === appealId);
    if (index >= 0) {
      state.appeals[index] = payload.appeal;
    } else {
      state.appeals.unshift(payload.appeal);
    }
    renderAppeals();
    setStatus(elements.governanceStatus, 'Appeal detail refreshed.');
  } catch (error) {
    setStatus(elements.governanceStatus, error.payload?.message || error.payload?.error || error.message);
  }
}

async function loadApprovals() {
  if (!canModerate()) {
    state.approvals = [];
    renderApprovals();
    return;
  }

  try {
    const payload = await api('/approvals');
    state.approvals = payload.approvals;
  } catch {
    state.approvals = [];
  }
  renderApprovals();
}

async function loadAdminUsers() {
  if (!canManageRoles()) {
    state.adminUsers = [];
    renderAdminUsers();
    return;
  }

  try {
    const payload = await api('/admin/users');
    state.adminUsers = payload.users;
  } catch {
    state.adminUsers = [];
  }
  renderAdminUsers();
}

async function loadAuditLog() {
  if (!canModerate()) {
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

async function loadMetrics() {
  if (!canModerate()) {
    state.metrics = null;
    renderMetrics();
    return;
  }

  try {
    const payload = await api('/metrics/summary');
    state.metrics = payload.metrics;
  } catch {
    state.metrics = null;
  }
  renderMetrics();
}

async function loadPublicAuditLog() {
  try {
    const payload = await api('/audit-log');
    state.publicAuditLog = payload.audit_log;
  } catch {
    state.publicAuditLog = [];
  }
  renderPublicAuditLog();
}

async function refreshAll() {
  await loadMe();
  await loadSpaces();
  await loadPosts();
  await loadCases();
  await loadAppeals();
  await loadApprovals();
  await loadAdminUsers();
  await loadMetrics();
  await loadAuditLog();
  await loadPublicAuditLog();
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
    await loadPublicAuditLog();
  } catch (error) {
    alert(error.payload?.message || error.payload?.error || error.message);
  }
}

async function voteAppeal(appealId, decision) {
  try {
    await api(`/appeals/${appealId}/votes`, {
      method: 'POST',
      body: JSON.stringify({ decision })
    });
    await loadAppeals();
    await loadPublicAuditLog();
  } catch (error) {
    alert(error.payload?.message || error.payload?.error || error.message);
  }
}

async function approveRequest(approval) {
  try {
    if (approval.operation === 'create_space') {
      await api('/spaces', {
        method: 'POST',
        body: JSON.stringify(approval.payload)
      });
    } else if (approval.operation === 'change_role') {
      await api('/admin/roles', {
        method: 'POST',
        body: JSON.stringify(approval.payload)
      });
      await loadMe();
      await loadAdminUsers();
    }
    await loadSpaces();
    await loadApprovals();
    await loadAuditLog();
    await loadPublicAuditLog();
  } catch (error) {
    setStatus(elements.moderationStatus, error.payload?.message || error.payload?.error || error.message);
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

elements.spaceForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  setStatus(elements.moderationStatus, 'Requesting space...');
  try {
    const allowedDomains = elements.spaceDomainsInput.value
      .split(',')
      .map((domain) => domain.trim().toLowerCase())
      .filter(Boolean);
    const payload = await api('/spaces', {
      method: 'POST',
      body: JSON.stringify({
        name: elements.spaceNameInput.value,
        allowed_domains: allowedDomains
      })
    });
    elements.spaceNameInput.value = '';
    elements.spaceDomainsInput.value = '';
    setStatus(elements.moderationStatus, payload.space ? 'Space created.' : 'Approval requested.');
    await loadSpaces();
    await loadApprovals();
    await loadAuditLog();
    await loadPublicAuditLog();
  } catch (error) {
    setStatus(elements.moderationStatus, error.payload?.message || error.payload?.error || error.message);
  }
});

elements.roleForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  setStatus(elements.moderationStatus, 'Requesting role change...');
  try {
    const payload = await api('/admin/roles', {
      method: 'POST',
      body: JSON.stringify({
        user_hash: elements.roleUserHashInput.value,
        role: elements.roleSelect.value,
        action: elements.roleActionSelect.value
      })
    });
    setStatus(
      elements.moderationStatus,
      payload.user ? 'Role change applied.' : 'Role change needs another system admin approval.'
    );
    await loadMe();
    await loadAdminUsers();
    await loadApprovals();
    await loadMetrics();
    await loadAuditLog();
    await loadPublicAuditLog();
  } catch (error) {
    setStatus(elements.moderationStatus, error.payload?.message || error.payload?.error || error.message);
  }
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
    await loadPublicAuditLog();
  } catch (error) {
    setStatus(elements.moderationStatus, error.payload?.message || error.payload?.error || error.message);
  }
});

elements.logoutButton.addEventListener('click', async () => {
  state.token = '';
  state.user = null;
  state.cases = [];
  state.appeals = [];
  state.approvals = [];
  state.adminUsers = [];
  state.metrics = null;
  localStorage.removeItem('unianon:token');
  await refreshAll();
});

elements.refreshButton.addEventListener('click', refreshAll);
elements.auditRefreshButton.addEventListener('click', async () => {
  await loadApprovals();
  await loadAdminUsers();
  await loadMetrics();
  await loadAuditLog();
  await loadPublicAuditLog();
});

refreshAll().catch((error) => {
  console.error(error);
});
