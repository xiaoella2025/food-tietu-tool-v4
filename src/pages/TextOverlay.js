// ===== TEXT OVERLAY PAGE v3 (独立工作区 / target 维度 / 三列布局) =====
//
// 输入参数（renderTextOverlayPage({...})）：
//   targets         [{ targetId, frameId, versionKey, materialName }]
//   frames          capturedFrames（取 source / time / versionsCache[versionKey]）
//   activeTargetId  当前编辑的 targetId
//   projects        { [targetId]: project }  — 工程数据，按 targetId 索引
//   results         { [targetId]: { dataUrl, savedAt } } — 加字成品（这里只读用于显示状态）
//   onSave          ({ targetId, dataUrl, project }) => void
//   onSwitchTarget  (targetId) => void  仅更新 state.textActiveTargetId，不触发 render
//
// 关键约定（系统性重构后的纪律）：
//   - 第三步绝不写 frame.versionsCache —— 加字成品只走 onSave -> state.textResults
//   - target 列表只含已裁好的版本（含原图也只有当源没生成任何版本时才出现，但这种情况上层已挡掉）
//   - 中栏画布永远画 frame.versionsCache[versionKey] —— 不回退到原图
//   - 文案 tab 用 input 事件就地更新数据，不重渲染 tab body（保住焦点与光标）

const FONT_OPTIONS = [
  // 中文
  { id: 'YaHei',     label: '微软雅黑',       css: '"Microsoft YaHei","PingFang SC",Arial,sans-serif' },
  { id: 'SourceHan', label: '思源黑体',       css: '"Source Han Sans CN","Noto Sans CJK SC","PingFang SC",sans-serif' },
  { id: 'PingFang',  label: '苹方',           css: '"PingFang SC","Microsoft YaHei",sans-serif' },
  { id: 'Hei',       label: '黑体',           css: 'SimHei,"Heiti SC",sans-serif' },
  { id: 'Song',      label: '宋体',            css: 'SimSun,"Songti SC",serif' },
  { id: 'KaiTi',     label: '楷体',            css: 'KaiTi,"Kaiti SC","STKaiti",serif' },
  { id: 'FangSong',  label: '仿宋',            css: '"FangSong","FangSong SC",serif' },
  { id: 'LiSu',      label: '隶书',            css: 'LiSu,"STLiti","Baoli SC",serif' },
  { id: 'HXEK',      label: '华文行楷',        css: '"STXingkai","Xingkai SC",cursive' },
  { id: 'HXWB',      label: '华文新魏',        css: '"STXinwei","Xinwei SC",fantasy' },
  { id: 'YouYuan',   label: '幼圆',            css: '"YouYuan","Yuan",sans-serif' },
  { id: 'FZHei',     label: '方正黑体',        css: '"FZHei","FZHei-B01",sans-serif' },
  { id: 'FZKai',     label: '方正楷体',        css: '"FZKai","FZKai-B01",serif' },
  { id: 'ZKHappy',   label: '站酷快乐体',      css: '"ZCOOLKuaiLe","ZCOOLXiaoWei",sans-serif' },
  { id: 'ZKCool',    label: '站酷酷黑',        css: '"ZCOOLKuTi","ZCOOLQingKeJingKe",sans-serif' },
  // 英文
  { id: 'Arial',     label: 'Arial',           css: 'Arial,sans-serif' },
  { id: 'Helvetica', label: 'Helvetica',       css: 'Helvetica,Arial,sans-serif' },
  { id: 'Georgia',   label: 'Georgia',          css: 'Georgia,serif' },
  { id: 'Times',     label: 'Times New Roman', css: '"Times New Roman",Times,serif' },
  { id: 'Impact',    label: 'Impact',           css: 'Impact,sans-serif' },
  { id: 'Verdana',   label: 'Verdana',         css: 'Verdana,sans-serif' },
  { id: 'Tahoma',    label: 'Tahoma',          css: 'Tahoma,sans-serif' },
  { id: 'Comic',     label: 'Comic Sans MS',   css: '"Comic Sans MS",cursive,sans-serif' },
  { id: 'Courier',   label: 'Courier New',     css: '"Courier New",Courier,monospace' },
  { id: 'Trebuchet', label: 'Trebuchet MS',    css: '"Trebuchet MS",sans-serif' },
];

const STYLE_PRESETS = [
  { id: 'yellow-black', label: '黄字黑边',
    style: { color: '#ffd24d', bold: true, strokeOn: true, strokeColor: '#000000', strokeWidth: 8, shadowOn: false, bgOn: false, borderOn: false } },
  { id: 'white-black', label: '白字黑边',
    style: { color: '#ffffff', bold: true, strokeOn: true, strokeColor: '#000000', strokeWidth: 6, shadowOn: false, bgOn: false, borderOn: false } },
  { id: 'white-red', label: '白字红边',
    style: { color: '#ffffff', bold: true, strokeOn: true, strokeColor: '#d42a2a', strokeWidth: 5, shadowOn: false, bgOn: false, borderOn: false } },
  { id: 'black-yellow', label: '黑字黄底',
    style: { color: '#111111', bold: true, strokeOn: false, shadowOn: false, bgOn: true, bgColor: '#ffd24d', bgAlpha: 0.9, bgRadius: 10, bgPadX: 16, bgPadY: 8, borderOn: false } },
  { id: 'orange-gradient', label: '橙黄渐变感',
    style: { color: '#ff8a3d', bold: true, strokeOn: true, strokeColor: '#7a3000', strokeWidth: 5, shadowOn: true, shadowColor: '#000000', shadowBlur: 8, shadowOffsetX: 3, shadowOffsetY: 3, bgOn: true, bgColor: '#fff3e0', bgAlpha: 0.85, bgRadius: 14, bgPadX: 18, bgPadY: 10, borderOn: false } },
  { id: 'red-calligraphy', label: '红色书法感',
    style: { color: '#cc2200', bold: true, strokeOn: true, strokeColor: '#ffffcc', strokeWidth: 4, shadowOn: true, shadowColor: '#660000', shadowBlur: 5, shadowOffsetX: 2, shadowOffsetY: 2, bgOn: false, borderOn: false } },
  { id: 'cream-outline', label: '奶白描边',
    style: { color: '#fffbe6', bold: true, strokeOn: true, strokeColor: '#8b6914', strokeWidth: 6, shadowOn: false, bgOn: false, borderOn: false } },
  { id: 'fresh-health', label: '清爽养生风',
    style: { color: '#2d7a4f', bold: true, strokeOn: true, strokeColor: '#e8f5e9', strokeWidth: 4, shadowOn: true, shadowColor: '#000000', shadowBlur: 4, shadowOffsetX: 1, shadowOffsetY: 1, bgOn: true, bgColor: '#e8f5e9', bgAlpha: 0.8, bgRadius: 10, bgPadX: 16, bgPadY: 8, borderOn: false } },
  { id: 'bold-cover', label: '粗黑封面字',
    style: { color: '#ffffff', bold: true, strokeOn: true, strokeColor: '#000000', strokeWidth: 10, shadowOn: true, shadowColor: '#000000', shadowBlur: 12, shadowOffsetX: 4, shadowOffsetY: 4, bgOn: false, borderOn: false } },
  { id: 'minimal-light', label: '轻食极简字',
    style: { color: '#555555', bold: false, strokeOn: false, shadowOn: false, bgOn: true, bgColor: '#ffffff', bgAlpha: 0.75, bgRadius: 6, bgPadX: 12, bgPadY: 6, borderOn: false } },
  // 兼容旧 id
  { id: 'clean-black', label: '黑字简洁',
    style: { color: '#111111', bold: true, strokeOn: false, shadowOn: false, bgOn: true, bgColor: '#ffffff', bgAlpha: 0.85, bgRadius: 8, bgPadX: 16, bgPadY: 8, borderOn: false } },
  { id: 'warm', label: '养生暖色',
    style: { color: '#ffffff', bold: true, strokeOn: true, strokeColor: '#8b4513', strokeWidth: 4, shadowOn: true, shadowColor: '#000000', shadowBlur: 6, bgOn: true, bgColor: '#d4860a', bgAlpha: 0.85, bgRadius: 14, bgPadX: 18, bgPadY: 10, borderOn: false } },
];

const PRESET_COLORS = ['#ffffff','#000000','#ffd24d','#ff5252','#3aa0ff','#1aa760','#a259ff','#ff8a3d'];

// ===== STATE (模块级，每次 renderTextOverlayPage 重置) =====
let onSaveCallback = null;
let onSwitchTargetCallback = null;
let onRemoveTargetCallback = null;

let targetList = [];
let frameList = [];
let projectsMap = {};
let resultsMap = {};
let currentTargetId = null;
let activeScriptTab = 'title';
let selectedLayerId = null;

let baseImageEl = null;
let baseImageW = 0;
let baseImageH = 0;
let previewCanvas = null;
let previewCtx = null;
let previewW = 0;
let previewH = 0;

let drag = { active: false, layerId: null, offsetX: 0, offsetY: 0 };
let resize = { active: false, handle: null, layerId: null, startX: 0, startY: 0, startFontSize: 0, startTextWidth: 0 };
let undoStack = [];

// ===== ENTRY =====
export function renderTextOverlayPage({ targets, frames, activeTargetId, projects, results, onSave, onSwitchTarget, onRemoveTarget }) {
  onSaveCallback = onSave;
  onSwitchTargetCallback = onSwitchTarget;
  onRemoveTargetCallback = onRemoveTarget || null;
  targetList = targets || [];
  frameList = frames || [];
  projectsMap = projects || {};
  resultsMap = results || {};
  currentTargetId = activeTargetId && targetList.find(t => t.targetId === activeTargetId)
    ? activeTargetId
    : (targetList[0]?.targetId || null);
  selectedLayerId = null;
  undoStack = [];

  // 为没有 project 的 target 初始化
  targetList.forEach(t => {
    if (!projectsMap[t.targetId]) {
      projectsMap[t.targetId] = emptyProject();
    }
  });

  return `
    <div class="text-page-3col">
      ${renderLeftCol()}
      ${renderCanvasCol()}
      ${renderRightCol()}
    </div>
  `;
}

function emptyProject() {
  return { layers: [], scripts: { title: '', steps: [''], body: '' } };
}

// ===== LEFT: 待加字图片列表（平铺，按素材名分组） =====
function renderLeftCol() {
  // 按 materialName 分组（保持原顺序）
  const groups = [];
  const groupIdx = new Map();
  targetList.forEach(t => {
    if (!groupIdx.has(t.materialName)) {
      groupIdx.set(t.materialName, groups.length);
      groups.push({ materialName: t.materialName, frameId: t.frameId, items: [] });
    }
    groups[groupIdx.get(t.materialName)].items.push(t);
  });

  return `
    <div class="section-card text-target-card">
      <div class="section-header">
        <div class="section-title">待加字图片</div>
        <div class="section-subtitle">${targetList.length} 张</div>
      </div>
      <div class="text-target-list" id="text-target-list">
        ${groups.map(g => renderTargetGroup(g)).join('') || `
          <div class="layer-empty" style="padding:16px 12px;">还没有待加字图片<br/>请回到第二步生成比例版本</div>
        `}
      </div>
    </div>
  `;
}

function renderTargetGroup(g) {
  return `
    <div class="target-group" data-group-material="${escapeAttr(g.materialName)}">
      <div class="target-group-header">
        <span title="${escapeAttr(g.materialName)}">${escapeHTML(g.materialName)}</span>
        <button class="group-del-btn" data-group-del="${escapeAttr(g.materialName)}" title="删除整组">×</button>
      </div>
      ${g.items.map(t => renderTargetItem(t)).join('')}
    </div>
  `;
}

function renderTargetItem(t) {
  const frame = frameList.find(f => f.id === t.frameId);
  // P0防线：只从versionsCache取纯净成品图dataUrl，不fallback到任何其他来源
  const dataUrl = (frame?.versionsCache?.[t.versionKey]) || '';
  if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) {
    // 没有有效finalDataUrl时渲染空项，不使用frame.sourceDataUrl
    return `
    <div class="target-item" data-target-id="${t.targetId}">
      <div class="ti-thumb" style="background:#333;opacity:0.5;text-align:center;line-height:60px;color:#888;font-size:11px;">无成品图</div>
      <div class="ti-info">
        <div class="ti-version">${escapeHTML(t.versionKey)} <span style="color:#ff6666">⚠</span></div>
        <div class="ti-source">${escapeHTML(sourceLine(frame))}</div>
      </div>
      <button class="ti-del" data-target-del="${t.targetId}" title="删除此版本">×</button>
    </div>
  `;
  }
  const isActive = t.targetId === currentTargetId;
  const hasResult = !!resultsMap[t.targetId];
  const sourceLabel = sourceLine(frame);
  return `
    <div class="target-item ${isActive ? 'active' : ''}" data-target-id="${t.targetId}">
      <div class="ti-thumb"><img src="${dataUrl}" draggable="false" alt="${escapeAttr(t.versionKey)}"></div>
      <div class="ti-info">
        <div class="ti-version">${escapeHTML(t.versionKey)}${hasResult ? ' <span class="ti-saved" title="已有加字成品">●</span>' : ''}</div>
        <div class="ti-source">${escapeHTML(sourceLabel)}</div>
      </div>
      <button class="ti-del" data-target-del="${t.targetId}" title="删除此版本">×</button>
    </div>
  `;
}

function sourceLine(frame) {
  if (!frame) return '';
  const s = frame.source;
  if (!s) return frame.time || '';
  if (s.type === 'upload') return `上传 · ${s.name?.slice(0, 18) || ''}`;
  if (s.type === 'video-frame') return `${s.videoName?.slice(0, 14) || '视频'} · ${s.time || ''}`;
  if (s.type === 'video-region') return `${s.videoName?.slice(0, 14) || '视频'} · ${s.time || ''} 选区`;
  return frame.time || '';
}

// ===== CENTER: 画布 =====
function renderCanvasCol() {
  const t = currentTarget();
  const frame = currentFrame();
  const headLine = t
    ? `${t.materialName} · ${sourceLine(frame)} · <strong>${escapeHTML(t.versionKey)}</strong>`
    : '未选择';
  return `
    <div class="section-card text-canvas-card">
      <div class="section-header">
        <div class="section-title">画布预览</div>
        <div class="section-subtitle" id="text-preview-hint">当前编辑：${headLine}</div>
      </div>
      <div class="text-toolbar">
        <button data-nav="edit" class="btn-back">← 图片编辑</button>
        <button id="btn-text-undo" disabled>↩ 撤销</button>
        <span class="text-toolbar-tip">提示：拖动文字框可调整位置，双击进入编辑</span>
        <span style="flex:1;"></span>
        <button id="btn-text-save" class="primary">💾 保存加字成品</button>
      </div>
      <div class="section-body" style="padding:8px;">
        <div class="edit-preview-wrap text-canvas-wrap" id="text-preview-wrap">
          <canvas id="text-canvas"></canvas>
          <div class="layer-handles" id="layer-handles"></div>
        </div>
      </div>
      <div class="canvas-recipe-bar" id="canvas-recipe-bar">
        <span class="recipe-bar-label">配方：</span>
        <button id="btn-save-canvas-recipe" class="recipe-action-btn">💾 保存整图配方</button>
        <button id="btn-apply-canvas-recipe" class="recipe-action-btn">📥 应用配方</button>
        <select id="canvas-recipe-select" class="recipe-select" style="max-width:140px;">
          <option value="">— 选择配方 —</option>
          ${getCanvasRecipes().map((r, i) => `<option value="${i}">${escapeHTML(r.name)}</option>`).join('')}
        </select>
      </div>
    </div>
  `;
}

// ===== RIGHT: 文案 + 图层 + 样式（单列竖向滚动） =====
function renderRightCol() {
  const project = currentProject();
  return `
    <div class="section-card text-right-card">
      <div class="right-scroll" id="text-right-scroll">
        ${renderScriptSection(project)}
        ${renderLayerSection(project)}
        ${renderStyleSection()}
      </div>
    </div>
  `;
}

function renderScriptSection(project) {
  return `
    <div class="rc-section" id="rc-script">
      <div class="rc-section-header">
        <div class="rc-section-title">文案内容</div>
      </div>
      <div class="script-tabs">
        <button class="script-tab ${activeScriptTab === 'title' ? 'active' : ''}" data-script-tab="title">标题</button>
        <button class="script-tab ${activeScriptTab === 'step' ? 'active' : ''}" data-script-tab="step">步骤</button>
        <button class="script-tab ${activeScriptTab === 'body' ? 'active' : ''}" data-script-tab="body">正文</button>
      </div>
      <div class="script-tab-body" id="script-tab-body">
        ${renderScriptTabBody(project)}
      </div>
    </div>
  `;
}

function renderScriptTabBody(project) {
  if (activeScriptTab === 'title') {
    return `
      <textarea id="title-input" rows="2" placeholder="直接在这里输入标题">${escapeHTML(project.scripts.title || '')}</textarea>
      <div class="script-row-actions">
        <button id="btn-add-title" class="primary">+ 加入画布（作为标题）</button>
      </div>
      <div class="script-helper">不知道写啥？候选可点击填充：</div>
      <div class="script-candidates" id="title-candidates">
        ${titleCandidatesOf(project.scripts.title).map(t => `
          <button class="cand-pill" data-cand-title="${escapeAttr(t)}">${escapeHTML(t)}</button>
        `).join('')}
      </div>
    `;
  }
  if (activeScriptTab === 'step') {
    return `
      <div class="step-list" id="step-list">
        ${(project.scripts.steps || ['']).map((s, i) => `
          <div class="step-row" data-step-idx="${i}">
            <span class="step-no">${i + 1}</span>
            <textarea class="step-input" placeholder="步骤${i+1} 直接输入" rows="2">${escapeForTextarea(s)}</textarea>
            <button class="step-add-canvas primary" title="加入画布">+ 加入</button>
            <button class="step-del" title="删除该步">×</button>
          </div>
        `).join('')}
      </div>
      <button id="btn-add-step">+ 添加一行</button>
    `;
  }
  // body
  return `
    <textarea id="body-text" rows="6" placeholder="直接在这里输入正文文案（支持多行）">${escapeHTML(project.scripts.body || '')}</textarea>
    <div class="script-row-actions">
      <span class="body-count" id="body-count">${(project.scripts.body || '').length} 字</span>
      <button id="btn-add-body" class="primary">+ 加入画布</button>
    </div>
  `;
}

function renderLayerSection(project) {
  return `
    <div class="rc-section" id="rc-layers">
      <div class="rc-section-header">
        <div class="rc-section-title">文字图层</div>
        <div class="rc-section-sub">${project.layers.length} 层</div>
      </div>
      <div class="layer-list" id="layer-list">
        ${project.layers.map(l => renderLayerItem(l)).join('') || `<div class="layer-empty">还没有文字图层<br/>用「+ 加入画布」添加，或点下面「+ 添加文字」</div>`}
      </div>
      <div class="layer-actions">
        <button id="btn-add-layer">+ 添加文字</button>
        <button id="btn-dup-layer" ${!selectedLayerId ? 'disabled' : ''}>复制</button>
        <button id="btn-del-layer" ${!selectedLayerId ? 'disabled' : ''} class="danger">删除</button>
      </div>
    </div>
  `;
}

function renderLayerItem(layer) {
  const selected = layer.id === selectedLayerId;
  return `
    <div class="layer-item ${selected ? 'selected' : ''}" data-layer-id="${layer.id}">
      <span class="layer-icon">T</span>
      <span class="layer-name" title="${escapeAttr(layer.name)}">${escapeHTML(layer.name)}</span>
      <button class="layer-vis" data-layer-vis="${layer.id}" title="${layer.visible ? '隐藏' : '显示'}">${layer.visible ? '👁' : '◌'}</button>
      <button class="layer-up" data-layer-up="${layer.id}" title="上移">↑</button>
      <button class="layer-down" data-layer-down="${layer.id}" title="下移">↓</button>
    </div>
  `;
}

function renderStyleSection() {
  const layer = currentLayer();
  if (!layer) {
    return `
      <div class="rc-section" id="rc-style">
        <div class="rc-section-header">
          <div class="rc-section-title">样式设置</div>
          <div class="rc-section-sub">未选中图层</div>
        </div>
        <div class="style-empty">点击图层或先「+ 加入画布」后在此调样式</div>
      </div>
    `;
  }
  return `
    <div class="rc-section" id="rc-style">
      <div class="rc-section-header">
        <div class="rc-section-title">样式设置</div>
        <div class="rc-section-sub">当前：${escapeHTML(layer.name)}</div>
      </div>
      <div class="style-body">
        ${renderTextSettings(layer)}
        ${renderOrientationSettings(layer)}
        ${renderStrokeSettings(layer)}
        ${renderShadowSettings(layer)}
        ${renderAlignSettings(layer)}
        ${renderBgSettings(layer)}
        ${renderBorderSettings(layer)}
        ${renderArtPresetSettings()}
        ${renderPresetSettings()}
      </div>
    </div>
  `;
}

function renderTextSettings(l) {
  return `
    <div class="ctrl-group">
      <div class="ctrl-group-title">基础</div>
      <div class="row" style="align-items:flex-start;"><label style="line-height:28px;">内容</label><textarea data-layer-prop="text" rows="3" style="flex:1;resize:vertical;">${escapeAttr(l.text)}</textarea></div>
      <div class="row"><label>名称</label><input type="text" data-layer-prop="name" value="${escapeAttr(l.name)}" /></div>
      <div class="row">
        <label>字体</label>
        <select data-layer-prop="font" class="font-select" style="max-width:none;">
          ${FONT_OPTIONS.map(f => `<option value="${f.id}" ${l.font === f.id ? 'selected' : ''}>${f.label}</option>`).join('')}
        </select>
      </div>
      <div class="slider-group" data-slider="fontSize">
        <label>字号</label>
        <input type="range" min="20" max="220" step="2" value="${l.fontSize}" />
        <span class="val">${l.fontSize}</span>
      </div>
      <div class="row">
        <label>文本框宽度</label>
        <input type="number" data-layer-prop="textWidth" value="${l.textWidth || 300}" min="50" max="2000" style="width:70px;" />
      </div>
      <div class="row">
        <label>颜色</label>
        <input type="color" data-layer-prop="color" value="${l.color}" />
        <div class="swatches">
          ${PRESET_COLORS.map(c => `<button class="color-swatch" data-color-for="color" data-color="${c}" style="background:${c};" title="${c}"></button>`).join('')}
        </div>
      </div>
      <div class="row"><label>加粗</label><input type="checkbox" data-layer-prop="bold" ${l.bold ? 'checked' : ''} /></div>
      <div class="slider-group" data-slider="lineHeight">
        <label>行距</label>
        <input type="range" min="0.8" max="2.2" step="0.05" value="${l.lineHeight}" />
        <span class="val">${l.lineHeight.toFixed(2)}</span>
      </div>
      <div class="slider-group" data-slider="letterSpacing">
        <label>字间距</label>
        <input type="range" min="-5" max="40" step="1" value="${l.letterSpacing}" />
        <span class="val">${l.letterSpacing}</span>
      </div>
    </div>
  `;
}

function renderOrientationSettings(l) {
  return `
    <div class="ctrl-group">
      <div class="ctrl-group-title">排列方向</div>
      <div class="row">
        <label>方向</label>
        <div class="pos-grid">
          <button data-set-orient="h" class="${!l.vertical ? 'active' : ''}">横排</button>
          <button data-set-orient="v" class="${l.vertical ? 'active' : ''}">竖排</button>
        </div>
      </div>
    </div>
  `;
}

function renderStrokeSettings(l) {
  return `
    <div class="ctrl-group">
      <div class="ctrl-group-title row-title">
        <span>描边</span>
        <label><input type="checkbox" data-layer-prop="strokeOn" ${l.strokeOn ? 'checked' : ''}/> 启用</label>
      </div>
      <div class="row"><label>颜色</label><input type="color" data-layer-prop="strokeColor" value="${l.strokeColor}" /></div>
      <div class="slider-group" data-slider="strokeWidth">
        <label>粗细</label>
        <input type="range" min="0" max="30" step="1" value="${l.strokeWidth}" />
        <span class="val">${l.strokeWidth}</span>
      </div>
    </div>
  `;
}

function renderShadowSettings(l) {
  return `
    <div class="ctrl-group">
      <div class="ctrl-group-title row-title">
        <span>阴影</span>
        <label><input type="checkbox" data-layer-prop="shadowOn" ${l.shadowOn ? 'checked' : ''}/> 启用</label>
      </div>
      <div class="row"><label>颜色</label><input type="color" data-layer-prop="shadowColor" value="${l.shadowColor}" /></div>
      <div class="slider-group" data-slider="shadowBlur"><label>模糊</label><input type="range" min="0" max="40" step="1" value="${l.shadowBlur}" /><span class="val">${l.shadowBlur}</span></div>
      <div class="slider-group" data-slider="shadowOffsetX"><label>偏移X</label><input type="range" min="-20" max="20" step="1" value="${l.shadowOffsetX}" /><span class="val">${l.shadowOffsetX}</span></div>
      <div class="slider-group" data-slider="shadowOffsetY"><label>偏移Y</label><input type="range" min="-20" max="20" step="1" value="${l.shadowOffsetY}" /><span class="val">${l.shadowOffsetY}</span></div>
    </div>
  `;
}

function renderAlignSettings(l) {
  return `
    <div class="ctrl-group">
      <div class="ctrl-group-title">对齐 / 位置</div>
      <div class="row">
        <label>对齐</label>
        <div class="pos-grid">
          <button data-set-align="left"   class="${l.align === 'left'   ? 'active' : ''}">左</button>
          <button data-set-align="center" class="${l.align === 'center' ? 'active' : ''}">中</button>
          <button data-set-align="right"  class="${l.align === 'right'  ? 'active' : ''}">右</button>
        </div>
      </div>
      <div class="row">
        <label>位置</label>
        <div class="pos-grid">
          <button data-quick-pos="top">上</button>
          <button data-quick-pos="center">中</button>
          <button data-quick-pos="bottom">下</button>
        </div>
      </div>
    </div>
  `;
}

function renderBgSettings(l) {
  return `
    <div class="ctrl-group">
      <div class="ctrl-group-title row-title">
        <span>背景板</span>
        <label><input type="checkbox" data-layer-prop="bgOn" ${l.bgOn ? 'checked' : ''}/> 启用</label>
      </div>
      <div class="row"><label>颜色</label><input type="color" data-layer-prop="bgColor" value="${l.bgColor}" /></div>
      <div class="slider-group" data-slider="bgAlpha"><label>透明度</label><input type="range" min="0" max="100" step="5" value="${Math.round(l.bgAlpha * 100)}" /><span class="val">${Math.round(l.bgAlpha * 100)}</span></div>
      <div class="slider-group" data-slider="bgRadius"><label>圆角</label><input type="range" min="0" max="40" step="1" value="${l.bgRadius}" /><span class="val">${l.bgRadius}</span></div>
      <div class="slider-group" data-slider="bgPadX"><label>横边距</label><input type="range" min="0" max="60" step="1" value="${l.bgPadX}" /><span class="val">${l.bgPadX}</span></div>
      <div class="slider-group" data-slider="bgPadY"><label>竖边距</label><input type="range" min="0" max="40" step="1" value="${l.bgPadY}" /><span class="val">${l.bgPadY}</span></div>
    </div>
  `;
}

function renderBorderSettings(l) {
  return `
    <div class="ctrl-group">
      <div class="ctrl-group-title row-title">
        <span>边框</span>
        <label><input type="checkbox" data-layer-prop="borderOn" ${l.borderOn ? 'checked' : ''}/> 启用</label>
      </div>
      <div class="row"><label>颜色</label><input type="color" data-layer-prop="borderColor" value="${l.borderColor}" /></div>
      <div class="slider-group" data-slider="borderWidth"><label>粗细</label><input type="range" min="0" max="12" step="1" value="${l.borderWidth}" /><span class="val">${l.borderWidth}</span></div>
    </div>
  `;
}

function renderArtPresetSettings() {
  const artPresets = [
    { id: 'art-yellow-black', label: '黄字黑边',    color: '#ffd24d', stroke: '#000000', sw: 8, bold: true,  shadow: false, bg: false },
    { id: 'art-white-black',  label: '白字黑边',    color: '#ffffff', stroke: '#000000', sw: 6, bold: true,  shadow: false, bg: false },
    { id: 'art-white-red',    label: '白字红边',    color: '#ffffff', stroke: '#d42a2a', sw: 5, bold: true,  shadow: false, bg: false },
    { id: 'art-black-yellow', label: '黑字黄底',    color: '#111111', stroke: false,    sw: 0, bold: true,  shadow: false, bg: true,  bgColor: '#ffd24d' },
    { id: 'art-orange',       label: '橙黄渐变感',  color: '#ff8a3d', stroke: '#7a3000', sw: 5, bold: true,  shadow: true,  bg: true,  bgColor: '#fff3e0' },
    { id: 'art-red-cally',    label: '红色书法感',  color: '#cc2200', stroke: '#ffffcc', sw: 4, bold: true,  shadow: true,  bg: false },
    { id: 'art-cream',        label: '奶白描边',    color: '#fffbe6', stroke: '#8b6914', sw: 6, bold: true,  shadow: false, bg: false },
    { id: 'art-fresh',        label: '清爽养生风',  color: '#2d7a4f', stroke: '#e8f5e9', sw: 4, bold: true,  shadow: true,  bg: true,  bgColor: '#e8f5e9' },
    { id: 'art-bold',         label: '粗黑封面字',  color: '#ffffff', stroke: '#000000', sw: 10, bold: true, shadow: true,  bg: false },
    { id: 'art-minimal',      label: '轻食极简字',  color: '#555555', stroke: false,     sw: 0, bold: false, shadow: false, bg: true,  bgColor: '#ffffff' },
  ];
  return `
    <div class="ctrl-group">
      <div class="ctrl-group-title">艺术字预设</div>
      <div class="art-preset-grid">
        ${artPresets.map(p => `
          <button class="art-preset-btn" data-art-preset="${p.id}" title="${p.label}">
            <span class="art-preset-label" style="
              color:${p.color};
              ${p.stroke ? `-webkit-text-stroke:1px ${p.stroke};text-stroke:1px ${p.stroke};` : ''}
              font-weight:${p.bold ? 'bold' : 'normal'};
              ${p.shadow ? 'text-shadow:1px 1px 3px rgba(0,0,0,0.6);' : ''}
            ">${p.label}</span>
          </button>
        `).join('')}
      </div>
    </div>
  `;
}

function renderPresetSettings() {
  return `
    <div class="ctrl-group">
      <div class="ctrl-group-title">样式预设</div>
      <div class="preset-row">
        ${STYLE_PRESETS.map(p => `<button class="preset-pill" data-style-preset="${p.id}">${p.label}</button>`).join('')}
        <button class="preset-pill" data-style-preset="__reset">恢复默认</button>
      </div>
      <div class="style-recipe-row">
        <button class="preset-pill save-recipe-btn" id="save-style-recipe-btn">💾 保存当前样式</button>
      </div>
      ${renderStyleRecipeSection()}
    </div>
  `;
}

function renderStyleRecipeSection() {
  const recipes = getStyleRecipes();
  if (recipes.length === 0) return '';
  return `
    <div class="ctrl-group-title" style="margin-top:10px;">已保存配方</div>
    <div class="recipe-list">
      ${recipes.map((r, i) => `
        <div class="recipe-item" data-recipe-index="${i}">
          <span class="recipe-name">${escapeHTML(r.name)}</span>
          <button class="recipe-apply-btn" data-recipe-index="${i}" title="应用">应用</button>
          <button class="recipe-del-btn" data-recipe-index="${i}" title="删除">×</button>
        </div>
      `).join('')}
    </div>
  `;
}

// ===== CANVAS RECIPE (整图配方) =====
function getCanvasRecipes() {
  try { return JSON.parse(localStorage.getItem('canvasRecipes') || '[]'); } catch { return []; }
}

function saveCanvasRecipe(name) {
  const project = currentProject();
  const recipe = {
    name,
    layers: project.layers.map(l => ({
      role: l.role || l.kind || 'custom',
      name: l.name,
      text: l.text,
      xPct: l.xPct,
      yPct: l.yPct,
      textWidth: l.textWidth,
      fontSize: l.fontSize,
      font: l.font,
      color: l.color,
      bold: l.bold,
      strokeOn: l.strokeOn,
      strokeColor: l.strokeColor,
      strokeWidth: l.strokeWidth,
      shadowOn: l.shadowOn,
      shadowColor: l.shadowColor,
      shadowBlur: l.shadowBlur,
      shadowOffsetX: l.shadowOffsetX,
      shadowOffsetY: l.shadowOffsetY,
      align: l.align,
      vertical: l.vertical,
      lineHeight: l.lineHeight,
      letterSpacing: l.letterSpacing,
      bgOn: l.bgOn,
      bgColor: l.bgColor,
      bgAlpha: l.bgAlpha,
      bgRadius: l.bgRadius,
      bgPadX: l.bgPadX,
      bgPadY: l.bgPadY,
    })),
  };
  const recipes = getCanvasRecipes();
  recipes.push(recipe);
  localStorage.setItem('canvasRecipes', JSON.stringify(recipes));
}

function applyCanvasRecipe(index) {
  const recipes = getCanvasRecipes();
  if (!recipes[index]) return;
  const recipe = recipes[index];
  const project = currentProject();
  project.layers = recipe.layers.map((l, i) => ({
    id: `L-${Date.now()}-${i}-${Math.random().toString(36).slice(2,6)}`,
    visible: true,
    ...l,
  }));
  selectedLayerId = project.layers[0]?.id || null;
  refreshLayerListDOM();
  refreshStyleSectionDOM();
  drawAll();
  renderHandles();
}

// ===== STYLE RECIPE (单图层样式预设) =====
function getStyleRecipes() {
  try { return JSON.parse(localStorage.getItem('styleRecipes') || '[]'); } catch { return []; }
}

function saveStyleRecipe(name) {
  const layer = currentLayer();
  if (!layer) return;
  const recipe = {
    name,
    font: layer.font,
    fontSize: layer.fontSize,
    color: layer.color,
    bold: layer.bold,
    strokeOn: layer.strokeOn,
    strokeColor: layer.strokeColor,
    strokeWidth: layer.strokeWidth,
    shadowOn: layer.shadowOn,
    shadowColor: layer.shadowColor,
    shadowBlur: layer.shadowBlur,
    shadowOffsetX: layer.shadowOffsetX,
    shadowOffsetY: layer.shadowOffsetY,
    align: layer.align,
    textWidth: layer.textWidth,
    lineHeight: layer.lineHeight,
    letterSpacing: layer.letterSpacing,
    bgOn: layer.bgOn,
    bgColor: layer.bgColor,
    bgAlpha: layer.bgAlpha,
    bgRadius: layer.bgRadius,
    bgPadX: layer.bgPadX,
    bgPadY: layer.bgPadY,
    borderOn: layer.borderOn,
    borderColor: layer.borderColor,
    borderWidth: layer.borderWidth,
    vertical: layer.vertical,
  };
  const recipes = getStyleRecipes();
  recipes.push(recipe);
  localStorage.setItem('styleRecipes', JSON.stringify(recipes));
}

function applyStyleRecipe(index) {
  const recipes = getStyleRecipes();
  if (!recipes[index]) return;
  const layer = currentLayer();
  if (!layer) return;
  Object.assign(layer, recipes[index]);
  drawAll();
  refreshStyleSectionDOM();
  renderHandles();
}

function deleteStyleRecipe(index) {
  const recipes = getStyleRecipes();
  recipes.splice(index, 1);
  localStorage.setItem('styleRecipes', JSON.stringify(recipes));
  refreshStyleSectionDOM();
}

// ===== INIT (绑定事件 + 加载图像) =====
export function initTextOverlayPage() {
  previewCanvas = document.getElementById('text-canvas');
  if (!previewCanvas) return;
  previewCtx = previewCanvas.getContext('2d');
  loadBaseImage(() => {
    sizeCanvasForImage();
    drawAll();
    renderHandles();
  });
  bindAllEvents();
}

function currentTarget() {
  return targetList.find(t => t.targetId === currentTargetId) || null;
}
function currentFrame() {
  const t = currentTarget();
  if (!t) return null;
  return frameList.find(f => f.id === t.frameId);
}
function currentProject() {
  if (!currentTargetId) return emptyProject();
  if (!projectsMap[currentTargetId]) projectsMap[currentTargetId] = emptyProject();
  return projectsMap[currentTargetId];
}
function currentLayer() {
  return currentProject().layers.find(l => l.id === selectedLayerId);
}

function getBaseDataUrl() {
  const t = currentTarget();
  const frame = currentFrame();
  if (!t || !frame) return null;
  return frame.versionsCache?.[t.versionKey] || null;
}

function loadBaseImage(cb) {
  const url = getBaseDataUrl();
  if (!url) return;
  const img = new Image();
  img.onload = () => {
    baseImageEl = img;
    baseImageW = img.naturalWidth;
    baseImageH = img.naturalHeight;
    cb?.();
  };
  img.src = url;
}

function sizeCanvasForImage() {
  const wrap = document.getElementById('text-preview-wrap');
  const maxW = wrap?.clientWidth ? wrap.clientWidth - 16 : 560;
  const maxH = 540;
  const scale = Math.min(maxW / baseImageW, maxH / baseImageH, 1);
  previewW = Math.max(50, Math.round(baseImageW * scale));
  previewH = Math.max(50, Math.round(baseImageH * scale));
  previewCanvas.width = previewW;
  previewCanvas.height = previewH;
}

// ===== DRAW =====
function drawAll() {
  if (!previewCtx || !baseImageEl) return;
  previewCtx.clearRect(0, 0, previewW, previewH);
  previewCtx.drawImage(baseImageEl, 0, 0, previewW, previewH);
  const project = currentProject();
  const scale = previewW / baseImageW;
  project.layers.forEach(layer => {
    if (!layer.visible) return;
    drawLayerOnContext(previewCtx, layer, previewW, previewH, scale);
  });
}

function drawLayerOnContext(ctx, layer, w, h, scale) {
  if (!layer.text || !layer.text.trim()) return;
  if (layer.vertical) return drawVerticalLayer(ctx, layer, w, h, scale);
  return drawHorizontalLayer(ctx, layer, w, h, scale);
}

function drawHorizontalLayer(ctx, layer, w, h, scale) {
  const rawLines = layer.text.split('\n');
  const fontSize = layer.fontSize * scale;
  const lineHeight = fontSize * layer.lineHeight;
  const letterSpacing = layer.letterSpacing * scale;
  const fontCss = FONT_OPTIONS.find(f => f.id === layer.font)?.css || FONT_OPTIONS[0].css;
  ctx.font = `${layer.bold ? 'bold ' : ''}${fontSize}px ${fontCss}`;

  // Use alphabetic baseline: boxY = baseline of line 0
  // text top = boxY - ascent, text bottom = boxY + (numLines-1)*lineHeight + descent
  const sampleH = ctx.measureText('T');
  const ascent = sampleH.actualBoundingBoxAscent || fontSize * 0.72;
  const descent = sampleH.actualBoundingBoxDescent || fontSize * 0.28;
  ctx.textBaseline = 'alphabetic';

  const measureLine = (line) => {
    if (!letterSpacing) return ctx.measureText(line).width;
    let w2 = 0;
    for (const ch of line) w2 += ctx.measureText(ch).width + letterSpacing;
    return Math.max(0, w2 - letterSpacing);
  };

  // Auto-wrap: split long lines at textWidth
  const textWidthPx = (layer.textWidth || 300) * scale;
  const allLines = [];
  rawLines.forEach(raw => {
    if (!raw) { allLines.push(''); return; }
    const chars = Array.from(raw);
    let current = '';
    for (const ch of chars) {
      const test = current + ch;
      if (measureLine(test) > textWidthPx && current) {
        allLines.push(current);
        current = ch;
      } else {
        current = test;
      }
    }
    if (current) allLines.push(current);
  });

  const lineWidths = allLines.map(l => measureLine(l || ' '));
  const maxLineW = Math.max(...lineWidths);
  // totalH = lineHeight * numLines (gap between lines = lineHeight - fontSize)
  const totalH = lineHeight * allLines.length;
  // Visual text height: from ascent above baseline 0 to descent below last line baseline
  const visualH = ascent + (allLines.length - 1) * lineHeight + descent;
  const buffer = 2 * scale;
  const padY = (layer.bgPadY || 8) * scale;

  const boxX = layer.xPct * w;
  const boxY = layer.yPct * h;

  // For center/right alignment, shift background so it always wraps the visual text area
  const boxXAligned = layer.align === 'left' ? boxX : boxX;
  const lineX = (i) => {
    const lw = lineWidths[i];
    if (layer.align === 'left') return boxX;
    if (layer.align === 'right') return boxX + maxLineW - lw;
    return boxX + (maxLineW - lw) / 2;
  };
  // Background: always align its left edge with the actual text leftmost edge
  // For left-align: bgLeft = boxX; for center/right: bgLeft = lineX(0) (leftmost line)
  const bgLeft = boxX;
  const bgTop = boxY - ascent - padY;
  const bgH = visualH + padY * 2;
  drawBgIfNeeded(ctx, layer, bgLeft, bgTop, maxLineW + buffer * 2, bgH, scale);

  const eachChar = (drawFn) => {
    allLines.forEach((line, i) => {
      const y = boxY + i * lineHeight;
      if (!letterSpacing) {
        drawFn(line, lineX(i) + buffer, y);
      } else {
        let x = lineX(i) + buffer;
        for (const ch of line) {
          drawFn(ch, x, y);
          x += ctx.measureText(ch).width + letterSpacing;
        }
      }
    });
  };

  if (layer.shadowOn && layer.shadowBlur >= 0) {
    ctx.save();
    ctx.shadowColor = layer.shadowColor || 'rgba(0,0,0,0.85)';
    ctx.shadowBlur = layer.shadowBlur * scale;
    ctx.shadowOffsetX = layer.shadowOffsetX * scale;
    ctx.shadowOffsetY = layer.shadowOffsetY * scale;
    ctx.fillStyle = layer.color;
    eachChar((t, x, y) => ctx.fillText(t, x, y));
    ctx.restore();
  }
  if (layer.strokeOn && layer.strokeWidth > 0) {
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.miterLimit = 2;
    ctx.lineWidth = layer.strokeWidth * scale;
    ctx.strokeStyle = layer.strokeColor;
    eachChar((t, x, y) => ctx.strokeText(t, x, y));
    ctx.restore();
  }
  ctx.save();
  ctx.fillStyle = layer.color;
  eachChar((t, x, y) => ctx.fillText(t, x, y));
  ctx.restore();

  // Selection box uses same buffer as background for consistent visual padding
  const selPadX = buffer; // horizontal padding same as in drawBgIfNeeded
  layer._lastBox = { x: boxX - selPadX, y: bgTop, w: maxLineW + selPadX * 2, h: bgH, scale };
}

function drawVerticalLayer(ctx, layer, w, h, scale) {
  const fontSize = layer.fontSize * scale;
  const letterSpacing = layer.letterSpacing * scale;
  const colStep = fontSize * layer.lineHeight; // 列间距
  const charStep = fontSize + letterSpacing;   // 每字垂直步进
  const fontCss = FONT_OPTIONS.find(f => f.id === layer.font)?.css || FONT_OPTIONS[0].css;
  ctx.font = `${layer.bold ? 'bold ' : ''}${fontSize}px ${fontCss}`;
  ctx.textBaseline = 'top';

  const rawLines = layer.text.split('\n'); // 每行 = 一列
  const textWidthPx = (layer.textWidth || 300) * scale;

  // Auto-wrap each line column-wise for vertical layout
  const wrappedCols = [];
  rawLines.forEach(raw => {
    if (!raw) { wrappedCols.push(['']); return; }
    const chars = Array.from(raw);
    let current = '';
    let col = [];
    for (const ch of chars) {
      const test = current + ch;
      if (ctx.measureText(test).width > textWidthPx && current) {
        col.push(current);
        current = ch;
      } else {
        current = test;
      }
    }
    if (current) col.push(current);
    if (col.length === 0) col.push('');
    wrappedCols.push(col);
  });

  // Each column is an array of strings (auto-wrapped pieces)
  const maxColLen = Math.max(...wrappedCols.map(c => c.reduce((s, seg) => s + seg.length, 0) || 1));
  const totalH = maxColLen * charStep;
  const totalW = wrappedCols.length * colStep;

  const boxX = layer.xPct * w;
  const boxY = layer.yPct * h;

  // 列从右往左排列（符合中文竖排习惯：第一行是最右一列）
  const colX = (i) => boxX + (wrappedCols.length - 1 - i) * colStep;

  drawBgIfNeeded(ctx, layer, boxX, boxY, totalW, totalH, scale);

  const eachChar = (drawFn) => {
    wrappedCols.forEach((segments, i) => {
      const x = colX(i);
      segments.forEach((seg, si) => {
        const chars = Array.from(seg);
        chars.forEach((ch, j) => {
          const cw = ctx.measureText(ch).width;
          // 字符在列宽内居中
          const charY = boxY + (si * chars.length + j) * charStep;
          drawFn(ch, x + (fontSize - cw) / 2, charY);
        });
      });
    });
  };

  if (layer.shadowOn && layer.shadowBlur >= 0) {
    ctx.save();
    ctx.shadowColor = layer.shadowColor || 'rgba(0,0,0,0.85)';
    ctx.shadowBlur = layer.shadowBlur * scale;
    ctx.shadowOffsetX = layer.shadowOffsetX * scale;
    ctx.shadowOffsetY = layer.shadowOffsetY * scale;
    ctx.fillStyle = layer.color;
    eachChar((t, x, y) => ctx.fillText(t, x, y));
    ctx.restore();
  }
  if (layer.strokeOn && layer.strokeWidth > 0) {
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.miterLimit = 2;
    ctx.lineWidth = layer.strokeWidth * scale;
    ctx.strokeStyle = layer.strokeColor;
    eachChar((t, x, y) => ctx.strokeText(t, x, y));
    ctx.restore();
  }
  ctx.save();
  ctx.fillStyle = layer.color;
  eachChar((t, x, y) => ctx.fillText(t, x, y));
  ctx.restore();

  layer._lastBox = { x: boxX, y: boxY, w: totalW, h: totalH, scale };
}

function drawBgIfNeeded(ctx, layer, boxX, boxY, contentW, contentH, scale) {
  if (!layer.bgOn) return;
  const padX = layer.bgPadX * scale;
  const padY = layer.bgPadY * scale;
  const r = layer.bgRadius * scale;
  const bx = boxX - padX;
  const by = boxY - padY;
  const bw = contentW + padX * 2;
  const bh = contentH + padY * 2;
  ctx.save();
  ctx.fillStyle = hexWithAlpha(layer.bgColor, layer.bgAlpha);
  roundRect(ctx, bx, by, bw, bh, Math.min(r, bw / 2, bh / 2));
  ctx.fill();
  if (layer.borderOn && layer.borderWidth > 0) {
    ctx.strokeStyle = layer.borderColor;
    ctx.lineWidth = layer.borderWidth * scale;
    roundRect(ctx, bx, by, bw, bh, Math.min(r, bw / 2, bh / 2));
    ctx.stroke();
  }
  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function hexWithAlpha(hex, alpha) {
  const c = hex.replace('#', '');
  const r = parseInt(c.substring(0, 2), 16);
  const g = parseInt(c.substring(2, 4), 16);
  const b = parseInt(c.substring(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// ===== HANDLES =====
function renderHandles() {
  const wrap = document.getElementById('layer-handles');
  if (!wrap || !previewCanvas) return;
  wrap.innerHTML = '';
  const project = currentProject();
  const canvasRect = previewCanvas.getBoundingClientRect();
  const wrapRect = wrap.getBoundingClientRect();
  const offsetLeft = canvasRect.left - wrapRect.left;
  const offsetTop = canvasRect.top - wrapRect.top;

  project.layers.forEach(layer => {
    if (!layer._lastBox) return;
    const box = layer._lastBox;
    const isSelected = layer.id === selectedLayerId;
    const div = document.createElement('div');
    div.className = `layer-handle ${isSelected ? 'selected' : ''}`;
    div.style.left = (offsetLeft + box.x) + 'px';
    div.style.top = (offsetTop + box.y) + 'px';
    div.style.width = box.w + 'px';
    div.style.height = box.h + 'px';
    div.dataset.layerId = layer.id;
    wrap.appendChild(div);

    // 仅选中时画8个控制点（4角 + 4边中点）
    if (!isSelected) return;
    const hs = 7; // 控制点半径
    const handles = [
      { h: 'nw', x: -hs, y: -hs },
      { h: 'ne', x: box.w - hs, y: -hs },
      { h: 'sw', x: -hs, y: box.h - hs },
      { h: 'se', x: box.w - hs, y: box.h - hs },
      { h: 'n',  x: box.w / 2 - hs, y: -hs },
      { h: 's',  x: box.w / 2 - hs, y: box.h - hs },
      { h: 'w',  x: -hs, y: box.h / 2 - hs },
      { h: 'e',  x: box.w - hs, y: box.h / 2 - hs },
    ];
    handles.forEach(({ h, x, y }) => {
      const hd = document.createElement('div');
      hd.className = `resize-handle resize-${h}`;
      hd.dataset.resizeHandle = h;
      hd.dataset.layerId = layer.id;
      hd.style.cssText = `position:absolute;left:${offsetLeft + box.x + x}px;top:${offsetTop + box.y + y}px;width:${hs*2}px;height:${hs*2}px;background:#fff;border:1.5px solid #1d5fe7;border-radius:3px;cursor:${h};pointer-events:all;`;
      wrap.appendChild(hd);
    });
  });
}

// ===== EVENTS =====
function bindAllEvents() {
  bindLeftListEvents();
  bindCanvasDrag();
  bindScriptEvents();
  bindLayerListEvents();
  bindStyleEvents();
  bindTopActions();
  window.addEventListener('resize', () => {
    sizeCanvasForImage();
    drawAll();
    renderHandles();
  });
}

function bindLeftListEvents() {
  document.getElementById('text-target-list')?.addEventListener('click', e => {
    // 删除单个 target 版本
    const delBtn = e.target.closest('[data-target-del]');
    if (delBtn) {
      e.stopPropagation();
      const tid = delBtn.dataset.targetDel;
      if (!window.confirm(`删除待加字版本「${tid}」？\n（不会删除第二步的原图和版本）`)) return;
      onRemoveTargetCallback?.(tid);
      return;
    }
    // 删除整组
    const groupDelBtn = e.target.closest('[data-group-del]');
    if (groupDelBtn) {
      e.stopPropagation();
      const matName = groupDelBtn.dataset.groupDel;
      if (!window.confirm(`删除素材「${matName}」的全部待加字版本？\n（不会删除第二步的原图和版本）`)) return;
      onRemoveTargetCallback?.(null, matName);
      return;
    }
    const item = e.target.closest('.target-item');
    if (!item) return;
    const tid = item.dataset.targetId;
    if (tid === currentTargetId) return;
    currentTargetId = tid;
    selectedLayerId = null;
    onSwitchTargetCallback?.(tid);
    refreshLeftListDOM();
    refreshCanvasHeader();
    refreshRightColDOM();
    loadBaseImage(() => {
      sizeCanvasForImage();
      drawAll();
      renderHandles();
    });
  });
}

function bindCanvasDrag() {
  const wrap = document.getElementById('text-preview-wrap');
  if (!wrap) return;

  const onDown = (e) => {
    const rect = previewCanvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    if (px < 0 || py < 0 || px > rect.width || py > rect.height) return;
    const project = currentProject();
    let hit = null;
    for (let i = project.layers.length - 1; i >= 0; i--) {
      const l = project.layers[i];
      if (!l.visible || !l._lastBox) continue;
      const b = l._lastBox;
      if (px >= b.x - 4 && px <= b.x + b.w + 4 && py >= b.y - 4 && py <= b.y + b.h + 4) {
        hit = l; break;
      }
    }
    if (hit) {
      selectedLayerId = hit.id;
      drag.active = true;
      drag.layerId = hit.id;
      drag.offsetX = px - hit._lastBox.x;
      drag.offsetY = py - hit._lastBox.y;
      refreshLayerListDOM();
      refreshStyleSectionDOM();
      drawAll();
      renderHandles();
      e.preventDefault();
    } else if (selectedLayerId) {
      selectedLayerId = null;
      refreshLayerListDOM();
      refreshStyleSectionDOM();
      drawAll();
      renderHandles();
    }
  };

  const onMove = (e) => {
    if (drag.active) {
      const rect = previewCanvas.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      const layer = currentProject().layers.find(l => l.id === drag.layerId);
      if (!layer) return;
      layer.xPct = (px - drag.offsetX) / previewW;
      layer.yPct = (py - drag.offsetY) / previewH;
      drawAll();
      renderHandles();
    }
    if (resize.active) {
      const layer = currentProject().layers.find(l => l.id === resize.layerId);
      if (!layer) return;
      const dx = e.clientX - resize.startX;
      const dy = e.clientY - resize.startY;
      const scale = previewW / baseImageW;
      // 角点拖动：同步缩放 fontSize 和 textWidth（保持比例）
      if (['nw', 'ne', 'sw', 'se'].some(h => resize.handle === h)) {
        const scaleFactor = (resize.startTextWidth + dx * 2) / resize.startTextWidth;
        const newFontSize = Math.max(12, Math.round(resize.startFontSize * scaleFactor));
        const newW = Math.max(50, Math.round(resize.startTextWidth * scaleFactor));
        layer.fontSize = newFontSize;
        layer.textWidth = newW;
        drawAll();
        renderHandles();
        refreshStyleSectionDOM();
      }
      // 边中点拖动：只调整 textWidth（自动换行）
      else if (['e', 'w'].some(h => resize.handle.includes(h))) {
        const deltaX = resize.handle.includes('w') ? -dx : dx;
        const newW = Math.max(50, Math.round(resize.startTextWidth + deltaX / scale));
        layer.textWidth = newW;
        drawAll();
        renderHandles();
        refreshStyleSectionDOM();
      }
    }
  };

  const onUp = () => {
    if (drag.active) { drag.active = false; drag.layerId = null; }
    if (resize.active) { resize.active = false; resize.layerId = null; }
  };

  previewCanvas.addEventListener('mousedown', onDown);
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);

  // Resize handles (delegated to wrap)
  wrap.addEventListener('mousedown', e => {
    const hd = e.target.closest('.resize-handle');
    if (!hd) return;
    e.preventDefault();
    e.stopPropagation();
    const layer = currentProject().layers.find(l => l.id === hd.dataset.layerId);
    if (!layer) return;
    selectedLayerId = layer.id;
    resize.active = true;
    resize.handle = hd.dataset.resizeHandle;
    resize.layerId = layer.id;
    resize.startX = e.clientX;
    resize.startY = e.clientY;
    resize.startFontSize = layer.fontSize;
    resize.startTextWidth = layer.textWidth || 300;
    refreshLayerListDOM();
    refreshStyleSectionDOM();
    renderHandles();
  });

  previewCanvas.addEventListener('dblclick', () => {
    // Focus the right-side content textarea instead of a prompt
    const ta = document.querySelector('#rc-style textarea[data-layer-prop="text"]');
    if (ta) { ta.focus(); ta.selectionStart = ta.selectionEnd = ta.value.length; }
  });
}

function bindScriptEvents() {
  // tab 切换：只重渲染 tab body，不动其他段
  document.querySelectorAll('#rc-script .script-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      activeScriptTab = btn.dataset.scriptTab;
      refreshScriptTabBodyDOM();
    });
  });

  const body = document.getElementById('script-tab-body');
  if (!body) return;

  // input 事件：就地写入数据，绝不重渲染 (保住光标)
  body.addEventListener('input', e => {
    const project = currentProject();
    const t = e.target;
    if (t.id === 'title-input') {
      project.scripts.title = t.value;
      // 候选区可静默更新（如果选中过候选区，重渲染会丢焦，所以只在用户主动停顿时更新——干脆不更新）
    } else if (t.id === 'body-text') {
      project.scripts.body = t.value;
      const cnt = document.getElementById('body-count');
      if (cnt) cnt.textContent = `${t.value.length} 字`;
    } else if (t.classList.contains('step-input')) {
      const idx = parseInt(t.closest('.step-row').dataset.stepIdx);
      project.scripts.steps[idx] = t.value;
    }
  });

  body.addEventListener('click', e => {
    const project = currentProject();
    if (e.target.id === 'btn-add-title') {
      const text = (project.scripts.title || '').trim();
      if (!text) { showToast('请先输入标题'); return; }
      addLayer({ kind: 'title', name: '主标题', text, preset: 'yellow-black' });
      return;
    }
    if (e.target.id === 'btn-add-body') {
      const text = (project.scripts.body || '').trim();
      if (!text) { showToast('请先输入正文'); return; }
      addLayer({ kind: 'body', name: '正文', text });
      return;
    }
    if (e.target.id === 'btn-add-step') {
      project.scripts.steps = project.scripts.steps || [];
      project.scripts.steps.push('');
      refreshScriptTabBodyDOM();
      return;
    }
    if (e.target.classList.contains('step-del')) {
      const idx = parseInt(e.target.closest('.step-row').dataset.stepIdx);
      project.scripts.steps.splice(idx, 1);
      if (project.scripts.steps.length === 0) project.scripts.steps.push('');
      refreshScriptTabBodyDOM();
      return;
    }
    if (e.target.classList.contains('step-add-canvas')) {
      const idx = parseInt(e.target.closest('.step-row').dataset.stepIdx);
      const text = (project.scripts.steps[idx] || '').trim();
      if (!text) { showToast(`步骤${idx + 1} 为空`); return; }
      addLayer({ kind: 'step', name: `步骤${idx + 1}`, text, preset: 'clean-black' });
      return;
    }
    const cand = e.target.closest('[data-cand-title]');
    if (cand) {
      // 候选只填进输入框，不直接加图层
      const text = cand.dataset.candTitle;
      project.scripts.title = text;
      const inp = document.getElementById('title-input');
      if (inp) inp.value = text;
      return;
    }
  });
}

function bindLayerListEvents() {
  document.getElementById('layer-list')?.addEventListener('click', e => {
    const vis = e.target.closest('[data-layer-vis]');
    if (vis) {
      const id = vis.dataset.layerVis;
      const l = currentProject().layers.find(x => x.id === id);
      if (l) { l.visible = !l.visible; refreshLayerListDOM(); drawAll(); renderHandles(); }
      return;
    }
    const up = e.target.closest('[data-layer-up]');
    if (up) { moveLayer(up.dataset.layerUp, -1); return; }
    const down = e.target.closest('[data-layer-down]');
    if (down) { moveLayer(down.dataset.layerDown, 1); return; }
    const item = e.target.closest('.layer-item');
    if (item) {
      selectedLayerId = item.dataset.layerId;
      refreshLayerListDOM();
      refreshStyleSectionDOM();
      drawAll();
      renderHandles();
    }
  });
  document.getElementById('btn-add-layer')?.addEventListener('click', () => {
    addLayer({ kind: 'free', name: `文字${currentProject().layers.length + 1}`, text: '点此输入文字' });
  });
  document.getElementById('btn-dup-layer')?.addEventListener('click', duplicateLayer);
  document.getElementById('btn-del-layer')?.addEventListener('click', deleteLayer);
}

function bindStyleEvents() {
  const root = document.getElementById('rc-style');
  if (!root) return;
  root.addEventListener('input', e => {
    const layer = currentLayer();
    if (!layer) return;
    const prop = e.target.dataset.layerProp;
    if (prop) {
      if (e.target.type === 'checkbox') layer[prop] = e.target.checked;
      else if (prop === 'textWidth') layer[prop] = parseInt(e.target.value) || 300;
      else layer[prop] = e.target.value;
      drawAll();
      if (prop === 'name') refreshLayerListDOM();
      renderHandles();
    }
    const sg = e.target.closest('[data-slider]');
    if (sg) {
      const id = sg.dataset.slider;
      let v = parseFloat(e.target.value);
      const valEl = sg.querySelector('.val');
      if (id === 'lineHeight') { layer.lineHeight = v; valEl.textContent = v.toFixed(2); }
      else if (id === 'bgAlpha') { layer.bgAlpha = v / 100; valEl.textContent = Math.round(v); }
      else { layer[id] = v; valEl.textContent = Math.round(v); }
      drawAll();
      renderHandles();
    }
  });
  root.addEventListener('click', e => {
    const layer = currentLayer();
    if (!layer) return;
    const sw = e.target.closest('[data-color-for]');
    if (sw) { layer[sw.dataset.colorFor] = sw.dataset.color; drawAll(); refreshStyleSectionDOM(); renderHandles(); return; }
    const al = e.target.closest('[data-set-align]');
    if (al) { layer.align = al.dataset.setAlign; drawAll(); refreshStyleSectionDOM(); renderHandles(); return; }
    const ori = e.target.closest('[data-set-orient]');
    if (ori) { layer.vertical = ori.dataset.setOrient === 'v'; drawAll(); refreshStyleSectionDOM(); renderHandles(); return; }
    const qp = e.target.closest('[data-quick-pos]');
    if (qp) { applyQuickPos(layer, qp.dataset.quickPos); drawAll(); renderHandles(); return; }
    const artBtn = e.target.closest('[data-art-preset]');
    if (artBtn) { applyArtPreset(layer, artBtn.dataset.artPreset); drawAll(); refreshStyleSectionDOM(); renderHandles(); return; }
    const presetBtn = e.target.closest('[data-style-preset]');
    if (presetBtn) {
      const pid = presetBtn.dataset.stylePreset;
      if (pid === '__reset') Object.assign(layer, defaultLayerStyle());
      else { const preset = STYLE_PRESETS.find(p => p.id === pid); if (preset) Object.assign(layer, preset.style); }
      drawAll();
      refreshStyleSectionDOM();
      renderHandles();
    }
    const saveRecipeBtn = e.target.closest('#save-style-recipe-btn');
    if (saveRecipeBtn) {
      const name = prompt('请输入配方名称：');
      if (name && name.trim()) { saveStyleRecipe(name.trim()); refreshStyleSectionDOM(); }
      return;
    }
    const applyRecipeBtn = e.target.closest('[data-recipe-index]');
    if (applyRecipeBtn) {
      const idx = parseInt(applyRecipeBtn.dataset.recipeIndex);
      applyStyleRecipe(idx);
      return;
    }
    const delRecipeBtn = e.target.closest('.recipe-del-btn');
    if (delRecipeBtn) {
      const idx = parseInt(delRecipeBtn.dataset.recipeIndex);
      deleteStyleRecipe(idx);
      return;
    }
  });
}

function applyQuickPos(layer, pos) {
  if (!layer._lastBox) return;
  const box = layer._lastBox;
  layer.xPct = layer.align === 'left' ? 0.05
             : layer.align === 'right' ? (previewW - box.w) / previewW - 0.05
             : ((previewW - box.w) / 2) / previewW;
  if (pos === 'top') layer.yPct = 0.05;
  else if (pos === 'center') layer.yPct = (previewH - box.h) / 2 / previewH;
  else layer.yPct = (previewH - box.h) / previewH - 0.05;
}

const ART_PRESET_MAP = {
  'art-yellow-black': { color: '#ffd24d', bold: true, strokeOn: true, strokeColor: '#000000', strokeWidth: 8, shadowOn: false, bgOn: false },
  'art-white-black':  { color: '#ffffff', bold: true, strokeOn: true, strokeColor: '#000000', strokeWidth: 6, shadowOn: false, bgOn: false },
  'art-white-red':    { color: '#ffffff', bold: true, strokeOn: true, strokeColor: '#d42a2a', strokeWidth: 5, shadowOn: false, bgOn: false },
  'art-black-yellow': { color: '#111111', bold: true, strokeOn: false, shadowOn: false, bgOn: true, bgColor: '#ffd24d', bgAlpha: 0.9, bgRadius: 10, bgPadX: 16, bgPadY: 8 },
  'art-orange':       { color: '#ff8a3d', bold: true, strokeOn: true, strokeColor: '#7a3000', strokeWidth: 5, shadowOn: true, shadowColor: '#000000', shadowBlur: 8, shadowOffsetX: 3, shadowOffsetY: 3, bgOn: true, bgColor: '#fff3e0', bgAlpha: 0.85, bgRadius: 14, bgPadX: 18, bgPadY: 10 },
  'art-red-cally':    { color: '#cc2200', bold: true, strokeOn: true, strokeColor: '#ffffcc', strokeWidth: 4, shadowOn: true, shadowColor: '#660000', shadowBlur: 5, shadowOffsetX: 2, shadowOffsetY: 2, bgOn: false },
  'art-cream':        { color: '#fffbe6', bold: true, strokeOn: true, strokeColor: '#8b6914', strokeWidth: 6, shadowOn: false, bgOn: false },
  'art-fresh':        { color: '#2d7a4f', bold: true, strokeOn: true, strokeColor: '#e8f5e9', strokeWidth: 4, shadowOn: true, shadowColor: '#000000', shadowBlur: 4, shadowOffsetX: 1, shadowOffsetY: 1, bgOn: true, bgColor: '#e8f5e9', bgAlpha: 0.8, bgRadius: 10, bgPadX: 16, bgPadY: 8 },
  'art-bold':         { color: '#ffffff', bold: true, strokeOn: true, strokeColor: '#000000', strokeWidth: 10, shadowOn: true, shadowColor: '#000000', shadowBlur: 12, shadowOffsetX: 4, shadowOffsetY: 4, bgOn: false },
  'art-minimal':      { color: '#555555', bold: false, strokeOn: false, shadowOn: false, bgOn: true, bgColor: '#ffffff', bgAlpha: 0.75, bgRadius: 6, bgPadX: 12, bgPadY: 6 },
};

function applyArtPreset(layer, artId) {
  const artStyle = ART_PRESET_MAP[artId];
  if (!artStyle) return;
  Object.assign(layer, artStyle);
}

function bindTopActions() {
  document.getElementById('btn-text-save')?.addEventListener('click', saveOverlay);
  document.getElementById('btn-text-undo')?.addEventListener('click', performUndo);
  document.getElementById('btn-save-canvas-recipe')?.addEventListener('click', () => {
    const name = prompt('请输入配方名称：');
    if (name && name.trim()) { saveCanvasRecipe(name.trim()); showToast('配方已保存'); }
  });
  document.getElementById('btn-apply-canvas-recipe')?.addEventListener('click', () => {
    const sel = document.getElementById('canvas-recipe-select');
    if (sel && sel.value !== '') { applyCanvasRecipe(parseInt(sel.value)); showToast('配方已应用'); }
    else showToast('请先在下方选择要应用的配方');
  });
}

// ===== LAYER OPS =====
function defaultLayerStyle() {
  return {
    font: 'YaHei',
    fontSize: 72,
    color: '#ffffff',
    bold: true,
    align: 'center',
    lineHeight: 1.25,
    letterSpacing: 0,
    vertical: false,
    textWidth: 300,
    strokeOn: true, strokeColor: '#000000', strokeWidth: 6,
    shadowOn: true, shadowColor: '#000000', shadowBlur: 6, shadowOffsetX: 2, shadowOffsetY: 2,
    bgOn: false, bgColor: '#000000', bgAlpha: 0.5, bgRadius: 12, bgPadX: 18, bgPadY: 10,
    borderOn: false, borderColor: '#000000', borderWidth: 2,
  };
}

function addLayer({ kind, name, text, preset }) {
  const layer = {
    id: `L-${Date.now()}-${Math.random().toString(36).slice(2,6)}`,
    name: name || `文字${currentProject().layers.length + 1}`,
    kind: kind || 'free',
    text: text || '点此输入文字',
    visible: true,
    xPct: 0.1,
    yPct: 0.08 + currentProject().layers.length * 0.08,
    ...defaultLayerStyle(),
  };
  if (preset) {
    const p = STYLE_PRESETS.find(x => x.id === preset);
    if (p) Object.assign(layer, p.style);
  }
  currentProject().layers.push(layer);
  selectedLayerId = layer.id;
  refreshLayerListDOM();
  refreshStyleSectionDOM();
  drawAll();
  renderHandles();
}

function duplicateLayer() {
  const l = currentLayer();
  if (!l) return;
  const copy = JSON.parse(JSON.stringify(l));
  copy.id = `L-${Date.now()}-${Math.random().toString(36).slice(2,6)}`;
  copy.name = l.name + ' 副本';
  copy.xPct = Math.min(0.95, l.xPct + 0.03);
  copy.yPct = Math.min(0.95, l.yPct + 0.03);
  currentProject().layers.push(copy);
  selectedLayerId = copy.id;
  refreshLayerListDOM();
  refreshStyleSectionDOM();
  drawAll();
  renderHandles();
}

function deleteLayer() {
  const project = currentProject();
  const idx = project.layers.findIndex(l => l.id === selectedLayerId);
  if (idx < 0) return;
  if (!window.confirm('删除当前文字图层？')) return;
  project.layers.splice(idx, 1);
  selectedLayerId = project.layers[idx]?.id || project.layers[idx - 1]?.id || null;
  refreshLayerListDOM();
  refreshStyleSectionDOM();
  drawAll();
  renderHandles();
}

function moveLayer(id, dir) {
  const project = currentProject();
  const i = project.layers.findIndex(l => l.id === id);
  if (i < 0) return;
  const j = i + dir;
  if (j < 0 || j >= project.layers.length) return;
  [project.layers[i], project.layers[j]] = [project.layers[j], project.layers[i]];
  refreshLayerListDOM();
  drawAll();
  renderHandles();
}

// ===== SAVE (只触发 onSave, 绝不动 frame.versionsCache) =====
function saveOverlay() {
  const t = currentTarget();
  const frame = currentFrame();
  if (!t || !frame) { showToast('未选中目标'); return; }
  const project = currentProject();
  if (project.layers.filter(l => l.visible && l.text.trim()).length === 0) {
    showToast('当前没有可保存的文字图层');
    return;
  }
  pushUndo();
  renderFrameToDataUrlAsync(frame, t.versionKey, project).then(dataUrl => {
    onSaveCallback?.({ targetId: t.targetId, dataUrl, project });
    // 更新本地 resultsMap 以便左栏小绿点立刻显示
    resultsMap[t.targetId] = { dataUrl, savedAt: Date.now() };
    refreshLeftListDOM();
    refreshUndoBtn();
    showToast(`已保存：${t.materialName} · ${t.versionKey}`);
  });
}

function renderFrameToDataUrlAsync(frame, versionKey, project) {
  return new Promise(resolve => {
    const url = frame.versionsCache?.[versionKey];
    if (!url) { resolve(''); return; }
    const drawTo = (img, W, H) => {
      const out = document.createElement('canvas');
      out.width = W; out.height = H;
      const oc = out.getContext('2d');
      oc.drawImage(img, 0, 0, W, H);
      project.layers.forEach(layer => {
        if (!layer.visible) return;
        drawLayerOnContext(oc, layer, W, H, 1);
      });
      resolve(out.toDataURL('image/png'));
    };
    const img = new Image();
    img.onload = () => drawTo(img, img.naturalWidth, img.naturalHeight);
    img.onerror = () => resolve('');
    img.src = url;
  });
}

// ===== UNDO =====
function pushUndo() {
  undoStack.push({ projects: JSON.parse(JSON.stringify(projectsMap)) });
  if (undoStack.length > 10) undoStack.shift();
  refreshUndoBtn();
}
function performUndo() {
  if (undoStack.length === 0) return;
  const prev = undoStack.pop();
  projectsMap = prev.projects;
  refreshRightColDOM();
  drawAll();
  renderHandles();
  refreshUndoBtn();
  showToast('已撤销一步');
}
function refreshUndoBtn() {
  const btn = document.getElementById('btn-text-undo');
  if (btn) btn.disabled = undoStack.length === 0;
}

// ===== Partial refreshers (避免重渲染整页导致输入框失焦) =====
function refreshLeftListDOM() {
  const card = document.querySelector('.text-target-card');
  if (!card) return;
  card.outerHTML = renderLeftCol();
  bindLeftListEvents();
}
function refreshCanvasHeader() {
  const hint = document.getElementById('text-preview-hint');
  if (!hint) return;
  const t = currentTarget();
  const frame = currentFrame();
  hint.innerHTML = t ? `当前编辑：${t.materialName} · ${sourceLine(frame)} · <strong>${escapeHTML(t.versionKey)}</strong>` : '未选择';
}
function refreshRightColDOM() {
  const card = document.querySelector('.text-right-card');
  if (!card) return;
  card.outerHTML = renderRightCol();
  bindScriptEvents();
  bindLayerListEvents();
  bindStyleEvents();
}
function refreshScriptTabBodyDOM() {
  const body = document.getElementById('script-tab-body');
  if (!body) return;
  body.innerHTML = renderScriptTabBody(currentProject());
  // 同步 tab active 状态
  document.querySelectorAll('#rc-script .script-tab').forEach(b => {
    b.classList.toggle('active', b.dataset.scriptTab === activeScriptTab);
  });
}
function refreshLayerListDOM() {
  const section = document.getElementById('rc-layers');
  if (!section) return;
  section.outerHTML = renderLayerSection(currentProject());
  bindLayerListEvents();
}
function refreshStyleSectionDOM() {
  const section = document.getElementById('rc-style');
  if (!section) return;
  section.outerHTML = renderStyleSection();
  bindStyleEvents();
}

// ===== HELPERS =====
function titleCandidatesOf(seed) {
  const k = (seed || '').trim() || '美食';
  return [
    `${k}的家常做法`,
    `${k}怎么做最好吃`,
    `教你做${k}，超简单`,
    `秋冬必备：${k}`,
    `养生美食：${k}`,
    `5分钟搞定${k}`,
  ];
}

function escapeHTML(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}
function escapeAttr(s) {
  return escapeHTML(s).replace(/\n/g, '&#10;');
}
function escapeForTextarea(s) {
  // For textarea content: preserve actual newlines, escape HTML special chars only
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

function showToast(msg) {
  let toast = document.querySelector('.toast');
  if (!toast) { toast = document.createElement('div'); toast.className = 'toast'; document.body.appendChild(toast); }
  toast.textContent = msg;
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => toast.remove(), 2200);
}
