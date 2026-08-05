(() => {
  const $ = (id) => document.getElementById(id);

  const usernameInput = $('username');
  const ttlSelect = $('ttl-days');
  const dropzone = $('dropzone');
  const fileInput = $('file-input');
  const browseBtn = $('browse-btn');
  const uploadState = $('upload-state');
  const uploadMsg = $('upload-msg');
  const result = $('result');
  const resultTitle = $('result-title');
  const resultUrl = $('result-url');
  const copyBtn = $('copy-btn');
  const openBtn = $('open-btn');
  const pageList = $('page-list');
  const refreshBtn = $('refresh-btn');
  const publishedCount = $('published-count');
  const toastEl = $('toast');
  const loginScreen = $('login-screen');
  const appShell = $('app-shell');
  const authSlot = $('auth-slot');
  const usernameHint = $('username-hint');

  const USER_KEY = 'pagedrop_username';

  let authEnabled = true;
  let allowRegister = false;
  let currentUser = null;
  let defaultTtlDays = 30;

  const saved = localStorage.getItem(USER_KEY);
  if (saved) usernameInput.value = saved;

  function toast(msg, isError = false) {
    toastEl.textContent = msg;
    toastEl.classList.toggle('error', isError);
    toastEl.classList.remove('hidden');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => toastEl.classList.add('hidden'), 2800);
  }

  function setBusy(busy, msg = '正在发布…') {
    dropzone.classList.toggle('busy', busy);
    uploadState.classList.toggle('hidden', !busy);
    uploadMsg.textContent = msg;
  }

  async function api(url, options = {}) {
    const res = await fetch(url, {
      credentials: 'same-origin',
      ...options,
      headers: {
        ...(options.body && !(options.body instanceof FormData)
          ? { 'Content-Type': 'application/json' }
          : {}),
        ...options.headers,
      },
    });
    let data = null;
    try {
      data = await res.json();
    } catch {
      data = { ok: false, error: '无效响应' };
    }
    return { res, data };
  }

  function applyTtlOptions(allowed, selected) {
    if (!ttlSelect || !Array.isArray(allowed)) return;
    const labels = {
      0: '永久',
      1: '1 天',
      7: '7 天',
      30: '30 天',
      90: '90 天',
      365: '365 天',
    };
    ttlSelect.innerHTML = allowed
      .map((d) => `<option value="${d}">${labels[d] ?? `${d} 天`}</option>`)
      .join('');
    const pick = allowed.includes(selected) ? selected : allowed[0];
    ttlSelect.value = String(pick);
  }

  function renderAuthSlot() {
    if (!authEnabled) {
      authSlot.innerHTML = '<span class="auth-muted">开放模式</span>';
      return;
    }
    if (currentUser) {
      authSlot.innerHTML = `
        <span class="auth-user">@${escapeHtml(currentUser.username)}${
          currentUser.role === 'admin' ? ' · 管理员' : ''
        }</span>
        <button type="button" id="logout-btn" class="btn btn-small">退出</button>`;
      $('logout-btn')?.addEventListener('click', logout);
    } else {
      authSlot.innerHTML = '<span class="auth-muted">未登录</span>';
    }
  }

  function updateAuthUi() {
    renderAuthSlot();
    const needLogin = authEnabled && !currentUser;

    // 未登录：只显示全屏居中登录；已登录/开放模式：显示主应用
    loginScreen?.classList.toggle('hidden', !needLogin);
    appShell?.classList.toggle('hidden', needLogin);

    if (needLogin) {
      document.body.classList.add('is-login');
      document.title = '登录 — PageDrop';
      setTimeout(() => $('login-username')?.focus(), 50);
    } else {
      document.body.classList.remove('is-login');
      document.title = 'PageDrop — 上传即发布';
    }

    const adminWrap = $('admin-all-wrap');
    if (adminWrap) {
      adminWrap.classList.toggle('hidden', !(authEnabled && currentUser?.role === 'admin'));
    }

    if (authEnabled && currentUser) {
      usernameInput.value = currentUser.username;
      usernameInput.readOnly = true;
      usernameHint.textContent = '登录后发布到你的命名空间（不可冒用他人）';
    } else {
      usernameInput.readOnly = false;
      usernameHint.textContent = authEnabled
        ? '用于归类和查找页面'
        : '用于归类和查找页面，不是登录账号';
    }
  }

  async function loadSession() {
    const { data: cfg } = await api('/api/auth/config');
    if (cfg?.ok) {
      authEnabled = !!cfg.authEnabled;
      allowRegister = !!cfg.allowRegister;
      defaultTtlDays = cfg.defaultTtlDays ?? 30;
      applyTtlOptions(cfg.allowedTtlDays || [0, 1, 7, 30, 90, 365], defaultTtlDays);
    }

    const { data: me } = await api('/api/auth/me');
    currentUser = me?.user || null;

    const toggleReg = $('toggle-register');
    const regForm = $('register-form');
    if (allowRegister && toggleReg) {
      toggleReg.classList.remove('hidden');
      toggleReg.onclick = () => {
        regForm.classList.toggle('hidden');
        $('login-form').classList.toggle('hidden');
        toggleReg.textContent = regForm.classList.contains('hidden')
          ? '没有账号？注册'
          : '已有账号？登录';
      };
    }

    updateAuthUi();
    if (!authEnabled || currentUser) {
      loadPages();
    }
  }

  async function logout() {
    await api('/api/auth/logout', { method: 'POST', body: '{}' });
    currentUser = null;
    updateAuthUi();
    toast('已退出');
  }

  $('login-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const errEl = $('login-error');
    errEl.classList.add('hidden');
    const username = $('login-username').value.trim();
    const password = $('login-password').value;
    const { res, data } = await api('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
    if (!res.ok || !data.ok) {
      errEl.textContent = data.error || '登录失败';
      errEl.classList.remove('hidden');
      return;
    }
    currentUser = data.user;
    updateAuthUi();
    toast('登录成功');
    loadPages();
  });

  $('register-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const errEl = $('reg-error');
    errEl.classList.add('hidden');
    const { res, data } = await api('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        username: $('reg-username').value.trim(),
        password: $('reg-password').value,
      }),
    });
    if (!res.ok || !data.ok) {
      errEl.textContent = data.error || '注册失败';
      errEl.classList.remove('hidden');
      return;
    }
    currentUser = data.user;
    updateAuthUi();
    toast('注册成功');
    loadPages();
  });

  usernameInput.addEventListener('change', () => {
    if (!usernameInput.readOnly) {
      localStorage.setItem(USER_KEY, usernameInput.value.trim());
      loadPages();
    }
  });
  usernameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !usernameInput.readOnly) {
      localStorage.setItem(USER_KEY, usernameInput.value.trim());
      loadPages();
    }
  });

  function openPicker(e) {
    e?.stopPropagation();
    fileInput.click();
  }

  browseBtn.addEventListener('click', openPicker);
  dropzone.addEventListener('click', (e) => {
    if (e.target === browseBtn) return;
    openPicker(e);
  });
  dropzone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openPicker(e);
    }
  });

  ['dragenter', 'dragover'].forEach((ev) => {
    dropzone.addEventListener(ev, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.add('dragover');
    });
  });
  ['dragleave', 'drop'].forEach((ev) => {
    dropzone.addEventListener(ev, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.remove('dragover');
    });
  });

  dropzone.addEventListener('drop', (e) => {
    const file = e.dataTransfer?.files?.[0];
    if (file) publishFile(file);
  });

  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (file) publishFile(file);
    fileInput.value = '';
  });

  async function publishFile(file) {
    if (authEnabled && !currentUser) {
      toast('请先登录', true);
      return;
    }
    const username = usernameInput.value.trim();
    if (!username) {
      toast('请先填写用户名', true);
      usernameInput.focus();
      return;
    }

    const form = new FormData();
    form.append('username', username);
    form.append('ttlDays', ttlSelect?.value ?? String(defaultTtlDays));
    form.append('file', file);

    setBusy(true, `正在发布 ${file.name}…`);
    result.classList.add('hidden');

    try {
      const { res, data } = await api('/api/publish', { method: 'POST', body: form });
      if (!res.ok || !data.ok) {
        if (res.status === 401) {
          currentUser = null;
          updateAuthUi();
        }
        throw new Error(data.error || '发布失败');
      }

      const exp = data.page.expiresAt
        ? ` · 有效期至 ${formatTime(data.page.expiresAt)}`
        : ' · 永久';
      resultTitle.textContent = `${data.page.title} · ${data.page.kind.toUpperCase()}${exp}`;
      resultUrl.value = data.url;
      openBtn.href = data.url;
      result.classList.remove('hidden');
      setShareHint(data.url);
      localStorage.setItem(USER_KEY, username);
      toast('发布成功');
      const localPreview = `${window.location.origin}${data.path || new URL(data.url).pathname}`;
      window.open(localPreview, '_blank', 'noopener');
      loadPages();
    } catch (err) {
      toast(err.message || '发布失败', true);
    } finally {
      setBusy(false);
    }
  }

  function setShareHint(url) {
    const hint = $('result-hint');
    if (!hint) return;
    try {
      const u = new URL(url);
      const host = u.hostname;
      if (host === 'localhost' || host === '127.0.0.1') {
        hint.className = 'result-hint warn';
        hint.textContent =
          '当前仍是本机地址，同事无法打开。请用局域网 IP 访问本站后再发布，或设置 PUBLIC_URL。';
      } else {
        hint.className = 'result-hint';
        hint.textContent = '分享此链接给同一网络的同事即可访问（请保持 PageDrop 服务运行）。';
      }
    } catch {
      hint.textContent = '';
    }
  }

  copyBtn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(resultUrl.value);
      toast('链接已复制');
    } catch {
      resultUrl.select();
      document.execCommand('copy');
      toast('链接已复制');
    }
  });

  function formatTime(iso) {
    try {
      return new Date(iso).toLocaleString('zh-CN', { hour12: false });
    } catch {
      return iso;
    }
  }

  $('admin-all')?.addEventListener('change', loadPages);

  async function loadPages() {
    if (authEnabled && !currentUser) return;
    try {
      const all = $('admin-all')?.checked && currentUser?.role === 'admin';
      const { res, data } = await api(all ? '/api/pages?all=1' : '/api/pages');
      if (!res.ok || !data.ok) {
        if (res.status === 401) {
          currentUser = null;
          updateAuthUi();
          return;
        }
        throw new Error(data.error || '加载失败');
      }

      const pages = data.pages || [];
      const labelUser = currentUser?.username || usernameInput.value.trim();
      publishedCount.textContent = labelUser
        ? `${labelUser} · ${pages.length} 个页面`
        : `已发布页面 · ${pages.length}`;

      if (pages.length === 0) {
        pageList.innerHTML = '<li class="empty">暂无页面，拖入文件开始发布</li>';
        return;
      }

      pageList.innerHTML = pages
        .map((p) => {
          const exp = p.expiresAt
            ? ` · 至 ${formatTime(p.expiresAt)}`
            : ' · 永久';
          const del = p.canDelete
            ? `<button type="button" class="btn btn-danger btn-small" data-del-user="${escapeAttr(
                p.username
              )}" data-del-id="${escapeAttr(p.id)}">删除</button>`
            : '';
          return `
        <li>
          <div class="page-meta">
            <strong><span class="kind-pill">${escapeHtml(p.kind)}</span>${escapeHtml(p.title)}</strong>
            <span>@${escapeHtml(p.username)} · ${formatTime(p.createdAt)}${exp} · ${escapeHtml(
              p.originalName || ''
            )}</span>
          </div>
          <div class="page-actions">
            <a class="btn btn-small" href="${escapeAttr(p.path)}" target="_blank" rel="noopener">打开</a>
            ${del}
          </div>
        </li>`;
        })
        .join('');

      pageList.querySelectorAll('[data-del-id]').forEach((btn) => {
        btn.addEventListener('click', () =>
          deletePage(btn.getAttribute('data-del-user'), btn.getAttribute('data-del-id'))
        );
      });
    } catch (err) {
      pageList.innerHTML = `<li class="empty">${escapeHtml(err.message)}</li>`;
    }
  }

  async function deletePage(username, id) {
    if (!confirm('确定删除该页面？此操作不可恢复。')) return;
    const { res, data } = await api(`/api/pages/${encodeURIComponent(username)}/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    if (!res.ok || !data.ok) {
      toast(data.error || '删除失败', true);
      return;
    }
    toast('已删除');
    loadPages();
  }

  function escapeHtml(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function escapeAttr(s) {
    return escapeHtml(s).replace(/'/g, '&#39;');
  }

  refreshBtn.addEventListener('click', loadPages);
  loadSession().catch((err) => {
    console.error(err);
    toast('初始化失败', true);
  });
})();
