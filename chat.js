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
      hint: '提问直送工作空间里的助手（免费模型），回复自动生成，通常 20–60 秒',
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
    var st = { after: 0, seen: {}, mode: 'bridge', model: '', newestRole: null,
               busy: false, timer: null, alive: true, pollMs: 3000 };

    function setBadge() {
      if (!n.badge) return;
      var m = MODE_LABEL[st.mode] || MODE_LABEL.bridge;
      var text = m.text;
      // 直连助手会话时，把当前用的模型（默认免费 hy3）也标出来，家长一眼看清是否免费
      if (st.mode === 'cli' && st.model) {
        text += ' · 免费模型 ' + String(st.model).toUpperCase();
      }
      n.badge.innerHTML = '<span class="chat-badge ' + m.cls + '">' + text + '</span>';
      if (n.hint) n.hint.textContent = m.hint;
    }

    function scrollBottom() {
      n.messages.scrollTop = n.messages.scrollHeight;
    }

    // ---------- 图片附件 ----------
    // 学生拍照发题目是最自然的用法，所以选图 / 粘贴 / 拖拽三条路都留着
    var imgs = []; // [{ file, dataUrl }]
    var mistakeBtn = null; // 「📌 记错题」按钮引用（发送成功后要复位）

    // 记错题开关是一次性的：发完这一条就自动关掉，
    // 避免"开一次之后所有对话都能写文件"。
    function resetMistakeToggle() {
      st.addMistake = false;
      if (mistakeBtn) {
        mistakeBtn.classList.remove('on');
        mistakeBtn.textContent = '📌 记错题';
      }
    }

    function buildImageUI() {
      if (!n.input) return;

      var prev = document.createElement('div');
      prev.className = 'chat-attachments';
      prev.id = 'chatAttach_' + subject;
      prev.hidden = true;
      n.input.parentNode.insertBefore(prev, n.input);

      var row = n.send.parentNode;
      var btn = document.createElement('button');
      btn.className = 'btn btn-ghost attach-btn';
      btn.type = 'button';
      btn.textContent = '🖼 图片';
      btn.title = '拍照或选图（也可以直接 Ctrl+V 粘贴截图）';
      row.insertBefore(btn, row.firstChild);

      // 「记错题」开关：开启后本次提问临时放开写权限，让助手直接写进 xlsx。
      // 必须手动点这个按钮才生效——不接受对话里出现"记错题"字样自动放开，
      // 避免被提示词注入骗出写权限。
      var mbtn = document.createElement('button');
      mbtn.className = 'btn btn-ghost mistake-btn';
      mbtn.type = 'button';
      mbtn.textContent = '📌 记错题';
      mbtn.title = '开启后，这次提问允许助手把错题直接写进「错题总表.xlsx」';
      mbtn.onclick = function () {
        if (st.away) { showToast('外出模式写不了电脑上的错题表，请连家里 WiFi 再试'); return; }
        st.addMistake = !st.addMistake;
        mbtn.classList.toggle('on', st.addMistake);
        mbtn.textContent = st.addMistake ? '📌 记错题 ✓' : '📌 记错题';
        showToast(st.addMistake ? '已开启：这次提问允许写入错题表' : '已关闭：这次提问不会写文件');
      };
      mistakeBtn = mbtn;
      row.insertBefore(mbtn, row.firstChild);

      var fi = document.createElement('input');
      fi.type = 'file';
      fi.id = 'chatFile_' + subject;
      fi.accept = 'image/*';
      fi.multiple = true;
      fi.style.display = 'none';
      row.appendChild(fi);
      btn.onclick = function () { fi.click(); };
      fi.onchange = function () { addFiles(fi.files); fi.value = ''; };

      n.input.addEventListener('paste', function (e) {
        var items = e.clipboardData && e.clipboardData.items;
        if (!items) return;
        var got = [];
        for (var i = 0; i < items.length; i++) {
          if (items[i].kind === 'file' && /^image\//.test(items[i].type)) got.push(items[i].getAsFile());
        }
        if (got.length) { e.preventDefault(); addFiles(got); }
      });

      n.input.addEventListener('dragover', function (e) { e.preventDefault(); });
      n.input.addEventListener('drop', function (e) {
        if (!e.dataTransfer) return;
        var got = [];
        for (var i = 0; i < e.dataTransfer.files.length; i++) {
          if (/^image\//.test(e.dataTransfer.files[i].type)) got.push(e.dataTransfer.files[i]);
        }
        if (got.length) { e.preventDefault(); addFiles(got); }
      });
    }

    function addFiles(list) {
      if (!list || !list.length) return;
      for (var i = 0; i < list.length; i++) {
        if (imgs.length >= 4) { showToast('最多 4 张图'); break; }
        var f = list[i];
        if (!/^image\//.test(f.type)) continue;
        if (f.size > 10 * 1024 * 1024) { showToast('有图片超过 10MB，已跳过'); continue; }
        (function (file) {
          var fr = new FileReader();
          fr.onload = function () { imgs.push({ file: file, dataUrl: String(fr.result) }); renderAttach(); };
          fr.readAsDataURL(file);
        })(f);
      }
    }

    function renderAttach() {
      var box = document.getElementById('chatAttach_' + subject);
      if (!box) return;
      if (!imgs.length) { box.innerHTML = ''; box.hidden = true; return; }
      box.hidden = false;
      box.innerHTML = imgs.map(function (im, i) {
        return '<div class="attach-item"><img src="' + im.dataUrl + '" alt="附件' + (i + 1) + '">' +
          '<button class="attach-del" data-i="' + i + '" title="移除">×</button></div>';
      }).join('');
      box.querySelectorAll('.attach-del').forEach(function (b) {
        b.onclick = function () { imgs.splice(+b.dataset.i, 1); renderAttach(); };
      });
    }

    function clearImgs() {
      imgs = [];
      renderAttach();
    }

    // 在家模式：先把图传到电脑，再把路径塞进问题里让助手 Read
    async function uploadImages(list) {
      var paths = [];
      for (var i = 0; i < (list || []).length; i++) {
        var r = await fetch('/api/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ data: list[i].dataUrl, filename: list[i].file.name }),
        });
        var j = await r.json();
        if (!j.ok) throw new Error(j.error || '上传失败');
        paths.push({ path: j.path, url: j.url });
      }
      return paths;
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
      // 只发图不打字也允许——拍完直接发是常态
      if (!text && !imgs.length) return;

      st.busy = true;
      n.send.disabled = true;

      var pendingImgs = imgs.slice();
      var imgHtml = pendingImgs.length
        ? '<div class="msg-imgs">' + pendingImgs.map(function (im) {
            return '<img src="' + im.dataUrl + '" alt="题目图">';
          }).join('') + '</div>'
        : '';

      addRow('user', mdToHtml(text) + imgHtml, Date.now() / 1000);
      st.newestRole = 'user';
      setTyping(true);
      scrollBottom();
      n.input.value = '';
      clearImgs();

      // 外出模式：图片直接转 base64 发给 vision 模型
      if (st.away) {
        AwayMode.appendMessage(subject, {
          id: 'u' + Date.now(), ts: Date.now() / 1000, role: 'user',
          text: text || '（发了一张图片）',
        });
        try {
          var reply = await AwayMode.ask(subject, text, pendingImgs.map(function (i) { return i.dataUrl; }));
          AwayMode.appendMessage(subject, {
            id: 'a' + Date.now(), ts: Date.now() / 1000, role: 'assistant', text: reply,
          });
          renderAway();
        } catch (e) {
          setTyping(false);
          addRow('error', '调用模型失败：' + esc(e.message) +
            '（发图片要用能看图的模型，比如通义千问 VL / 智谱 GLM-4V；DeepSeek 看不了图）',
            Date.now() / 1000);
        }
        n.send.disabled = false;
        st.busy = false;
        return;
      }

      // 在家：先把图片传到电脑，再把路径塞进问题让助手用 Read 看
      var finalText = text;
      if (pendingImgs.length) {
        try {
          showToast('正在上传图片…');
          var up = await uploadImages(pendingImgs);
          var note = '【学生上传了 ' + up.length + ' 张题目图片，请先用 Read 工具查看这些图片，' +
            '再按你的角色规则回答：\n' +
            up.map(function (u, i) { return (i + 1) + '. ' + u.path; }).join('\n') + '】';
          finalText = note + '\n\n' + (text || '（学生没有额外文字说明）');
        } catch (e) {
          setTyping(false);
          addRow('error', '图片上传失败：' + esc(e.message), Date.now() / 1000);
          n.send.disabled = false;
          st.busy = false;
          return;
        }
      }

      try {
        var r = await fetch('/api/chat/ask', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            subject: subject,
            text: finalText,
            add_mistake: !!st.addMistake,
          }),
        });
        var j = await r.json();
        if (!j.ok) {
          addRow('error', esc(j.error || '发送失败'), Date.now() / 1000);
          setTyping(false);
        } else if (j.ts) {
          resetMistakeToggle(); // 记错题开关一次性的，发完自动关
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
      buildImageUI();

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
            st.model = j.model || '';
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

  // 点气泡里的图片放大看（题目照片往往要看清细节）
  function lightbox(src) {
    var box = document.getElementById('imgLightbox');
    if (!box) {
      box = document.createElement('div');
      box.id = 'imgLightbox';
      box.className = 'img-lightbox';
      box.hidden = true;
      box.innerHTML = '<img alt="放大查看">';
      box.onclick = function () { box.hidden = true; };
      document.body.appendChild(box);
    }
    box.querySelector('img').src = src;
    box.hidden = false;
  }

  document.addEventListener('click', function (e) {
    var t = e.target;
    if (!t || t.tagName !== 'IMG') return;
    if (!t.closest || !t.closest('.msg-imgs')) return;
    lightbox(t.src);
  });

  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    var box = document.getElementById('imgLightbox');
    if (box) box.hidden = true;
  });

  document.addEventListener('DOMContentLoaded', function () {
    SUBJECTS.forEach(function (s) {
      createChat(s, (window.MODULES || {})[s] || null);
    });
  });
})();
