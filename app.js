const CONFIG = {
  owner: 'jyhome1228-cyber',
  api: 'https://api.github.com',
  activeWindowDays: 30,
  maxRepos: 100,
  dashboardRows: 8,
  cacheKey: '9w-control-core-v2',
  cacheTtl: 3 * 60 * 1000,
  deploymentScanLimit: 8,
};

const state = {
  repos: [],
  events: [],
  route: 'dashboard',
  repoQuery: '',
  projectQuery: '',
  projectFilter: 'all',
  apiMeta: { remaining: null, limit: null },
  loadedAt: null,
  deploymentsLoaded: false,
  issuesLoaded: false,
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const els = {
  bootScreen: $('#bootScreen'),
  bootText: $('#bootText'),
  sidebar: $('#sidebar'),
  mobileNavTrigger: $('#mobileNavTrigger'),
  clock: $('#clock'),
  dateLabel: $('#dateLabel'),
  githubStatus: $('#githubStatus'),
  connectionPill: $('#connectionPill'),
  syncText: $('#syncText'),
  repoCount: $('#repoCount'),
  activeCount: $('#activeCount'),
  issueCount: $('#issueCount'),
  languageCount: $('#languageCount'),
  repoMeta: $('#repoMeta'),
  activeMeta: $('#activeMeta'),
  languageMeta: $('#languageMeta'),
  dashboardRepoBody: $('#dashboardRepoBody'),
  dashboardActivity: $('#dashboardActivity'),
  languageBars: $('#languageBars'),
  apiHealth: $('#apiHealth'),
  indexHealth: $('#indexHealth'),
  terminalLines: $('#terminalLines'),
  navProjectCount: $('#navProjectCount'),
  projectsStat: $('#projectsStat'),
  projectFilters: $('#projectFilters'),
  projectSearch: $('#projectSearch'),
  projectList: $('#projectList'),
  refreshButton: $('#refreshButton'),
  repoSearch: $('#repoSearch'),
  repoResults: $('#repoResults'),
  repoTableBody: $('#repoTableBody'),
  activityFeed: $('#activityFeed'),
  loadDeployments: $('#loadDeployments'),
  deploymentList: $('#deploymentList'),
  loadIssues: $('#loadIssues'),
  issueSummary: $('#issueSummary'),
  issueList: $('#issueList'),
  globalSearchInput: $('#globalSearchInput'),
  globalSearchResults: $('#globalSearchResults'),
  settingsMode: $('#settingsMode'),
  settingsStatus: $('#settingsStatus'),
  drawerBackdrop: $('#drawerBackdrop'),
  repoDrawer: $('#repoDrawer'),
  drawerRepoName: $('#drawerRepoName'),
  drawerBody: $('#drawerBody'),
  drawerClose: $('#drawerClose'),
  commandTrigger: $('#commandTrigger'),
  commandOverlay: $('#commandOverlay'),
  commandInput: $('#commandInput'),
  commandResults: $('#commandResults'),
};

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function formatNumber(value) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Number(value) || 0);
}

function formatRelativeTime(dateString) {
  if (!dateString) return '—';
  const target = new Date(dateString).getTime();
  if (!Number.isFinite(target)) return '—';
  const diff = Math.max(0, Date.now() - target);
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (diff < minute) return 'NOW';
  if (diff < hour) return `${Math.floor(diff / minute)}M`;
  if (diff < day) return `${Math.floor(diff / hour)}H`;
  if (diff < 14 * day) return `${Math.floor(diff / day)}D`;
  return new Date(dateString).toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' }).replaceAll('-', '.');
}

function formatDateTime(dateString) {
  if (!dateString) return '—';
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date(dateString)).replace(',', '');
}

function isActive(repo) {
  const threshold = Date.now() - CONFIG.activeWindowDays * 24 * 60 * 60 * 1000;
  return new Date(repo.pushed_at || repo.updated_at || 0).getTime() >= threshold;
}

function repoUpdatedAt(repo) {
  return repo.pushed_at || repo.updated_at || repo.created_at;
}

function log(message, tone = 'normal') {
  if (!els.terminalLines) return;
  const p = document.createElement('p');
  if (tone === 'muted') p.className = 'terminal-muted';
  p.innerHTML = `<span class="prompt">&gt;</span>${escapeHtml(message)}`;
  els.terminalLines.appendChild(p);
  while (els.terminalLines.children.length > 7) els.terminalLines.removeChild(els.terminalLines.firstElementChild);
}

function updateClock() {
  const now = new Date();
  els.clock.textContent = `${new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(now)} KST`;
  els.dateLabel.textContent = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now).replaceAll('-', '.');
}

function setConnection(status, detail = '') {
  const map = {
    syncing: ['GITHUB SYNCING', 'SYNC', 'fetching repositories...', 'var(--orange)'],
    connected: ['GITHUB CONNECTED', 'LIVE', detail || 'public API connected', 'var(--green)'],
    cached: ['GITHUB CONNECTED', 'CACHE', detail || 'cached index loaded', 'var(--green)'],
    error: ['GITHUB DEGRADED', 'ERROR', detail || 'connection failed', 'var(--red)'],
  };
  const item = map[status] || map.syncing;
  els.githubStatus.textContent = item[0];
  els.connectionPill.textContent = item[1];
  els.connectionPill.style.color = item[3];
  els.syncText.textContent = item[2];
  els.settingsStatus.textContent = status === 'error' ? 'DEGRADED' : status === 'syncing' ? 'SYNCING' : 'CONNECTED';
  els.apiHealth.textContent = status === 'error' ? 'DEGRADED' : status === 'syncing' ? 'CONNECTING' : 'OPERATIONAL';
}

function saveCoreCache() {
  try {
    sessionStorage.setItem(CONFIG.cacheKey, JSON.stringify({
      savedAt: Date.now(), repos: state.repos, events: state.events,
    }));
  } catch (_) {}
}

function readCoreCache() {
  try {
    const raw = sessionStorage.getItem(CONFIG.cacheKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed.savedAt || Date.now() - parsed.savedAt > CONFIG.cacheTtl) return null;
    if (!Array.isArray(parsed.repos) || !Array.isArray(parsed.events)) return null;
    return parsed;
  } catch (_) {
    return null;
  }
}

async function githubFetch(path) {
  const response = await fetch(`${CONFIG.api}${path}`, {
    headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
  });
  state.apiMeta.remaining = response.headers.get('x-ratelimit-remaining');
  state.apiMeta.limit = response.headers.get('x-ratelimit-limit');
  if (!response.ok) {
    const remaining = response.headers.get('x-ratelimit-remaining');
    const message = response.status === 403 && remaining === '0'
      ? 'GitHub API rate limit reached'
      : `GitHub API ${response.status}`;
    throw new Error(message);
  }
  return response.json();
}

async function loadCoreData({ force = false } = {}) {
  setConnection('syncing');
  log('syncing github repository index...');
  els.bootText.textContent = 'SYNCING GITHUB REPOSITORIES...';

  if (!force) {
    const cached = readCoreCache();
    if (cached) {
      state.repos = cached.repos;
      state.events = cached.events;
      state.loadedAt = new Date(cached.savedAt);
      renderAll();
      setConnection('cached', `cached ${formatRelativeTime(cached.savedAt)}`);
      finishBoot();
      log(`${state.repos.length} repositories restored from session cache`, 'muted');
      return;
    }
  }

  try {
    const [repos, events] = await Promise.all([
      githubFetch(`/users/${CONFIG.owner}/repos?per_page=${CONFIG.maxRepos}&sort=pushed&direction=desc&type=owner`),
      githubFetch(`/users/${CONFIG.owner}/events/public?per_page=30`),
    ]);
    state.repos = Array.isArray(repos) ? repos : [];
    state.events = Array.isArray(events) ? events : [];
    state.loadedAt = new Date();
    saveCoreCache();
    renderAll();
    const remaining = state.apiMeta.remaining != null ? ` / API ${state.apiMeta.remaining} REMAIN` : '';
    setConnection('connected', `synced ${new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}${remaining}`);
    log(`${state.repos.length} repositories loaded / connection established`);
  } catch (error) {
    console.error(error);
    setConnection('error', error.message);
    renderCoreError(error.message);
    log(`sync error: ${error.message}`);
  } finally {
    finishBoot();
  }
}

function finishBoot() {
  setTimeout(() => els.bootScreen.classList.add('done'), 180);
}

function renderAll() {
  renderMetrics();
  renderDashboardRepositories();
  renderDashboardActivity();
  renderLanguageBars();
  renderProjects();
  renderRepositories();
  renderActivityFeed();
  renderIssueSignals();
  renderCommandResults('');
  els.navProjectCount.textContent = String(state.repos.filter((repo) => !repo.archived).length).padStart(2, '0');
  els.projectsStat.textContent = String(state.repos.length).padStart(2, '0');
  els.indexHealth.textContent = `${state.repos.length} INDEXED`;
  els.settingsMode.textContent = 'PUBLIC API';
}

function renderMetrics() {
  const nonArchived = state.repos.filter((repo) => !repo.archived);
  const active = nonArchived.filter(isActive);
  const openItems = nonArchived.reduce((sum, repo) => sum + (repo.open_issues_count || 0), 0);
  const languages = new Set(nonArchived.map((repo) => repo.language).filter(Boolean));
  els.repoCount.textContent = formatNumber(nonArchived.length).padStart(2, '0');
  els.activeCount.textContent = formatNumber(active.length).padStart(2, '0');
  els.issueCount.textContent = formatNumber(openItems).padStart(2, '0');
  els.languageCount.textContent = formatNumber(languages.size).padStart(2, '0');
  els.repoMeta.textContent = `${state.repos.filter((repo) => repo.archived).length} ARCHIVED`;
  els.activeMeta.textContent = `${Math.round((active.length / Math.max(nonArchived.length, 1)) * 100)}% OF INDEX`;
  els.languageMeta.textContent = [...languages].slice(0, 3).join(' / ').toUpperCase() || 'NO LANGUAGE DATA';
}

function renderDashboardRepositories() {
  els.dashboardRepoBody.innerHTML = '';
  const repos = state.repos.filter((repo) => !repo.archived).slice(0, CONFIG.dashboardRows);
  if (!repos.length) {
    els.dashboardRepoBody.innerHTML = '<tr class="loading-row"><td colspan="6">&gt; no repositories found</td></tr>';
    return;
  }
  repos.forEach((repo) => {
    const tr = document.createElement('tr');
    const active = isActive(repo);
    tr.innerHTML = `
      <td><button class="repo-name-button" type="button" data-repo="${escapeHtml(repo.name)}"><span class="repo-status-dot ${active ? 'active' : ''}"></span><span><strong>${escapeHtml(repo.name.toUpperCase())}</strong><small>${escapeHtml(repo.description || repo.full_name)}</small></span></button></td>
      <td class="mono">${escapeHtml(repo.default_branch || 'main')}</td>
      <td class="mono repo-state ${active ? 'active' : ''}">${active ? '● ACTIVE' : '○ IDLE'}</td>
      <td class="mono">${escapeHtml(repo.language || '—')}</td>
      <td class="mono">${formatRelativeTime(repoUpdatedAt(repo))}</td>
      <td><a class="repo-open mono" href="${escapeHtml(repo.html_url)}" target="_blank" rel="noreferrer">OPEN ↗</a></td>`;
    els.dashboardRepoBody.appendChild(tr);
  });
}

function filteredRepos() {
  const q = state.repoQuery.trim().toLowerCase();
  const repos = state.repos.filter((repo) => !repo.archived);
  if (!q) return repos;
  return repos.filter((repo) => [repo.name, repo.description, repo.language, repo.default_branch, repo.visibility]
    .filter(Boolean).some((value) => String(value).toLowerCase().includes(q)));
}

function renderRepositories() {
  const repos = filteredRepos();
  els.repoResults.textContent = `${repos.length} RESULTS`;
  els.repoTableBody.innerHTML = '';
  if (!repos.length) {
    els.repoTableBody.innerHTML = '<tr class="loading-row"><td colspan="7">&gt; no repositories matched filter</td></tr>';
    return;
  }
  repos.forEach((repo) => {
    const tr = document.createElement('tr');
    tr.className = 'repo-row';
    const active = isActive(repo);
    tr.innerHTML = `
      <td><button class="repo-name-button" type="button" data-repo="${escapeHtml(repo.name)}"><span class="repo-status-dot ${active ? 'active' : ''}"></span><span><strong>${escapeHtml(repo.name.toUpperCase())}</strong><small>${escapeHtml(repo.description || repo.full_name)}</small></span></button></td>
      <td class="mono">${escapeHtml((repo.visibility || (repo.private ? 'private' : 'public')).toUpperCase())}</td>
      <td class="mono">${escapeHtml(repo.default_branch || 'main')}</td>
      <td class="mono">${escapeHtml(repo.language || '—')}</td>
      <td class="mono">${formatNumber(repo.open_issues_count || 0)}</td>
      <td class="mono">${formatRelativeTime(repoUpdatedAt(repo))}</td>
      <td><a class="repo-open mono" href="${escapeHtml(repo.html_url)}" target="_blank" rel="noreferrer">OPEN ↗</a></td>`;
    els.repoTableBody.appendChild(tr);
  });
}

function getProjectRepos() {
  const q = state.projectQuery.trim().toLowerCase();
  return state.repos.filter((repo) => {
    if (state.projectFilter === 'active' && (!isActive(repo) || repo.archived)) return false;
    if (state.projectFilter === 'idle' && (isActive(repo) || repo.archived)) return false;
    if (state.projectFilter === 'archived' && !repo.archived) return false;
    if (state.projectFilter === 'all' && repo.archived) return false;
    if (!q) return true;
    return [repo.name, repo.description, repo.language].filter(Boolean).some((value) => String(value).toLowerCase().includes(q));
  });
}

function renderProjects() {
  const repos = getProjectRepos();
  els.projectList.innerHTML = '';
  if (!repos.length) {
    els.projectList.innerHTML = '<div class="empty-state mono">&gt; no project matched current filter</div>';
    return;
  }
  repos.forEach((repo, index) => {
    const row = document.createElement('div');
    row.className = 'project-row';
    row.dataset.repo = repo.name;
    row.innerHTML = `
      <span class="project-index">${String(index + 1).padStart(2, '0')}</span>
      <div class="project-main"><strong>${escapeHtml(repo.name.toUpperCase())}</strong><span>${escapeHtml(repo.description || repo.full_name)}</span></div>
      <span class="project-cell">${escapeHtml(repo.language || 'NO LANG')}</span>
      <span class="project-cell">${escapeHtml(repo.default_branch || 'main')}</span>
      <span class="project-cell ${isActive(repo) && !repo.archived ? 'active' : ''}">${repo.archived ? '− ARCHIVE' : isActive(repo) ? '● ACTIVE' : '○ IDLE'}</span>
      <span class="project-cell">${formatRelativeTime(repoUpdatedAt(repo))}</span>`;
    els.projectList.appendChild(row);
  });
}

function eventLabel(type) {
  const labels = {
    PushEvent: 'PUSH', CreateEvent: 'CREATE', DeleteEvent: 'DELETE', PullRequestEvent: 'PULL REQUEST',
    IssuesEvent: 'ISSUE', IssueCommentEvent: 'COMMENT', WatchEvent: 'STAR', ForkEvent: 'FORK',
    ReleaseEvent: 'RELEASE', PublicEvent: 'PUBLIC', MemberEvent: 'MEMBER',
  };
  return labels[type] || String(type || 'EVENT').replace('Event', '').toUpperCase();
}

function eventDetail(event) {
  if (event.type === 'PushEvent') {
    const count = event.payload?.size ?? event.payload?.commits?.length ?? 0;
    const branch = String(event.payload?.ref || '').replace('refs/heads/', '') || 'branch';
    const first = event.payload?.commits?.[0]?.message;
    return `${count} commit${count === 1 ? '' : 's'} → ${branch}${first ? ` / ${first.split('\n')[0]}` : ''}`;
  }
  if (event.type === 'CreateEvent') return `${event.payload?.ref_type || 'resource'} created${event.payload?.ref ? ` / ${event.payload.ref}` : ''}`;
  if (event.type === 'DeleteEvent') return `${event.payload?.ref_type || 'resource'} deleted${event.payload?.ref ? ` / ${event.payload.ref}` : ''}`;
  if (event.type === 'PullRequestEvent') return `${event.payload?.action || 'updated'} PR #${event.payload?.number || ''}`;
  if (event.type === 'IssuesEvent') return `${event.payload?.action || 'updated'} issue #${event.payload?.issue?.number || ''}`;
  if (event.type === 'WatchEvent') return 'repository starred';
  if (event.type === 'ForkEvent') return 'repository forked';
  return event.payload?.action || 'repository activity';
}

function renderDashboardActivity() {
  els.dashboardActivity.innerHTML = '';
  const events = state.events.slice(0, 7);
  if (!events.length) {
    state.repos.slice(0, 7).forEach((repo) => appendDashboardActivity('UPDATE', repo.name, `repository updated / ${repo.default_branch}`, repoUpdatedAt(repo)));
    return;
  }
  events.forEach((event) => appendDashboardActivity(eventLabel(event.type), event.repo?.name?.split('/').pop() || 'repository', eventDetail(event), event.created_at));
}

function appendDashboardActivity(type, name, detail, createdAt) {
  const item = document.createElement('div');
  item.className = 'activity-item';
  item.innerHTML = `<div class="activity-top mono"><span class="activity-type">${escapeHtml(type)}</span><span class="activity-time">${formatRelativeTime(createdAt)}</span></div><div class="activity-name">${escapeHtml(String(name).toUpperCase())}</div><div class="activity-detail mono">${escapeHtml(detail)}</div>`;
  els.dashboardActivity.appendChild(item);
}

function renderActivityFeed() {
  els.activityFeed.innerHTML = '';
  const events = state.events.length ? state.events : state.repos.slice(0, 20).map((repo) => ({ type: 'UpdateEvent', repo: { name: repo.full_name }, created_at: repoUpdatedAt(repo), payload: { action: 'repository updated' } }));
  if (!events.length) {
    els.activityFeed.innerHTML = '<div class="empty-state mono">&gt; no public activity available</div>';
    return;
  }
  events.forEach((event) => {
    const row = document.createElement('div');
    row.className = 'feed-row';
    row.innerHTML = `<span class="feed-time">${formatRelativeTime(event.created_at)}</span><span class="feed-type">${escapeHtml(eventLabel(event.type))}</span><strong class="feed-repo">${escapeHtml(event.repo?.name || 'repository')}</strong><span class="feed-detail">${escapeHtml(eventDetail(event))}</span>`;
    els.activityFeed.appendChild(row);
  });
}

function renderLanguageBars() {
  const counts = new Map();
  state.repos.filter((repo) => !repo.archived && repo.language).forEach((repo) => counts.set(repo.language, (counts.get(repo.language) || 0) + 1));
  const items = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  els.languageBars.innerHTML = '';
  if (!items.length) {
    els.languageBars.innerHTML = '<div class="empty-state mono">no language metadata</div>';
    return;
  }
  const max = Math.max(...items.map(([, count]) => count));
  items.forEach(([language, count]) => {
    const row = document.createElement('div');
    row.className = 'language-row';
    row.innerHTML = `<strong>${escapeHtml(language.toUpperCase())}</strong><div class="language-track"><i style="width:${Math.max(4, (count / max) * 100)}%"></i></div><span>${count}</span>`;
    els.languageBars.appendChild(row);
  });
}

function renderIssueSignals() {
  const withItems = state.repos.filter((repo) => (repo.open_issues_count || 0) > 0).sort((a, b) => b.open_issues_count - a.open_issues_count);
  const total = withItems.reduce((sum, repo) => sum + repo.open_issues_count, 0);
  els.issueSummary.innerHTML = `
    <div><span>OPEN ITEM SIGNAL</span><strong>${formatNumber(total)}</strong></div>
    <div><span>REPOSITORIES WITH ITEMS</span><strong>${formatNumber(withItems.length)}</strong></div>
    <div><span>CLEAN REPOSITORIES</span><strong>${formatNumber(state.repos.filter((repo) => !repo.archived && !(repo.open_issues_count || 0)).length)}</strong></div>`;
}

async function loadIssues() {
  if (state.issuesLoaded) return;
  els.loadIssues.disabled = true;
  els.loadIssues.textContent = 'LOADING...';
  els.issueList.innerHTML = '<div class="empty-state mono">&gt; querying GitHub issue search...</div>';
  try {
    const query = encodeURIComponent(`user:${CONFIG.owner} is:issue is:open`);
    const data = await githubFetch(`/search/issues?q=${query}&sort=updated&order=desc&per_page=50`);
    const items = Array.isArray(data.items) ? data.items : [];
    els.issueList.innerHTML = '';
    if (!items.length) {
      els.issueList.innerHTML = '<div class="empty-state mono">&gt; no open issues found in public repositories</div>';
    } else {
      items.forEach((issue) => {
        const repoName = issue.repository_url?.split('/').pop() || 'repository';
        const row = document.createElement('div');
        row.className = 'issue-row';
        row.innerHTML = `<span class="issue-number">#${issue.number}</span><a class="issue-title" href="${escapeHtml(issue.html_url)}" target="_blank" rel="noreferrer">${escapeHtml(issue.title)}</a><span class="issue-repo">${escapeHtml(repoName)}</span><span class="issue-updated">${formatRelativeTime(issue.updated_at)}</span>`;
        els.issueList.appendChild(row);
      });
    }
    state.issuesLoaded = true;
    els.loadIssues.textContent = `${items.length} LOADED`;
    log(`${items.length} open issues loaded from public repositories`);
  } catch (error) {
    els.issueList.innerHTML = `<div class="empty-state mono">&gt; ${escapeHtml(error.message)}</div>`;
    els.loadIssues.disabled = false;
    els.loadIssues.textContent = 'RETRY ISSUES';
    log(`issue scan failed: ${error.message}`);
  }
}

async function loadDeployments() {
  if (state.deploymentsLoaded) return;
  const candidates = state.repos.filter((repo) => !repo.archived && !repo.fork).slice(0, CONFIG.deploymentScanLimit);
  els.loadDeployments.disabled = true;
  els.loadDeployments.textContent = 'SCANNING...';
  els.deploymentList.innerHTML = '<div class="empty-state mono">&gt; scanning recent repositories for GitHub Actions...</div>';
  const results = [];
  for (const repo of candidates) {
    try {
      const data = await githubFetch(`/repos/${CONFIG.owner}/${encodeURIComponent(repo.name)}/actions/runs?per_page=1`);
      const run = data.workflow_runs?.[0];
      if (run) results.push({ repo, run });
    } catch (error) {
      if (String(error.message).includes('rate limit')) break;
    }
  }
  els.deploymentList.innerHTML = '';
  if (!results.length) {
    els.deploymentList.innerHTML = '<div class="empty-state mono">&gt; no workflow runs found in recently updated repositories</div>';
  } else {
    results.sort((a, b) => new Date(b.run.updated_at) - new Date(a.run.updated_at));
    results.forEach(({ repo, run }) => {
      const status = run.conclusion || run.status || 'pending';
      const css = status === 'success' ? 'success' : ['failure', 'cancelled', 'timed_out'].includes(status) ? 'failure' : 'pending';
      const row = document.createElement('div');
      row.className = 'deployment-row';
      row.innerHTML = `<div><strong>${escapeHtml(repo.name.toUpperCase())}</strong><small>${escapeHtml(run.name || 'WORKFLOW')}</small></div><span class="mono">${escapeHtml(run.head_branch || repo.default_branch || 'main')}</span><span class="deployment-state ${css}">${escapeHtml(status.toUpperCase())}</span><span class="mono">${escapeHtml(String(run.head_sha || '').slice(0, 7) || '—')}</span><a class="repo-open mono" href="${escapeHtml(run.html_url)}" target="_blank" rel="noreferrer">${formatRelativeTime(run.updated_at)} ↗</a>`;
      els.deploymentList.appendChild(row);
    });
  }
  state.deploymentsLoaded = true;
  els.loadDeployments.textContent = `${results.length} RUNS`;
  log(`${results.length} workflow runs found across ${candidates.length} recent repositories`);
}

async function openRepoDrawer(repoName) {
  const repo = state.repos.find((item) => item.name === repoName);
  if (!repo) return;
  els.drawerRepoName.textContent = repo.name.toUpperCase();
  els.drawerBackdrop.hidden = false;
  els.repoDrawer.classList.add('open');
  els.repoDrawer.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
  els.drawerBody.innerHTML = `
    <div class="drawer-summary"><div><span>BRANCH</span><strong>${escapeHtml(repo.default_branch || 'main')}</strong></div><div><span>LANGUAGE</span><strong>${escapeHtml(repo.language || '—')}</strong></div><div><span>UPDATED</span><strong>${formatRelativeTime(repoUpdatedAt(repo))}</strong></div></div>
    <div class="drawer-section"><div class="drawer-section-title"><span>ABOUT</span><span>${escapeHtml((repo.visibility || 'public').toUpperCase())}</span></div><div class="drawer-description">${escapeHtml(repo.description || 'No repository description.')}</div></div>
    <div class="drawer-section"><div class="drawer-section-title"><span>METADATA</span><span>${escapeHtml(repo.full_name)}</span></div><div class="drawer-summary"><div><span>OPEN ITEMS</span><strong>${repo.open_issues_count || 0}</strong></div><div><span>FORKS</span><strong>${repo.forks_count || 0}</strong></div><div><span>SIZE</span><strong>${formatNumber(repo.size)} KB</strong></div></div></div>
    <div class="drawer-section"><div class="drawer-section-title"><span>ACTIONS</span><span>QUICK LINKS</span></div><div class="drawer-actions"><a class="outline-button mono" href="${escapeHtml(repo.html_url)}" target="_blank" rel="noreferrer">GITHUB ↗</a>${repo.homepage ? `<a class="outline-button mono" href="${escapeHtml(repo.homepage)}" target="_blank" rel="noreferrer">LIVE SITE ↗</a>` : ''}<a class="outline-button mono" href="${escapeHtml(repo.html_url)}/commits/${escapeHtml(repo.default_branch || 'main')}" target="_blank" rel="noreferrer">COMMITS ↗</a></div></div>
    <div class="drawer-section" id="drawerCommits"><div class="drawer-section-title"><span>LATEST COMMITS</span><span>LOADING</span></div><div class="empty-state mono">&gt; fetching commit history...</div></div>`;
  try {
    const commits = await githubFetch(`/repos/${CONFIG.owner}/${encodeURIComponent(repo.name)}/commits?per_page=5`);
    const box = $('#drawerCommits');
    if (!box) return;
    box.innerHTML = `<div class="drawer-section-title"><span>LATEST COMMITS</span><span>${Array.isArray(commits) ? commits.length : 0} ITEMS</span></div>`;
    if (!Array.isArray(commits) || !commits.length) {
      box.insertAdjacentHTML('beforeend', '<div class="empty-state mono">no commit history returned</div>');
      return;
    }
    commits.forEach((item) => {
      const div = document.createElement('div');
      div.className = 'commit-row';
      div.innerHTML = `<strong>${escapeHtml(item.commit?.message?.split('\n')[0] || 'commit')}</strong><span>${escapeHtml(String(item.sha || '').slice(0, 7))} / ${escapeHtml(item.commit?.author?.name || 'unknown')} / ${formatRelativeTime(item.commit?.author?.date)}</span>`;
      box.appendChild(div);
    });
  } catch (error) {
    const box = $('#drawerCommits');
    if (box) box.innerHTML = `<div class="drawer-section-title"><span>LATEST COMMITS</span><span>ERROR</span></div><div class="empty-state mono">&gt; ${escapeHtml(error.message)}</div>`;
  }
}

function closeRepoDrawer() {
  els.repoDrawer.classList.remove('open');
  els.repoDrawer.setAttribute('aria-hidden', 'true');
  setTimeout(() => { els.drawerBackdrop.hidden = true; }, 250);
  document.body.style.overflow = '';
}

function renderGlobalSearch(query) {
  const q = query.trim().toLowerCase();
  els.globalSearchResults.innerHTML = '';
  if (!q) {
    els.globalSearchResults.innerHTML = '<div class="empty-state mono">start typing to search the workspace index</div>';
    return;
  }
  const repoResults = state.repos.filter((repo) => [repo.name, repo.description, repo.language, repo.default_branch].filter(Boolean).some((value) => String(value).toLowerCase().includes(q))).slice(0, 12);
  const eventResults = state.events.filter((event) => `${eventLabel(event.type)} ${event.repo?.name || ''} ${eventDetail(event)}`.toLowerCase().includes(q)).slice(0, 8);
  const results = [
    ...repoResults.map((repo) => ({ type: 'REPOSITORY', title: repo.name, detail: `${repo.language || 'NO LANG'} / ${repo.default_branch || 'main'}`, action: () => openRepoDrawer(repo.name) })),
    ...eventResults.map((event) => ({ type: 'ACTIVITY', title: event.repo?.name || eventLabel(event.type), detail: eventDetail(event), action: () => routeTo('activity') })),
  ];
  if (!results.length) {
    els.globalSearchResults.innerHTML = '<div class="empty-state mono">&gt; no result in current workspace index</div>';
    return;
  }
  results.forEach((result) => {
    const row = document.createElement('div');
    row.className = 'search-result';
    row.innerHTML = `<span class="search-result-type">${escapeHtml(result.type)}</span><div><strong>${escapeHtml(result.title)}</strong><small>${escapeHtml(result.detail)}</small></div><span>OPEN →</span>`;
    row.addEventListener('click', result.action);
    els.globalSearchResults.appendChild(row);
  });
}

function routeTo(route) {
  const valid = ['dashboard', 'projects', 'repositories', 'activity', 'deployments', 'issues', 'search', 'settings'];
  state.route = valid.includes(route) ? route : 'dashboard';
  $$('.view').forEach((view) => view.classList.toggle('active', view.dataset.view === state.route));
  $$('.nav-item').forEach((item) => item.classList.toggle('active', item.dataset.route === state.route));
  history.replaceState(null, '', state.route === 'dashboard' ? location.pathname : `#${state.route}`);
  els.sidebar.classList.remove('open');
  window.scrollTo({ top: 0, behavior: 'instant' });
  if (state.route === 'search') setTimeout(() => els.globalSearchInput.focus(), 80);
  log(`${state.route} module selected`, 'muted');
}

function openCommand() {
  els.commandOverlay.classList.add('open');
  els.commandOverlay.setAttribute('aria-hidden', 'false');
  els.commandInput.value = '';
  renderCommandResults('');
  requestAnimationFrame(() => els.commandInput.focus());
}

function closeCommand() {
  els.commandOverlay.classList.remove('open');
  els.commandOverlay.setAttribute('aria-hidden', 'true');
}

function renderCommandResults(query = '') {
  const q = query.trim().toLowerCase();
  els.commandResults.innerHTML = '<div class="command-section-label mono">COMMANDS / REPOSITORIES</div>';
  const commands = [
    { id: 'dashboard', label: 'Open dashboard', meta: '01' },
    { id: 'projects', label: 'Open projects', meta: '02' },
    { id: 'repositories', label: 'Open repositories', meta: '03' },
    { id: 'activity', label: 'Open activity stream', meta: '04' },
    { id: 'refresh', label: 'Sync GitHub data', meta: 'R' },
    { id: 'github', label: 'Open GitHub profile', meta: '↗' },
  ].filter((item) => !q || item.label.toLowerCase().includes(q));
  commands.forEach((item) => {
    const button = document.createElement('button');
    button.dataset.command = item.id;
    button.innerHTML = `<span>${escapeHtml(item.label)}</span><em class="mono">${escapeHtml(item.meta)}</em>`;
    els.commandResults.appendChild(button);
  });
  state.repos.filter((repo) => !q || repo.name.toLowerCase().includes(q)).slice(0, 10).forEach((repo) => {
    const button = document.createElement('button');
    button.dataset.repo = repo.name;
    button.innerHTML = `<span>${escapeHtml(repo.name.toUpperCase())}</span><em class="mono">${escapeHtml(repo.default_branch || 'main')} →</em>`;
    els.commandResults.appendChild(button);
  });
}

function runCommand(command) {
  if (command === 'refresh') {
    closeCommand();
    try { sessionStorage.removeItem(CONFIG.cacheKey); } catch (_) {}
    loadCoreData({ force: true });
    return;
  }
  if (command === 'github') {
    window.open(`https://github.com/${CONFIG.owner}`, '_blank', 'noopener');
    return;
  }
  closeCommand();
  routeTo(command);
}

function renderCoreError(message) {
  const escaped = escapeHtml(message);
  els.dashboardRepoBody.innerHTML = `<tr class="loading-row"><td colspan="6">&gt; ${escaped}</td></tr>`;
  els.repoTableBody.innerHTML = `<tr class="loading-row"><td colspan="7">&gt; ${escaped}</td></tr>`;
  els.dashboardActivity.innerHTML = `<div class="activity-empty mono">${escaped}</div>`;
  els.indexHealth.textContent = 'INDEX ERROR';
}

function delegateRepoOpen(event) {
  const button = event.target.closest('[data-repo]');
  if (!button) return;
  openRepoDrawer(button.dataset.repo);
}

$$('[data-route]').forEach((button) => button.addEventListener('click', () => routeTo(button.dataset.route)));
els.dashboardRepoBody.addEventListener('click', delegateRepoOpen);
els.repoTableBody.addEventListener('click', delegateRepoOpen);
els.projectList.addEventListener('click', delegateRepoOpen);
els.repoSearch.addEventListener('input', (event) => { state.repoQuery = event.target.value; renderRepositories(); });
els.projectSearch.addEventListener('input', (event) => { state.projectQuery = event.target.value; renderProjects(); });
els.projectFilters.addEventListener('click', (event) => {
  const button = event.target.closest('[data-filter]');
  if (!button) return;
  state.projectFilter = button.dataset.filter;
  $$('#projectFilters button').forEach((item) => item.classList.toggle('active', item === button));
  renderProjects();
});
els.refreshButton.addEventListener('click', () => {
  try { sessionStorage.removeItem(CONFIG.cacheKey); } catch (_) {}
  loadCoreData({ force: true });
});
els.loadIssues.addEventListener('click', loadIssues);
els.loadDeployments.addEventListener('click', loadDeployments);
els.globalSearchInput.addEventListener('input', (event) => renderGlobalSearch(event.target.value));
els.drawerClose.addEventListener('click', closeRepoDrawer);
els.drawerBackdrop.addEventListener('click', closeRepoDrawer);
els.mobileNavTrigger.addEventListener('click', () => els.sidebar.classList.toggle('open'));
els.commandTrigger.addEventListener('click', openCommand);
els.commandInput.addEventListener('input', (event) => renderCommandResults(event.target.value));
els.commandResults.addEventListener('click', (event) => {
  const button = event.target.closest('button');
  if (!button) return;
  if (button.dataset.command) runCommand(button.dataset.command);
  if (button.dataset.repo) { closeCommand(); openRepoDrawer(button.dataset.repo); }
});
els.commandOverlay.addEventListener('click', (event) => { if (event.target === els.commandOverlay) closeCommand(); });

document.addEventListener('keydown', (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    els.commandOverlay.classList.contains('open') ? closeCommand() : openCommand();
  }
  if (event.key === 'Escape') {
    closeCommand();
    if (els.repoDrawer.classList.contains('open')) closeRepoDrawer();
    els.sidebar.classList.remove('open');
  }
});

window.addEventListener('hashchange', () => routeTo(location.hash.replace('#', '') || 'dashboard'));

updateClock();
setInterval(updateClock, 20 * 1000);
routeTo(location.hash.replace('#', '') || 'dashboard');
loadCoreData();
