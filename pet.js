// ===== 宠物系统：宝可梦 + 任务 + 金币 =====
// 后端 API：/api/pet /api/tasks /api/coinlog（见 server.py + pet_api.py）
// 数据持久化：D:\studyspace\宠物\{pets.json, current.json, tasks.json, coinlog.jsonl}

(function () {

  // 宠物图片地址：本地（站点根目录）与 GitHub Pages（/仓库名/ 子目录）都能正确加载
  function petImg(id) {
    var h = location.hostname;
    var base = '/';
    if (h === 'chenmianwu.github.io' || h.slice(-10) === '.github.io') {
      var seg = (location.pathname.split('/').filter(Boolean)[0]) || '';
      base = '/' + seg + '/';
    }
    return base + '宠物/images/' + id + '.png';
  }
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
      +     '<button class="btn btn-ghost" id="petChangeBtn">🐾 换宝可梦</button>'
      +     '<button class="btn btn-ghost" id="petLogBtn">📒 流水</button>'
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
    var imgUrl = petImg(cur.form.id);
    var types = (cur.form.type || []).map(function (t) { return '<span class="pet-type pet-type-' + esc(t) + '">' + esc(t) + '</span>'; }).join('');
    // 进度条：按"当前形态内进度"展示（0..100），避免累计经验"溢出"造成 175/25 这种怪数字
    var progress;
    if (cur.is_max) {
      progress = '<p class="pet-max">🏆 已到最高形态（累计 ' + cur.exp + ' 经验）</p>';
    } else {
      var pct = Math.min(100, Math.max(0, (cur.exp_in_form / Math.max(1, cur.form_exp_total)) * 100));
      progress = ''
        + '<div class="pet-progress" data-flash="1">'
        +   '<div class="pet-progress-bar" style="width:' + pct.toFixed(0) + '%"></div>'
        +   '<span class="pet-progress-text">' + cur.exp_in_form + ' / ' + cur.form_exp_total + ' · 还差 ' + cur.form_exp_total + ' 经验进化</span>'
        + '</div>';
    }
    // 阶段小标（1 阶/3 阶 等），强化"刚刚归零"的反馈
    var stageTag = '<span class="pet-stage">第 ' + (cur.form_index + 1) + ' / ' + cur.total_forms + ' 阶</span>';
    box.innerHTML = ''
      + '<div class="pet-now">'
      +   '<img class="pet-img" src="' + imgUrl + '" alt="' + esc(cur.form.name) + '" onerror="this.style.opacity=0.3">'
      +   '<div class="pet-info">'
      +     '<div class="pet-form-name">' + esc(cur.form.name) + ' ' + stageTag + '</div>'
      +     '<div class="pet-form-id">#' + esc(cur.form.id) + ' · ' + esc(cur.chain_name) + '系 · 累计 ' + cur.exp + ' 经验</div>'
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
          +   '<img src="' + petImg(form.id) + '" alt="' + esc(form.name) + '" onerror="this.style.opacity=0.3">'
          +   '<div class="pet-choose-name">' + esc(form.name) + '</div>'
          +   '<div class="pet-choose-sub">（' + esc(c.name) + '系起点）</div>'
          +   (c.id === cur.chain_id ? '<div class="pet-choose-cur">当前</div>' : '<div class="pet-choose-btn">点这里收养</div>')
          + '</div>';
      }).join('')
      // 添加新宝可梦入口
      + '<div class="pet-choose-card pet-add-chain" id="petAddChainBtn">'
      +   '<div class="pet-add-chain-icon">＋</div>'
      +   '<div class="pet-choose-name">添加新宝可梦</div>'
      +   '<div class="pet-choose-sub">伊布？胖丁？自己收</div>'
      + '</div>'
      + '</div>'
      + '<p class="pet-choose-hint">⚠ 换宝可梦会清空当前经验，从初始形态重新开始。</p>';
    openModal('选择宝可梦', html);
  }

  function showAddChain() {
    var html = ''
      + '<p class="card-text">想收养没在上面的宝可梦？填好链 + 形态图片 URL，后端会下载图片到 <code>宠物/images/</code>，下次刷新就出现在展馆里。</p>'
      + '<div class="pet-add-form">'
      +   '<label>链 ID（小写拼音/英文，必须唯一）'
      +     '<input type="text" id="newChainId" placeholder="例如 pikachu" maxlength="30">'
      +   '</label>'
      +   '<label>链显示名（中文）'
      +     '<input type="text" id="newChainName" placeholder="例如 皮卡丘" maxlength="20">'
      +   '</label>'
      +   '<div class="pet-add-form-hint">形态（按进化顺序，至少 1 个；填几个就几条链）：</div>'
      +   '<div id="newChainForms"></div>'
      +   '<button class="btn btn-ghost" id="newChainAddRow">＋ 再加 1 个形态</button>'
      +   '<button class="btn btn-primary pet-add-form-submit" id="newChainSubmit">✨ 添加到游戏</button>'
      + '</div>'
      + '<p class="pet-choose-hint">提示：图片 URL 推荐用 <code>https://assets.pokemon.com/assets/cms2/img/pokedex/full/{001-999}.png</code> 或 <a href="https://nationaldex.io/zh-CN/pokemon" target="_blank">NationalDex</a> 上的图。下载失败的话，本地图片路径也可以（如 <code>D:\\下载\\xxx.png</code>）。</p>';
    openModal('＋ 添加新宝可梦', html);

    // 初始化 3 个空白行（默认 3 形态：起点 / 进化中 / 终态）
    var formsBox = document.getElementById('newChainForms');
    function addRow(id, name, url) {
      var row = document.createElement('div');
      row.className = 'pet-add-form-row';
      row.innerHTML = ''
        + '<input type="text" class="f-id" placeholder="形态 ID（4位数 0025）" value="' + esc(id || '') + '">'
        + '<input type="text" class="f-name" placeholder="名字（皮卡丘）" value="' + esc(name || '') + '">'
        + '<input type="text" class="f-url" placeholder="图片 URL（https://…）" value="' + esc(url || '') + '">'
        + '<button class="pet-btn-del" title="删除这一行">×</button>';
      formsBox.appendChild(row);
    }
    formsBox.innerHTML = '';
    addRow(); addRow(); addRow();

    // 「+再加 1 个形态」按钮（用事件委托，bind 里也加了）
    document.getElementById('newChainAddRow').addEventListener('click', function (e) {
      e.preventDefault(); e.stopPropagation();
      addRow();
    });
    // 行内 × 按钮
    formsBox.addEventListener('click', function (e) {
      var b = e.target.closest('.pet-btn-del');
      if (!b) return;
      var row = b.closest('.pet-add-form-row');
      if (formsBox.children.length > 1) row.remove();
      else { alert('至少保留 1 个形态'); }
    });
  }

  function submitNewChain() {
    var id = (document.getElementById('newChainId').value || '').trim();
    var name = (document.getElementById('newChainName').value || '').trim();
    var rows = document.querySelectorAll('#newChainForms .pet-add-form-row');
    if (!id) { alert('请填"链 ID"'); return; }
    if (!/^[a-z0-9_]+$/i.test(id)) { alert('"链 ID"只能用英文/数字/下划线'); return; }
    if (!name) { alert('请填"链显示名"'); return; }
    var forms = [];
    rows.forEach(function (r) {
      var fid = (r.querySelector('.f-id').value || '').trim();
      var fname = (r.querySelector('.f-name').value || '').trim();
      var furl = (r.querySelector('.f-url').value || '').trim();
      if (fid && fname) forms.push({ id: fid, name: fname, image_url: furl });
    });
    if (!forms.length) { alert('至少填 1 个有效的形态（id + name 必填）'); return; }
    var btn = document.getElementById('newChainSubmit');
    btn.disabled = true; btn.textContent = '⏳ 下载图片中…';
    fetch('/api/chains', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chain: { id: id, name: name, forms: forms } }),
    }).then(function (r) { return r.json(); }).then(function (j) {
      if (j.ok) {
        closeModal();
        // 刷新一次（这样 pet_status 的 all_chains 会包含新链）
        refresh();
        // 给个温和的页面反馈（不用 alert）
        showEvoBanner({ name: '已添加 ' + name + '链（共 ' + (j.chain ? j.chain.forms.length : forms.length) + ' 形态）', _added: true });
      } else {
        alert('添加失败：' + (j.error || ''));
        btn.disabled = false; btn.textContent = '✨ 添加到游戏';
      }
    }).catch(function (e) {
      alert('网络错误：' + e);
      btn.disabled = false; btn.textContent = '✨ 添加到游戏';
    });
  }

  function showGallery() {
    openModal('🏛 展馆', '<p class="card-text">加载中…</p>');
    getGallery().then(function (j) {
      if (!j.ok) {
        document.getElementById('petModalContent').innerHTML = '<p>加载失败：' + esc(j.error || '') + '</p>';
        return;
      }
      var items = j.items || [];
      var html = '<div class="pet-log-total">已收集 <b>' + (j.collected || 0) + '</b> / ' + (j.total_slots || 0) + ' 个形态</div>';
      if (!items.length) {
        html += '<p class="card-text pet-empty">还没定义宝可梦</p>';
      } else {
        // 按链分组展示：未收集的灰色 + 锁图标，已收集的彩色
        html += '<div class="pet-choose-grid">' + items.map(function (e) {
          var imgUrl = petImg(e.form_id);
          if (e.collected) {
            return ''
              + '<div class="pet-gallery-card">'
              +   '<img src="' + imgUrl + '" alt="' + esc(e.form_name) + '" onerror="this.style.opacity=0.3">'
              +   '<div class="pet-choose-name">' + esc(e.form_name) + '</div>'
              +   '<div class="pet-choose-sub">' + esc(e.chain_name) + ' · ' + esc(e.collected_date || '') + '</div>'
              +   '<div class="pet-gallery-exp">' + (e.exp_at_evolution || 0) + ' 经验时进化</div>'
              + '</div>';
          } else {
            return ''
              + '<div class="pet-gallery-card pet-gallery-locked">'
              +   '<img src="' + imgUrl + '" alt="' + esc(e.form_name) + '" class="locked" onerror="this.style.opacity=0.3">'
              +   '<div class="pet-choose-name">' + esc(e.form_name) + '</div>'
              +   '<div class="pet-choose-sub">' + esc(e.chain_name) + '系 · 第 ' + Math.floor(((e.exp_required || 0) / 100) + 1) + ' 阶</div>'
              +   '<div class="pet-gallery-exp pet-locked-tag">🔒 ' + (e.exp_required || 0) + ' 经验解锁</div>'
              + '</div>';
          }
        }).join('') + '</div>';
        html += '<p class="pet-choose-hint">💡 让当前宠物累计到对应经验值，就能在展馆看到这只宝可梦的彩色图。</p>';
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
      if (t.id === 'petAddChainBtn') { showAddChain(); return; }
      if (t.id === 'newChainAddRow') { /* 已在 showAddChain 里直接绑定 */ return; }
      if (t.id === 'newChainSubmit') { submitNewChain(); return; }
      if (t.id === 'petLogBtn') { showLog(); return; }
      if (t.id === 'petGalleryBtn') { showGallery(); return; }
      if (t.id === 'petModalClose' || t === document.getElementById('petModal')) { closeModal(); return; }
      if (t.id === 'addTaskBtn') { onAdd(); return; }
      var action = t.getAttribute('data-action');
      if (action === 'claim') { onClaim(t.getAttribute('data-id'), t); return; }
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
  function onClaim(id, btnEl) {
    claimTask(id).then(function (j) {
      if (!j.ok) {
        alert('失败：' + (j.error || ''));
        return;
      }
      // 1) 按钮内嵌反馈：变成 "✓ +N"，2 秒后刷新时自动变回
      var origin = btnEl ? btnEl.innerHTML : '';
      if (btnEl) {
        btnEl.classList.add('claimed');
        btnEl.textContent = '✓ +' + j.coin;
      }
      // 2) 进化了 → 在页面顶部闪一条简短横幅（不是浏览器弹窗）
      if (j.evolved_to && j.evolved_to.name) {
        showEvoBanner(j.evolved_to);
      }
      // 3) 2 秒后刷新列表与宠物进度（按钮自动还原成 "+N"，因为重新渲染了）
      setTimeout(function () { refresh(); }, 1200);
    });
  }

  function showEvoBanner(form) {
    var b = document.createElement('div');
    b.className = 'pet-evo-banner';
    if (form && form._added) {
      b.innerHTML = '✅ ' + esc(form.name);
    } else {
      b.innerHTML = '🎉 进化为 <b>' + esc(form.name || '？') + '</b>！';
    }
    document.body.appendChild(b);
    // 强制下一帧显示，再加类触发动画
    requestAnimationFrame(function () { b.classList.add('show'); });
    setTimeout(function () {
      b.classList.remove('show');
      setTimeout(function () { b.remove(); }, 400);
    }, 2200);
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
