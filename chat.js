// ===== 在线对话：网页 ↔ 工作空间助手 =====
// 提问 POST /api/chat/ask 落进收件箱，助手回复后由轮询 /api/chat/poll 取回显示。
// 新增学科：把 id 加进下面的 SUBJECTS，并在 index.html 里放同名容器即可。

(function () {
  'use strict';

  var SUBJECTS = ['chinese', 'english', 'math', 'general'];

  // 三种后端模式对前端是同一套接口，只是徽标和提示语不同
  var MODE_LABEL = {
    cli: {
      cls: 'chat-badge-cli',
      text: '● 直连助手会话',
      hint: '提问直送工作空间里的助手，回复自动生成，通常 20–60 秒',
    },
    away: {
      cls: 'chat-badge-away',
      text: '● 外出模式',
      hint: '直连云端大模型；对话存手机本地，回家可一键导入电脑',
    },
    api: { cls: 'chat-badge-api', text: '● 实时模式', hint: '回复由模型实时生成' },
    bridge: {
      cls: 'chat-badge-bridge',
      text: '● 文件桥模式',
      hint: '提问已送进收件箱，需到助手会话里说「处理网页提问」',
    },
  };

  function esc(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // 轻量 markdown：够用就好，不引第三方库
  function mdToHtml(text) {
    var s = esc(text);
    s = s.replace(/`([^`\n]+)`/g, '<code>$1</code>');
    s = s.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/^\s*#{1,6}\s*(.+)$/gm, '<div class="md-h">$1</div>');
    s = s.replace(/^\s*[-*]\s+(.+)$/gm, '<div class="md-li">· $1</div>');
    s = s.replace(/^\s*(\d+)[.、]\s*(.+)$/gm, '<div class="md-li">$1. $2</div>');
    s = s.replace(/^\s*&gt;\s*(.+)$/gm, '<div class="md-quote">$1</div>');
    s = s.replace(/\n{2,}/g, '</div><div class="md-p">');
    s = '<div class="md-p">' + s + '</div>';
    s = s.replace(/\n/g, '<br>');
    return s;
  }

  function hhmm(ts) {
    var d = new Date(ts * 1000);
    if (isNaN(d.getTime())) return '';
    return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
  }

  function createChat(subject, meta) {
    var ids = {
      badge: 'chatBadge_' + subject,
      messages: 'chatMessages_' + subject,
      typing: 'chatTyping_' + subject,
      quick: 'chatQuick_' + subject,
      input: 'chatInput_' + subject,
      send: 'chatSend_' + subject,
      hint: 'chatHint_' + subject,
    };
    var n = {};
    for (var k in ids) n[k] = document.getElementById(ids[k]);
    if (!n.messages) return;

    var accent = (meta && meta.accent) || subject;
    var icon = (meta && meta.icon) || '🤖';
    var st = { after: 0, seen: {}, mode: 'bridge', newestRole: null,
               busy: false, timer: null, alive: true, pollMs: 3000 };

    function setBadge() {
      if (!n.badge) return;
      var m = MODE_LABEL[st.mode] || MODE_LABEL.bridge;
      n.badge.innerHTML = '<span class="chat-badge ' + m.cls + '">' + m.text + '</span>';
      if (n.hint) n.hint.textContent = m.hint;
    }

    function scrollBottom() {
      n.messages.scrollTop = n.messages.scrollHeight;
    }

    // 等回复要几十秒，光转三个点不够，得让玩家看到已经等了多久
    var typingT0 = null, typingTimer = null;

    function setTyping(on) {
      if (!n.typing) return;
      n.typing.hidden = !on;
      if (typingTimer) { clearInterval(typingTimer); typingTimer = null; }
      if (on) {
        typingT0 = Date.now();
        if (n.hint) {
          n.hint.textContent = '助手正在思考…';
          typingTimer = setInterval(function () {
            var s = Math.round((Date.now() - typingT0) / 1000);
            n.hint.textContent = '助手正在思考… 已等待 ' + s + ' 秒';
          }, 1000);
        }
        scrollBottom();
      } else {
        typingT0 = null;
        setBadge();
      }
    }

    function addRow(role, html, ts) {
      var row = document.createElement('div');
      row.className = 'chat-row ' + role;
      if (role === 'user') {
        row.innerHTML =
          '<div class="chat-meta">' + hhmm(ts) + '</div>' +
          '<div class="chat-bubble" style="background:var(--c-' + accent + ')">' + html + '</div>' +
          '<div class="chat-avatar" style="background:var(--primary-soft)">🙋</div>';
      } else if (role === 'assistant') {
        row.innerHTML =
          '<div class="chat-avatar" style="background:var(--c-' + accent + '-soft)">' + icon + '</div>' +
          '<div class="chat-bubble">' + html + '</div>' +
          '<div class="chat-meta">' + hhmm(ts) + '</div>';
      } else {
        row.innerHTML = '<div class="chat-bubble chat-error">' + html + '</div>';
      }
      n.messages.insertBefore(row, n.typing || null);
      return row;
    }

    function render(list) {
      list.forEach(function (m) {
        var key = m.id + ':' + m.role + ':' + m.ts;
        if (st.seen[key]) return;
        st.seen[key] = 1;
        addRow(m.role, mdToHtml(m.text), m.ts);
        st.newestRole = m.role;
        if (m.ts > st.after) st.after = m.ts;
      });
      setTyping(st.newestRole === 'user');
      scrollBottom();
    }

    async function poll() {
      if (!st.alive) return;
      try {
        var r = await fetch('/api/chat/poll?subject=' + encodeURIComponent(subject) +
                            '&after=' + encodeURIComponent(st.after) + '&t=' + Date.now());
        if (!r.ok) return;
        var j = await r.json();
        if (!j.ok) return;
        if (j.mode) st.mode = j.mode;
        setBadge();
        if (j.messages && j.messages.length) render(j.messages);
      } catch (e) {
        /* 服务没开就静默重试 */
      }
    }

    async function send() {
      if (st.busy) return;
      var text = (n.input.value || '').trim();
      if (!text) return;
      st.busy = true;
      n.send.disabled = true;
      addRow('user', mdToHtml(text), Date.now() / 1000);
      st.newestRole = 'user';
      setTyping(true);
      scrollBottom();
      n.input.value = '';

      // 外出模式：不走本地服务，直接问云端大模型
      if (st.away) {
        AwayMode.appendMessage(subject, { id: 'u' + Date.now(), ts: Date.now() / 1000, role: 'user', text: text });
        try {
          var reply = await AwayMode.ask(subject, text);
          AwayMode.appendMessage(subject, {
            id: 'a' + Date.now(), ts: Date.now() / 1000, role: 'assistant', text: reply,
          });
          renderAway();
        } catch (e) {
          setTyping(false);
          addRow('error', '调用模型失败：' + esc(e.message) +
            '（点顶栏「外出模式」检查 API Key 和网络）', Date.now() / 1000);
        }
        n.send.disabled = false;
        st.busy = false;
        return;
      }

      try {
        var r = await fetch('/api/chat/ask', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ subject: subject, text: text }),
        });
        var j = await r.json();
        if (!j.ok) {
          addRow('error', esc(j.error || '发送失败'), Date.now() / 1000);
          setTyping(false);
        } else if (j.ts) {
          if (j.ts > st.after) st.after = j.ts;
        }
      } catch (e) {
        addRow('error', '发送失败：连不上本地服务。请用 start-portal.bat 启动后再试。', Date.now() / 1000);
        setTyping(false);
      }
      n.send.disabled = false;
      st.busy = false;
      await poll();
    }

    function buildQuick() {
      if (!n.quick || !meta || !meta.quickCommands) return;
      n.quick.innerHTML = meta.quickCommands
        .map(function (c) {
          return '<button class="quick-btn" data-prompt="' + esc(c.prompt) + '">' + esc(c.label) + '</button>';
        })
        .join('');
      n.quick.querySelectorAll('.quick-btn').forEach(function (b) {
        b.addEventListener('click', function () {
          n.input.value = b.dataset.prompt;
          n.input.focus();
        });
      });
    }

    // 外出模式：直接从手机本地存储里渲染
    function renderAway() {
      AwayMode.listMessages(subject).forEach(function (m) {
        var key = m.id + ':' + m.role + ':' + m.ts;
        if (st.seen[key]) return;
        st.seen[key] = 1;
        addRow(m.role, mdToHtml(m.text), m.ts);
        if (m.ts > st.after) st.after = m.ts;
      });
      setTyping(false);
      scrollBottom();
    }

    async function init() {
      buildQuick();

      // 先判断在家还是外出：连得上 /api/health 就是在家
      var home = await AwayMode.probeHome(2200);
      st.away = !home;

      if (st.away) {
        st.mode = 'away';
        setBadge();
        renderAway();
        if (!AwayMode.ready()) {
          addRow('error', '外出模式还没配 API Key——点顶栏「外出模式」填一下就能直接用。', Date.now() / 1000);
        }
        setInterval(renderAway, st.pollMs);
        return;
      }

      try {
        var r = await fetch('/api/chat/config?t=' + Date.now());
        if (r.ok) {
          var j = await r.json();
          if (j.ok) {
            st.mode = j.mode || 'bridge';
            if (j.poll_interval_ms) st.pollMs = j.poll_interval_ms;
            var s = j.subjects && j.subjects[subject];
            if (s && !s.enabled) {
              addRow('error', '该学科尚未接入网页对话，请把 chat/config.json 里对应学科的 enabled 改为 true。', Date.now() / 1000);
            } else if (s && st.mode === 'cli' && s.bound === false) {
              addRow('error', '该学科还没绑定助手会话，请在 chat/config.json 里填上 session_id。', Date.now() / 1000);
            }
          }
        }
      } catch (e) {
        addRow('error', '连不上本地服务。请用 start-portal.bat 启动服务后再打开本页。', Date.now() / 1000);
      }
      setBadge();
      await poll();
      setInterval(poll, st.pollMs);
    }

    n.send.addEventListener('click', send);
    n.input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        send();
      }
    });

    init();
  }

  document.addEventListener('DOMContentLoaded', function () {
    SUBJECTS.forEach(function (s) {
      createChat(s, (window.MODULES || {})[s] || null);
    });
  });
})();
