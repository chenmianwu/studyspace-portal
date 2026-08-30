// ===== 学习中心数据配置 =====
// 每个模块对应一个 workbuddy 会话，session_id 来自 workbuddy.db
// 主题色在 styles.css 中通过 data-accent 控制

const MODULES = {
  general: {
    id: 'general',
    title: '总助手',
    icon: '🎯',
    session_id: '',
    description: '私人学习总管',
    tagline: '五铁律 · 跨学科协调 · 周报汇总',
    quickCommands: [
      { label: '今日清单', prompt: '今日清单' },
      { label: '生成周报', prompt: '周报' },
      { label: '错题统计', prompt: '错题统计' },
      { label: '学生档案', prompt: '复述一遍你记住的学生档案要点和铁律' },
      { label: '看口令手册', prompt: '列出我当前所有可用口令' },
    ],
  },
  chinese: {
    id: 'chinese',
    title: '语文辅导',
    icon: '📖',
    session_id: '',
    description: '统编版七年级',
    tagline: '文言文 · 现代文 · 作文 · 古诗文默写',
    quickCommands: [
      { label: '今日清单', prompt: '今日清单（语文）' },
      { label: '挖空练习', prompt: '挖空当前所学课文 5 个空' },
      { label: '文言文实词', prompt: '给我当前文言文课的重点实词表（8-10 个）' },
      { label: '作文提纲', prompt: '给我当前作文题的提纲 + 句式框架 + 不超过 3 个范例句' },
      { label: '古诗抽默', prompt: '本周古诗文抽默，按抽默规则来' },
    ],
  },
  english: {
    id: 'english',
    title: '英语辅导',
    icon: '🔤',
    session_id: '',
    description: '人教新目标 Go for it!',
    tagline: '单词 · 语法 · 课文 · 作文',
    quickCommands: [
      { label: '今日清单', prompt: '今日清单（英语）' },
      { label: '听写 Unit', prompt: '听写当前单元，按报中文拼写来' },
      { label: '挖空 Unit', prompt: '挖空当前单元课文 5 个空' },
      { label: '语法讲解', prompt: '讲解当前单元语法点（规则 3 行 + 5 单选 + 3 中译英）' },
      { label: '作文框架', prompt: '给我当前作文题的提纲 + 句式 + 不超过 3 个范例句' },
    ],
  },
  math: {
    id: 'math',
    title: '数学辅导',
    icon: '📐',
    session_id: '',
    description: '人教版七年级',
    tagline: '分步引导 · 错因四分类 · 变式训练',
    quickCommands: [
      { label: '今日清单', prompt: '今日清单（数学）' },
      { label: '口算热身', prompt: '出 10 道口算热身（有理数/整式），掐时间 5 分钟' },
      { label: '讲这题', prompt: '给我讲这道错题：【贴你的题】' },
      { label: '出变式', prompt: '针对刚才错的题出 2 道变式（1 平行 + 1 略难）' },
      { label: '判错因', prompt: '批改（贴你的答案或照片）' },
    ],
  },
};

// 唤起 workbuddy 的策略
function openWorkbuddySession(sessionId) {
  // 1) 尝试用自定义 URL scheme
  const schemeUrl = `workbuddy://session/${sessionId}`;
  // 2) 尝试用 workbuddy.exe 启动
  // 3) 降级为复制 session_id 到剪贴板，提示用户在 workbuddy 里导航

  // 直接试 URL scheme
  try {
    window.location.href = schemeUrl;
  } catch (e) {}

  // 同时弹一个提示，让用户知道发生了什么
  setTimeout(() => {
    showToast('已尝试唤起 workbuddy · 如未打开请手动进入对应会话', 'success');
  }, 200);

  // 备份：复制 session_id
  copyToClipboard(sessionId);
}

// 剪贴板工具
async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (e) {
    // 降级方案
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); return true; }
    catch (e2) { return false; }
    finally { document.body.removeChild(ta); }
  }
}

// Toast
function showToast(message, type = '') {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = message;
  toast.className = 'toast show ' + type;
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => {
    toast.className = 'toast ' + type;
  }, 2400);
}
