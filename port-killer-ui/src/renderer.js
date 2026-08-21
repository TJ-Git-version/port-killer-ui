'use strict';

/**
 * 端口占用关闭工具 - 渲染进程交互逻辑
 * 通过 window.portTool（preload 暴露的安全 API）与主进程通信。
 */

const api = window.portTool;

const els = {
  portInput: document.getElementById('portInput'),
  queryBtn: document.getElementById('queryBtn'),
  clearBtn: document.getElementById('clearBtn'),
  chipBar: document.getElementById('chipBar'),
  resultCount: document.getElementById('resultCount'),
  selectedCount: document.getElementById('selectedCount'),
  selectAllBtn: document.getElementById('selectAllBtn'),
  deselectAllBtn: document.getElementById('deselectAllBtn'),
  killBtn: document.getElementById('killBtn'),
  processBody: document.getElementById('processBody'),
  emptyState: document.getElementById('emptyState'),
  loadingOverlay: document.getElementById('loadingOverlay'),
  toastContainer: document.getElementById('toastContainer'),
  confirmModal: document.getElementById('confirmModal'),
  confirmText: document.getElementById('confirmText'),
  modalOkBtn: document.getElementById('modalOkBtn'),
  modalCancelBtn: document.getElementById('modalCancelBtn'),
  adminBadge: document.getElementById('adminBadge'),
  relaunchAdminBtn: document.getElementById('relaunchAdminBtn'),
  versionText: document.getElementById('versionText'),
  themeToggle: document.getElementById('themeToggle'),
  updateBtn: document.getElementById('updateBtn'),
  updateStatus: document.getElementById('updateStatus'),
};

const THEME_KEY = 'portkiller-theme';
const MAX_RANGE_PORTS = 1000;

let results = [];      // [{ pid, port, name, proto, localAddr, state }]
let checked = new Set(); // 已勾选的 pid
let lastQuery = null;  // { type: 'single'|'range', label }
let modalResolve = null;
let updateState = 'idle'; // idle | checking | available | downloading | downloaded

init();

function init() {
  initTheme();
  bindEvents();
  checkAdmin();
  loadAppInfo();
  bindUpdateEvents();
}

/* ---------------- 事件绑定 ---------------- */

function bindEvents() {
  els.portInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') query();
  });
  els.queryBtn.addEventListener('click', query);
  els.clearBtn.addEventListener('click', clearAll);
  els.chipBar.addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    els.portInput.value = chip.dataset.range || chip.dataset.port;
    query();
  });
  els.selectAllBtn.addEventListener('click', () => setAll(true));
  els.deselectAllBtn.addEventListener('click', () => setAll(false));
  els.killBtn.addEventListener('click', requestKill);
  els.themeToggle.addEventListener('click', toggleTheme);
  els.updateBtn.addEventListener('click', onCheckUpdate);

  els.processBody.addEventListener('change', (e) => {
    const cb = e.target.closest('.row-check');
    if (!cb) return;
    const tr = cb.closest('tr');
    const pid = tr.dataset.pid;
    if (cb.checked) checked.add(pid);
    else checked.delete(pid);
    tr.classList.toggle('selected', cb.checked);
    updateSummary();
  });

  els.processBody.addEventListener('click', (e) => {
    // 点击整行切换勾选（但点击勾选框本身时避免重复触发）
    const cb = e.target.closest('.row-check');
    if (cb) return;
    const tr = e.target.closest('tr');
    if (!tr) return;
    const box = tr.querySelector('.row-check');
    if (!box) return;
    box.checked = !box.checked;
    const change = new Event('change', { bubbles: true });
    box.dispatchEvent(change);
  });

  els.modalCancelBtn.addEventListener('click', () => closeModal(false));
  els.modalOkBtn.addEventListener('click', () => closeModal(true));
  els.confirmModal.addEventListener('click', (e) => {
    if (e.target === els.confirmModal) closeModal(false);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !els.confirmModal.classList.contains('hidden')) closeModal(false);
  });

  els.relaunchAdminBtn.addEventListener('click', relaunchAdmin);
}

/* ---------------- 主题 ---------------- */

function initTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  let theme = saved;
  if (theme !== 'light' && theme !== 'dark') {
    theme = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }
  applyTheme(theme);
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  try { localStorage.setItem(THEME_KEY, theme); } catch (err) { /* 忽略 */ }
}

function toggleTheme() {
  const next = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
  applyTheme(next);
}

/* ---------------- 查询 ---------------- */

/** 解析查询输入：支持单端口（8080）或范围（8080-8090），非法返回 { ok:false, message } */
function parseQueryInput(text) {
  const s = String(text == null ? '' : text).trim();
  if (/^\d+$/.test(s)) {
    const n = Number(s);
    if (n >= 1 && n <= 65535) return { ok: true, type: 'single', port: n, label: String(n) };
    return { ok: false, message: '端口号无效，请输入 1~65535 之间的整数。' };
  }
  if (/^\d+\s*-\s*\d+$/.test(s)) {
    const parts = s.split('-').map((x) => Number(x.trim()));
    const start = parts[0];
    const end = parts[1];
    if (start < 1 || end > 65535 || start > end) {
      return { ok: false, message: '端口范围无效，起止需在 1~65535 之间且起始不大于结束。' };
    }
    if (end - start + 1 > MAX_RANGE_PORTS) {
      return { ok: false, message: `端口范围过大，单次最多查询 ${MAX_RANGE_PORTS} 个端口。` };
    }
    return { ok: true, type: 'range', start, end, label: `${start}-${end}` };
  }
  return { ok: false, message: '请输入端口号（如 8080）或范围（如 8080-8090）。' };
}

async function query() {
  const parsed = parseQueryInput(els.portInput.value);
  if (!parsed.ok) {
    toast(parsed.message || '输入无效', 'error');
    els.portInput.focus();
    return;
  }
  setLoading(true);
  els.loadingOverlay.querySelector('p').textContent = '正在查询端口占用情况…';
  lastQuery = { type: parsed.type, label: parsed.label };
  try {
    const res = parsed.type === 'single'
      ? await api.queryPort(parsed.port)
      : await api.queryPortRange(`${parsed.start}-${parsed.end}`);
    if (!res.ok) {
      toast(res.error || '查询失败', 'error');
      results = [];
      render();
      return;
    }
    results = res.results;
    checked.clear();
    render();
    const extra = res.skipped ? `（另有 ${res.skipped} 条残留连接已忽略）` : '';
    const scope = parsed.type === 'single' ? `端口 ${res.port}` : `范围 ${res.start}-${res.end}`;
    toast(`${scope} 共发现 ${res.results.length} 个进程${extra}`, res.results.length ? 'success' : 'info');
  } catch (err) {
    toast('查询失败：' + err.message, 'error');
  } finally {
    setLoading(false);
  }
}

function clearAll() {
  results = [];
  checked.clear();
  lastQuery = null;
  els.portInput.value = '';
  render();
}

/* ---------------- 渲染 ---------------- */

function render() {
  els.processBody.innerHTML = '';
  if (results.length === 0) {
    els.emptyState.classList.remove('hidden');
    els.resultCount.textContent = lastQuery
      ? `${lastQuery.type === 'range' ? '范围' : '端口'} ${lastQuery.label} 无占用`
      : '未查询';
    updateSummary();
    return;
  }
  els.emptyState.classList.add('hidden');
  els.resultCount.textContent = `${results.length} 个进程`;

  const frag = document.createDocumentFragment();
  results.forEach((r, i) => {
    const tr = document.createElement('tr');
    tr.dataset.pid = r.pid;
    tr.style.animationDelay = `${Math.min(i * 45, 400)}ms`;
    const avatar = (r.name && r.name[0] || '?').toUpperCase();
    tr.innerHTML = `
      <td class="col-check"><input type="checkbox" class="row-check" aria-label="选择 PID ${escapeHtml(r.pid)}"></td>
      <td class="pid-cell">${escapeHtml(r.pid)}</td>
      <td><span class="name-cell"><span class="proc-avatar">${escapeHtml(avatar)}</span>${escapeHtml(r.name)}</span></td>
      <td><span class="pill proto ${escapeHtml(r.proto.toLowerCase())}">${escapeHtml(r.proto)}</span></td>
      <td class="addr-cell"><code>${escapeHtml(r.localAddr)}</code></td>
      <td class="port-cell">${escapeHtml(r.port)}</td>
      <td><span class="pill state ${stateClass(r.state)}">${escapeHtml(r.state)}</span></td>`;
    frag.appendChild(tr);
  });
  els.processBody.appendChild(frag);
  updateSummary();
}

function stateClass(state) {
  const s = String(state).toUpperCase();
  if (s === 'LISTENING') return 'ok';
  if (s === 'ESTABLISHED') return 'info';
  if (s === 'TIME_WAIT' || s === 'CLOSE_WAIT' || s === 'FIN_WAIT_1' || s === 'FIN_WAIT_2') return 'warn';
  return '';
}

function updateSummary() {
  const n = checked.size;
  els.selectedCount.textContent = `已选 ${n} 个`;
  els.killBtn.disabled = n === 0;
  els.killBtn.textContent = n === 0 ? '关闭选中进程' : `关闭选中进程（${n}）`;
}

function setAll(value) {
  checked.clear();
  if (value) results.forEach((r) => checked.add(r.pid));
  els.processBody.querySelectorAll('.row-check').forEach((cb) => { cb.checked = value; });
  els.processBody.querySelectorAll('tr').forEach((tr) => tr.classList.toggle('selected', value));
  updateSummary();
}

/* ---------------- 关闭进程 ---------------- */

async function requestKill() {
  const pids = [...checked];
  if (pids.length === 0) return;
  const confirmed = await openModal(
    `确定要强制结束选中的 ${pids.length} 个进程吗？\n未保存的数据可能丢失。`,
    '强制关闭',
    'danger'
  );
  if (!confirmed) return;
  await performKill(pids);
}

async function performKill(pids) {
  let denied = false;
  let killed = 0;
  setLoading(true);
  els.loadingOverlay.querySelector('p').textContent = '正在关闭进程…';
  for (const pid of [...pids]) {
    try {
      const res = await api.killProcess(pid);
      if (res.ok) {
        killed += 1;
        results = results.filter((r) => r.pid !== pid);
        checked.delete(pid);
      } else {
        if (res.code === 'denied') denied = true;
        toast(res.message, 'error');
      }
    } catch (err) {
      toast(`关闭 PID ${pid} 失败：${err.message}`, 'error');
    }
  }
  setLoading(false);
  render();

  if (killed > 0) toast(`已成功关闭 ${killed} 个进程，可重新查询确认端口已释放`, 'success');
  if (denied) {
    const again = await openModal(
      '部分进程因权限不足未能关闭。\n是否以管理员身份重新启动本工具？',
      '以管理员身份重启',
      'info'
    );
    if (again) relaunchAdmin();
  }
}

/* ---------------- 弹窗 ---------------- */

function openModal(text, okLabel, kind) {
  els.confirmText.textContent = text;
  els.modalOkBtn.textContent = okLabel || '确定';
  const icon = els.confirmModal.querySelector('.modal-icon');
  icon.className = 'modal-icon ' + (kind || 'danger');
  els.confirmModal.classList.remove('hidden');
  els.modalOkBtn.focus();
  return new Promise((resolve) => {
    modalResolve = resolve;
  });
}

/** 若已有弹窗打开，等待其关闭后再弹新窗（用于更新提示等异步场景） */
function openModalWhenFree(text, okLabel, kind) {
  if (els.confirmModal.classList.contains('hidden')) {
    return openModal(text, okLabel, kind);
  }
  return new Promise((resolve) => {
    const timer = setInterval(() => {
      if (els.confirmModal.classList.contains('hidden')) {
        clearInterval(timer);
        openModal(text, okLabel, kind).then(resolve);
      }
    }, 200);
  });
}

function closeModal(result) {
  if (!modalResolve) return;
  const resolve = modalResolve;
  modalResolve = null;
  els.confirmModal.classList.add('hidden');
  resolve(result);
}

/* ---------------- 权限 ---------------- */

async function checkAdmin() {
  try {
    const { admin } = await api.isAdmin();
    els.adminBadge.classList.toggle('admin', admin);
    els.adminBadge.innerHTML = `<i class="dot"></i>${admin ? '管理员权限' : '普通权限'}`;
  } catch {
    els.adminBadge.textContent = '权限未知';
  }
}

async function relaunchAdmin() {
  const ok = await openModal('将以管理员身份重新启动本工具，请在 UAC 弹窗中确认。', '重启', 'info');
  if (!ok) return;
  try {
    await api.relaunchAdmin();
    toast('已请求以管理员身份重启…', 'info');
  } catch (err) {
    toast('启动失败：' + err.message, 'error');
  }
}

/* ---------------- 应用信息与自动更新 ---------------- */

async function loadAppInfo() {
  try {
    const info = await api.getAppInfo();
    if (info && info.version) els.versionText.textContent = 'v' + info.version;
    if (info && info.updateSupported) els.updateBtn.classList.remove('hidden');
  } catch (err) {
    // 忽略：开发环境或旧版主进程
  }
}

function setUpdateStatus(text, cls) {
  els.updateStatus.textContent = text || '';
  els.updateStatus.className = 'update-status' + (text ? (cls ? ' ' + cls : '') : ' hidden');
}

async function onCheckUpdate() {
  if (updateState === 'downloading') return;
  setUpdateStatus('正在检查更新…');
  try {
    const res = await api.checkForUpdates();
    if (!res.ok) {
      setUpdateStatus('');
      toast(res.error || '无法检查更新', 'error');
    }
  } catch (err) {
    setUpdateStatus('');
    toast('检查更新失败：' + err.message, 'error');
  }
}

function bindUpdateEvents() {
  if (!api.onUpdateEvent) return;
  api.onUpdateEvent((payload) => {
    switch (payload.type) {
      case 'checking':
        updateState = 'checking';
        setUpdateStatus('正在检查更新…');
        break;
      case 'available':
        updateState = 'available';
        setUpdateStatus(`发现新版本 v${payload.version}`);
        toast(`发现新版本 v${payload.version}，是否立即下载？`, 'info');
        promptDownload(payload.version);
        break;
      case 'not-available':
        updateState = 'idle';
        setUpdateStatus('');
        toast(`当前已是最新版本${payload.version ? ' v' + payload.version : ''}`, 'success');
        break;
      case 'progress':
        updateState = 'downloading';
        setUpdateStatus(`正在下载更新… ${payload.percent}%`, 'downloading');
        break;
      case 'downloaded':
        updateState = 'downloaded';
        setUpdateStatus(`新版本 v${payload.version} 已就绪`, 'downloading');
        promptInstall();
        break;
      case 'error':
        updateState = 'idle';
        setUpdateStatus('更新失败', 'error');
        toast('更新失败：' + (payload.message || '未知错误'), 'error');
        break;
    }
  });
}

async function promptDownload(version) {
  const ok = await openModalWhenFree(
    `发现新版本 v${version}，是否立即下载并安装？`,
    '立即下载',
    'info'
  );
  if (!ok) {
    setUpdateStatus(`发现新版本 v${version}，可稍后点击「检查更新」重新下载`);
    return;
  }
  try {
    const res = await api.downloadUpdate();
    if (!res.ok) {
      setUpdateStatus('');
      toast(res.error || '下载更新失败', 'error');
    }
  } catch (err) {
    setUpdateStatus('');
    toast('下载更新失败：' + err.message, 'error');
  }
}

async function promptInstall() {
  const ok = await openModalWhenFree(
    '新版本已下载完成，是否立即重启并安装？',
    '重启安装',
    'info'
  );
  if (!ok) {
    setUpdateStatus('新版本已下载，将在退出应用时自动安装');
    return;
  }
  try {
    await api.installUpdate();
  } catch (err) {
    toast('安装失败：' + err.message, 'error');
  }
}

/* ---------------- 工具函数 ---------------- */

function setLoading(on) {
  els.loadingOverlay.classList.toggle('hidden', !on);
}

function escapeHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function toast(message, type = 'info') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  const icon = type === 'success' ? '✓' : type === 'error' ? '!' : 'i';
  el.innerHTML = `<span class="toast-icon">${icon}</span><span>${escapeHtml(message)}</span>`;
  els.toastContainer.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 320);
  }, 3400);
}
