(() => {
  const $ = (id) => document.getElementById(id);

  const usernameInput = $('username');
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

  const USER_KEY = 'pagedrop_username';

  // restore username
  const saved = localStorage.getItem(USER_KEY);
  if (saved) usernameInput.value = saved;

  usernameInput.addEventListener('change', () => {
    localStorage.setItem(USER_KEY, usernameInput.value.trim());
    loadPages();
  });
  usernameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      localStorage.setItem(USER_KEY, usernameInput.value.trim());
      loadPages();
    }
  });

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
    const username = usernameInput.value.trim();
    if (!username) {
      toast('请先填写用户名', true);
      usernameInput.focus();
      return;
    }

    const form = new FormData();
    form.append('username', username);
    form.append('file', file);

    setBusy(true, `正在发布 ${file.name}…`);
    result.classList.add('hidden');

    try {
      const res = await fetch('/api/publish', { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || '发布失败');
      }

      resultTitle.textContent = `${data.page.title} · ${data.page.kind.toUpperCase()}`;
      resultUrl.value = data.url;
      openBtn.href = data.url;
      result.classList.remove('hidden');
      localStorage.setItem(USER_KEY, username);
      toast('发布成功');
      window.open(data.url, '_blank', 'noopener');
      loadPages();
    } catch (err) {
      toast(err.message || '发布失败', true);
    } finally {
      setBusy(false);
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
      const d = new Date(iso);
      return d.toLocaleString('zh-CN', { hour12: false });
    } catch {
      return iso;
    }
  }

  async function loadPages() {
    const username = usernameInput.value.trim();
    const qs = username ? `?username=${encodeURIComponent(username)}` : '';
    try {
      const res = await fetch(`/api/pages${qs}`);
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || '加载失败');

      const pages = data.pages || [];
      publishedCount.textContent = username
        ? `${username} · ${pages.length} 个页面`
        : `已发布页面 · ${pages.length}`;

      if (pages.length === 0) {
        pageList.innerHTML = '<li class="empty">暂无页面，拖入文件开始发布</li>';
        return;
      }

      pageList.innerHTML = pages
        .map(
          (p) => `
        <li>
          <div class="page-meta">
            <strong><span class="kind-pill">${escapeHtml(p.kind)}</span>${escapeHtml(p.title)}</strong>
            <span>@${escapeHtml(p.username)} · ${formatTime(p.createdAt)} · ${escapeHtml(p.originalName || '')}</span>
          </div>
          <a class="btn" href="${escapeAttr(p.url)}" target="_blank" rel="noopener">打开</a>
        </li>`
        )
        .join('');
    } catch (err) {
      pageList.innerHTML = `<li class="empty">${escapeHtml(err.message)}</li>`;
    }
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
  loadPages();
})();
