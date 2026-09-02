// ===== 学习中心 · 主交互 =====

(function () {
  'use strict';

  // ---------- 路由：模块切换 ----------
  function switchModule(moduleId) {
    document.querySelectorAll('.nav-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.module === moduleId);
    });
    document.querySelectorAll('.module-page').forEach((page) => {
      page.classList.toggle('active', page.dataset.page === moduleId);
    });
    history.replaceState(null, '', `#${moduleId}`);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    // 关闭移动端导航
    document.getElementById('nav')?.classList.remove('mobile-show');
    document.getElementById('mobileNavBackdrop')?.classList.remove('show');
  }

  // 初始化路由
  function initRouter() {
    document.querySelectorAll('.nav-btn').forEach((btn) => {
      btn.addEventListener('click', () => switchModule(btn.dataset.module));
    });
    document.querySelectorAll('[data-jump]').forEach((el) => {
      el.addEventListener('click', () => switchModule(el.dataset.jump));
    });

    // 根据 hash 自动跳转
    const hash = window.location.hash.slice(1);
    if (hash && ['home', 'general', 'chinese', 'english', 'math'].includes(hash)) {
      switchModule(hash);
    }
  }

  // ---------- 主题切换 ----------
  function initTheme() {
    const stored = localStorage.getItem('studyspace-theme') || 'light';
    document.documentElement.dataset.theme = stored;
    updateThemeIcon(stored);

    document.getElementById('themeToggle').addEventListener('click', () => {
      const current = document.documentElement.dataset.theme;
      const next = current === 'light' ? 'dark' : 'light';
      document.documentElement.dataset.theme = next;
      localStorage.setItem('studyspace-theme', next);
      updateThemeIcon(next);
    });
  }

  function updateThemeIcon(theme) {
    const icon = document.querySelector('#themeToggle .theme-icon');
    if (icon) icon.textContent = theme === 'light' ? '🌙' : '☀️';
  }

  // ---------- 注入模块卡片（主页） ----------
  function renderModuleTiles() {
    const grid = document.getElementById('moduleGrid');
    if (!grid) return;
    const tiles = ['general', 'chinese', 'english', 'math']
      .map((id) => MODULES[id])
      .filter(Boolean)
      .map(
        (m) => `
        <button class="module-tile" data-accent="${m.id}" data-jump="${m.id}">
          <div class="module-tile-head">
            <div class="module-tile-icon">${m.icon}</div>
            <h3 class="module-tile-title">${m.title}</h3>
          </div>
          <p class="module-tile-desc">${m.tagline}</p>
          <div class="module-tile-footer">
            <span class="module-tile-status">
              <span class="status-pill active">● 已就绪</span>
            </span>
            <span>${m.description}</span>
          </div>
        </button>`
      )
      .join('');
    grid.innerHTML = tiles;
    grid.querySelectorAll('[data-jump]').forEach((el) => {
      el.addEventListener('click', () => switchModule(el.dataset.jump));
    });
  }

  // ---------- 注入快捷口令 ----------
  function renderQuickActions() {
    Object.values(MODULES).forEach((m) => {
      const container = document.getElementById(`quickActions_${m.id}`);
      if (!container) return;
      container.innerHTML = m.quickCommands
        .map(
          (cmd, idx) => `
          <button class="quick-btn"
            data-prompt="${escapeAttr(cmd.prompt)}"
            data-module="${m.id}">
            ${cmd.label}
          </button>`
        )
        .join('');
      container.querySelectorAll('.quick-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          const prompt = btn.dataset.prompt;
          const moduleId = btn.dataset.module;
          const ta = document.getElementById(`askInput_${moduleId}`);
          if (ta) {
            ta.value = prompt;
            ta.focus();
            showToast('已填入输入框，可点击「复制并打开对话」', 'success');
          }
        });
      });
    });
  }

  // ---------- 动作分发 ----------
  function initActions() {
    document.body.addEventListener('click', async (e) => {
      const target = e.target.closest('[data-action]');
      if (!target) return;
      const action = target.dataset.action;
      const moduleId = target.dataset.module;

      if (action === 'open-session') {
        const m = MODULES[moduleId];
        if (m) openWorkbuddySession(m.session_id);
      } else if (action === 'copy-quick') {
        const m = MODULES[moduleId];
        if (!m) return;
        const ok = await copyToClipboard(m.quickCommands[0].prompt);
        showToast(ok ? `已复制：「${m.quickCommands[0].prompt}」` : '复制失败', ok ? 'success' : 'error');
      } else if (action === 'copy-ask') {
        const ta = document.getElementById(`askInput_${moduleId}`);
        const text = (ta?.value || '').trim();
        if (!text) {
          showToast('请先输入问题', 'error');
          return;
        }
        const ok = await copyToClipboard(text);
        showToast(ok ? '已复制到剪贴板' : '复制失败', ok ? 'success' : 'error');
      } else if (action === 'ask-and-open') {
        const ta = document.getElementById(`askInput_${moduleId}`);
        const text = (ta?.value || '').trim();
        if (!text) {
          showToast('请先输入问题', 'error');
          return;
        }
        const ok = await copyToClipboard(text);
        if (!ok) {
          showToast('复制失败', 'error');
          return;
        }
        const m = MODULES[moduleId];
        showToast(`已复制问题，正在唤起 workbuddy · ${m.title}...`, 'success');
        openWorkbuddySession(m.session_id);
      }
    });
  }

  // ---------- 数据加载 ----------
  // 后端 /api/mistakes 每次请求都实时读 错题总表.xlsx
  // → 改完 xlsx 直接刷新网页（或等 20 秒自动轮询）就是最新数据，不用跑任何脚本
  const API_BASE = '/api';
  const IS_FILE_PROTOCOL = window.location.protocol === 'file:';

  async function loadData() {
    // file:// 协议下浏览器禁止 fetch 本地 API，直接给出空状态 + 提示横幅
    if (IS_FILE_PROTOCOL) {
      renderFileProtocolHint();
      ['general', 'chinese', 'english', 'math'].forEach((id) => {
        renderEmptyRecentTask(id);
        renderRecentMistakes(id, null);
      });
      updateStat('statTasks', '今日暂无');
      updateStat('statMistakes', '—');
      return;
    }

    try {
      const [profile, apiResp] = await Promise.all([
        fetchText('../学生档案.md').catch(() => null),
        fetch(`${API_BASE}/mistakes?t=${Date.now()}`)
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null),
      ]);

      if (profile) {
        renderProfileOnHome(profile);
        renderRoleCards(profile);
      }

      const mistakesData = apiResp && apiResp.ok ? apiResp.data : null;
      const stats = apiResp && apiResp.ok ? apiResp.stats : null;

      ['general', 'chinese', 'english', 'math'].forEach((id) => {
        renderEmptyRecentTask(id);
        renderRecentMistakes(id, mistakesData);
      });
      updateStat('statTasks', '今日暂无');

      if (stats) {
        updateStat('statMistakes', String(stats.unmastered || stats.total || 0));
      }

      renderDataSourceBadge(apiResp);
    } catch (e) {
      console.warn('数据加载失败：', e);
    }
  }

  // file:// 协议下显示醒目横幅，提示用 HTTP 服务器打开
  function renderFileProtocolHint() {
    renderDataSourceBadge({ ok: false });
    const banner = document.getElementById('protocolWarning');
    if (banner) {
      banner.hidden = false;
      banner.innerHTML = `
        <div class="protocol-warning-icon">⚠️</div>
        <div class="protocol-warning-body">
          <strong>当前是 file:// 协议打开的，错题数据和学生档案无法加载。</strong>
          <div>请用以下任一方式打开网页：</div>
          <ul>
            <li>推荐：先启动服务 <code>python D:\\studyspace\\网页\\server.py 8765</code>，然后浏览器访问
              <a href="http://127.0.0.1:8765/网页/index.html" target="_blank" rel="noopener">http://127.0.0.1:8765/网页/index.html</a>
            </li>
            <li>或：<code>cd D:\\studyspace && python -m http.server 8765</code>，然后访问上面的链接</li>
          </ul>
          <div class="protocol-warning-tip">⚙ 学科模块、口令、主题、剪贴板、提问区仍可使用；只是错题表和学生档案摘要不显示。</div>
        </div>`;
    }
    // 档案摘要区显示 file:// 占位
    const profile = document.getElementById('profileSummary');
    if (profile) {
      profile.innerHTML = `
        <div class="list-empty">
          <div style="font-size:24px;margin-bottom:6px">📄</div>
          <div>file:// 协议无法读取本地 .md 文件</div>
          <div style="margin-top:8px;font-size:12px">请用 HTTP 服务器打开（见顶部黄色提示）</div>
        </div>`;
    }
    // 状态栏文案调整
    const status = document.getElementById('statusText');
    if (status) status.textContent = 'file:// 协议 · 数据未加载';
  }

  // 数据来源标识：实时 xlsx / 演示数据 / 未连接
  function renderDataSourceBadge(apiResp) {
    const el = document.getElementById('dataBadge');
    if (!el) return;
    if (!apiResp || !apiResp.ok) {
      el.innerHTML = `<span class="badge badge-warn">⚠ 未连接错题服务</span>`;
      return;
    }
    const isDemo = apiResp.is_demo;
    const ts = apiResp.updated_at ? new Date(apiResp.updated_at * 1000) : null;
    const timeText = ts
      ? `${String(ts.getHours()).padStart(2, '0')}:${String(ts.getMinutes()).padStart(2, '0')}`
      : '--:--';

    const badge = isDemo
      ? `<span class="badge badge-demo">演示数据</span>`
      : `<span class="badge badge-live">● 实时同步 xlsx</span>`;

    el.innerHTML = `${badge}<span class="badge-time">更新于 ${timeText}</span>`;
  }

  // ---------- 自动轮询 ----------
  const POLL_INTERVAL = 20 * 1000; // 20 秒检查一次
  let _pollTimer = null;

  async function refreshMistakes(silent = true) {
    if (IS_FILE_PROTOCOL) return true; // file:// 协议下无 API，不轮询
    try {
      const r = await fetch(`${API_BASE}/mistakes?t=${Date.now()}`);
      if (!r.ok) {
        if (!silent) showToast('刷新失败，检查服务是否在运行', 'error');
        return false;
      }
      const json = await r.json();
      if (!json.ok) return false;
      ['general', 'chinese', 'english', 'math'].forEach((id) => {
        renderRecentMistakes(id, json.data);
      });
      if (json.stats) {
        updateStat('statMistakes', String(json.stats.unmastered || json.stats.total || 0));
      }
      renderDataSourceBadge(json);
      return true;
    } catch (e) {
      if (!silent) {
        const msg = IS_FILE_PROTOCOL
          ? 'file:// 协议无法访问 API'
          : '刷新失败，检查服务是否在运行';
        showToast(msg, 'error');
      }
      return false;
    }
  }

  function startPolling() {
    if (IS_FILE_PROTOCOL) return; // file:// 协议下不轮询
    stopPolling();
    _pollTimer = setInterval(() => {
      if (document.hidden) return;
      refreshMistakes(true);
    }, POLL_INTERVAL);
  }

  function stopPolling() {
    if (_pollTimer) clearInterval(_pollTimer);
    _pollTimer = null;
  }

  async function fetchText(path) {
    const res = await fetch(path);
    if (!res.ok) throw new Error('not found: ' + path);
    return res.text();
  }

  function updateStat(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  }

  // 学生档案摘要 - 展示在主页
  function renderProfileOnHome(md) {
    const host = document.getElementById('profileSummary');
    if (!host) return;
    // 提取前 3 条 ## 章节下的关键事实
    const lines = md.split('\n');
    const facts = [];
    lines.forEach((l) => {
      const m = l.match(/^[-*]\s+(.+)/);
      if (m) facts.push(m[1].trim());
    });
    const summary = facts.slice(0, 4);
    host.innerHTML = `
      <ul class="profile-facts">
        ${summary.map((f) => `<li>${escapeHtml(f)}</li>`).join('')}
      </ul>
      <div class="profile-meta">
        <span class="chip">五条铁律</span>
        <span class="chip">不代写</span>
        <span class="chip">每日 ≤90 分钟</span>
        <span class="chip">每次新题 ≤10 道</span>
      </div>`;
  }

  // 角色卡片动态注入：从学生档案读取"教材版本/最弱科目"
  function renderRoleCards(profile) {
    // 简单替换主页"今日建议"区域下的卡片描述
    const weakestMatch = profile.match(/自述最弱科目[：:]\s*\*\*([^*]+)\*\*/);
    const weakest = weakestMatch ? weakestMatch[1].trim() : '英语';
    document.querySelectorAll('.module-tile').forEach((tile) => {
      if (tile.dataset.accent === 'english') {
        const sub = tile.querySelector('.module-tile-desc');
        if (sub) sub.textContent = `单词 · 语法 · 课文 · 作文（家长标注最弱：${weakest}）`;
      }
    });
  }

  function renderEmptyRecentTask(moduleId) {
    const el = document.getElementById(`recentTasks_${moduleId}`);
    if (!el) return;
    el.innerHTML = `
      <div class="list-empty">
        <div style="font-size:24px;margin-bottom:6px">📭</div>
        <div>今日清单待生成</div>
        <div style="margin-top:8px;font-size:12px">
          向 ${moduleId === 'general' ? '总助手' : '对应学科助手'} 发送 <code>今日清单</code>
        </div>
      </div>`;
  }

  function renderRecentMistakes(moduleId, allMistakes) {
    const el = document.getElementById(`recentMistakes_${moduleId}`);
    if (!el) return;
    const subjectMap = { general: null, chinese: 'chinese', english: 'english', math: 'math' };
    const key = subjectMap[moduleId];

    let list = [];
    if (allMistakes && key && allMistakes[key]) {
      list = allMistakes[key];
    } else if (moduleId === 'general' && allMistakes) {
      list = [...(allMistakes.math || []), ...(allMistakes.chinese || []), ...(allMistakes.english || [])];
    }

    if (!list.length) {
      el.innerHTML = `<div class="list-empty">暂无该科错题</div>`;
      return;
    }
    el.innerHTML = list
      .slice(0, 4)
      .map(
        (m) => `
        <div class="list-item">
          <div class="list-item-icon">📌</div>
          <div class="list-item-body">
            <div class="list-item-title">${escapeHtml(m.summary || m.topic || '')}</div>
            <div class="list-item-meta">${escapeHtml(m.topic || '')} · ${escapeHtml(m.reason || '')} · ${escapeHtml(m.status || '')}</div>
          </div>
        </div>`
      )
      .join('');
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
  function escapeAttr(s) {
    return escapeHtml(s);
  }

  // ---------- 移动端导航 ----------
  function initMobileNav() {
    const toggle = document.getElementById('mobileNavToggle');
    const nav = document.getElementById('nav');
    const backdrop = document.getElementById('mobileNavBackdrop');
    if (!toggle || !nav) return;
    toggle.addEventListener('click', () => {
      nav.classList.toggle('mobile-show');
      backdrop.classList.toggle('show');
    });
    backdrop.addEventListener('click', () => {
      nav.classList.remove('mobile-show');
      backdrop.classList.remove('show');
    });
  }

  // ---------- 刷新 ----------
  function initRefresh() {
    document.getElementById('refreshBtn').addEventListener('click', async () => {
      showToast('正在刷新...');
      const ok = await refreshMistakes(false);
      await loadData();
      if (ok) showToast('数据已刷新（实时读取 xlsx）', 'success');
    });
  }

  // ---------- 页面可见性 ----------
  // 从别的窗口切回来时立刻刷新一次，不用等轮询
  function initVisibilityRefresh() {
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        refreshMistakes(true);
      }
    });
  }

  // ---------- 启动 ----------
  // 实时探 /api/health，让底部状态条反映"真"在不在家里
  // ——以前是 HTML 写死的"已连接"，导致从公网打开也显示绿点，骗人。
  async function pollHomeStatus() {
    const dot = document.querySelector('.status-dot');
    const text = document.getElementById('statusText');
    if (!dot || !text) return;
    try {
      const r = await fetch('/api/health?t=' + Date.now(), { cache: 'no-store' });
      if (!r.ok) throw new Error('http ' + r.status);
      const j = await r.json();
      if (j && j.ok) {
        text.textContent = '已连接到 studyspace 工作空间';
        text.dataset.state = 'connected';
        dot.dataset.state = 'connected';
      } else {
        throw new Error('not ok');
      }
    } catch (e) {
      text.textContent = '未连到家里 server · 当前显示的是公网版本（手机用家里 WiFi 请访问 http://<电脑内网 IP>:8765）';
      text.dataset.state = 'disconnected';
      dot.dataset.state = 'disconnected';
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    initRouter();
    initActions();
    initMobileNav();
    initRefresh();
    initVisibilityRefresh();
    renderModuleTiles();
    renderQuickActions();
    loadData();
    startPolling();
    pollHomeStatus();
    setInterval(pollHomeStatus, 8000);
    console.log('学习中心已启动 · 错题实时同步中。WorkBuddy 会话：', MODULES);
  });
})();
