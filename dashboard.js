const state = {
  logs: [],
  selectedId: null,
  query: '',
};

const elements = {
  clearSelectionButton: document.getElementById('clearSelectionButton'),
  detailMeta: document.getElementById('detailMeta'),
  detailPanel: document.getElementById('detailPanel'),
  detailStatus: document.getElementById('detailStatus'),
  detailTitle: document.getElementById('detailTitle'),
  emptyState: document.getElementById('emptyState'),
  errorPayload: document.getElementById('errorPayload'),
  requestList: document.getElementById('requestList'),
  requestPayload: document.getElementById('requestPayload'),
  responsePayload: document.getElementById('responsePayload'),
  searchInput: document.getElementById('searchInput'),
};

function formatJson(value) {
  if (value == null) {
    return 'null';
  }

  return JSON.stringify(value, null, 2);
}

function formatTime(timestamp) {
  if (!timestamp) {
    return 'Unknown time';
  }

  return new Date(timestamp).toLocaleTimeString();
}

function formatListUrl(value) {
  if (!value) {
    return 'Unknown URL';
  }

  try {
    const parsedUrl = new URL(value);
    return `${parsedUrl.pathname}${parsedUrl.search}${parsedUrl.hash}` || '/';
  } catch (error) {
    return value;
  }
}

function getMethodClassName(method) {
  return `method-${String(method || 'get').toLowerCase()}`;
}

function getStatusClassName(log) {
  return log.ok ? 'status-success' : 'status-error';
}

function getFilteredLogs() {
  const normalizedQuery = state.query.trim().toLowerCase();
  if (!normalizedQuery) {
    return state.logs;
  }

  return state.logs.filter(log => {
    const haystack = [
      log.appName,
      log.clientName,
      log.method,
      log.url,
      log.response && log.response.status,
      log.error && log.error.message,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    return haystack.includes(normalizedQuery);
  });
}

function renderList() {
  const logs = getFilteredLogs();

  if (!logs.length) {
    elements.requestList.innerHTML = '<div class="empty-state">No requests match the current filter.</div>';
    return;
  }

  elements.requestList.innerHTML = logs.map(log => `
    <article class="request-card ${state.selectedId === log.id ? 'active' : ''}" data-log-id="${log.id}">
      <div class="request-topline">
        <span class="method-pill ${getMethodClassName(log.method)}">${log.method}</span>
        <span class="status-badge ${getStatusClassName(log)}">${log.response ? log.response.status : 'ERR'}</span>
      </div>
      <div class="request-url">${formatListUrl(log.url)}</div>
      <div class="request-meta">
        ${log.appName || 'Unknown app'} · ${log.clientName || 'default'} · <span class="request-meta-strong">${formatTime(log.startedAt)}</span> · <span class="request-meta-strong">${log.durationMs || 0}ms</span>
      </div>
    </article>
  `).join('');

  document.querySelectorAll('[data-log-id]').forEach(node => {
    node.addEventListener('click', () => {
      state.selectedId = node.getAttribute('data-log-id');
      render();
    });
  });
}

function renderDetails() {
  const selectedLog = state.logs.find(log => log.id === state.selectedId);

  if (!selectedLog) {
    elements.emptyState.classList.remove('hidden');
    elements.detailPanel.classList.add('hidden');
    return;
  }

  elements.emptyState.classList.add('hidden');
  elements.detailPanel.classList.remove('hidden');
  elements.detailTitle.textContent = `${selectedLog.method} ${selectedLog.url}`;
  elements.detailMeta.textContent = [
    `${selectedLog.appName || 'Unknown app'} / ${selectedLog.clientName || 'default'}`,
    `${formatTime(selectedLog.startedAt)} to ${formatTime(selectedLog.finishedAt)}`,
    `${selectedLog.durationMs || 0}ms`,
    selectedLog.platform || 'unknown',
  ].join(' · ');
  elements.detailStatus.className = `status-badge ${getStatusClassName(selectedLog)}`;
  elements.detailStatus.textContent = selectedLog.response ? selectedLog.response.status : 'ERR';
  elements.requestPayload.textContent = formatJson(selectedLog.request);
  elements.responsePayload.textContent = formatJson(selectedLog.response);
  elements.errorPayload.textContent = formatJson(selectedLog.error);
}

function render() {
  renderList();
  renderDetails();
}

async function loadInitialLogs() {
  const response = await fetch('/api/logs');
  const payload = await response.json();
  state.logs = payload.logs || [];
  render();
}

function connectEventStream() {
  const eventSource = new EventSource('/api/stream');

  eventSource.onmessage = event => {
    const payload = JSON.parse(event.data);

    if (payload.type === 'log') {
      state.logs.unshift(payload.payload);
      if (!state.selectedId) {
        state.selectedId = payload.payload.id;
      }
      render();
    }
  };
}

elements.searchInput.addEventListener('input', event => {
  state.query = event.target.value;
  render();
});

elements.clearSelectionButton.addEventListener('click', () => {
  state.selectedId = null;
  render();
});

loadInitialLogs().then(connectEventStream);
