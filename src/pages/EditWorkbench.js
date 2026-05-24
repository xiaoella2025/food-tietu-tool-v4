// ===== 成图编辑工作台 (新第二步 / 第1步实现) =====
//
// 布局：上(顶栏由 app.js 提供撤销/保存当前) / 左大画布 + 画布下方工具坞 / 右固定文字与样式 / 底部图片队列
//
// 与 app.js 契约：
//   renderEditWorkbench({ frames, currentFrameId, projects, results, onSwitchFrame, onSaveResult }) -> HTML
//   initEditWorkbench()      绑定事件、加载画布
//   undoWorkbench()          顶栏撤销
//   saveCurrentWorkbench()   顶栏保存当前
//
// 纪律：
//   - 不破坏 frame.sourceDataUrl；图片处理结果存 project.baseDataUrl（派生），不回写 sourceDataUrl
//   - 不改 frame.versionsCache 结构
//   - 成品图通过 onSaveResult 存入 state.editResults，供后续拼图导出读取
//   - 成图模板只存版式与样式（localStorage 'editTemplates'），不存图片/dataUrl/具体文案

const FONT_STACK = '"Microsoft YaHei","PingFang SC",Arial,sans-serif';
const LINE_HEIGHT_BASE = 1.32;
const RATIOS = ['原图', '1:1', '3:4', '4:3', '16:9', '9:16', '2:1', '2.35:1'];
const COLOR_PRESETS = ['#ffffff', '#000000', '#ffd24d', '#ff5252', '#3aa0ff', '#1aa760'];
const TITLE_SAMPLES = ['家常美味做法', '简单又好吃', '一看就会做', '好吃不复杂', '今日家常菜'];

const ART_PRESETS = {
  'yellow-black': { label: '黄字黑边', style: { color: '#ffd24d', bold: true, strokeOn: true, strokeColor: '#000000', strokeWidth: 8, shadowOn: false, bgOn: false } },
  'black-clean':  { label: '黑字简洁', style: { color: '#111111', bold: true, strokeOn: false, strokeWidth: 0, shadowOn: false, bgOn: true, bgColor: '#ffffff', bgAlpha: 0.85 } },
  'warm':         { label: '养生暖色', style: { color: '#ffffff', bold: true, strokeOn: true, strokeColor: '#8b4513', strokeWidth: 5, shadowOn: true, shadowColor: '#000000', bgOn: true, bgColor: '#d4860a', bgAlpha: 0.8 } },
};

const COLOR_FX = {
  '原图':   { brightness: 100, contrast: 100, saturate: 100, temp: 0 },
  '提亮':   { brightness: 115, contrast: 102, saturate: 105, temp: 5 },
  '暖色':   { brightness: 104, contrast: 102, saturate: 110, temp: 28 },
  '高对比': { brightness: 100, contrast: 130, saturate: 110, temp: 0 },
  '柔和':   { brightness: 106, contrast: 92,  saturate: 95,  temp: 6 },
  '冷白':   { brightness: 110, contrast: 104, saturate: 96,  temp: -22 },
};

// ===== 模块状态（每次 render 重置引用）=====
let framesRef = [];
let projectsRef = {};
let resultsRef = {};
let currentFrameId = null;
let onSwitchFrameCb = null;
let onSaveResultCb = null;

let canvasMode = 'text';      // text | crop | watermark
let activeTool = null;        // crop | watermark | color | clarity | subtitle | null
let selectedLayerId = null;

let baseImageEl = null;
let baseW = 0, baseH = 0;
let canvas = null, ctx = null;
let viewW = 0, viewH = 0, viewScale = 1;

let drag = { active: false, layerId: null, ox: 0, oy: 0 };
let resize = { active: false, layerId: null, handle: null, sx: 0, startFont: 0, startWidth: 0, startBoxW: 0 };

let cropRect = null;          // 图片像素坐标 {x,y,w,h}
let cropRatio = '原图';
let cropDrag = { active: false, mode: null, sx: 0, sy: 0, start: null };

let wmRect = null;            // 图片像素坐标 {x,y,w,h}
let wmDrag = { active: false, sx: 0, sy: 0 };
let wmFill = 'auto';          // auto | white | black

let adj = { brightness: 100, contrast: 100, saturate: 100, temp: 0, sharpen: 0, blur: 0, shadow: 0, highlight: 0, vignette: 0 };
let subtitleFrac = 0.12;

let undoStack = [];

let accordion = { template: true, title: true, steps: false, body: false, style: true, art: false };

// ===== 入口 =====
export function renderEditWorkbench({ frames, currentFrameId: cid, projects, results, onSwitchFrame, onSaveResult }) {
  framesRef = frames || [];
  projectsRef = projects || {};
  resultsRef = results || {};
  onSwitchFrameCb = onSwitchFrame || null;
  onSaveResultCb = onSaveResult || null;
  currentFrameId = framesRef.find(f => f.id === cid) ? cid : (framesRef[0]?.id || null);
  selectedLayerId = null;
  activeTool = null;
  canvasMode = 'text';
  cropRect = null; wmRect = null;
  resetAdj();
  undoStack = [];
  ensureProject(currentFrameId);

  return `
    <div class="wb">
      <div class="wb-main">
        <div class="wb-canvas-area" id="wb-canvas-area">
          <div class="wb-mode-badge" id="wb-mode-badge">${modeBadge()}</div>
          <div class="wb-canvas-wrap" id="wb-canvas-wrap">
            <canvas id="wb-canvas"></canvas>
            <div class="wb-handles" id="wb-handles"></div>
          </div>
        </div>
        ${renderDock()}
      </div>
      ${renderRight()}
      ${renderQueue()}
    </div>
  `;
}

function resetAdj() { adj = { brightness: 100, contrast: 100, saturate: 100, temp: 0, sharpen: 0, blur: 0, shadow: 0, highlight: 0, vignette: 0 }; }

function emptyProject(frame) {
  return {
    baseDataUrl: frame.sourceDataUrl,
    layers: [],
    scripts: { keyword: '', title: '', steps: [''], body: '' },
    processed: false,
    saved: false,
    templateName: null,
  };
}
function ensureProject(frameId) {
  const frame = framesRef.find(f => f.id === frameId);
  if (!frame) return null;
  if (!projectsRef[frameId]) projectsRef[frameId] = emptyProject(frame);
  if (!projectsRef[frameId].baseDataUrl) projectsRef[frameId].baseDataUrl = frame.sourceDataUrl;
  return projectsRef[frameId];
}
function currentFrame() { return framesRef.find(f => f.id === currentFrameId) || null; }
function project() { return ensureProject(currentFrameId) || emptyProject({ sourceDataUrl: '' }); }
function currentLayer() { return project().layers.find(l => l.id === selectedLayerId) || null; }
function markDirty() { const p = project(); if (p) p.saved = false; updateCurrentCardBadges(); }

function modeBadge() {
  if (canvasMode === 'crop') return '✂ 裁剪';
  if (canvasMode === 'watermark') return '🩹 去水印';
  return '✏ 文字';
}

// ===== 画布下方：工具坞 =====
function renderDock() {
  const tools = [
    { id: 'crop', label: '裁剪' },
    { id: 'watermark', label: '去水印' },
    { id: 'color', label: '调色' },
    { id: 'clarity', label: '清晰' },
    { id: 'subtitle', label: '字幕裁切' },
  ];
  return `
    <div class="wb-dock ${activeTool ? 'open' : ''}" id="wb-dock">
      <div class="wb-dock-bar">
        ${tools.map(t => `<button class="wb-tool ${activeTool === t.id ? 'active' : ''}" data-tool="${t.id}">${t.label}</button>`).join('')}
        <button class="wb-tool wb-tool-apply" data-tool="apply-selected" title="把当前处理参数应用到队列里勾选的图（第2步补齐）">应用到选中</button>
        ${activeTool ? `<button class="wb-dock-collapse" id="wb-dock-collapse" title="收起">⌄ 收起</button>` : ''}
      </div>
      ${activeTool ? `<div class="wb-dock-params" id="wb-dock-params">${renderDockParams()}</div>` : ''}
    </div>
  `;
}

function renderDockParams() {
  if (activeTool === 'crop') return renderCropParams();
  if (activeTool === 'watermark') return renderWatermarkParams();
  if (activeTool === 'color') return renderColorParams();
  if (activeTool === 'clarity') return renderClarityParams();
  if (activeTool === 'subtitle') return renderSubtitleParams();
  if (activeTool === 'apply-selected') return `<div class="wb-note">「应用到选中图」需要在底部队列多选图片，本功能将在成图编辑第 2 步补齐。<br/>按钮已做，逻辑未接。</div>`;
  return '';
}

function renderCropParams() {
  return `
    <div class="wb-prow"><span class="wb-plabel">比例</span>
      <div class="wb-chips">${RATIOS.map(r => `<button class="wb-chip ${cropRatio === r ? 'active' : ''}" data-crop-ratio="${r}">${r}</button>`).join('')}</div>
    </div>
    <div class="wb-prow"><span class="wb-plabel">构图</span>
      <div class="wb-chips">
        ${['上', '中', '下'].map(v => `<button class="wb-chip" data-crop-v="${v}">${v}</button>`).join('')}
        <span class="wb-sep"></span>
        ${['左', '中', '右'].map(h => `<button class="wb-chip" data-crop-h="${h}">${h}</button>`).join('')}
      </div>
    </div>
    <div class="wb-prow">
      <button class="wb-chip" id="wb-crop-recommend">推荐裁剪框</button>
      <button class="primary wb-apply" id="wb-crop-apply">应用裁剪（当前图）</button>
      <button class="wb-apply" data-apply-selected="crop" title="第2步补齐">应用到选中</button>
    </div>
    <div class="wb-note">在画布上拖动裁剪框移动、拖角点缩放；推荐框默认避开底部字幕区。</div>
  `;
}

function renderWatermarkParams() {
  return `
    <div class="wb-prow"><span class="wb-plabel">填充</span>
      <div class="wb-chips">
        <button class="wb-chip ${wmFill === 'auto' ? 'active' : ''}" data-wm-fill="auto">自动取色</button>
        <button class="wb-chip ${wmFill === 'white' ? 'active' : ''}" data-wm-fill="white">白色</button>
        <button class="wb-chip ${wmFill === 'black' ? 'active' : ''}" data-wm-fill="black">黑色</button>
      </div>
    </div>
    <div class="wb-prow"><span class="wb-plabel">方式</span>
      <div class="wb-chips">
        <button class="primary wb-apply" id="wb-wm-cover">遮盖当前图</button>
        <button class="wb-apply" id="wb-wm-blur">模糊当前图</button>
        <button class="wb-apply" data-tool-todo="涂抹">涂抹</button>
        <button class="wb-apply" data-apply-selected="wm" title="第2步补齐">应用到选中</button>
      </div>
    </div>
    <div class="wb-note">先在画布上拖动框选水印区域，再点「遮盖/模糊」。涂抹与批量应用为第 2 步。</div>
  `;
}

function slider(id, label, min, max, step, val) {
  return `<div class="wb-slider" data-adj="${id}"><label>${label}</label><input type="range" min="${min}" max="${max}" step="${step}" value="${val}"><span class="wb-sval">${val}</span></div>`;
}

function renderColorParams() {
  return `
    <div class="wb-prow"><span class="wb-plabel">预设</span>
      <div class="wb-chips">${Object.keys(COLOR_FX).map(k => `<button class="wb-chip" data-color-fx="${k}">${k}</button>`).join('')}</div>
    </div>
    ${slider('brightness', '亮度', 50, 150, 1, adj.brightness)}
    ${slider('contrast', '对比度', 50, 160, 1, adj.contrast)}
    ${slider('saturate', '饱和度', 0, 200, 1, adj.saturate)}
    ${slider('temp', '色温', -60, 60, 1, adj.temp)}
    <div class="wb-prow">
      <button class="wb-chip" id="wb-color-reset">重置</button>
      <button class="primary wb-apply" id="wb-color-apply">应用当前图</button>
      <button class="wb-apply" data-apply-selected="color" title="第2步补齐">应用到选中</button>
    </div>
  `;
}

function renderClarityParams() {
  return `
    ${slider('sharpen', '锐化', 0, 100, 1, adj.sharpen)}
    ${slider('blur', '模糊', 0, 8, 1, adj.blur)}
    ${slider('shadow', '阴影', -100, 100, 1, adj.shadow)}
    ${slider('highlight', '高光', -100, 100, 1, adj.highlight)}
    ${slider('vignette', '暗角', 0, 100, 1, adj.vignette)}
    <div class="wb-prow">
      <button class="wb-chip" id="wb-clarity-reset">重置</button>
      <button class="primary wb-apply" id="wb-clarity-apply">应用当前图</button>
      <button class="wb-apply" data-apply-selected="clarity" title="第2步补齐">应用到选中</button>
    </div>
    <div class="wb-note">第1步已接：锐化、模糊。阴影/高光/暗角为 UI，效果第 2 步补齐。</div>
  `;
}

function renderSubtitleParams() {
  return `
    <div class="wb-slider" data-sub="frac"><label>裁切高度</label><input type="range" min="5" max="35" step="1" value="${Math.round(subtitleFrac * 100)}"><span class="wb-sval">${Math.round(subtitleFrac * 100)}%</span></div>
    <div class="wb-prow">
      <button class="primary wb-apply" id="wb-sub-apply">裁掉底部（当前图）</button>
      <button class="wb-apply" data-apply-selected="subtitle" title="第2步补齐">应用到选中</button>
    </div>
    <div class="wb-note">底部红色区域为将被裁掉的字幕区，可拖动滑块调整高度。</div>
  `;
}

// ===== 右侧：文字生成与样式（手风琴）=====
function renderRight() {
  return `
    <div class="wb-right" id="wb-right">
      <div class="wb-right-title">文字生成与样式设置</div>
      <div class="wb-right-scroll">
        ${section('template', '成图模板', renderTemplateBlock())}
        ${section('title', '① 标题生成', renderTitleBlock())}
        ${section('steps', '② 步骤图文字', renderStepsBlock())}
        ${section('body', '③ 正文编辑', renderBodyBlock())}
        ${section('style', '④ 字体与样式', renderStyleBlock())}
        ${section('art', '⑤ 艺术字模板', renderArtBlock())}
      </div>
    </div>
  `;
}

function section(key, title, body) {
  const open = accordion[key];
  return `
    <div class="wb-acc ${open ? 'open' : ''}" data-acc="${key}">
      <div class="wb-acc-head" data-acc-toggle="${key}"><span>${title}</span><span class="wb-acc-arrow">${open ? '▾' : '▸'}</span></div>
      <div class="wb-acc-body">${body}</div>
    </div>
  `;
}

function renderTemplateBlock() {
  const tpls = getTemplates();
  return `
    <div class="wb-prow">
      <select id="wb-tpl-select" class="wb-tpl-select">
        <option value="">— 选择成图模板 —</option>
        ${tpls.map((t, i) => `<option value="${i}">${escapeHTML(t.name)}</option>`).join('')}
      </select>
    </div>
    <div class="wb-prow wb-tpl-actions">
      <button class="wb-chip" id="wb-tpl-apply">应用到当前图</button>
      <button class="wb-chip" data-apply-selected="template" title="第2步补齐">应用到选中图</button>
    </div>
    <div class="wb-prow wb-tpl-actions">
      <button class="wb-chip" id="wb-tpl-save">保存当前为模板</button>
      <button class="wb-chip" id="wb-tpl-update">更新当前模板</button>
    </div>
    <div class="wb-note">模板只保存版式与样式（文字框数量/位置/字号/颜色/描边/背景/边框/阴影/对齐等），不保存图片与具体文案。</div>
  `;
}

function renderTitleBlock() {
  const p = project();
  return `
    <div class="wb-field"><input type="text" id="wb-title-kw" placeholder="输入关键词（如：红烧排骨）" value="${escapeAttr(p.scripts.keyword || '')}"></div>
    <div class="wb-cands" id="wb-title-cands">${buildTitleCandidates(p.scripts.keyword).map(c => `<button class="wb-cand" data-title-cand="${escapeAttr(c)}">${escapeHTML(c)}</button>`).join('')}</div>
    <div class="wb-field"><textarea id="wb-title-text" rows="2" placeholder="标题文字">${escapeHTML(p.scripts.title || '')}</textarea></div>
    <button class="primary wb-add" data-add="title">加入画布（标题）</button>
  `;
}

function renderStepsBlock() {
  const p = project();
  return `
    <div id="wb-step-list">
      ${(p.scripts.steps || ['']).map((s, i) => `
        <div class="wb-step-row" data-step-idx="${i}">
          <span class="wb-step-no">${i + 1}</span>
          <textarea class="wb-step-input" rows="2" placeholder="步骤${i + 1}（建议10-20字，可换行）">${escapeHTML(s)}</textarea>
          <button class="wb-mini primary" data-step-add="${i}">加入</button>
          <button class="wb-mini" data-step-del="${i}">×</button>
        </div>
      `).join('')}
    </div>
    <button class="wb-add" id="wb-step-addrow">+ 添加一条步骤</button>
  `;
}

function renderBodyBlock() {
  const p = project();
  return `
    <div class="wb-field"><textarea id="wb-body-text" rows="3" placeholder="正文短句（补充说明，可换行）">${escapeHTML(p.scripts.body || '')}</textarea></div>
    <button class="primary wb-add" data-add="body">加入画布（正文）</button>
  `;
}

function renderStyleBlock() {
  const l = currentLayer();
  if (!l) return `<div class="wb-empty">在画布上点选一个文字，或先「加入画布」，再在此调整样式</div>`;
  return `
    <div class="wb-field">
      <label class="wb-flabel">当前选中文字</label>
      <textarea id="wb-sel-text" rows="2" placeholder="修改后画布实时变化">${escapeHTML(l.text || '')}</textarea>
    </div>
    ${slider2('fontSize', '字号', 16, 260, 2, l.fontSize)}
    <div class="wb-srow"><label>颜色</label><input type="color" data-lp="color" value="${l.color}">
      <div class="wb-sw">${COLOR_PRESETS.map(c => `<button class="wb-swatch" data-color-for="color" data-color="${c}" style="background:${c}"></button>`).join('')}</div>
    </div>
    <div class="wb-srow"><label>加粗</label><input type="checkbox" data-lp="bold" ${l.bold ? 'checked' : ''}></div>
    <div class="wb-srow wb-srow-check"><label><input type="checkbox" data-lp="strokeOn" ${l.strokeOn ? 'checked' : ''}> 描边</label><input type="color" data-lp="strokeColor" value="${l.strokeColor}"></div>
    ${slider2('strokeWidth', '描边粗细', 0, 24, 1, l.strokeWidth)}
    ${slider2('lineHeightX10', '行距', 8, 26, 1, Math.round(l.lineHeight * 10))}
    <div class="wb-srow"><label>对齐</label><div class="wb-btng">
      ${['left', 'center', 'right'].map(a => `<button data-align="${a}" class="${l.align === a ? 'active' : ''}">${a === 'left' ? '左' : a === 'center' ? '中' : '右'}</button>`).join('')}
    </div></div>
    <div class="wb-srow"><label>位置</label><div class="wb-btng">
      ${['top', 'center', 'bottom'].map(pp => `<button data-pos="${pp}">${pp === 'top' ? '上' : pp === 'center' ? '中' : '下'}</button>`).join('')}
    </div></div>
    <div class="wb-srow wb-srow-check"><label><input type="checkbox" data-lp="bgOn" ${l.bgOn ? 'checked' : ''}> 背景板</label><input type="color" data-lp="bgColor" value="${l.bgColor}"></div>
    ${slider2('bgAlphaPct', '背景透明', 10, 100, 5, Math.round((l.bgAlpha != null ? l.bgAlpha : 0.55) * 100))}
    ${slider2('bgRadius', '圆角', 0, 40, 1, l.bgRadius)}
    <div class="wb-srow wb-srow-check"><label><input type="checkbox" data-lp="borderOn" ${l.borderOn ? 'checked' : ''}> 边框</label><input type="color" data-lp="borderColor" value="${l.borderColor}"></div>
    ${slider2('borderWidth', '边框粗细', 0, 12, 1, l.borderWidth)}
    <div class="wb-srow wb-srow-check"><label><input type="checkbox" data-lp="shadowOn" ${l.shadowOn ? 'checked' : ''}> 阴影</label><input type="color" data-lp="shadowColor" value="${l.shadowColor}"></div>
    <button class="wb-chip wb-del-layer" id="wb-del-layer">删除此文字</button>
  `;
}

function slider2(id, label, min, max, step, val) {
  return `<div class="wb-slider2" data-lslider="${id}"><label>${label}</label><input type="range" min="${min}" max="${max}" step="${step}" value="${val}"><span class="wb-sval">${val}</span></div>`;
}

function renderArtBlock() {
  return `
    <div class="wb-art-grid">
      ${Object.entries(ART_PRESETS).map(([id, p]) => `<button class="wb-art" data-art="${id}">${p.label}</button>`).join('')}
    </div>
    <div class="wb-note">点击后套用到当前选中文字。</div>
  `;
}

// ===== 底部队列 =====
function renderQueue() {
  return `
    <div class="wb-queue" id="wb-queue">
      <div class="wb-queue-scroll">
        ${framesRef.map((f, i) => renderQueueCard(f, i)).join('')}
      </div>
    </div>
  `;
}

function renderQueueCard(f, idx) {
  const p = projectsRef[f.id];
  const thumb = (p && p.baseDataUrl) || f.sourceDataUrl;
  const processed = p && p.processed;
  const hasText = p && p.layers && p.layers.length > 0;
  const saved = p && p.saved && resultsRef[f.id];
  const name = f.materialName || ('素材' + String(idx + 1).padStart(4, '0'));
  return `
    <div class="wb-qcard ${f.id === currentFrameId ? 'active' : ''}" data-frame-id="${f.id}">
      <div class="wb-qthumb"><img src="${thumb}" draggable="false" alt="${escapeAttr(name)}"></div>
      <div class="wb-qname">${escapeHTML(name)}</div>
      <div class="wb-qbadges">
        ${processed ? '<span class="wb-badge b-proc">已处理</span>' : '<span class="wb-badge b-none">未处理</span>'}
        ${hasText ? '<span class="wb-badge b-text">已加字</span>' : ''}
        ${saved ? '<span class="wb-badge b-saved">已保存</span>' : '<span class="wb-badge b-unsaved">未保存</span>'}
      </div>
    </div>
  `;
}

// ===== INIT =====
export function initEditWorkbench() {
  canvas = document.getElementById('wb-canvas');
  if (!canvas) return;
  ctx = canvas.getContext('2d');
  loadBase(() => { sizeCanvas(); drawAll(); renderHandles(); });
  bindAll();
}

function getBaseDataUrl() { const p = project(); return p ? p.baseDataUrl : null; }

function loadBase(cb) {
  const url = getBaseDataUrl();
  if (!url) { baseImageEl = null; cb?.(); return; }
  const img = new Image();
  img.onload = () => { baseImageEl = img; baseW = img.naturalWidth; baseH = img.naturalHeight; cb?.(); };
  img.onerror = () => { baseImageEl = null; cb?.(); };
  img.src = url;
}

function sizeCanvas() {
  if (!baseImageEl || !canvas) return;
  const area = document.getElementById('wb-canvas-area');
  const maxW = (area?.clientWidth || 800) - 24;
  const maxH = (area?.clientHeight || 520) - 24;
  viewScale = Math.min(maxW / baseW, maxH / baseH, 1);
  viewW = Math.max(40, Math.round(baseW * viewScale));
  viewH = Math.max(40, Math.round(baseH * viewScale));
  canvas.width = viewW;
  canvas.height = viewH;
}

// ===== 绘制 =====
function buildFilter(scaleForBlur) {
  const b = adj.brightness, c = adj.contrast, s = adj.saturate;
  const blurPx = adj.blur * (scaleForBlur != null ? scaleForBlur : 1);
  let f = `brightness(${b}%) contrast(${c}%) saturate(${s}%)`;
  if (blurPx > 0) f += ` blur(${blurPx}px)`;
  return f;
}

function drawAll() {
  if (!ctx) return;
  ctx.clearRect(0, 0, viewW, viewH);
  if (!baseImageEl) return;
  // 图片 + 实时调色/模糊预览
  ctx.save();
  ctx.filter = buildFilter(viewScale);
  ctx.drawImage(baseImageEl, 0, 0, viewW, viewH);
  ctx.restore();
  // 色温叠加预览
  if (adj.temp !== 0) {
    ctx.save();
    const warm = adj.temp > 0;
    const a = Math.min(0.4, Math.abs(adj.temp) / 100 * 0.4);
    ctx.fillStyle = warm ? `rgba(255,150,40,${a})` : `rgba(40,140,255,${a})`;
    ctx.fillRect(0, 0, viewW, viewH);
    ctx.restore();
  }
  // 文字层
  project().layers.forEach(l => drawLayer(ctx, l, viewW, viewH, viewScale));
  // 字幕裁切预览
  if (activeTool === 'subtitle') {
    const bandH = subtitleFrac * viewH;
    ctx.save();
    ctx.fillStyle = 'rgba(212,42,42,0.4)';
    ctx.fillRect(0, viewH - bandH, viewW, bandH);
    ctx.restore();
  }
}

function wrapLines(c, text, maxW) {
  const out = [];
  text.split('\n').forEach(raw => {
    if (!raw) { out.push(''); return; }
    const chars = Array.from(raw);
    let cur = '';
    for (const ch of chars) {
      const test = cur + ch;
      if (maxW > 0 && c.measureText(test).width > maxW && cur) { out.push(cur); cur = ch; }
      else cur = test;
    }
    if (cur) out.push(cur);
  });
  return out.length ? out : [''];
}

function drawLayer(c, layer, w, h, scale) {
  if (!layer.text || !layer.text.trim()) { layer._box = null; return; }
  const fontSize = layer.fontSize * scale;
  const lineHeight = fontSize * (layer.lineHeight || LINE_HEIGHT_BASE);
  c.font = `${layer.bold ? 'bold ' : ''}${fontSize}px ${FONT_STACK}`;
  c.textBaseline = 'alphabetic';
  const maxW = (layer.textWidth || baseW || 800) * scale;
  const lines = wrapLines(c, layer.text, maxW);
  const sm = c.measureText('字');
  const ascent = sm.actualBoundingBoxAscent || fontSize * 0.82;
  const descent = sm.actualBoundingBoxDescent || fontSize * 0.2;
  const lineWidths = lines.map(l => c.measureText(l || ' ').width);
  const maxLineW = Math.max(...lineWidths, 1);
  const visualH = ascent + (lines.length - 1) * lineHeight + descent;
  const padX = Math.max(10 * scale, fontSize * 0.32);
  const padY = Math.max(6 * scale, fontSize * 0.20);
  const boxX = layer.xPct * w;
  const boxY = layer.yPct * h;
  const lineX = (i) => {
    const lw = lineWidths[i];
    if (layer.align === 'right') return boxX + maxLineW - lw;
    if (layer.align === 'center') return boxX + (maxLineW - lw) / 2;
    return boxX;
  };
  const bx = boxX - padX, by = boxY - ascent - padY, bw = maxLineW + padX * 2, bh = visualH + padY * 2;
  if (layer.bgOn) {
    c.save();
    c.fillStyle = hexA(layer.bgColor, layer.bgAlpha != null ? layer.bgAlpha : 0.55);
    roundRect(c, bx, by, bw, bh, Math.min((layer.bgRadius || 0) * scale, bw / 2, bh / 2));
    c.fill();
    if (layer.borderOn && layer.borderWidth > 0) {
      c.lineWidth = layer.borderWidth * scale; c.strokeStyle = layer.borderColor; c.stroke();
    }
    c.restore();
  } else if (layer.borderOn && layer.borderWidth > 0) {
    c.save();
    c.lineWidth = layer.borderWidth * scale; c.strokeStyle = layer.borderColor;
    roundRect(c, bx, by, bw, bh, Math.min((layer.bgRadius || 0) * scale, bw / 2, bh / 2));
    c.stroke();
    c.restore();
  }
  if (layer.shadowOn) {
    c.save();
    c.shadowColor = layer.shadowColor || '#000000';
    c.shadowBlur = 6 * scale; c.shadowOffsetX = 2 * scale; c.shadowOffsetY = 2 * scale;
    c.fillStyle = layer.color;
    lines.forEach((ln, i) => { if (ln) c.fillText(ln, lineX(i), boxY + i * lineHeight); });
    c.restore();
  }
  if (layer.strokeOn && layer.strokeWidth > 0) {
    c.save();
    c.lineJoin = 'round'; c.miterLimit = 2;
    c.lineWidth = layer.strokeWidth * scale; c.strokeStyle = layer.strokeColor;
    lines.forEach((ln, i) => { if (ln) c.strokeText(ln, lineX(i), boxY + i * lineHeight); });
    c.restore();
  }
  c.save();
  c.fillStyle = layer.color;
  lines.forEach((ln, i) => { if (ln) c.fillText(ln, lineX(i), boxY + i * lineHeight); });
  c.restore();
  layer._box = { x: bx, y: by, w: bw, h: bh };
}

function roundRect(c, x, y, w, h, r) {
  r = Math.max(0, r);
  c.beginPath();
  c.moveTo(x + r, y); c.lineTo(x + w - r, y); c.quadraticCurveTo(x + w, y, x + w, y + r);
  c.lineTo(x + w, y + h - r); c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  c.lineTo(x + r, y + h); c.quadraticCurveTo(x, y + h, x, y + h - r);
  c.lineTo(x, y + r); c.quadraticCurveTo(x, y, x + r, y); c.closePath();
}
function hexA(hex, a) {
  const c = String(hex || '#000000').replace('#', '');
  return `rgba(${parseInt(c.substr(0, 2), 16) || 0},${parseInt(c.substr(2, 2), 16) || 0},${parseInt(c.substr(4, 2), 16) || 0},${a})`;
}

// ===== 控制点 / 选中框 / 裁剪框 / 水印框 =====
function renderHandles() {
  const wrap = document.getElementById('wb-handles');
  if (!wrap || !canvas) return;
  wrap.innerHTML = '';
  const cr = canvas.getBoundingClientRect();
  const wr = wrap.getBoundingClientRect();
  const ox = cr.left - wr.left, oy = cr.top - wr.top;

  if (canvasMode === 'crop' && cropRect) {
    const r = imgRectToView(cropRect);
    const box = document.createElement('div');
    box.className = 'wb-crop-box';
    box.style.cssText = `left:${ox + r.x}px;top:${oy + r.y}px;width:${r.w}px;height:${r.h}px;`;
    wrap.appendChild(box);
    [['nw', 0, 0], ['ne', r.w, 0], ['sw', 0, r.h], ['se', r.w, r.h]].forEach(([h, x, y]) => {
      const hd = document.createElement('div');
      hd.className = 'wb-crop-handle'; hd.dataset.cropHandle = h;
      hd.style.cssText = `left:${ox + r.x + x - 7}px;top:${oy + r.y + y - 7}px;`;
      wrap.appendChild(hd);
    });
    return;
  }
  if (canvasMode === 'watermark' && wmRect) {
    const r = imgRectToView(wmRect);
    const box = document.createElement('div');
    box.className = 'wb-wm-box';
    box.style.cssText = `left:${ox + r.x}px;top:${oy + r.y}px;width:${r.w}px;height:${r.h}px;`;
    wrap.appendChild(box);
    return;
  }
  // text 模式：选中层控制点
  const layer = currentLayer();
  if (!layer || !layer._box) return;
  const b = layer._box;
  const box = document.createElement('div');
  box.className = 'wb-sel-box';
  box.style.cssText = `left:${ox + b.x}px;top:${oy + b.y}px;width:${b.w}px;height:${b.h}px;`;
  wrap.appendChild(box);
  const hs = 8;
  [['nw', -hs, -hs, 'nwse-resize'], ['ne', b.w - hs, -hs, 'nesw-resize'], ['sw', -hs, b.h - hs, 'nesw-resize'], ['se', b.w - hs, b.h - hs, 'nwse-resize'], ['w', -hs, b.h / 2 - hs, 'ew-resize'], ['e', b.w - hs, b.h / 2 - hs, 'ew-resize']].forEach(([h, x, y, cur]) => {
    const hd = document.createElement('div');
    hd.className = 'wb-rh'; hd.dataset.rh = h; hd.dataset.layerId = layer.id;
    hd.style.cssText = `left:${ox + b.x + x}px;top:${oy + b.y + y}px;cursor:${cur};`;
    wrap.appendChild(hd);
  });
}

function imgRectToView(r) { return { x: r.x * viewScale, y: r.y * viewScale, w: r.w * viewScale, h: r.h * viewScale }; }
function viewToImg(px, py) { return { x: px / viewScale, y: py / viewScale }; }

// ===== 事件 =====
function bindAll() {
  bindCanvas();
  bindDock();
  bindRight();
  bindQueue();
  window.addEventListener('resize', onResize);
}
function onResize() { sizeCanvas(); drawAll(); renderHandles(); }

function setTool(tool) {
  activeTool = (activeTool === tool) ? null : tool;
  canvasMode = activeTool === 'crop' ? 'crop' : activeTool === 'watermark' ? 'watermark' : 'text';
  if (canvasMode === 'crop' && !cropRect) initCropRect();
  if (canvasMode !== 'crop') {}
  refreshDock();
  refreshModeBadge();
  drawAll();
  renderHandles();
}

function bindDock() {
  const dock = document.getElementById('wb-dock');
  if (!dock) return;
  dock.addEventListener('click', e => {
    const toolBtn = e.target.closest('[data-tool]');
    if (toolBtn) { setTool(toolBtn.dataset.tool); return; }
    if (e.target.id === 'wb-dock-collapse') { activeTool = null; canvasMode = 'text'; refreshDock(); refreshModeBadge(); drawAll(); renderHandles(); return; }
    handleDockParamClick(e);
  });
  dock.addEventListener('input', handleDockParamInput);
  dock.addEventListener('change', handleDockParamChange);
}

function handleDockParamClick(e) {
  // crop
  const cr = e.target.closest('[data-crop-ratio]');
  if (cr) { cropRatio = cr.dataset.cropRatio; initCropRect(); refreshDock(); drawAll(); renderHandles(); return; }
  const cv = e.target.closest('[data-crop-v]'); if (cv) { composeCrop(null, cv.dataset.cropV); drawAll(); renderHandles(); return; }
  const ch = e.target.closest('[data-crop-h]'); if (ch) { composeCrop(ch.dataset.cropH, null); drawAll(); renderHandles(); return; }
  if (e.target.id === 'wb-crop-recommend') { recommendCrop(); drawAll(); renderHandles(); return; }
  if (e.target.id === 'wb-crop-apply') { applyCrop(); return; }
  // watermark
  const wf = e.target.closest('[data-wm-fill]'); if (wf) { wmFill = wf.dataset.wmFill; refreshDock(); return; }
  if (e.target.id === 'wb-wm-cover') { applyWatermark('cover'); return; }
  if (e.target.id === 'wb-wm-blur') { applyWatermark('blur'); return; }
  // color
  const cfx = e.target.closest('[data-color-fx]'); if (cfx) { applyColorFx(cfx.dataset.colorFx); refreshDock(); drawAll(); return; }
  if (e.target.id === 'wb-color-reset') { resetAdj(); refreshDock(); drawAll(); return; }
  if (e.target.id === 'wb-color-apply') { bakeAdjustments(); return; }
  // clarity
  if (e.target.id === 'wb-clarity-reset') { resetAdj(); refreshDock(); drawAll(); return; }
  if (e.target.id === 'wb-clarity-apply') { bakeAdjustments(); return; }
  // subtitle
  if (e.target.id === 'wb-sub-apply') { applySubtitleCrop(); return; }
  // 应用到选中（第2步）
  if (e.target.dataset.applySelected || e.target.dataset.toolTodo) { showToast('该功能将在成图编辑第 2 步补齐'); return; }
}

function handleDockParamInput(e) {
  const adjSl = e.target.closest('[data-adj]');
  if (adjSl) {
    const id = adjSl.dataset.adj;
    adj[id] = parseFloat(e.target.value);
    const v = adjSl.querySelector('.wb-sval'); if (v) v.textContent = adj[id];
    drawAll();
    return;
  }
  const sub = e.target.closest('[data-sub]');
  if (sub) {
    subtitleFrac = parseInt(e.target.value) / 100;
    const v = sub.querySelector('.wb-sval'); if (v) v.textContent = Math.round(subtitleFrac * 100) + '%';
    drawAll();
  }
}
function handleDockParamChange(e) {
  // 调色/清晰滑块松手时记录撤销点（在烘焙时也会记录，这里仅为可回退预览意图，保持简单不额外快照）
}

function initCropRect() {
  let ratio = null;
  if (cropRatio !== '原图') {
    const [a, b] = cropRatio.split(':').map(Number);
    ratio = a / b;
  }
  let w = baseW, h = baseH;
  if (ratio) {
    if (baseW / baseH > ratio) { h = baseH; w = h * ratio; } else { w = baseW; h = w / ratio; }
  }
  w = Math.round(w * 0.9); h = Math.round(h * 0.9);
  cropRect = { x: Math.round((baseW - w) / 2), y: Math.round((baseH - h) / 2), w, h };
}
function composeCrop(hPos, vPos) {
  if (!cropRect) initCropRect();
  if (hPos) cropRect.x = hPos === '左' ? 0 : hPos === '右' ? baseW - cropRect.w : Math.round((baseW - cropRect.w) / 2);
  if (vPos) cropRect.y = vPos === '上' ? 0 : vPos === '下' ? baseH - cropRect.h : Math.round((baseH - cropRect.h) / 2);
  clampCrop();
}
function recommendCrop() {
  // 本地规则：按当前比例取最大居中框，并避开底部 12% 字幕区
  initCropRect();
  const safeBottom = baseH * 0.88;
  if (cropRect.y + cropRect.h > safeBottom) cropRect.y = Math.max(0, Math.round(safeBottom - cropRect.h));
  clampCrop();
}
function clampCrop() {
  if (!cropRect) return;
  cropRect.w = Math.min(cropRect.w, baseW); cropRect.h = Math.min(cropRect.h, baseH);
  cropRect.x = Math.max(0, Math.min(cropRect.x, baseW - cropRect.w));
  cropRect.y = Math.max(0, Math.min(cropRect.y, baseH - cropRect.h));
}
function applyCrop() {
  if (!cropRect) { showToast('请先选择裁剪比例'); return; }
  pushUndo();
  const out = document.createElement('canvas');
  out.width = Math.round(cropRect.w); out.height = Math.round(cropRect.h);
  out.getContext('2d').drawImage(baseImageEl, cropRect.x, cropRect.y, cropRect.w, cropRect.h, 0, 0, out.width, out.height);
  setBaseDataUrl(out.toDataURL('image/png'), () => { showToast('已应用裁剪'); activeTool = null; canvasMode = 'text'; cropRect = null; refreshDock(); refreshModeBadge(); });
}

function applySubtitleCrop() {
  pushUndo();
  const keepH = Math.round(baseH * (1 - subtitleFrac));
  const out = document.createElement('canvas');
  out.width = baseW; out.height = keepH;
  out.getContext('2d').drawImage(baseImageEl, 0, 0, baseW, keepH, 0, 0, baseW, keepH);
  setBaseDataUrl(out.toDataURL('image/png'), () => { showToast('已裁掉底部字幕区'); activeTool = null; refreshDock(); });
}

function applyColorFx(name) {
  const fx = COLOR_FX[name]; if (!fx) return;
  adj.brightness = fx.brightness; adj.contrast = fx.contrast; adj.saturate = fx.saturate; adj.temp = fx.temp;
}
function bakeAdjustments() {
  pushUndo();
  const out = document.createElement('canvas');
  out.width = baseW; out.height = baseH;
  const oc = out.getContext('2d');
  oc.filter = buildFilter(1);
  oc.drawImage(baseImageEl, 0, 0, baseW, baseH);
  oc.filter = 'none';
  if (adj.temp !== 0) {
    const warm = adj.temp > 0;
    const a = Math.min(0.4, Math.abs(adj.temp) / 100 * 0.4);
    oc.fillStyle = warm ? `rgba(255,150,40,${a})` : `rgba(40,140,255,${a})`;
    oc.fillRect(0, 0, baseW, baseH);
  }
  if (adj.sharpen > 0) sharpenCanvas(out, adj.sharpen / 100);
  setBaseDataUrl(out.toDataURL('image/png'), () => { showToast('已应用'); resetAdj(); refreshDock(); });
}

function sharpenCanvas(cv, amount) {
  const c = cv.getContext('2d');
  const w = cv.width, h = cv.height;
  let src;
  try { src = c.getImageData(0, 0, w, h); } catch (e) { return; }
  const sd = src.data;
  const out = c.createImageData(w, h);
  const od = out.data;
  od.set(sd); // 先整体拷贝（保留边缘与 alpha）
  const a = amount;
  const k = [0, -a, 0, -a, 1 + 4 * a, -a, 0, -a, 0];
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      for (let ch = 0; ch < 3; ch++) {
        let sum = 0, ki = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          sum += sd[((y + dy) * w + (x + dx)) * 4 + ch] * k[ki++];
        }
        od[(y * w + x) * 4 + ch] = sum < 0 ? 0 : sum > 255 ? 255 : sum;
      }
    }
  }
  c.putImageData(out, 0, 0);
}

function applyWatermark(method) {
  if (!wmRect) { showToast('请先在画布上框选水印区域'); return; }
  pushUndo();
  const out = document.createElement('canvas');
  out.width = baseW; out.height = baseH;
  const oc = out.getContext('2d');
  oc.drawImage(baseImageEl, 0, 0, baseW, baseH);
  const r = wmRect;
  if (method === 'cover') {
    let fill = '#ffffff';
    if (wmFill === 'black') fill = '#000000';
    else if (wmFill === 'auto') fill = sampleEdgeColor(oc, r);
    oc.fillStyle = fill;
    oc.fillRect(r.x, r.y, r.w, r.h);
  } else if (method === 'blur') {
    // 取区域，缩小再放大模拟模糊
    const tmp = document.createElement('canvas');
    const fw = Math.max(1, Math.round(r.w / 12)), fh = Math.max(1, Math.round(r.h / 12));
    tmp.width = fw; tmp.height = fh;
    tmp.getContext('2d').drawImage(out, r.x, r.y, r.w, r.h, 0, 0, fw, fh);
    oc.imageSmoothingEnabled = true;
    oc.drawImage(tmp, 0, 0, fw, fh, r.x, r.y, r.w, r.h);
  }
  setBaseDataUrl(out.toDataURL('image/png'), () => { showToast(method === 'cover' ? '已遮盖水印区域' : '已模糊水印区域'); wmRect = null; renderHandles(); });
}
function sampleEdgeColor(oc, r) {
  try {
    const px = oc.getImageData(Math.max(0, r.x - 2), Math.max(0, r.y - 2), 1, 1).data;
    return `rgb(${px[0]},${px[1]},${px[2]})`;
  } catch (e) { return '#ffffff'; }
}

function setBaseDataUrl(dataUrl, after) {
  const p = project();
  p.baseDataUrl = dataUrl;
  p.processed = true;
  markDirty();
  loadBase(() => { sizeCanvas(); drawAll(); renderHandles(); refreshQueue(); after?.(); });
}

// ===== 画布交互 =====
function bindCanvas() {
  const wrap = document.getElementById('wb-canvas-wrap');
  if (!wrap || !canvas) return;

  canvas.addEventListener('mousedown', e => {
    const rect = canvas.getBoundingClientRect();
    const px = e.clientX - rect.left, py = e.clientY - rect.top;
    if (px < 0 || py < 0 || px > rect.width || py > rect.height) return;

    if (canvasMode === 'crop') {
      const ip = viewToImg(px, py);
      cropDrag = { active: true, mode: 'move', sx: ip.x, sy: ip.y, start: { ...cropRect } };
      e.preventDefault(); return;
    }
    if (canvasMode === 'watermark') {
      const ip = viewToImg(px, py);
      wmDrag = { active: true, sx: ip.x, sy: ip.y };
      wmRect = { x: ip.x, y: ip.y, w: 0, h: 0 };
      e.preventDefault(); return;
    }
    // text 模式：选中 + 拖动
    const layers = project().layers;
    let hit = null;
    for (let i = layers.length - 1; i >= 0; i--) {
      const b = layers[i]._box; if (!b) continue;
      if (px >= b.x - 4 && px <= b.x + b.w + 4 && py >= b.y - 4 && py <= b.y + b.h + 4) { hit = layers[i]; break; }
    }
    if (hit) {
      const changed = selectedLayerId !== hit.id;
      selectedLayerId = hit.id;
      pushUndo();
      drag = { active: true, layerId: hit.id, ox: px - hit.xPct * viewW, oy: py - hit.yPct * viewH };
      if (changed) { refreshStyle(); refreshQueueStatus(); }
      drawAll(); renderHandles(); e.preventDefault();
    } else if (selectedLayerId) {
      selectedLayerId = null; refreshStyle(); drawAll(); renderHandles();
    }
  });

  document.addEventListener('mousemove', onCanvasMove);
  document.addEventListener('mouseup', onCanvasUp);

  // text 缩放控制点
  wrap.addEventListener('mousedown', e => {
    const hd = e.target.closest('.wb-rh');
    if (!hd) {
      const ch = e.target.closest('.wb-crop-handle');
      if (ch) { startCropHandle(ch.dataset.cropHandle, e); }
      return;
    }
    e.preventDefault(); e.stopPropagation();
    const layer = project().layers.find(l => l.id === hd.dataset.layerId);
    if (!layer || !layer._box) return;
    selectedLayerId = layer.id;
    pushUndo();
    resize = { active: true, layerId: layer.id, handle: hd.dataset.rh, sx: e.clientX, startFont: layer.fontSize, startWidth: layer.textWidth || Math.round((baseW || 800) * 0.8), startBoxW: layer._box.w };
  });

  canvas.addEventListener('dblclick', () => {
    const ta = document.getElementById('wb-sel-text');
    if (ta) { ta.focus(); ta.selectionStart = ta.selectionEnd = ta.value.length; }
  });
}

let cropHandleDrag = { active: false, handle: null, start: null };
function startCropHandle(handle, e) {
  e.preventDefault(); e.stopPropagation();
  cropHandleDrag = { active: true, handle, start: { ...cropRect } };
}

function onCanvasMove(e) {
  const rect = canvas?.getBoundingClientRect();
  if (!rect) return;
  const px = e.clientX - rect.left, py = e.clientY - rect.top;

  if (drag.active) {
    const layer = project().layers.find(l => l.id === drag.layerId); if (!layer) return;
    layer.xPct = (px - drag.ox) / viewW; layer.yPct = (py - drag.oy) / viewH;
    drawAll(); renderHandles(); return;
  }
  if (resize.active) {
    const layer = project().layers.find(l => l.id === resize.layerId); if (!layer) return;
    const dx = e.clientX - resize.sx;
    if (['nw', 'ne', 'sw', 'se'].includes(resize.handle)) {
      const dir = (resize.handle === 'se' || resize.handle === 'ne') ? 1 : -1;
      const base = Math.max(20, resize.startBoxW);
      const factor = Math.max(0.2, (base + dx * dir) / base);
      layer.fontSize = Math.max(12, Math.round(resize.startFont * factor));
      layer.textWidth = Math.max(40, Math.round(resize.startWidth * factor));
    } else {
      const dir = resize.handle === 'w' ? -1 : 1;
      layer.textWidth = Math.max(40, Math.round(resize.startWidth + (dx * dir) / viewScale));
    }
    drawAll(); renderHandles(); syncFontSlider(layer); return;
  }
  if (cropDrag.active) {
    const ip = viewToImg(px, py);
    const ddx = ip.x - cropDrag.sx, ddy = ip.y - cropDrag.sy;
    cropRect.x = cropDrag.start.x + ddx; cropRect.y = cropDrag.start.y + ddy;
    clampCrop(); drawAll(); renderHandles(); return;
  }
  if (cropHandleDrag.active) {
    const ip = viewToImg(px, py);
    const s = cropHandleDrag.start;
    let nx = s.x, ny = s.y, nw = s.w, nh = s.h;
    if (cropHandleDrag.handle.includes('e')) nw = ip.x - s.x;
    if (cropHandleDrag.handle.includes('s')) nh = ip.y - s.y;
    if (cropHandleDrag.handle.includes('w')) { nx = ip.x; nw = s.x + s.w - ip.x; }
    if (cropHandleDrag.handle.includes('n')) { ny = ip.y; nh = s.y + s.h - ip.y; }
    if (nw > 20 && nh > 20) { cropRect = { x: nx, y: ny, w: nw, h: nh }; clampCrop(); drawAll(); renderHandles(); }
    return;
  }
  if (wmDrag.active) {
    const ip = viewToImg(px, py);
    wmRect = { x: Math.min(wmDrag.sx, ip.x), y: Math.min(wmDrag.sy, ip.y), w: Math.abs(ip.x - wmDrag.sx), h: Math.abs(ip.y - wmDrag.sy) };
    drawAll(); renderHandles(); return;
  }
}
function onCanvasUp() {
  if (drag.active) { drag.active = false; markDirty(); }
  if (resize.active) { resize.active = false; markDirty(); }
  cropDrag.active = false;
  cropHandleDrag.active = false;
  if (wmDrag.active) { wmDrag.active = false; if (wmRect && (wmRect.w < 8 || wmRect.h < 8)) wmRect = null; renderHandles(); }
}
function syncFontSlider(layer) {
  const sl = document.querySelector('[data-lslider="fontSize"]');
  if (sl) { const inp = sl.querySelector('input'); const v = sl.querySelector('.wb-sval'); if (inp) inp.value = layer.fontSize; if (v) v.textContent = Math.round(layer.fontSize); }
}

// ===== 右侧事件 =====
function bindRight() {
  const right = document.getElementById('wb-right');
  if (!right) return;

  right.addEventListener('click', e => {
    const acc = e.target.closest('[data-acc-toggle]');
    if (acc) { const k = acc.dataset.accToggle; accordion[k] = !accordion[k]; refreshRight(); return; }
    handleRightClick(e);
  });
  right.addEventListener('input', handleRightInput);
  // 在编辑样式/文字内容前记录一次撤销点（聚焦即记录，连续微调合并为一步）
  right.addEventListener('focusin', e => {
    if (e.target.id === 'wb-sel-text' || e.target.dataset.lp || e.target.closest('[data-lslider]')) {
      if (currentLayer()) pushUndo();
    }
  });
}

function handleRightClick(e) {
  const p = project();
  // 候选标题
  const cand = e.target.closest('[data-title-cand]');
  if (cand) { p.scripts.title = cand.dataset.titleCand; const ta = document.getElementById('wb-title-text'); if (ta) ta.value = p.scripts.title; return; }
  // 加入画布
  const add = e.target.closest('[data-add]');
  if (add) {
    const kind = add.dataset.add;
    const text = (kind === 'title' ? (p.scripts.title || '') : (p.scripts.body || '')).trim();
    if (!text) { showToast(kind === 'title' ? '请先输入标题' : '请先输入正文'); return; }
    addLayer(kind, kind === 'title' ? '标题' : '正文', text); return;
  }
  // 步骤
  const sAdd = e.target.closest('[data-step-add]');
  if (sAdd) { const i = +sAdd.dataset.stepAdd; const t = (p.scripts.steps[i] || '').trim(); if (!t) { showToast(`步骤${i + 1}为空`); return; } addLayer('step', `步骤${i + 1}`, t); return; }
  const sDel = e.target.closest('[data-step-del]');
  if (sDel) { const i = +sDel.dataset.stepDel; p.scripts.steps.splice(i, 1); if (!p.scripts.steps.length) p.scripts.steps.push(''); refreshStepsBlock(); return; }
  if (e.target.id === 'wb-step-addrow') { p.scripts.steps.push(''); refreshStepsBlock(); return; }
  // 样式区按钮
  const al = e.target.closest('[data-align]'); if (al) { const l = currentLayer(); if (l) { pushUndo(); l.align = al.dataset.align; drawAll(); refreshStyle(); renderHandles(); markDirty(); } return; }
  const pos = e.target.closest('[data-pos]'); if (pos) { const l = currentLayer(); if (l) { pushUndo(); quickPos(l, pos.dataset.pos); drawAll(); renderHandles(); markDirty(); } return; }
  const sw = e.target.closest('[data-color-for]'); if (sw) { const l = currentLayer(); if (l) { pushUndo(); l[sw.dataset.colorFor] = sw.dataset.color; drawAll(); refreshStyle(); renderHandles(); markDirty(); } return; }
  if (e.target.id === 'wb-del-layer') { deleteSelectedLayer(); return; }
  const art = e.target.closest('[data-art]'); if (art) { applyArt(art.dataset.art); return; }
  // 模板
  if (e.target.id === 'wb-tpl-apply') { applyTemplateFromSelect(); return; }
  if (e.target.id === 'wb-tpl-save') { saveTemplatePrompt(); return; }
  if (e.target.id === 'wb-tpl-update') { updateTemplateFromSelect(); return; }
  if (e.target.dataset.applySelected) { showToast('「应用到选中图」将在成图编辑第 2 步补齐'); return; }
}

function handleRightInput(e) {
  const p = project();
  if (e.target.id === 'wb-title-kw') { p.scripts.keyword = e.target.value; return; }
  if (e.target.id === 'wb-title-text') { p.scripts.title = e.target.value; return; }
  if (e.target.id === 'wb-body-text') { p.scripts.body = e.target.value; return; }
  if (e.target.classList.contains('wb-step-input')) { const i = +e.target.closest('.wb-step-row').dataset.stepIdx; p.scripts.steps[i] = e.target.value; return; }
  // 当前选中文字
  if (e.target.id === 'wb-sel-text') {
    const l = currentLayer(); if (!l) return;
    l.text = e.target.value; drawAll(); renderHandles(); markDirty(); return;
  }
  // 样式属性
  const lp = e.target.dataset.lp;
  if (lp) {
    const l = currentLayer(); if (!l) return;
    if (e.target.type === 'checkbox') l[lp] = e.target.checked;
    else l[lp] = e.target.value;
    drawAll(); renderHandles(); markDirty(); return;
  }
  const ls = e.target.closest('[data-lslider]');
  if (ls) {
    const l = currentLayer(); if (!l) return;
    const id = ls.dataset.lslider; const val = parseFloat(e.target.value);
    if (id === 'bgAlphaPct') l.bgAlpha = val / 100;
    else if (id === 'lineHeightX10') l.lineHeight = val / 10;
    else l[id] = val;
    const v = ls.querySelector('.wb-sval'); if (v) v.textContent = Math.round(val);
    drawAll(); renderHandles(); markDirty();
  }
}
function quickPos(layer, pos) {
  if (!layer._box) return;
  const b = layer._box;
  const gapX = layer.xPct * viewW - b.x, gapY = layer.yPct * viewH - b.y;
  const tx = (viewW - b.w) / 2;
  let ty;
  if (pos === 'top') ty = viewH * 0.04; else if (pos === 'center') ty = (viewH - b.h) / 2; else ty = viewH - b.h - viewH * 0.04;
  layer.xPct = (tx + gapX) / viewW; layer.yPct = (ty + gapY) / viewH;
}

function defaultStyle() {
  return {
    fontSize: 64, color: '#ffffff', bold: true, align: 'center', lineHeight: LINE_HEIGHT_BASE,
    textWidth: Math.max(120, Math.round((baseW || 800) * 0.8)),
    strokeOn: true, strokeColor: '#000000', strokeWidth: 6,
    bgOn: false, bgColor: '#000000', bgAlpha: 0.55, bgRadius: 12,
    borderOn: false, borderColor: '#000000', borderWidth: 2,
    shadowOn: false, shadowColor: '#000000',
  };
}
function addLayer(kind, name, text) {
  const p = project();
  pushUndo();
  const style = defaultStyle();
  if (kind === 'step' || kind === 'body') { style.fontSize = 46; style.bgOn = true; }
  const layer = { id: `L-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, kind, name, text, xPct: 0.08, yPct: 0.12 + p.layers.length * 0.14, ...style };
  p.layers.push(layer);
  selectedLayerId = layer.id;
  markDirty();
  refreshStyle(); refreshRightAccordionOpen('style'); drawAll(); renderHandles(); refreshQueueStatus();
}
function deleteSelectedLayer() {
  const p = project(); const idx = p.layers.findIndex(l => l.id === selectedLayerId);
  if (idx < 0) return;
  if (!window.confirm('删除此文字图层？')) return;
  pushUndo();
  p.layers.splice(idx, 1); selectedLayerId = null; markDirty();
  refreshStyle(); drawAll(); renderHandles(); refreshQueueStatus();
}
function applyArt(id) {
  const preset = ART_PRESETS[id]; const l = currentLayer();
  if (!preset || !l) { if (!l) showToast('请先选中一个文字'); return; }
  pushUndo();
  Object.assign(l, preset.style); markDirty();
  drawAll(); refreshStyle(); renderHandles();
}

// ===== 成图模板（localStorage）=====
function getTemplates() { try { return JSON.parse(localStorage.getItem('editTemplates') || '[]'); } catch { return []; } }
function setTemplates(arr) { localStorage.setItem('editTemplates', JSON.stringify(arr)); }
function layerToTpl(l) {
  return {
    kind: l.kind, xPct: l.xPct, yPct: l.yPct, fontSize: l.fontSize, textWidth: l.textWidth,
    color: l.color, bold: l.bold, align: l.align, lineHeight: l.lineHeight,
    strokeOn: l.strokeOn, strokeColor: l.strokeColor, strokeWidth: l.strokeWidth,
    bgOn: l.bgOn, bgColor: l.bgColor, bgAlpha: l.bgAlpha, bgRadius: l.bgRadius,
    borderOn: l.borderOn, borderColor: l.borderColor, borderWidth: l.borderWidth,
    shadowOn: l.shadowOn, shadowColor: l.shadowColor,
  };
}
function placeholderFor(kind) { return kind === 'title' ? '标题文字' : kind === 'step' ? '步骤文字' : kind === 'body' ? '正文文字' : '文字'; }
function saveTemplatePrompt() {
  const p = project();
  if (!p.layers.length) { showToast('当前没有文字版式可保存'); return; }
  const name = prompt('成图模板名称（如：美食步骤图-黄字黑边）：');
  if (!name || !name.trim()) return;
  const tpls = getTemplates();
  tpls.push({ name: name.trim(), layers: p.layers.map(layerToTpl) });
  setTemplates(tpls);
  p.templateName = name.trim();
  refreshTemplateBlock();
  showToast('已保存成图模板');
}
function updateTemplateFromSelect() {
  const sel = document.getElementById('wb-tpl-select');
  if (!sel || sel.value === '') { showToast('请先在下拉框选择要更新的模板'); return; }
  const tpls = getTemplates(); const idx = +sel.value;
  if (!tpls[idx]) return;
  tpls[idx].layers = project().layers.map(layerToTpl);
  setTemplates(tpls);
  showToast(`已更新模板：${tpls[idx].name}`);
}
function applyTemplateFromSelect() {
  const sel = document.getElementById('wb-tpl-select');
  if (!sel || sel.value === '') { showToast('请先选择一个成图模板'); return; }
  const tpls = getTemplates(); const tpl = tpls[+sel.value];
  if (!tpl) return;
  pushUndo();
  const p = project();
  p.layers = tpl.layers.map((t, i) => ({
    id: `L-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 5)}`,
    name: placeholderFor(t.kind), text: placeholderFor(t.kind), ...defaultStyle(), ...t,
  }));
  p.templateName = tpl.name;
  selectedLayerId = p.layers[0]?.id || null;
  markDirty();
  refreshStyle(); drawAll(); renderHandles(); refreshQueueStatus();
  showToast(`已应用模板：${tpl.name}（文字为占位，请逐条改文案）`);
}

// ===== 队列事件 =====
function bindQueue() {
  document.getElementById('wb-queue')?.addEventListener('click', e => {
    const card = e.target.closest('.wb-qcard');
    if (!card) return;
    const id = card.dataset.frameId;
    if (id === currentFrameId) return;
    switchFrame(id);
  });
}
function switchFrame(id) {
  const p = project();
  if (p && !p.saved && (p.layers.length > 0 || p.processed)) {
    if (!window.confirm('当前图还未保存，切换将保留草稿但不生成成品。确定切换？')) return;
  }
  currentFrameId = id;
  selectedLayerId = null;
  activeTool = null; canvasMode = 'text'; cropRect = null; wmRect = null; resetAdj();
  undoStack = [];
  onSwitchFrameCb?.(id);
  ensureProject(id);
  refreshDock(); refreshModeBadge(); refreshRight(); refreshQueue();
  loadBase(() => { sizeCanvas(); drawAll(); renderHandles(); });
}

// ===== 撤销 =====
function pushUndo() {
  const p = project();
  undoStack.push({ baseDataUrl: p.baseDataUrl, layers: JSON.stringify(p.layers), scripts: JSON.stringify(p.scripts) });
  if (undoStack.length > 10) undoStack.shift();
}
export function undoWorkbench() {
  if (undoStack.length === 0) { showToast('没有可撤销的操作'); return; }
  const snap = undoStack.pop();
  const p = project();
  const baseChanged = p.baseDataUrl !== snap.baseDataUrl;
  p.baseDataUrl = snap.baseDataUrl;
  p.layers = JSON.parse(snap.layers);
  p.scripts = JSON.parse(snap.scripts);
  selectedLayerId = null;
  markDirty();
  refreshRight();
  if (baseChanged) loadBase(() => { sizeCanvas(); drawAll(); renderHandles(); refreshQueue(); });
  else { drawAll(); renderHandles(); refreshQueue(); }
  showToast('已撤销');
}

// ===== 保存当前 =====
export function saveCurrentWorkbench() {
  const frame = currentFrame(); const p = project();
  if (!frame || !p) { showToast('没有当前图'); return; }
  const img = new Image();
  img.onload = () => {
    const W = img.naturalWidth, H = img.naturalHeight;
    const out = document.createElement('canvas');
    out.width = W; out.height = H;
    const oc = out.getContext('2d');
    oc.drawImage(img, 0, 0, W, H);
    p.layers.forEach(l => drawLayer(oc, l, W, H, 1));
    const dataUrl = out.toDataURL('image/png');
    onSaveResultCb?.({ frameId: frame.id, dataUrl });
    p.saved = true;
    refreshQueue();
    showToast('已保存当前成图');
  };
  img.onerror = () => showToast('底图加载失败，保存中断');
  img.src = p.baseDataUrl || frame.sourceDataUrl;
}

// ===== 候选标题（本地）=====
function buildTitleCandidates(keyword) {
  const k = (keyword || '').trim();
  if (k) {
    const seed = k.slice(0, 12);
    return [`${seed}的家常做法`, `${seed}怎么做好吃`, `教你做${seed}`, `养生美食：${seed}`, `${seed}，超简单`];
  }
  return TITLE_SAMPLES.slice();
}

// ===== 局部刷新 =====
function refreshModeBadge() { const el = document.getElementById('wb-mode-badge'); if (el) el.textContent = modeBadge(); }
function refreshDock() {
  const main = document.querySelector('.wb-main');
  const old = document.getElementById('wb-dock');
  if (!main || !old) return;
  old.outerHTML = renderDock();
  // 事件用委托绑在 wb-dock 上，需重新绑定
  bindDock();
}
function refreshRight() {
  const old = document.getElementById('wb-right');
  if (!old) return;
  old.outerHTML = renderRight();
  bindRight();
}
function refreshRightAccordionOpen(key) { if (!accordion[key]) { accordion[key] = true; refreshRight(); } }
function refreshStyle() {
  const acc = document.querySelector('.wb-acc[data-acc="style"] .wb-acc-body');
  if (!acc) { refreshRight(); return; }
  acc.innerHTML = renderStyleBlock();
}
function refreshStepsBlock() {
  const acc = document.querySelector('.wb-acc[data-acc="steps"] .wb-acc-body');
  if (acc) acc.innerHTML = renderStepsBlock();
}
function refreshTemplateBlock() {
  const acc = document.querySelector('.wb-acc[data-acc="template"] .wb-acc-body');
  if (acc) acc.innerHTML = renderTemplateBlock();
}
function refreshQueue() {
  const old = document.getElementById('wb-queue');
  if (!old) return;
  old.outerHTML = renderQueue();
  bindQueue();
}
function refreshQueueStatus() { updateCurrentCardBadges(); }
// 只更新当前卡片的状态角标，避免每次微调都重渲染整条队列（含大缩略图）
function updateCurrentCardBadges() {
  const card = document.querySelector(`.wb-qcard[data-frame-id="${currentFrameId}"]`);
  if (!card) return;
  const badges = card.querySelector('.wb-qbadges');
  if (!badges) return;
  const p = projectsRef[currentFrameId];
  const processed = p && p.processed;
  const hasText = p && p.layers && p.layers.length > 0;
  const saved = p && p.saved && resultsRef[currentFrameId];
  badges.innerHTML = `
    ${processed ? '<span class="wb-badge b-proc">已处理</span>' : '<span class="wb-badge b-none">未处理</span>'}
    ${hasText ? '<span class="wb-badge b-text">已加字</span>' : ''}
    ${saved ? '<span class="wb-badge b-saved">已保存</span>' : '<span class="wb-badge b-unsaved">未保存</span>'}
  `;
}

// ===== 工具 =====
function escapeHTML(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function escapeAttr(s) { return escapeHTML(s).replace(/\n/g, '&#10;'); }
function showToast(msg) {
  let t = document.querySelector('.toast');
  if (!t) { t = document.createElement('div'); t.className = 'toast'; document.body.appendChild(t); }
  t.textContent = msg;
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => t.remove(), 2200);
}
