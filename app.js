const CONFIG = {
  owner: 'jyhome1228-cyber',
  api: 'https://api.github.com',
  activeWindowDays: 30,
  maxRepos: 100,
  visibleRows: 18,
};

const state = {
  repos: [],
  events: [],
  query: '',
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const els = {
  clock: $('#clock'),
  dateLabel: $('#dateLabel'),
  githubStatus: $('#githubStatus'),
  connectionPill: $('#connectionPill'),
  syncText: $('#syncText'),
  repoCount: $('#repoCount'),
  activeCount: $('#activeCount'),
  issueCount: $('#issueCount'),
  forkCount: $('#forkCount'),
  repoTableBody: $('#repoTableBody'),
  repoSearch: $('#repoSearch'),
  refreshButton: $('#refreshButton'),
  activityList: $('#activityList'),
  terminalLines: $('#terminalLines'),
  commandTrigger: $('#commandTrigger'),
  commandOverlay: $('#commandOverlay'),
  commandInput: $('#commandInput'),
  commandResults: $('#commandResults'),
  repoRowTemplate: $('#repoRowTemplate'),
};

function formatNumber(value) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value || 0);
}

function formatRelativeTime(dateString) {
  const diff = Date.now() - new Date(dateString).getTime();
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diff < minute) return 'NOW';
  if (diff < hour) return `${Math.floor(diff / minute)}M`;
  if (diff < day) return `${Math.floor(diff / hour)}H`;
  if (diff < 14 * day) return `${Math.floor(diff / day)}D`;
  return new Date(dateString).toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' }).replaceAll('-', '.');
}

function isActive(repo) {
  const threshold = Date.now() - CONFIG.activeWindowDays * 24 * 60 * 60 * 1000;
  return new Date(repo.pushed_at || repo.updated_at).getTime() >= threshold;
}

function log(message, tone = 'normal') {
  const p = document.createElement('p');
  if (tone === 'muted') p.className = 'terminal-muted';
  p.innerHTML = `<span class="prompt">&gt;</span>${escapeHtml(message)}`;
  els.terminalLines.appendChild(p);
  while (els.terminalLines.children.length > 7) {
    els.terminalLines.removeChild(els.terminalLines.firstElementChild);
  }
}

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function updateClock() {
  const now = new Date();
  els.clock.textContent = `${new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Seoul',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(now)} KST`;

  els.dateLabel.textContent = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now).replaceAll('-', '.');
}

async function githubFetch(path) {
  const response = await fetch(`${CONFIG.api}${path}`, {
    headers: { Accept: 'application/vnd.github+json' },
  });

  if (!response.ok) {
    const remaining = response.headers.get('x-ratelimit-remaining');
    throw new Error(response.status === 403 && remaining === '0'
      ? 'GitHub public API rate limit reached'
      : `GitHub API ${response.status}`);
  }
  return response.json();
}

async function loadGitHubData() {
  setConnection('syncing');
  log('syncing github repositories...');

  try {
    const [repos, events] = await Promise.all([
      githubFetch(`/users/${CONFIG.owner}/repos?per_page=${CONFIG.maxRepos}&sort=pushed&direction=desc&type=owner`),
      githubFetch(`/users/${CONFIG.owner}/events/public?per_page=20`),
    ]);

    state.repos = repos.filter((repo) => !repo.archived);
    state.events = events;
    renderAll();
    setConnection('connected');
    log(`${state.repos.length} repositories loaded / connection established`);
  } catch (error) {
    console.error(error);
    setConnection('error', error.message);
    renderError(error.message);
    log(`sync error: ${error.message}`);
  }
}

function setConnection(status, detail = '') {
  if (status === 'connected') {
    els.githubStatus.textContent = 'GITHUB CONNECTED';
    els.connectionPill.textContent = 'LIVE';
    els.connectionPill.style.color = 'var(--green)';
    els.syncText.textContent = `synced ${new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
    return;
  }

  if (status === 'error') {
    els.githubStatus.textContent = 'GITHUB DEGRADED';
    els.connectionPill.textContent = 'ERROR';
    els.connectionPill.style.color = 'var(--red)';
    els.syncText.textContent = detail;
    return;
  }

  els.githubStatus.textContent = 'GITHUB SYNCING';
  els.connectionPill.textContent = 'SYNC';
  els.connectionPill.style.color = 'var(--orange)';
  els.syncText.textContent = 'fetching repositories...';
}

function renderAll() {
  renderMetrics();
  renderRepositories();
  renderActivity();
  renderCommandResults('');
}

function renderMetrics() {
  const active = state.repos.filter(isActive).length;
  const openItems = state.repos.reduce((sum, repo) => sum + (repo.open_issues_count || 0), 0);
  const forks = state.repos.filter((repo) => repo.fork).length;

  els.repoCount.textContent = formatNumber(state.repos.length).padStart(2, '0');
  els.activeCount.textContent = formatNumber(active).padStart(2, '0');
  els.issueCount.textContent = formatNumber(openItems).padStart(2, '0');
  els.forkCount.textContent = formatNumber(forks).padStart(2, '0');
}

function filteredRepos() {
  const q = state.query.trim().toLowerCase();
  if (!q) return state.repos;
  return state.repos.filter((repo) => {
    return [repo.name, repo.description, repo.language, repo.default_branch]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(q));
  });
}

function renderRepositories() {
  els.repoTableBody.innerHTML = '';
  const repos = filteredRepos().slice(0, CONFIG.visibleRows);

  if (!repos.length) {
    els.repoTableBody.innerHTML = '<tr class="loading-row"><td colspan="6">&gt; no repositories matched filter</td></tr>';
    return;
  }

  repos.forEach((repo) => {
    const row = els.repoRowTemplate.content.firstElementChild.cloneNode(true);
    const active = isActive(repo);

    row.querySelector('.repo-name').textContent = repo.name.toUpperCase();
    row.querySelector('.repo-description').textContent = repo.description || `${repo.full_name}`;
    row.querySelector('.repo-branch').textContent = repo.default_branch || 'main';
    row.querySelector('.repo-state').textContent = active ? '● ACTIVE' : '○ IDLE';
    row.querySelector('.repo-language').textContent = repo.language || '—';
    row.querySelector('.repo-updated').textContent = formatRelativeTime(repo.pushed_at || repo.updated_at);
    row.querySelector('.repo-open').href = repo.html_url;

    if (active) {
      row.querySelector('.repo-status-dot').classList.add('active');
      row.querySelector('.repo-state').classList.add('active');
    }

    row.addEventListener('dblclick', () => window.open(repo.html_url, '_blank', 'noopener'));
    els.repoTableBody.appendChild(row);
  });
}

function eventLabel(type) {
  const labels = {
    PushEvent: 'PUSH',
    CreateEvent: 'CREATE',
    DeleteEvent: 'DELETE',
    PullRequestEvent: 'PULL REQUEST',
    IssuesEvent: 'ISSUE',
    IssueCommentEvent: 'COMMENT',
    WatchEvent: 'STAR',
    ForkEvent: 'FORK',
    ReleaseEvent: 'RELEASE',
  };
  return labels[type] || type.replace('Event', '').toUpperCase();
}

function eventDetail(event) {
  if (event.type === 'PushEvent') {
    const count = event.payload?.size || event.payload?.commits?.length || 0;
    const branch = (event.payload?.ref || '').replace('refs/heads/', '') || 'branch';
    return `${count} commit${count === 1 ? '' : 's'} → ${branch}`;
  }
  if (event.type === 'CreateEvent') return `${event.payload?.ref_type || 'resource'} created`;
  if (event.type === 'PullRequestEvent') return `${event.payload?.action || 'updated'} #${event.payload?.number || ''}`;
  if (event.type === 'IssuesEvent') return `${event.payload?.action || 'updated'} #${event.payload?.issue?.number || ''}`;
  return event.payload?.action || 'repository activity';
}

function renderActivity() {
  els.activityList.innerHTML = '';
  const events = state.events.slice(0, 8);

  if (!events.length) {
    state.repos.slice(0, 8).forEach((repo) => {
      appendActivity('UPDATE', repo.name, `repository updated / ${repo.default_branch}`, repo.pushed_at || repo.updated_at);
    });
    return;
  }

  events.forEach((event) => {
    appendActivity(eventLabel(event.type), event.repo?.name?.split('/').pop() || 'repository', eventDetail(event), event.created_at);
  });
}

function appendActivity(type, name, detail, createdAt) {
  const item = document.createElement('div');
  item.className = 'activity-item';
  item.innerHTML = `
    <div class="activity-top mono">
      <span class="activity-type">${escapeHtml(type)}</span>
      <span class="activity-time">${formatRelativeTime(createdAt)}</span>
    </div>
    <div class="activity-name">${escapeHtml(name.toUpperCase())}</div>
    <div class="activity-detail mono">${escapeHtml(detail)}</div>
  `;
  els.activityList.appendChild(item);
}

function renderError(message) {
  els.repoTableBody.innerHTML = `<tr class="loading-row"><td colspan="6">&gt; ${escapeHtml(message)}</td></tr>`;
  els.activityList.innerHTML = `<div class="activity-empty mono">${escapeHtml(message)}</div>`;
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
    ['refresh', 'Refresh GitHub data', 'R'],
    ['recent', 'Show recently updated', '↵'],
    ['github', 'Open GitHub profile', '↗'],
  ].filter(([, label]) => !q || label.toLowerCase().includes(q));

  commands.forEach(([command, label, key]) => {
    const button = document.createElement('button');
    button.dataset.command = command;
    button.innerHTML = `<span>${escapeHtml(label)}</span><em class="mono">${escapeHtml(key)}</em>`;
    els.commandResults.appendChild(button);
  });

  state.repos
    .filter((repo) => !q || repo.name.toLowerCase().includes(q))
    .slice(0, 8)
    .forEach((repo) => {
      const button = document.createElement('button');
      button.dataset.repoUrl = repo.html_url;
      button.innerHTML = `<span>${escapeHtml(repo.name.toUpperCase())}</span><em class="mono">${escapeHtml(repo.default_branch || 'main')} ↗</em>`;
      els.commandResults.appendChild(button);
    });
}

function runCommand(command) {
  if (command === 'refresh') {
    closeCommand();
    loadGitHubData();
    return;
  }
  if (command === 'recent') {
    closeCommand();
    state.query = '';
    els.repoSearch.value = '';
    state.repos.sort((a, b) => new Date(b.pushed_at) - new Date(a.pushed_at));
    renderRepositories();
    log('repository index sorted by latest push');
    return;
  }
  if (command === 'github') {
    window.open(`https://github.com/${CONFIG.owner}`, '_blank', 'noopener');
  }
}

els.repoSearch.addEventListener('input', (event) => {
  state.query = event.target.value;
  renderRepositories();
});

els.refreshButton.addEventListener('click', loadGitHubData);
els.commandTrigger.addEventListener('click', openCommand);

els.commandInput.addEventListener('input', (event) => renderCommandResults(event.target.value));
els.commandResults.addEventListener('click', (event) => {
  const button = event.target.closest('button');
  if (!button) return;
  if (button.dataset.command) runCommand(button.dataset.command);
  if (button.dataset.repoUrl) window.open(button.dataset.repoUrl, '_blank', 'noopener');
});

els.commandOverlay.addEventListener('click', (event) => {
  if (event.target === els.commandOverlay) closeCommand();
});

document.addEventListener('keydown', (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    els.commandOverlay.classList.contains('open') ? closeCommand() : openCommand();
  }
  if (event.key === 'Escape') closeCommand();
});

$$('.nav-item').forEach((item) => {
  item.addEventListener('click', () => {
    $$('.nav-item').forEach((nav) => nav.classList.remove('active'));
    item.classList.add('active');
    const view = item.dataset.view || 'settings';
    log(`${view} selected / module shell reserved for next build`, 'muted');
  });
});

updateClock();
setInterval(updateClock, 1000 * 20);
loadGitHubData();
