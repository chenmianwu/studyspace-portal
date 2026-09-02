// ===== 宠物系统：宝可梦 + 任务 + 金币 =====
// 后端 API：/api/pet /api/tasks /api/coinlog（见 server.py + pet_api.py）
// 数据持久化：D:\studyspace\宠物\{pets.json, current.json, tasks.json, coinlog.jsonl}

(function () {
  var st = { pet: null, tasks: null, modalOpen: null };

  // ---------- HTML 注入 ----------
  function buildHTML() {
    return ''
      + '<div class="module-hero">'
      +   '<div class="module-hero-icon">🎮</div>'
      +   '<div class="module-hero-body">'
      +     '<div class="module-hero-eyebrow">宠物系统</div>'
      +     '<h1 class="module-hero-title">宝可梦 + 金币</h1>'
      +     '<p class="module-hero-desc">完成任务赚金币，金币=经验，100 经验进化一阶。进化过的形态会永久收进展馆 🏛</p>'
      +   '</div>'
      +   '<div class="module-hero-actions">'
      +     '<button class="btn btn-ghost" id="petChangeBtn">换宝可梦</button>'
      +     '<button class="btn btn-ghost" id="petLogBtn">今日流水</button>'
      +     '<button class="btn btn-primary" id="petGalleryBtn">🏛 展馆</button>'
      +   '</div>'
      + '</div>'
      + '<div class="pet-grid">'
      +   '<div class="card pet-card">'
      +     '<h3 class="card-title">当前宠物</h3>'
      +     '<div id="petCurrent"><p class="card-text">加载中…</p></div>'
      +   '</div>'
      +   '<div class="card pet-tasks-card">'
      +     '<h3 class="card-title">任务列表 <span class="pet-coin-total" id="petCoinTotal">— 金币</span></h3>'
      +     '<div id="petTasks"><p class="card-text">加载中…</p></div>'
      +     '<div class="pet-add-row">'
      +       '<input type="text" id="newTaskName" placeholder="任务名（例：背古诗）" maxlength="40">'
      +       '<input type="number" id="newTaskCoin" placeholder="金币" min="1" max="1000" value="10">'
      +       '<button class="btn btn-primary" id="addTaskBtn">＋添加</button>'
      +     '</div>'
      +   '</div>'
      + '</div>'
      + '<div class="pet-modal" id="petModal" hidden>'
      +   '<div class="pet-modal-body">'
      +     '<div class="pet-modal-head">'
      +       '<h3 id="petModalTitle">标题</h3>'
      +       '<button class="pet-modal-x" id="petModalClose" aria-label="关闭">×</button>'
      +     '</div>'
      +     '<div id="petModalContent">…</div>'
      +   '</div>'
      + '</div>';
  }

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]; }); }

  function fmtDate(s) { return s ? esc(s) : ''; }

  // ---------- API ----------
  async function getPet() {
    try { var r = await fetch('/api/pet'); var j = await r.json(); return j.ok ? j : null; } catch (e) { return null; }
  }
  async function getTasks() {
    try { var r = await fetch('/api/tasks'); var j = await r.json(); return j.ok ? j : null; } catch (e) { return null; }
  }
  async function addTask(name, coin) {
    try { var r = await fetch('/api/tasks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: name, coin: coin }) }); return await r.json(); }
    catch (e) { return { ok: false, error: String(e) }; }
  }
  async function delTask(id) {
    try { var r = await fetch('/api/tasks/' + id, { method: 'DELETE' }); return await r.json(); }
    catch (e) { return { ok: false, error: String(e) }; }
  }
  async function claimTask(id) {
    try { var r = await fetch('/api/tasks/claim', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: id }) }); return await r.json(); }
    catch (e) { return { ok: false, error: String(e) }; }
  }
  async function setPet(chain_id) {
    try { var r = await fetch('/api/pet', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'set_pet', chain_id: chain_id }) }); return await r.json(); }
    catch (e) { return { ok: false, error: String(e) }; }
  }
  async function getCoinlog(date) {
    try { var r = await fetch('/api/coinlog?date=' + encodeURIComponent(date || '')); return await r.json(); }
    catch (e) { return { ok: false, error: String(e) }; }
  }
  async function getGallery() {
    try { var r = await fetch('/api/pet/gallery'); return await r.json(); }
    catch (e) { return { ok: false, error: String(e) }; }
  }

  // ---------- 渲染 ----------
  function renderPet() {
    var box = document.getElementById('petCurrent');
    if (!box) return;
    if (!st.pet) { box.innerHTML = '<p class="card-text">⚠ 加载失败，请确认 server 在跑</p>'; return; }
    var cur = st.pet.current;
    var imgUrl = '/宠物/images/' + cur.form.id + '.png';
    var types = (cur.form.type || []).map(function (t) { return '<span class="pet-type pet-type-' + esc(t) + '">' + esc(t) + '</span>'; }).join('');
    var progress = cur.is_max
      ? '<p class="pet-max">已到最高形态 🏆</p>'
      : '<div class="pet-progress"><div class="pet-progress-bar" style="width:' + Math.min(100, (cur.exp / cur.exp_to_next * 100)) + '%"></div>'
        + '<span class="pet-progress-text">' + cur.exp + ' / ' + cur.exp_to_next + ' 经验</span></div>';
    box.innerHTML = ''
      + '<div class="pet-now">'
      +   '<img class="pet-img" src="' + imgUrl + '" alt="' + esc(cur.form.name) + '" onerror="this.style.opacity=0.3">'
      +   '<div class="pet-info">'
      +     '<div class="pet-form-name">' + esc(cur.form.name) + '</div>'
      +     '<div class="pet-form-id">#' + esc(cur.form.id) + ' · ' + esc(cur.chain_name) + '</div>'
      +     '<div class="pet-types">' + types + '</div>'
      +     progress
      +   '</div>'
      + '</div>';
  }

  function renderTasks() {
    var box = document.getElementById('petTasks');
    var totalEl = document.getElementById('petCoinTotal');
    if (!box) return;
    if (!st.tasks) { box.innerHTML = '<p class="card-text">⚠ 加载失败</p>'; return; }
    var tasks = st.tasks.tasks || [];
    if (totalEl) totalEl.textContent = (st.tasks.total_coin != null ? st.tasks.total_coin : 0) + ' 累计金币';
    if (!tasks.length) {
      box.innerHTML = '<p class="card-text pet-empty">还没有任务。下方添加一个试试 ↓</p>';
      return;
    }
    box.innerHTML = tasks.map(function (t) {
      return ''
        + '<div class="pet-task" data-id="' + t.id + '">'
        +   '<span class="pet-task-name">' + esc(t.name) + '</span>'
        +   '<span class="pet-task-coin">+ ' + t.coin + ' 金币</span>'
        +   '<button class="pet-btn-claim" data-action="claim" data-id="' + t.id + '">＋' + t.coin + '</button>'
        +   '<button class="pet-btn-del" data-action="del" data-id="' + t.id + '" title="删除">×</button>'
        + '</div>';
    }).join('');
  }

  function refresh() {
    return Promise.all([getPet(), getTasks()]).then(function (r) {
      st.pet = r[0]; st.tasks = r[1];
      renderPet(); renderTasks();
    });
  }

  // ---------- Modal ----------
  function openModal(title, contentHTML) {
    document.getElementById('petModalTitle').textContent = title;
    document.getElementById('petModalContent').innerHTML = contentHTML;
    document.getElementById('petModal').hidden = false;
    st.modalOpen = title;
  }
  function closeModal() {
    document.getElementById('petModal').hidden = true;
    st.modalOpen = null;
  }

  function showLog() {
    var today = new Date().toISOString().slice(0, 10);
    openModal('今日流水（' + today + '）', '<p class="card-text">加载中…</p>');
    getCoinlog(today).then(function (j) {
      if (!j.ok) { document.getElementById('petModalContent').innerHTML = '<p>加载失败：' + esc(j.error || '') + '</p>'; return; }
      var entries = j.entries || [];
      var html = ''
        + '<div class="pet-log-total">今日 +' + (j.total_today || 0) + ' 金币　·　历史累计 +' + (j.total_all || 0) + '</div>';
      if (!entries.length) html += '<p class="card-text pet-empty">今天还没有记录，完成一个任务来攒金币吧 ↓</p>';
      else html += '<ul class="pet-log-list">' + entries.map(function (e) {
        var t = new Date((e.ts || 0) * 1000);
        var time = t.getHours().toString().padStart(2, '0') + ':' + t.getMinutes().toString().padStart(2, '0');
        return '<li><span class="pet-log-time">' + time + '</span> '
          + '<span class="pet-log-name">' + esc(e.task_name || '未知') + '</span> '
          + '<span class="pet-log-coin">+' + e.coin + '</span>'
          + (e.form_then ? ' <span class="pet-log-evo">→ 进化为 ' + esc(e.form_then) + '</span>' : '')
          + '</li>';
      }).join('') + '</ul>';
      document.getElementById('petModalContent').innerHTML = html;
    });
  }

  function showChange() {
    if (!st.pet || !st.pet.all_chains) return;
    var cur = st.pet.current;
    var html = '<div class="pet-choose-grid">'
      + st.pet.all_chains.map(function (c) {
        var form = c.forms[0];
        return ''
          + '<div class="pet-choose-card' + (c.id === cur.chain_id ? ' on' : '') + '" data-chain="' + esc(c.id) + '">'
          +   '<img src="/宠物/images/' + form.id + '.png" alt="' + esc(form.name) + '" onerror="this.style.opacity=0.3">'
          +   '<div class="pet-choose-name">' + esc(form.name) + '</div>'
          +   '<div class="pet-choose-sub">（' + esc(c.name) + '系起点）</div>'
          +   (c.id === cur.chain_id ? '<div class="pet-choose-cur">当前</div>' : '<div class="pet-choose-btn">点这里收养</div>')
          + '</div>';
      }).join('')
      + '</div>'
      + '<p class="pet-choose-hint">⚠ 换宝可梦会清空当前经验，从初始形态重新开始。</p>';
    openModal('选择宝可梦', html);
  }

  function showGallery() {
    openModal('🏛 展馆', '<p class="card-text">加载中…</p>');
    getGallery().then(function (j) {
      if (!j.ok) {
        document.getElementById('petModalContent').innerHTML = '<p>加载失败：' + esc(j.error || '') + '</p>';
        return;
      }
      var items = j.items || [];
      var html = '<div class="pet-log-total">已收集 ' + (j.collected || 0) + ' / ' + (j.total_slots || 6) + ' 个形态</div>';
      if (!items.length) {
        html += '<p class="card-text pet-empty">展馆还空着 —— 让宠物进化一次，就能收进第一只 🏛</p>';
      } else {
        html += '<div class="pet-choose-grid">' + items.map(function (e) {
          return ''
            + '<div class="pet-gallery-card">'
            +   '<img src="/宠物/images/' + esc(e.form_id) + '.png" alt="' + esc(e.form_name) + '" onerror="this.style.opacity=0.3">'
            +   '<div class="pet-choose-name">' + esc(e.form_name) + '</div>'
            +   '<div class="pet-choose-sub">' + esc(e.chain_name || '') + ' · ' + esc(e.date || '') + '</div>'
            +   '<div class="pet-gallery-exp">' + (e.exp || 0) + ' 经验时进化</div>'
            + '</div>';
        }).join('') + '</div>';
      }
      document.getElementById('petModalContent').innerHTML = html;
    });
  }

  // ---------- 事件 ----------
  function bind() {
    var sec = document.getElementById('petSection');
    sec.addEventListener('click', function (e) {
      var t = e.target;
      if (t.id === 'petChangeBtn') { showChange(); return; }
      if (t.id === 'petLogBtn') { showLog(); return; }
      if (t.id === 'petGalleryBtn') { showGallery(); return; }
      if (t.id === 'petModalClose' || t === document.getElementById('petModal')) { closeModal(); return; }
      if (t.id === 'addTaskBtn') { onAdd(); return; }
      var action = t.getAttribute('data-action');
      if (action === 'claim') { onClaim(t.getAttribute('data-id')); return; }
      if (action === 'del') { onDel(t.getAttribute('data-id')); return; }
      var chain = t.closest && t.closest('.pet-choose-card');
      if (chain) { onChoose(chain.getAttribute('data-chain')); return; }
    });
    document.getElementById('petModal').addEventListener('click', function (e) {
      // 点空白处也关闭
      if (e.target.id === 'petModal') closeModal();
    });
    // Enter 键直接添加
    document.getElementById('newTaskName').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') onAdd();
    });
    document.getElementById('newTaskCoin').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') onAdd();
    });
  }

  function onAdd() {
    var nameEl = document.getElementById('newTaskName');
    var coinEl = document.getElementById('newTaskCoin');
    var name = (nameEl.value || '').trim();
    var coin = parseInt(coinEl.value || '0', 10);
    if (!name) { nameEl.focus(); return; }
    if (!coin || coin < 1) { coinEl.focus(); return; }
    addTask(name, coin).then(function (j) {
      if (j.ok) {
        nameEl.value = '';
        refresh();
      } else {
        alert('添加失败：' + (j.error || ''));
      }
    });
  }
  function onDel(id) {
    if (!confirm('删除这个任务？已发的金币不会收回。')) return;
    delTask(id).then(function (j) {
      if (j.ok) refresh();
      else alert('删除失败：' + (j.error || ''));
    });
  }
  function onClaim(id) {
    claimTask(id).then(function (j) {
      if (j.ok) {
        var msg = '＋' + j.coin + ' 金币';
        if (j.evolved_to) msg += '\n🎉 进化为 ' + j.evolved_to.name + '！';
        alert(msg);
        refresh();
      } else {
        alert('失败：' + (j.error || ''));
      }
    });
  }
  function onChoose(chain_id) {
    if (!confirm('换宝可梦会清空当前经验，确认？')) return;
    setPet(chain_id).then(function (j) {
      if (j.ok) { closeModal(); refresh(); }
      else alert('失败：' + (j.error || ''));
    });
  }

  // ---------- 启动 ----------
  document.addEventListener('DOMContentLoaded', function () {
    var sec = document.getElementById('petSection');
    if (!sec) return;
    sec.innerHTML = buildHTML();
    bind();
    refresh();
  });
})();
