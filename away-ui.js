// ===== 外出模式 UI =====
// 顶栏一个按钮，点开做三件事：配大模型、看待导入、手动记错题

(function () {
  'use strict';
  var A = window.AwayMode;
  if (!A) return;

  var PRESETS = [
    { name: 'DeepSeek（推荐）', base: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
    { name: 'Kimi 月之暗面', base: 'https://api.moonshot.cn/v1', model: 'moonshot-v1-8k' },
    { name: '通义千问', base: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus' },
    { name: '智谱 GLM', base: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4-flash' },
    { name: '自定义…', base: '', model: '' },
  ];

  var SUBJECTS = [
    { k: 'chinese', n: '语文' },
    { k: 'math', n: '数学' },
    { k: 'english', n: '英语' },
    { k: 'general', n: '总助手' },
  ];

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function buildModal() {
    if (document.getElementById('awayModal')) return;
    var d = document.createElement('div');
    d.id = 'awayModal';
    d.className = 'away-modal';
    d.hidden = true;
    d.innerHTML =
      '<div class="away-box">' +
      '<div class="away-head"><h3>外出模式</h3><button id="awayClose" class="away-x">×</button></div>' +
      '<div id="awayStatus" class="away-status"></div>' +

      '<h4 class="away-h4">1 · 接大模型</h4>' +
      '<label class="away-lb">服务商</label>' +
      '<select id="awayPreset" class="away-in">' +
      PRESETS.map(function (p, i) { return '<option value="' + i + '">' + esc(p.name) + '</option>'; }).join('') +
      '</select>' +
      '<label class="away-lb">Base URL</label>' +
      '<input id="awayBase" class="away-in" placeholder="https://api.deepseek.com/v1">' +
      '<label class="away-lb">模型名</label>' +
      '<input id="awayModel" class="away-in" placeholder="deepseek-chat">' +
      '<label class="away-lb">API Key</label>' +
      '<input id="awayKey" class="away-in" type="password" placeholder="sk-…（只存在这台手机/浏览器里）">' +
      '<div class="away-row">' +
      '<button id="awaySave" class="btn btn-primary">保存</button>' +
      '<button id="awayTest" class="btn btn-ghost">测试连接</button>' +
      '</div>' +
      '<div id="awayCfgMsg" class="away-msg"></div>' +

      '<h4 class="away-h4">2 · 缓存上下文（在家时点一次）</h4>' +
      '<p class="away-tip">把角色设定、学生档案、当前错题抓到手机里，外出时模型才有你的背景。</p>' +
      '<button id="awayCache" class="btn btn-ghost">抓取并缓存</button>' +
      '<div id="awayCacheMsg" class="away-msg"></div>' +

      '<h4 class="away-h4">3 · 待导入</h4>' +
      '<div id="awayPending" class="away-pending"></div>' +
      '<div class="away-row">' +
      '<button id="awayImport" class="btn btn-primary">导入到电脑</button>' +
      '<button id="awayClear" class="btn btn-ghost">清空本地</button>' +
      '</div>' +
      '<div id="awayImportMsg" class="away-msg"></div>' +

      '<h4 class="away-h4">4 · 手动记错题</h4>' +
      '<div class="away-grid">' +
      '<select id="awSub" class="away-in">' +
      SUBJECTS.map(function (s) { return '<option value="' + s.k + '">' + s.n + '</option>'; }).join('') +
      '</select>' +
      '<input id="awChapter" class="away-in" placeholder="章节（如 第一章 有理数）">' +
      '<input id="awTopic" class="away-in" placeholder="知识点">' +
      '<input id="awSummary" class="away-in" placeholder="题目摘要（必填）">' +
      '<input id="awMine" class="away-in" placeholder="我的答案">' +
      '<input id="awRight" class="away-in" placeholder="标准答案">' +
      '<select id="awReason" class="away-in">' +
      ['概念不清', '计算粗心', '审题失误', '答题不规范'].map(function (r) {
        return '<option>' + r + '</option>';
      }).join('') +
      '</select>' +
      '<input id="awDate" class="away-in" type="date">' +
      '</div>' +
      '<button id="awAdd" class="btn btn-ghost">加入待导入</button>' +
      '<div id="awAddMsg" class="away-msg"></div>' +

      '<h4 class="away-h4">5 · 跨设备搬运</h4>' +
      '<p class="away-tip">公网页面和家里局域网页面是不同域名，浏览器数据不互通。' +
      '在外面把数据导出成文件，回家用局域网页面导进来，再同步进电脑。</p>' +
      '<div class="away-row">' +
      '<button id="awayExport" class="btn btn-ghost">导出为文件</button>' +
      '<button id="awayImportFile" class="btn btn-ghost">从文件导入</button>' +
      '</div>' +
      '<input id="awayFileInput" type="file" accept=".json,application/json" style="display:none">' +
      '<div id="awayFileMsg" class="away-msg"></div>' +

      '</div>';
    document.body.appendChild(d);

    document.getElementById('awayClose').onclick = function () { d.hidden = true; };
    d.onclick = function (e) { if (e.target === d) d.hidden = true; };

    // 服务商联动
    document.getElementById('awayPreset').onchange = function () {
      var p = PRESETS[+this.value];
      if (!p || !p.base) return;
      document.getElementById('awayBase').value = p.base;
      document.getElementById('awayModel').value = p.model;
    };

    document.getElementById('awaySave').onclick = saveCfg;
    document.getElementById('awayTest').onclick = testConn;
    document.getElementById('awayCache').onclick = cacheCtx;
    document.getElementById('awayImport').onclick = doImport;
    document.getElementById('awayClear').onclick = doClear;
    document.getElementById('awAdd').onclick = addMistake;
    document.getElementById('awDate').value = new Date().toISOString().slice(0, 10);
    document.getElementById('awayExport').onclick = doExport;
    document.getElementById('awayImportFile').onclick = function () {
      document.getElementById('awayFileInput').click();
    };
    document.getElementById('awayFileInput').onchange = doImportFile;
  }

  function fillCfg() {
    var c = A.getConfig();
    document.getElementById('awayBase').value = c.base_url;
    document.getElementById('awayModel').value = c.model;
    document.getElementById('awayKey').value = c.api_key;
  }

  async function refresh() {
    var home = await A.probeHome(2000);
    var st = document.getElementById('awayStatus');
    var badge = home
      ? '<span class="away-dot ok"></span> 在家 · 对话走工作空间里的真助手'
      : '<span class="away-dot off"></span> 外出中 · 对话直连' + esc(A.getConfig().model || '云端模型');
    st.innerHTML = badge + (A.ready() ? '' : '<div class="away-warn">还没填 API Key，外出时用不了</div>');

    var p = A.pendingCount();
    document.getElementById('awayPending').innerHTML =
      '<b>' + p.messages + '</b> 条对话 · <b>' + p.mistakes + '</b> 条错题' +
      (p.messages + p.mistakes === 0 ? '<span class="away-muted">（暂无待导入）</span>' : '');
    var imp = document.getElementById('awayImport');
    imp.disabled = !(p.messages + p.mistakes) || !home;
    imp.title = !home ? '需要先连上家里的电脑（同一 WiFi 或组网）' : '';
  }

  function msg(id, text, ok) {
    var e = document.getElementById(id);
    if (e) { e.textContent = text; e.className = 'away-msg ' + (ok === false ? 'err' : ok === true ? 'ok' : ''); }
  }

  function saveCfg() {
    A.saveConfig({
      base_url: document.getElementById('awayBase').value.trim(),
      model: document.getElementById('awayModel').value.trim(),
      api_key: document.getElementById('awayKey').value.trim(),
      temperature: 0.4,
    });
    msg('awayCfgMsg', '已保存到本机浏览器', true);
    refresh();
  }

  async function testConn() {
    var btn = document.getElementById('awayTest');
    btn.disabled = true; btn.textContent = '测试中…';
    try {
      var c = A.getConfig();
      var url = String(c.base_url).replace(/\/+$/, '') + '/chat/completions';
      var res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + c.api_key },
        body: JSON.stringify({ model: c.model, messages: [{ role: 'user', content: '说两个字：正常' }] }),
      });
      if (!res.ok) throw new Error('HTTP ' + res.status + '：' + (await res.text()).slice(0, 150));
      var j = await res.json();
      var t = (((j.choices || [{}])[0] || {}).message || {}).content || '';
      msg('awayCfgMsg', '连通 ✅ 模型回：' + t.slice(0, 40), true);
    } catch (e) {
      msg('awayCfgMsg', '失败：' + e.message, false);
    }
    btn.disabled = false; btn.textContent = '测试连接';
  }

  async function cacheCtx() {
    try {
      var ok = await A.cacheContext();
      msg('awayCacheMsg', ok ? '已缓存角色设定 + 学生档案 + 当前错题' : '抓取失败（要在家连着服务才行）', ok);
    } catch (e) {
      msg('awayCacheMsg', '失败：' + e.message, false);
    }
  }

  async function doImport() {
    var btn = document.getElementById('awayImport');
    btn.disabled = true; btn.textContent = '导入中…';
    try {
      var r = await A.syncToHome();
      var i = r.imported || {};
      msg('awayImportMsg',
        '已导入：提问 ' + (i.questions || 0) + ' · 回复 ' + (i.answers || 0) +
        ' · 错题 ' + (i.mistakes || 0) + (i.skipped ? '（跳过重复 ' + i.skipped + '）' : '') +
        (r.warning ? ' ⚠ ' + r.warning : ''), true);
    } catch (e) {
      msg('awayImportMsg', '导入失败：' + e.message, false);
    }
    btn.disabled = false; btn.textContent = '导入到电脑';
    refresh();
  }

  function doClear() {
    if (!confirm('清空这台手机上缓存的对话和待导入错题？已导入的内容不受影响。')) return;
    A.reset();
    msg('awayImportMsg', '已清空', true);
    refresh();
  }

  function addMistake() {
    var summary = document.getElementById('awSummary').value.trim();
    if (!summary) { msg('awAddMsg', '题目摘要必填', false); return; }
    A.addMistake({
      date: document.getElementById('awDate').value,
      subject: document.getElementById('awSub').value,
      chapter: document.getElementById('awChapter').value.trim(),
      topic: document.getElementById('awTopic').value.trim(),
      summary: summary,
      my_answer: document.getElementById('awMine').value.trim(),
      correct: document.getElementById('awRight').value.trim(),
      reason: document.getElementById('awReason').value,
      difficulty: 3,
      status: '未掌握',
    });
    ['awChapter', 'awTopic', 'awSummary', 'awMine', 'awRight'].forEach(function (id) {
      document.getElementById(id).value = '';
    });
    msg('awAddMsg', '已加入待导入，回家后一键合并进错题总表', true);
    refresh();
  }

  function doExport() {
    try {
      var data = A.exportJSON();
      var blob = new Blob([data], { type: 'application/json;charset=utf-8' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = '学习中心-外出数据-' + new Date().toISOString().slice(0, 10) + '.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
      msg('awayFileMsg', '已导出（含角色设定、对话、待导入错题）', true);
    } catch (e) {
      msg('awayFileMsg', '导出失败：' + e.message, false);
    }
  }

  function doImportFile(e) {
    var f = e.target.files && e.target.files[0];
    if (!f) return;
    var r = new FileReader();
    r.onload = function () {
      try {
        var n = A.importJSON(String(r.result));
        msg('awayFileMsg',
          '已导入：新增对话 ' + n.messages + ' 条、错题 ' + n.mistakes + ' 条。' +
          '现在点上面「导入到电脑」即可写进本地文件。', true);
        refresh();
      } catch (err) {
        msg('awayFileMsg', '导入失败：' + err.message, false);
      }
    };
    r.onerror = function () { msg('awayFileMsg', '读文件失败', false); };
    r.readAsText(f, 'utf-8');
    e.target.value = '';
  }

  document.addEventListener('DOMContentLoaded', function () {
    buildModal();
    fillCfg();
    var btn = document.createElement('button');
    btn.className = 'away-btn';
    btn.id = 'awayOpen';
    btn.textContent = '外出模式';
    btn.onclick = function () {
      buildModal(); fillCfg(); refresh();
      document.getElementById('awayModal').hidden = false;
    };
    var bar = document.querySelector('.topbar-actions') || document.querySelector('.topbar');
    if (bar) bar.appendChild(btn);

    // 每 30 秒刷一下状态（在家/外出会变）
    setInterval(function () {
      if (!document.getElementById('awayModal').hidden) refresh();
    }, 30000);
    refresh();
  });
})();
