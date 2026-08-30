// ===== 外出模式：直连大模型 + 手机本地存储 + 回家导入 =====
//
// 设计要点：
//   1. 不在家时连不上本地服务，前端直接调大模型（DeepSeek / Kimi / 通义千问 都放行 CORS）
//   2. 对话和错题先存手机 localStorage，一份 key 打包，方便整体导出/清空
//   3. 回家连上服务后，一次性 POST /api/sync 合并进 xlsx 和对话账本
//   4. 角色设定、学生档案、已有错题在家时抓一次缓存下来，外出才有上下文

(function () {
  'use strict';

  var STORE_KEY = 'studyspace-away-v1';
  var CFG_KEY = 'studyspace-llm-config';

  var DEFAULT_CFG = {
    base_url: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
    api_key: '',
    temperature: 0.4,
  };

  // ---------- 存储 ----------
  function emptyStore() {
    return { v: 1, messages: {}, mistakes: [], roles: {}, profile: '', cachedAt: 0 };
  }

  function load() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (!raw) return emptyStore();
      var s = JSON.parse(raw);
      if (!s || s.v !== 1) return emptyStore();
      s.messages = s.messages || {};
      s.mistakes = s.mistakes || [];
      s.roles = s.roles || {};
      return s;
    } catch (e) {
      return emptyStore();
    }
  }

  function save(s) {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(s));
      return true;
    } catch (e) {
      // 配额满了：砍掉一半老消息再试
      var t = load();
      for (var k in t.messages) {
        if (t.messages[k].length > 20) t.messages[k] = t.messages[k].slice(-20);
      }
      try {
        localStorage.setItem(STORE_KEY, JSON.stringify(t));
        return true;
      } catch (e2) {
        return false;
      }
    }
  }

  // ---------- 大模型配置 ----------
  function getConfig() {
    try {
      var c = JSON.parse(localStorage.getItem(CFG_KEY) || '{}');
      return {
        base_url: c.base_url || DEFAULT_CFG.base_url,
        model: c.model || DEFAULT_CFG.model,
        api_key: (c.api_key || '').trim(),
        temperature: typeof c.temperature === 'number' ? c.temperature : DEFAULT_CFG.temperature,
      };
    } catch (e) {
      return Object.assign({}, DEFAULT_CFG);
    }
  }

  function saveConfig(cfg) {
    localStorage.setItem(CFG_KEY, JSON.stringify(cfg));
  }

  function ready() {
    return !!getConfig().api_key;
  }

  // ---------- 在家 / 外出 判定 ----------
  // 连得上 /api/health 就说明在家（或有局域网），否则外出
  async function probeHome(timeoutMs) {
    var ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctl) ctl.abort(); }, timeoutMs || 2500);
    try {
      var r = await fetch('/api/health?t=' + Date.now(), {
        signal: ctl ? ctl.signal : undefined,
        cache: 'no-store',
      });
      clearTimeout(timer);
      if (!r.ok) return false;
      var j = await r.json();
      return !!(j && j.ok);
    } catch (e) {
      clearTimeout(timer);
      return false;
    }
  }

  // ---------- 在家时把上下文缓存到手机 ----------
  async function cacheContext(subjects) {
    try {
      var r = await fetch('/api/sync/bundle?t=' + Date.now());
      if (!r.ok) return false;
      var j = await r.json();
      if (!j.ok) return false;
      var s = load();
      s.roles = j.roles || {};
      s.profile = j.profile || '';
      s.mistakes_snapshot = j.mistakes || {};
      s.cachedAt = Date.now();
      return save(s);
    } catch (e) {
      return false;
    }
  }

  // ---------- 消息 ----------
  function listMessages(subject, after) {
    var s = load();
    var arr = s.messages[subject] || [];
    return arr.filter(function (m) { return !after || m.ts > after; });
  }

  function appendMessage(subject, msg) {
    var s = load();
    if (!s.messages[subject]) s.messages[subject] = [];
    s.messages[subject].push(msg);
    return save(s);
  }

  // ---------- 错题 ----------
  function listMistakes() {
    return load().mistakes || [];
  }

  function addMistake(m) {
    var s = load();
    m.id = m.id || 'a' + Date.now();
    m.ts = m.ts || Date.now() / 1000;
    m.synced = false;
    s.mistakes.push(m);
    save(s);
    return m.id;
  }

  // ---------- 拼系统提示词 ----------
  function buildSystemPrompt(subject) {
    var s = load();
    var parts = [];
    if (s.profile) parts.push(s.profile);
    if (s.roles[subject]) parts.push(s.roles[subject]);
    var ms = (s.mistakes_snapshot || {})[subject] || [];
    if (ms.length) {
      parts.push(
        '该生当前未掌握/重做中的错题（引用时不要编造）：\n' +
          ms
            .slice(0, 10)
            .map(function (m) {
              return '- ' + m.topic + '：' + m.summary + '（错因：' + m.reason + '）';
            })
            .join('\n')
      );
    }
    if (!parts.length) {
      parts.push('你是初中全科辅导助手，遵守只做助教、不代写、卡题一次只给一步提示的原则。');
    }
    parts.push('注意：现在是「外出模式」，你无法读写本地文件。需要记录的内容请直接输出在对话里，用户回��后会导入。');
    return parts.join('\n\n');
  }

  // ---------- 调大模型 ----------
  // images 是 dataURL 数组；传了就按 OpenAI vision 格式发（模型得支持看图）
  async function ask(subject, question, images) {
    var cfg = getConfig();
    if (!cfg.api_key) throw new Error('还没填 API Key');

    var history = (load().messages[subject] || []).slice(-8);
    var messages = [{ role: 'system', content: buildSystemPrompt(subject) }];
    history.forEach(function (m) {
      messages.push({ role: m.role, content: m.text });
    });

    if (images && images.length) {
      var content = [{ type: 'text', text: question || '请看这张图。' }];
      images.forEach(function (d) {
        content.push({ type: 'image_url', image_url: { url: d } });
      });
      messages.push({ role: 'user', content: content });
    } else {
      messages.push({ role: 'user', content: question });
    }

    var url = String(cfg.base_url || '').replace(/\/+$/, '') + '/chat/completions';
    var res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + cfg.api_key,
      },
      body: JSON.stringify({
        model: cfg.model,
        messages: messages,
        temperature: cfg.temperature,
      }),
    });

    if (!res.ok) {
      var t = await res.text();
      throw new Error('HTTP ' + res.status + '：' + t.slice(0, 200));
    }
    var data = await res.json();
    var reply = (((data.choices || [{}])[0] || {}).message || {}).content || '';
    if (!reply.trim()) throw new Error('模型返回了空内容');
    return reply;
  }

  // ---------- 待导入 ----------
  function pending() {
    var s = load();
    var msgs = [];
    Object.keys(s.messages).forEach(function (sub) {
      (s.messages[sub] || []).forEach(function (m) {
        if (!m.synced) msgs.push({ subject: sub, ts: m.ts, role: m.role, text: m.text, id: m.id });
      });
    });
    var mis = (s.mistakes || []).filter(function (m) { return !m.synced; });
    return { messages: msgs, mistakes: mis };
  }

  function pendingCount() {
    var p = pending();
    return { messages: p.messages.length, mistakes: p.mistakes.length };
  }

  // ---------- 导入到电脑 ----------
  async function syncToHome() {
    var p = pending();
    if (!p.messages.length && !p.mistakes.length) {
      return { ok: true, imported: { messages: 0, mistakes: 0 }, note: '没有待导入的内容' };
    }
    var res = await fetch('/api/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(p),
    });
    var j = await res.json();
    if (!res.ok || !j.ok) throw new Error(j.error || '导入失败（HTTP ' + res.status + '）');

    // 标记已同步，保留记录但不再重复导入
    var s = load();
    var syncedMsg = {};
    (p.messages || []).forEach(function (m) { syncedMsg[m.subject + '|' + m.id] = 1; });
    Object.keys(s.messages).forEach(function (sub) {
      s.messages[sub].forEach(function (m) {
        if (syncedMsg[sub + '|' + m.id]) m.synced = true;
      });
    });
    (s.mistakes || []).forEach(function (m) {
      if (p.mistakes.some(function (x) { return x.id === m.id; })) m.synced = true;
    });
    save(s);
    return j;
  }

  function reset() {
    localStorage.removeItem(STORE_KEY);
  }

  // ---------- 跨源搬运：导出 / 导入 JSON 文件 ----------
  // localStorage 是按「域名」隔离的：github.io 上攒的数据，回家打开
  // http://10.134.131.219:8765 是读不到的。所以在外面把数据导成文件，
  // 回家用局域网页面把文件导进来，再同步进电脑。
  function exportJSON() {
    return JSON.stringify(load(), null, 2);
  }

  function importJSON(text) {
    var incoming;
    try {
      incoming = JSON.parse(text);
    } catch (e) {
      throw new Error('不是合法的 JSON');
    }
    if (!incoming || incoming.v !== 1) throw new Error('不是本系统导出的数据（缺少 v:1）');

    var s = load();
    var addedMsg = 0, addedMis = 0;

    Object.keys(incoming.messages || {}).forEach(function (sub) {
      if (!s.messages[sub]) s.messages[sub] = [];
      var seen = {};
      s.messages[sub].forEach(function (m) { seen[m.id] = 1; });
      (incoming.messages[sub] || []).forEach(function (m) {
        if (m && m.id && !seen[m.id]) { s.messages[sub].push(m); addedMsg++; }
      });
    });

    var seenM = {};
    (s.mistakes || []).forEach(function (m) { seenM[m.id] = 1; });
    (incoming.mistakes || []).forEach(function (m) {
      if (m && m.id && !seenM[m.id]) { s.mistakes.push(m); addedMis++; }
    });

    if (incoming.roles && Object.keys(incoming.roles).length) s.roles = incoming.roles;
    if (incoming.profile) s.profile = incoming.profile;
    if (incoming.mistakes_snapshot) s.mistakes_snapshot = incoming.mistakes_snapshot;

    save(s);
    return { messages: addedMsg, mistakes: addedMis };
  }

  window.AwayMode = {
    getConfig: getConfig,
    saveConfig: saveConfig,
    ready: ready,
    probeHome: probeHome,
    cacheContext: cacheContext,
    listMessages: listMessages,
    appendMessage: appendMessage,
    listMistakes: listMistakes,
    addMistake: addMistake,
    ask: ask,
    pending: pending,
    pendingCount: pendingCount,
    syncToHome: syncToHome,
    reset: reset,
    exportJSON: exportJSON,
    importJSON: importJSON,
  };
})();
