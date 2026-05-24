// ===== TEXT OVERLAY PAGE v4.1 (文字上图工作台 / 三栏 / 每图独立 project) =====
//
// 设计目标：助理能稳定使用的文字上图工作台。
// 本版功能：候选标题 / 加字 / 选中 / 拖动 / 角点+边缘缩放 / 多行清晰 / 背景板 /
//           当前选中文字实时编辑 / 基础样式 / 删除 / 保存加字成品。
// 本版不做：模板、配方、艺术字、图层上下移、显隐、复制、批量应用、第四步。
//
// 与 app.js 的契约（保持不变，本轮未改 app.js）：
//   renderTextOverlayPage({ targets, frames, activeTargetId, projects, results,
//                           onSave, onSwitchTarget, onRemoveTarget }) -> HTML 字符串
//   initTextOverlayPage()  -> render 后绑定事件、加载画布
//   onSave({ targetId, dataUrl, project })   保存加字成品 -> state.textResults / state.textProjects
//   onSwitchTarget(tid)                       切换当前图
//   onRemoveTarget(targetId, materialName)    删除待加字目标（本版未在 UI 暴露）
//
// 纪律：
//   - 中栏底图永远画 frame.versionsCache[versionKey]，绝不回退 sourceDataUrl
//   - 第三步绝不写 frame.versionsCache，加字成品只走 onSave
//   - 每个 target 一份独立 project（projectsMap[targetId]），物理隔离，不串图
//   - 文字位置用 xPct/yPct 百分比保存；自动换行用 textWidth(图片像素) 保存
//   - 预览与保存成品用同一 drawLayer：预览 scale=previewW/baseImageW，导出 scale=1，效果一致

// ===== 常量 =====
const PRESET_COLORS = ['#ffffff', '#000000', '#ffd24d', '#ff5252', '#3aa0ff', '#1aa760'];
const LINE_HEIGHT = 1.32;          // 行距系数（多行清晰）
const FIXED_TITLE_CANDIDATES = ['家常美味做法', '简单又好吃', '一看就会做', '好吃不复杂', '今日家常菜'];

// ===== 模块级状态（每次 renderTextOverlayPage 重置）=====
let onSaveCallback = null;
let onSwitchTargetCallback = null;
let onRemoveTargetCallback = null;

let targetList = [];
let frameList = [];
let projectsMap = {};
let resultsMap = {};
let currentTargetId = null;
let selectedLayerId = null;

let baseImageEl = null;
let baseImageW = 0;
let baseImageH = 0;
let previewCanvas = null;
let previewCtx = null;
let previewW = 0;
let previewH = 0;

let drag = { active: false, layerId: null, offsetX: 0, offsetY: 0 };
let resize = { active: false, handle: null, layerId: null, startX: 0, startY: 0, startFont: 0, startWidth: 0, startBoxW: 0 };

// ===== 入口 =====
export function renderTextOverlayPage({ targets, frames, activeTargetId, projects, results, onSave, onSwitchTarget, onRemoveTarget }) {
  onSaveCallback = onSave || null;
  onSwitchTargetCallback = onSwitchTarget || null;
  onRemoveTargetCallback = onRemoveTarget || null;
  targetList = targets || [];
  frameList = frames || [];
  projectsMap = projects || {};
  resultsMap = results || {};
  currentTargetId = activeTargetId && targetList.find(t => t.targetId === activeTargetId)
    ? activeTargetId
    : (targetList[0]?.targetId || null);
  selectedLayerId = null;
  baseImageEl = null;

  targetList.forEach(t => {
    if (!projectsMap[t.targetId]) projectsMap[t.targetId] = emptyProject();
  });

  return `
    <div class="t4-page">
      ${renderLeftCol()}
      ${renderCanvasCol()}
      ${renderRightCol()}
    </div>
  `;
}

function emptyProject() {
  return { scripts: { title: '', steps: [''], body: '' }, layers: [] };
}

// ===== 左栏：待加字图片 =====
function renderLeftCol() {
  return `
    <div class="section-card t4-left">
      <div class="section-header">
        <div class="section-title">待加字图片</div>
        <div class="section-subtitle">${targetList.length} 张</div>
      </div>
      <div class="t4-target-list" id="t4-target-list">
        ${targetList.map(t => renderTargetItem(t)).join('') || `
          <div class="t4-empty">还没有待加字图片<br/>请回到「图片编辑」裁出比例版本</div>
        `}
      </div>
    </div>
  `;
}

function renderTargetItem(t) {
  const frame = frameList.find(f => f.id === t.frameId);
  const dataUrl = frame?.versionsCache?.[t.versionKey] || '';
  const valid = dataUrl && typeof dataUrl === 'string' && dataUrl.startsWith('data:');
  const isActive = t.targetId === currentTargetId;
  const hasResult = !!resultsMap[t.targetId];
  return `
    <div class="t4-target-item ${isActive ? 'active' : ''}" data-target-id="${t.targetId}">
      <div class="t4-thumb">
        ${valid
          ? `<img src="${dataUrl}" draggable="false" alt="${escapeAttr(t.versionKey)}">`
          : `<div class="t4-thumb-bad">无成品图</div>`}
      </div>
      <div class="t4-target-info">
        <div class="t4-target-name" title="${escapeAttr(t.materialName)}">${escapeHTML(t.materialName)}</div>
        <div class="t4-target-meta">
          <span class="t4-ver">${escapeHTML(t.versionKey)}</span>
          ${hasResult ? `<span class="t4-saved" title="已保存加字成品">✓ 已保存</span>` : ''}
        </div>
      </div>
    </div>
  `;
}

// ===== 中栏：画布 =====
function renderCanvasCol() {
  const t = currentTarget();
  const head = t ? `${escapeHTML(t.materialName)} · <strong>${escapeHTML(t.versionKey)}</strong>` : '未选择';
  return `
    <div class="section-card t4-canvas">
      <div class="section-header">
        <div class="section-title">画布预览</div>
        <div class="section-subtitle" id="t4-canvas-head">当前：${head}</div>
      </div>
      <div class="t4-canvas-toolbar">
        <button data-nav="edit" class="t4-back">← 图片编辑</button>
        <span class="t4-tip">点击文字选中 · 拖动移动 · 拖角点改大小 · 拖左右边改宽度</span>
      </div>
      <div class="section-body t4-canvas-body">
        <div class="t4-canvas-wrap" id="t4-canvas-wrap">
          <canvas id="t4-canvas"></canvas>
          <div class="t4-handles" id="t4-handles"></div>
        </div>
      </div>
    </div>
  `;
}

// ===== 右栏：操作区（5 块）=====
function renderRightCol() {
  return `
    <div class="section-card t4-right">
      <div class="t4-right-scroll" id="t4-right-scroll">
        ${renderScriptBlock()}
        ${renderSelectedTextBlock()}
        ${renderStyleBlock()}
        ${renderLayerBlock()}
        ${renderSaveBlock()}
      </div>
    </div>
  `;
}

// ① 文案内容（含候选标题）
function renderScriptBlock() {
  const p = currentProject();
  return `
    <div class="t4-block" id="t4-script">
      <div class="t4-block-title">① 文案内容</div>

      <label class="t4-field-label">首图标题</label>
      <div class="t4-field-row">
        <textarea id="t4-in-title" rows="2" placeholder="输入标题">${escapeHTML(p.scripts.title || '')}</textarea>
        <button class="primary t4-add-btn" data-add="title">加入画布</button>
      </div>
      <div class="t4-cand-label">候选标题（点一下填入）：</div>
      <div class="t4-cands" id="t4-cands">
        ${buildTitleCandidates().map(c => `<button class="t4-cand" data-cand="${escapeAttr(c)}">${escapeHTML(c)}</button>`).join('')}
      </div>

      <label class="t4-field-label">步骤文字</label>
      <div class="t4-steps" id="t4-steps">
        ${(p.scripts.steps || ['']).map((s, i) => `
          <div class="t4-step-row" data-step-idx="${i}">
            <span class="t4-step-no">${i + 1}</span>
            <textarea class="t4-step-input" rows="2" placeholder="步骤${i + 1}（可换行）">${escapeHTML(s)}</textarea>
            <button class="primary t4-step-add" title="加入画布">加入</button>
            <button class="t4-step-del" title="删除该步">×</button>
          </div>
        `).join('')}
      </div>
      <button id="t4-add-step" class="t4-add-step-btn">+ 添加一行</button>

      <label class="t4-field-label">正文短句</label>
      <div class="t4-field-row">
        <textarea id="t4-in-body" rows="3" placeholder="输入正文短句（可换行）">${escapeHTML(p.scripts.body || '')}</textarea>
        <button class="primary t4-add-btn" data-add="body">加入画布</button>
      </div>
    </div>
  `;
}

// ② 当前选中文字（实时编辑）
function renderSelectedTextBlock() {
  const l = currentLayer();
  return `
    <div class="t4-block t4-block-accent" id="t4-selected">
      <div class="t4-block-title">② 当前选中文字 ${l ? `<span class="t4-block-sub">${escapeHTML(l.name || l.kind)}</span>` : ''}</div>
      ${l
        ? `<textarea id="t4-sel-text" rows="3" placeholder="修改这里，画布文字实时变化（可换行）">${escapeHTML(l.text || '')}</textarea>
           <div class="t4-sel-hint">改动会立即同步到画布和下方图层列表</div>`
        : `<div class="t4-style-empty">点击画布上的文字，或下方图层，即可在此编辑文字内容</div>`}
    </div>
  `;
}

// ③ 基础样式
function renderStyleBlock() {
  const l = currentLayer();
  if (!l) {
    return `
      <div class="t4-block" id="t4-style">
        <div class="t4-block-title">③ 基础样式</div>
        <div class="t4-style-empty">先选中一个文字图层，再调整样式</div>
      </div>
    `;
  }
  return `
    <div class="t4-block" id="t4-style">
      <div class="t4-block-title">③ 基础样式</div>

      <div class="t4-slider" data-style-slider="fontSize">
        <label>字号</label>
        <input type="range" min="16" max="260" step="2" value="${l.fontSize}">
        <span class="t4-val">${l.fontSize}</span>
      </div>

      <div class="t4-row">
        <label>字体颜色</label>
        <input type="color" data-style-prop="color" value="${l.color}">
        <div class="t4-swatches">
          ${PRESET_COLORS.map(c => `<button class="t4-swatch" data-color-for="color" data-color="${c}" style="background:${c};" title="${c}"></button>`).join('')}
        </div>
      </div>

      <div class="t4-row t4-row-check">
        <label><input type="checkbox" data-style-prop="strokeOn" ${l.strokeOn ? 'checked' : ''}> 描边</label>
        <input type="color" data-style-prop="strokeColor" value="${l.strokeColor}" title="描边颜色">
      </div>
      <div class="t4-slider" data-style-slider="strokeWidth">
        <label>描边粗细</label>
        <input type="range" min="0" max="24" step="1" value="${l.strokeWidth}">
        <span class="t4-val">${l.strokeWidth}</span>
      </div>

      <div class="t4-row t4-row-check">
        <label><input type="checkbox" data-style-prop="bgOn" ${l.bgOn ? 'checked' : ''}> 背景板</label>
        <input type="color" data-style-prop="bgColor" value="${l.bgColor}" title="背景板颜色">
      </div>
      <div class="t4-slider" data-style-slider="bgAlphaPct">
        <label>背景透明</label>
        <input type="range" min="10" max="100" step="5" value="${Math.round((l.bgAlpha != null ? l.bgAlpha : 0.55) * 100)}">
        <span class="t4-val">${Math.round((l.bgAlpha != null ? l.bgAlpha : 0.55) * 100)}</span>
      </div>

      <div class="t4-row">
        <label>对齐</label>
        <div class="t4-btn-group">
          <button data-set-align="left"   class="${l.align === 'left' ? 'active' : ''}">左</button>
          <button data-set-align="center" class="${l.align === 'center' ? 'active' : ''}">中</button>
          <button data-set-align="right"  class="${l.align === 'right' ? 'active' : ''}">右</button>
        </div>
      </div>

      <div class="t4-row">
        <label>位置</label>
        <div class="t4-btn-group">
          <button data-quick-pos="top">上</button>
          <button data-quick-pos="center">中</button>
          <button data-quick-pos="bottom">下</button>
        </div>
      </div>
    </div>
  `;
}

// ④ 当前图层
function renderLayerBlock() {
  const p = currentProject();
  return `
    <div class="t4-block" id="t4-layers">
      <div class="t4-block-title">④ 当前图层 <span class="t4-block-sub">${p.layers.length} 个</span></div>
      <div class="t4-layer-list" id="t4-layer-list">
        ${p.layers.map(l => `
          <div class="t4-layer-item ${l.id === selectedLayerId ? 'selected' : ''}" data-layer-id="${l.id}">
            <span class="t4-layer-icon">T</span>
            <span class="t4-layer-text" title="${escapeAttr(l.text)}">${escapeHTML(layerSummary(l))}</span>
            <button class="t4-layer-del" data-layer-del="${l.id}" title="删除">×</button>
          </div>
        `).join('') || `<div class="t4-style-empty">还没有文字，用上面「加入画布」添加</div>`}
      </div>
    </div>
  `;
}

function layerSummary(l) {
  const oneLine = (l.text || '').replace(/\n/g, ' ').trim();
  return oneLine || '（空）';
}

// ⑤ 保存
function renderSaveBlock() {
  return `
    <div class="t4-block" id="t4-save">
      <div class="t4-block-title">⑤ 保存</div>
      <div class="t4-save-row">
        <button id="t4-save-btn" class="primary">💾 保存加字成品</button>
        <button id="t4-next-btn">下一张 →</button>
      </div>
    </div>
  `;
}

// ===== INIT =====
export function initTextOverlayPage() {
  previewCanvas = document.getElementById('t4-canvas');
  if (!previewCanvas) return;
  previewCtx = previewCanvas.getContext('2d');
  loadBaseImage(() => {
    sizeCanvasForImage();
    drawAll();
    renderHandles();
  });
  bindAllEvents();
}

// ===== 当前对象访问 =====
function currentTarget() { return targetList.find(t => t.targetId === currentTargetId) || null; }
function currentFrame() {
  const t = currentTarget();
  if (!t) return null;
  return frameList.find(f => f.id === t.frameId) || null;
}
function currentProject() {
  if (!currentTargetId) return emptyProject();
  if (!projectsMap[currentTargetId]) projectsMap[currentTargetId] = emptyProject();
  return projectsMap[currentTargetId];
}
function currentLayer() { return currentProject().layers.find(l => l.id === selectedLayerId) || null; }
function getBaseDataUrl() {
  const t = currentTarget();
  const frame = currentFrame();
  if (!t || !frame) return null;
  return frame.versionsCache?.[t.versionKey] || null;
}

function buildTitleCandidates() {
  // 本地候选；若素材名含非"素材####"的有意义文字，则混入一条基于素材名的候选。不接 AI。
  const t = currentTarget();
  const name = (t?.materialName || '').trim();
  const meaningful = name && !/^素材\d+$/.test(name);
  if (meaningful) {
    const seed = name.slice(0, 10);
    return [`${seed}的家常做法`, ...FIXED_TITLE_CANDIDATES].slice(0, 5);
  }
  return FIXED_TITLE_CANDIDATES.slice(0, 5);
}

function loadBaseImage(cb) {
  const url = getBaseDataUrl();
  if (!url) { baseImageEl = null; cb?.(); return; }
  const img = new Image();
  img.onload = () => { baseImageEl = img; baseImageW = img.naturalWidth; baseImageH = img.naturalHeight; cb?.(); };
  img.onerror = () => { baseImageEl = null; cb?.(); };
  img.src = url;
}

function sizeCanvasForImage() {
  if (!baseImageEl || !previewCanvas) return;
  const wrap = document.getElementById('t4-canvas-wrap');
  const maxW = wrap?.clientWidth ? wrap.clientWidth - 12 : 720;
  // 画布尽量用满中间高度（放大编辑区）
  const maxH = Math.max(420, (window.innerHeight || 800) - 210);
  const scale = Math.min(maxW / baseImageW, maxH / baseImageH, 1);
  previewW = Math.max(50, Math.round(baseImageW * scale));
  previewH = Math.max(50, Math.round(baseImageH * scale));
  previewCanvas.width = previewW;
  previewCanvas.height = previewH;
}

// ===== 绘制 =====
function drawAll() {
  if (!previewCtx) return;
  previewCtx.clearRect(0, 0, previewW, previewH);
  if (!baseImageEl) return;
  previewCtx.drawImage(baseImageEl, 0, 0, previewW, previewH);
  const scale = previewW / baseImageW;
  currentProject().layers.forEach(layer => drawLayer(previewCtx, layer, previewW, previewH, scale));
}

// 计算换行后的行数组（依赖 ctx.font 已设置）
function wrapLines(ctx, text, maxWidthPx) {
  const out = [];
  text.split('\n').forEach(raw => {
    if (!raw) { out.push(''); return; }
    const chars = Array.from(raw);
    let cur = '';
    for (const ch of chars) {
      const test = cur + ch;
      if (maxWidthPx > 0 && ctx.measureText(test).width > maxWidthPx && cur) { out.push(cur); cur = ch; }
      else cur = test;
    }
    if (cur) out.push(cur);
  });
  return out.length ? out : [''];
}

// 在任意 ctx 上绘制文字图层。scale: 预览=previewW/baseImageW，导出=1。预览与导出共用，保证一致。
function drawLayer(ctx, layer, w, h, scale) {
  if (!layer.text || !layer.text.trim()) { layer._box = null; return; }
  const fontSize = layer.fontSize * scale;
  const lineHeight = fontSize * LINE_HEIGHT;
  ctx.font = `bold ${fontSize}px "Microsoft YaHei","PingFang SC",Arial,sans-serif`;
  ctx.textBaseline = 'alphabetic';

  const maxWidthPx = (layer.textWidth || baseImageW || 800) * scale;
  const lines = wrapLines(ctx, layer.text, maxWidthPx);

  const sample = ctx.measureText('字');
  const ascent = sample.actualBoundingBoxAscent || fontSize * 0.82;
  const descent = sample.actualBoundingBoxDescent || fontSize * 0.2;
  const lineWidths = lines.map(l => ctx.measureText(l || ' ').width);
  const maxLineW = Math.max(...lineWidths, 1);
  const visualH = ascent + (lines.length - 1) * lineHeight + descent;

  // 内边距随字号自适应（背景板/选中框更协调）
  const padX = Math.max(10 * scale, fontSize * 0.32);
  const padY = Math.max(6 * scale, fontSize * 0.20);

  const boxX = layer.xPct * w;            // 文字左边界
  const boxY = layer.yPct * h;            // 第一行 baseline
  const lineX = (i) => {
    const lw = lineWidths[i];
    if (layer.align === 'right') return boxX + maxLineW - lw;
    if (layer.align === 'center') return boxX + (maxLineW - lw) / 2;
    return boxX;
  };

  // 背景板（随多行/字号自动撑开）
  const bx = boxX - padX;
  const by = boxY - ascent - padY;
  const bw = maxLineW + padX * 2;
  const bh = visualH + padY * 2;
  if (layer.bgOn) {
    ctx.save();
    ctx.fillStyle = hexWithAlpha(layer.bgColor, layer.bgAlpha != null ? layer.bgAlpha : 0.55);
    roundRect(ctx, bx, by, bw, bh, Math.min(fontSize * 0.22, bw / 2, bh / 2));
    ctx.fill();
    ctx.restore();
  }

  // 描边（逐行，round 连接，避免糊成一团）
  if (layer.strokeOn && layer.strokeWidth > 0) {
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.miterLimit = 2;
    ctx.lineWidth = layer.strokeWidth * scale;
    ctx.strokeStyle = layer.strokeColor;
    lines.forEach((line, i) => { if (line) ctx.strokeText(line, lineX(i), boxY + i * lineHeight); });
    ctx.restore();
  }

  // 填充
  ctx.save();
  ctx.fillStyle = layer.color;
  lines.forEach((line, i) => { if (line) ctx.fillText(line, lineX(i), boxY + i * lineHeight); });
  ctx.restore();

  // 命中框 / 选中框（= 背景板范围）
  layer._box = { x: bx, y: by, w: bw, h: bh };
}

function roundRect(ctx, x, y, w, h, r) {
  r = Math.max(0, r);
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
  const c = String(hex || '#000000').replace('#', '');
  const r = parseInt(c.substring(0, 2), 16) || 0;
  const g = parseInt(c.substring(2, 4), 16) || 0;
  const b = parseInt(c.substring(4, 6), 16) || 0;
  return `rgba(${r},${g},${b},${alpha})`;
}

// ===== 选中框 + 缩放控制点 =====
function renderHandles() {
  const wrap = document.getElementById('t4-handles');
  if (!wrap || !previewCanvas) return;
  wrap.innerHTML = '';
  const canvasRect = previewCanvas.getBoundingClientRect();
  const wrapRect = wrap.getBoundingClientRect();
  const offX = canvasRect.left - wrapRect.left;
  const offY = canvasRect.top - wrapRect.top;

  const layer = currentLayer();
  if (!layer || !layer._box) return;
  const b = layer._box;

  const box = document.createElement('div');
  box.className = 't4-handle selected';
  box.style.left = (offX + b.x) + 'px';
  box.style.top = (offY + b.y) + 'px';
  box.style.width = b.w + 'px';
  box.style.height = b.h + 'px';
  wrap.appendChild(box);

  const hs = 8;
  const handles = [
    { h: 'nw', x: -hs, y: -hs, cur: 'nwse-resize' },
    { h: 'ne', x: b.w - hs, y: -hs, cur: 'nesw-resize' },
    { h: 'sw', x: -hs, y: b.h - hs, cur: 'nesw-resize' },
    { h: 'se', x: b.w - hs, y: b.h - hs, cur: 'nwse-resize' },
    { h: 'w', x: -hs, y: b.h / 2 - hs, cur: 'ew-resize' },
    { h: 'e', x: b.w - hs, y: b.h / 2 - hs, cur: 'ew-resize' },
  ];
  handles.forEach(({ h, x, y, cur }) => {
    const hd = document.createElement('div');
    hd.className = 't4-resize-handle';
    hd.dataset.resizeHandle = h;
    hd.dataset.layerId = layer.id;
    hd.style.cssText = `position:absolute;left:${offX + b.x + x}px;top:${offY + b.y + y}px;width:${hs * 2}px;height:${hs * 2}px;cursor:${cur};`;
    wrap.appendChild(hd);
  });
}

// ===== 事件绑定 =====
function bindAllEvents() {
  bindLeftList();
  bindCanvasInteractions();
  bindScript();
  bindSelectedText();
  bindStyle();
  bindLayerList();
  bindSave();
  window.addEventListener('resize', onWindowResize);
}

function onWindowResize() {
  sizeCanvasForImage();
  drawAll();
  renderHandles();
}

function bindLeftList() {
  document.getElementById('t4-target-list')?.addEventListener('click', e => {
    const item = e.target.closest('.t4-target-item');
    if (!item) return;
    const tid = item.dataset.targetId;
    if (tid === currentTargetId) return;
    switchTarget(tid);
  });
}

function switchTarget(tid) {
  currentTargetId = tid;
  selectedLayerId = null;
  onSwitchTargetCallback?.(tid);
  refreshLeftList();
  refreshCanvasHead();
  refreshRightCol();
  loadBaseImage(() => {
    sizeCanvasForImage();
    drawAll();
    renderHandles();
  });
}

function selectLayer(id) {
  selectedLayerId = id;
  refreshSelectedText();
  refreshStyle();
  refreshLayerList();
  drawAll();
  renderHandles();
}

function bindCanvasInteractions() {
  const wrap = document.getElementById('t4-canvas-wrap');
  if (!wrap || !previewCanvas) return;

  // 选中 + 拖动
  const onDown = (e) => {
    const rect = previewCanvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    if (px < 0 || py < 0 || px > rect.width || py > rect.height) return;
    const layers = currentProject().layers;
    let hit = null;
    for (let i = layers.length - 1; i >= 0; i--) {
      const b = layers[i]._box;
      if (!b) continue;
      if (px >= b.x - 4 && px <= b.x + b.w + 4 && py >= b.y - 4 && py <= b.y + b.h + 4) { hit = layers[i]; break; }
    }
    if (hit) {
      const changed = selectedLayerId !== hit.id;
      selectedLayerId = hit.id;
      drag.active = true;
      drag.layerId = hit.id;
      drag.offsetX = px - hit.xPct * previewW;
      drag.offsetY = py - hit.yPct * previewH;
      if (changed) { refreshSelectedText(); refreshStyle(); refreshLayerList(); }
      drawAll();
      renderHandles();
      e.preventDefault();
    } else if (selectedLayerId) {
      selectedLayerId = null;
      refreshSelectedText();
      refreshStyle();
      refreshLayerList();
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
      return;
    }
    if (resize.active) {
      const layer = currentProject().layers.find(l => l.id === resize.layerId);
      if (!layer) return;
      const dx = e.clientX - resize.startX;
      const scale = previewW / baseImageW;
      if (['nw', 'ne', 'sw', 'se'].includes(resize.handle)) {
        // 角点：等比缩放字号（同时按比例缩放 textWidth，保持换行观感）
        const dirX = (resize.handle === 'se' || resize.handle === 'ne') ? 1 : -1;
        const eff = dx * dirX;
        const base = Math.max(20, resize.startBoxW);
        const factor = Math.max(0.2, (base + eff) / base);
        layer.fontSize = Math.max(12, Math.round(resize.startFont * factor));
        layer.textWidth = Math.max(40, Math.round(resize.startWidth * factor));
      } else {
        // 左右边：仅调整文字框宽度，触发自动换行
        const dir = resize.handle === 'w' ? -1 : 1;
        const deltaImg = (dx * dir) / scale;
        layer.textWidth = Math.max(40, Math.round(resize.startWidth + deltaImg));
      }
      drawAll();
      renderHandles();
      refreshStyleValuesOnly(layer);
      return;
    }
  };

  const onUp = () => {
    if (drag.active) { drag.active = false; drag.layerId = null; }
    if (resize.active) { resize.active = false; resize.layerId = null; }
  };

  previewCanvas.addEventListener('mousedown', onDown);
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);

  // 缩放控制点（委托到 wrap）
  wrap.addEventListener('mousedown', e => {
    const hd = e.target.closest('.t4-resize-handle');
    if (!hd) return;
    e.preventDefault();
    e.stopPropagation();
    const layer = currentProject().layers.find(l => l.id === hd.dataset.layerId);
    if (!layer || !layer._box) return;
    selectedLayerId = layer.id;
    resize.active = true;
    resize.handle = hd.dataset.resizeHandle;
    resize.layerId = layer.id;
    resize.startX = e.clientX;
    resize.startY = e.clientY;
    resize.startFont = layer.fontSize;
    resize.startWidth = layer.textWidth || Math.round((baseImageW || 800) * 0.8);
    resize.startBoxW = layer._box.w;
  });

  // 双击画布 = 聚焦右侧"当前选中文字"编辑框
  previewCanvas.addEventListener('dblclick', () => {
    const ta = document.getElementById('t4-sel-text');
    if (ta) { ta.focus(); ta.selectionStart = ta.selectionEnd = ta.value.length; }
  });
}

function bindScript() {
  const block = document.getElementById('t4-script');
  if (!block) return;

  block.addEventListener('input', e => {
    const p = currentProject();
    const el = e.target;
    if (el.id === 't4-in-title') p.scripts.title = el.value;
    else if (el.id === 't4-in-body') p.scripts.body = el.value;
    else if (el.classList.contains('t4-step-input')) {
      const idx = parseInt(el.closest('.t4-step-row').dataset.stepIdx);
      p.scripts.steps[idx] = el.value;
    }
  });

  block.addEventListener('click', e => {
    const p = currentProject();
    const cand = e.target.closest('[data-cand]');
    if (cand) {
      p.scripts.title = cand.dataset.cand;
      const inp = document.getElementById('t4-in-title');
      if (inp) inp.value = p.scripts.title;
      return;
    }
    const addBtn = e.target.closest('.t4-add-btn');
    if (addBtn) {
      const kind = addBtn.dataset.add;
      const text = (kind === 'title' ? (p.scripts.title || '') : (p.scripts.body || '')).trim();
      if (!text) { showToast(kind === 'title' ? '请先输入标题' : '请先输入正文'); return; }
      addLayer(kind, kind === 'title' ? '标题' : '正文', text);
      return;
    }
    if (e.target.id === 't4-add-step') {
      p.scripts.steps = p.scripts.steps || [];
      p.scripts.steps.push('');
      refreshScriptBlock();
      return;
    }
    if (e.target.classList.contains('t4-step-del')) {
      const idx = parseInt(e.target.closest('.t4-step-row').dataset.stepIdx);
      p.scripts.steps.splice(idx, 1);
      if (p.scripts.steps.length === 0) p.scripts.steps.push('');
      refreshScriptBlock();
      return;
    }
    if (e.target.classList.contains('t4-step-add')) {
      const idx = parseInt(e.target.closest('.t4-step-row').dataset.stepIdx);
      const text = (p.scripts.steps[idx] || '').trim();
      if (!text) { showToast(`步骤${idx + 1} 为空`); return; }
      addLayer('step', `步骤${idx + 1}`, text);
      return;
    }
  });
}

// ② 当前选中文字：实时编辑
function bindSelectedText() {
  const block = document.getElementById('t4-selected');
  if (!block) return;
  block.addEventListener('input', e => {
    if (e.target.id !== 't4-sel-text') return;
    const layer = currentLayer();
    if (!layer) return;
    layer.text = e.target.value;
    drawAll();
    renderHandles();
    // 同步图层列表摘要（不重渲染整列表，保住编辑框焦点）
    const span = document.querySelector(`.t4-layer-item[data-layer-id="${layer.id}"] .t4-layer-text`);
    if (span) { span.textContent = layerSummary(layer); span.title = layer.text; }
  });
}

function bindStyle() {
  const block = document.getElementById('t4-style');
  if (!block) return;

  block.addEventListener('input', e => {
    const layer = currentLayer();
    if (!layer) return;
    const prop = e.target.dataset.styleProp;
    if (prop) {
      if (e.target.type === 'checkbox') layer[prop] = e.target.checked;
      else layer[prop] = e.target.value;
      drawAll();
      renderHandles();
      return;
    }
    const sl = e.target.closest('[data-style-slider]');
    if (sl) {
      const id = sl.dataset.styleSlider;
      const v = parseFloat(e.target.value);
      if (id === 'bgAlphaPct') layer.bgAlpha = v / 100;
      else layer[id] = v;
      const valEl = sl.querySelector('.t4-val');
      if (valEl) valEl.textContent = Math.round(v);
      drawAll();
      renderHandles();
    }
  });

  block.addEventListener('click', e => {
    const layer = currentLayer();
    if (!layer) return;
    const sw = e.target.closest('[data-color-for]');
    if (sw) { layer[sw.dataset.colorFor] = sw.dataset.color; drawAll(); refreshStyle(); renderHandles(); return; }
    const al = e.target.closest('[data-set-align]');
    if (al) { layer.align = al.dataset.setAlign; drawAll(); refreshStyle(); renderHandles(); return; }
    const qp = e.target.closest('[data-quick-pos]');
    if (qp) { applyQuickPos(layer, qp.dataset.quickPos); drawAll(); renderHandles(); return; }
  });
}

function applyQuickPos(layer, pos) {
  if (!layer._box) return;
  const b = layer._box;
  const anchorGapX = layer.xPct * previewW - b.x;
  const anchorGapY = layer.yPct * previewH - b.y;
  const targetBoxX = (previewW - b.w) / 2;
  let targetBoxY;
  if (pos === 'top') targetBoxY = previewH * 0.04;
  else if (pos === 'center') targetBoxY = (previewH - b.h) / 2;
  else targetBoxY = previewH - b.h - previewH * 0.04;
  layer.xPct = (targetBoxX + anchorGapX) / previewW;
  layer.yPct = (targetBoxY + anchorGapY) / previewH;
}

function bindLayerList() {
  document.getElementById('t4-layer-list')?.addEventListener('click', e => {
    const del = e.target.closest('[data-layer-del]');
    if (del) { e.stopPropagation(); deleteLayer(del.dataset.layerDel); return; }
    const item = e.target.closest('.t4-layer-item');
    if (item) selectLayer(item.dataset.layerId);
  });
}

function bindSave() {
  document.getElementById('t4-save-btn')?.addEventListener('click', saveOverlay);
  document.getElementById('t4-next-btn')?.addEventListener('click', gotoNextTarget);
}

// ===== 图层操作 =====
function defaultLayerStyle() {
  return {
    fontSize: 64,
    color: '#ffffff',
    align: 'center',
    textWidth: Math.max(120, Math.round((baseImageW || 800) * 0.8)),
    strokeOn: true,
    strokeColor: '#000000',
    strokeWidth: 6,
    bgOn: false,
    bgColor: '#000000',
    bgAlpha: 0.55,
  };
}

function addLayer(kind, name, text) {
  const p = currentProject();
  const style = defaultLayerStyle();
  if (kind === 'step' || kind === 'body') { style.fontSize = 46; style.bgOn = true; }
  const layer = {
    id: `L-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    kind: kind || 'free',
    name: name || '文字',
    text: text || '点此输入文字',
    xPct: 0.08,
    yPct: 0.12 + p.layers.length * 0.14,
    ...style,
  };
  p.layers.push(layer);
  selectLayer(layer.id);
}

function deleteLayer(id) {
  const p = currentProject();
  const idx = p.layers.findIndex(l => l.id === id);
  if (idx < 0) return;
  if (!window.confirm('删除这个文字图层？')) return;
  p.layers.splice(idx, 1);
  if (selectedLayerId === id) selectedLayerId = null;
  refreshSelectedText();
  refreshStyle();
  refreshLayerList();
  drawAll();
  renderHandles();
}

// ===== 保存加字成品（原始分辨率重绘，效果与预览一致）=====
function saveOverlay() {
  const t = currentTarget();
  const frame = currentFrame();
  if (!t || !frame) { showToast('未选中图片'); return; }
  const p = currentProject();
  if (p.layers.filter(l => l.text && l.text.trim()).length === 0) {
    showToast('当前没有文字，无法保存成品');
    return;
  }
  const url = frame.versionsCache?.[t.versionKey];
  if (!url) { showToast('底图无效'); return; }

  const img = new Image();
  img.onload = () => {
    const W = img.naturalWidth, H = img.naturalHeight;
    const out = document.createElement('canvas');
    out.width = W; out.height = H;
    const oc = out.getContext('2d');
    oc.drawImage(img, 0, 0, W, H);
    p.layers.forEach(layer => drawLayer(oc, layer, W, H, 1));
    const dataUrl = out.toDataURL('image/png');
    onSaveCallback?.({ targetId: t.targetId, dataUrl, project: p });
    resultsMap[t.targetId] = { dataUrl, savedAt: Date.now() };
    refreshLeftList();
    showToast(`已保存：${t.materialName} · ${t.versionKey}`);
    // 导出用 scale=1 覆盖了 _box，需还原为预览尺寸
    drawAll();
    renderHandles();
  };
  img.onerror = () => showToast('底图加载失败，保存中断');
  img.src = url;
}

function gotoNextTarget() {
  if (targetList.length === 0) return;
  const idx = targetList.findIndex(t => t.targetId === currentTargetId);
  const next = targetList[(idx + 1) % targetList.length];
  if (next) switchTarget(next.targetId);
}

// ===== 局部刷新 =====
function refreshLeftList() {
  const card = document.querySelector('.t4-left');
  if (!card) return;
  card.outerHTML = renderLeftCol();
  bindLeftList();
}
function refreshCanvasHead() {
  const head = document.getElementById('t4-canvas-head');
  if (!head) return;
  const t = currentTarget();
  head.innerHTML = t ? `当前：${escapeHTML(t.materialName)} · <strong>${escapeHTML(t.versionKey)}</strong>` : '未选择';
}
function refreshRightCol() {
  const card = document.querySelector('.t4-right');
  if (!card) return;
  card.outerHTML = renderRightCol();
  bindScript();
  bindSelectedText();
  bindStyle();
  bindLayerList();
  bindSave();
}
function refreshScriptBlock() {
  const block = document.getElementById('t4-script');
  if (!block) return;
  block.outerHTML = renderScriptBlock();
  bindScript();
}
function refreshSelectedText() {
  const block = document.getElementById('t4-selected');
  if (!block) return;
  block.outerHTML = renderSelectedTextBlock();
  bindSelectedText();
}
function refreshStyle() {
  const block = document.getElementById('t4-style');
  if (!block) return;
  block.outerHTML = renderStyleBlock();
  bindStyle();
}
function refreshLayerList() {
  const block = document.getElementById('t4-layers');
  if (!block) return;
  block.outerHTML = renderLayerBlock();
  bindLayerList();
}
// 缩放拖动时只更新样式面板里的数值显示（不重渲染，避免打断拖动）
function refreshStyleValuesOnly(layer) {
  const block = document.getElementById('t4-style');
  if (!block) return;
  const fsSlider = block.querySelector('[data-style-slider="fontSize"]');
  if (fsSlider) {
    const inp = fsSlider.querySelector('input');
    const val = fsSlider.querySelector('.t4-val');
    if (inp) inp.value = layer.fontSize;
    if (val) val.textContent = Math.round(layer.fontSize);
  }
}

// ===== 工具 =====
function escapeHTML(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function escapeAttr(s) { return escapeHTML(s).replace(/\n/g, '&#10;'); }
function showToast(msg) {
  let toast = document.querySelector('.toast');
  if (!toast) { toast = document.createElement('div'); toast.className = 'toast'; document.body.appendChild(toast); }
  toast.textContent = msg;
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => toast.remove(), 2200);
}
