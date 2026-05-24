// ===== IMAGE EDIT MODULE (v2 — preview/save separated) =====
// 模式（mode）：
//   'source' — 显示原图（无裁剪框）
//   'crop'   — 在原图上叠一个可拖动的裁剪框（仅预览，未保存）
//   'view'   — 显示某个已保存的版本（只读，可调色后再保存）
//
// 比例按钮 = 进入 crop 模式（不写入 versionsCache）
// 顶部「保存当前版本 / 另存新版本」= 唯一的落盘入口
// sourceDataUrl 永远不被修改，所有版本都从 sourceImageEl 原分辨率重新裁剪

const CROP_RATIOS = [
  { id: 'original', label: '原图',  ratio: null },
  { id: '1:1',      label: '1:1',   ratio: 1 },
  { id: '3:4',      label: '3:4',   ratio: 3/4 },
  { id: '4:3',      label: '4:3',   ratio: 4/3 },
  { id: '16:9',     label: '16:9',  ratio: 16/9 },
  { id: '9:16',     label: '9:16',  ratio: 9/16 },
  { id: '2.35:1',   label: '2.35:1',ratio: 2.35 },
  { id: '2:1',      label: '2:1',   ratio: 2 },
];

export { CROP_RATIOS };

export const PRESETS = [
  { id: 'original',  label: '原图',       params: { brightness: 0, contrast: 0, saturation: 0, temperature: 0, sharpness: 0, shadows: 0, highlights: 0, vignette: 0, blur: 0 } },
  { id: 'bright',    label: '提亮清晰',    params: { brightness: 18, contrast: 8,  saturation: 5,  temperature: 0,  sharpness: 18, shadows: 0,  highlights: 0,  vignette: 0, blur: 0 } },
  { id: 'warm',      label: '暖色食物',    params: { brightness: 5,  contrast: 5,  saturation: 15, temperature: 28, sharpness: 5,  shadows: 0,  highlights: 0,  vignette: 0, blur: 0 } },
  { id: 'vivid',     label: '高对比鲜艳',  params: { brightness: 0,  contrast: 24, saturation: 20, temperature: 0,  sharpness: 10, shadows: 0,  highlights: 0,  vignette: 0, blur: 0 } },
  { id: 'soft',      label: '柔和干净',    params: { brightness: 8,  contrast: -8, saturation: -10, temperature: 0,  sharpness: 0,  shadows: 5,  highlights: 5,  vignette: 0, blur: 0 } },
  { id: 'dark',      label: '暗调高级',    params: { brightness: -18, contrast: 18, saturation: 8,  temperature: 0,  sharpness: 8,  shadows: -5, highlights: -10, vignette: 25, blur: 0 } },
  { id: 'dehaze',    label: '去灰增强',    params: { brightness: -5, contrast: 22, saturation: 10, temperature: 0,  sharpness: 12, shadows: 0,  highlights: -5, vignette: 0, blur: 0 } },
  { id: 'impact',    label: '封面冲击感',  params: { brightness: 8,  contrast: 28, saturation: 18, temperature: 5,  sharpness: 15, shadows: 0,  highlights: 0,  vignette: 15, blur: 0 } },
  { id: 'cool',      label: '冷白清爽',     params: { brightness: 10, contrast: 5,  saturation: -5, temperature: -28, sharpness: 5,  shadows: 0,  highlights: 8,  vignette: 0, blur: 0 } },
  { id: 'sharpen',   label: '轻微锐化',    params: { brightness: 0,  contrast: 5,  saturation: 0,  temperature: 0,  sharpness: 20, shadows: 0,  highlights: 0,  vignette: 0, blur: 0 } },
];

export const PARAMS = [
  { id: 'brightness',  label: '亮度',    min: -30, max: 30,  defaultVal: 0 },
  { id: 'contrast',   label: '对比度',  min: -30, max: 50,  defaultVal: 0 },
  { id: 'saturation',  label: '饱和度',  min: -30, max: 50,  defaultVal: 0 },
  { id: 'temperature', label: '色温',    min: -50, max: 50,  defaultVal: 0 },
  { id: 'sharpness',  label: '锐化',    min: 0,   max: 50,  defaultVal: 0 },
  { id: 'shadows',     label: '阴影',    min: -30, max: 30,  defaultVal: 0 },
  { id: 'highlights',  label: '高光',    min: -30, max: 30,  defaultVal: 0 },
  { id: 'vignette',    label: '暗角',    min: 0,   max: 50,  defaultVal: 0 },
  { id: 'blur',        label: '模糊',    min: 0,   max: 5,   defaultVal: 0 },
];

// ===== MODULE STATE =====
let onSaveCallback = null;

// Source image (永远不变)
let sourceImageEl = null;
let sourceImageW = 0;
let sourceImageH = 0;

// Current "base" — 当前用作底图的 Image（source 或 version 的 image）
let baseImageEl = null;

// Canvas
let editCanvas = null;
let editCtx = null;
let editCanvasW = 0;
let editCanvasH = 0;

// 已应用滤镜后的快照，crop overlay 从它取 pixels
let filteredSnapshot = null;

// 模式
let mode = 'source';            // 'source' | 'crop' | 'view'
let cropRatioId = null;         // crop 模式下选的比例 id
let selectedVersionKey = null;  // view 模式下选的版本 key

// 版本
let versionsCache = {};         // { '3:4': dataUrl, '3:4 (2)': dataUrl, ... }
let undoStack = [];             // 仅记录 versionsCache 的快照

// Crop 框
let crop = {
  active: false, ratio: null,
  x: 0, y: 0, w: 0, h: 0,
  dragging: false, draggingCorner: null, dragOffset: { x: 0, y: 0 },
};

// 是否有未保存的滤镜变化（用于 view 模式提示）
let hasUnsavedFilterChange = false;

// ===== RENDER =====
export function renderImageEditPage(frameList, currentId, onSave) {
  onSaveCallback = onSave;
  const frame = frameList.find(f => f.id === currentId);
  const currentIdx = frameList.findIndex(f => f.id === currentId);

  versionsCache = frame ? { ...(frame.versionsCache || {}) } : {};
  mode = 'source';
  cropRatioId = null;
  selectedVersionKey = null;

  return `
    <div class="edit-page">
      ${renderEditTopbar(frameList, currentIdx + 1, frame)}
      <div class="edit-3col">
        ${renderImageList(frameList, currentId)}
        ${renderPreviewArea()}
        ${renderRightPanel()}
      </div>
    </div>
  `;
}

function renderEditTopbar(frames, current, frame) {
  const matName = frame?.materialName || (frame?.time ? frame.time : '');
  return `
    <div class="edit-topbar">
      <div class="edit-topbar-title">
        ✂ 图片编辑
        <span>${frames.length} 张素材 · 当前 ${current} / ${frames.length}${matName ? ` · <strong>${matName}</strong>` : ''}${frame?.time ? ` (${frame.time})` : ''}</span>
        <span class="edit-mode-tag" id="edit-mode-tag"></span>
      </div>
      <button id="btn-save-current" class="primary">💾 保存当前版本</button>
      <button id="btn-save-new" class="success">📑 另存为新版本</button>
      <button id="btn-undo" ${undoStack.length === 0 ? 'disabled' : ''}>↩ 撤销</button>
      <button id="btn-delete-frame" class="danger" title="删除当前素材及所有版本">🗑 删除素材</button>
      <button data-nav="text" class="success" title="所有已保存的比例版本会自动出现在第三步">→ 文字上图</button>
      <button data-nav="video">← 返回选图</button>
    </div>
  `;
}

function renderImageList(frames, currentId) {
  return `
    <div class="section-card edit-list-card">
      <div class="section-header">
        <div class="section-title">素材列表</div>
        <div class="section-subtitle">${frames.length} 张</div>
      </div>
      <div class="edit-img-list" id="edit-img-list">
        ${frames.map((f, idx) => renderImageListItem(f, idx, currentId)).join('')}
      </div>
    </div>
  `;
}

function renderImageListItem(frame, idx, currentId) {
  const isActiveFrame = currentId === frame.id;
  // 当前 frame 的版本用本地 versionsCache（含未持久化但已保存的）
  const vcache = isActiveFrame ? versionsCache : (frame.versionsCache || {});
  const versionKeys = Object.keys(vcache);
  const totalVersions = versionKeys.length + 1; // +1 for 原图

  // 高亮规则
  const sourceActive = isActiveFrame && mode === 'source';
  const cropActiveKey = isActiveFrame && mode === 'crop' ? cropRatioId : null;
  const viewActiveKey = isActiveFrame && mode === 'view' ? selectedVersionKey : null;

  // 默认仅展开当前选中的素材，其余收起
  const isExpanded = isActiveFrame;
  const matName = frame.materialName || ('素材 ' + (idx + 1));
  return `
    <div class="img-list-group ${isExpanded ? 'expanded' : ''} ${isActiveFrame ? 'active' : ''}" data-img-group-id="${frame.id}">
      <div class="img-list-row" data-img-row-id="${frame.id}">
        <div class="img-list-thumb">
          <img src="${frame.sourceDataUrl}" alt="${matName}" draggable="false">
        </div>
        <div class="img-list-info">
          <div class="img-list-name">${matName}</div>
          <div class="img-list-meta">
            <span class="ver-sub">${frame.time || ''}</span>
            <span class="ver-count">${totalVersions}版本</span>
          </div>
        </div>
        <div class="img-list-expand" data-expand-toggle="${frame.id}" title="折叠/展开">▶</div>
      </div>
      <div class="img-list-versions">
        <div class="ver-row source-ver ${sourceActive ? 'active' : ''}" data-frame-id="${frame.id}" data-action="select-source">
          <span class="ver-bullet">└</span>
          <span class="ver-thumb"><img src="${frame.sourceDataUrl}" draggable="false"></span>
          <span class="ver-label">原图</span>
        </div>
        ${versionKeys.map(key => `
          <div class="ver-row ${viewActiveKey === key ? 'active' : ''} ${cropActiveKey && key === cropActiveKey ? 'editing' : ''}"
               data-frame-id="${frame.id}" data-version-key="${key}" data-action="select-version">
            <span class="ver-bullet">└</span>
            <span class="ver-thumb"><img src="${vcache[key]}" draggable="false"></span>
            <span class="ver-label" title="${key}">${key}</span>
            <button class="ver-del" data-frame-id="${frame.id}" data-version-key="${key}" title="删除此版本">×</button>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

function renderPreviewArea() {
  return `
    <div class="section-card">
      <div class="section-header">
        <div class="section-title">预览</div>
        <div class="section-subtitle" id="preview-hint">原图</div>
      </div>
      <div class="section-body" style="padding:8px;">
        <div class="edit-preview-wrap" id="preview-canvas-wrap">
          <canvas id="edit-canvas"></canvas>
          <div class="edit-mode-banner" id="edit-mode-banner"></div>
        </div>
      </div>
    </div>
  `;
}

function renderRightPanel() {
  const ratioBtns = CROP_RATIOS.map(r => `
    <button class="crop-ratio-btn" data-ratio="${r.id}">${r.label}</button>
  `).join('');

  return `
    <div class="section-card">
      <div class="section-header"><div class="section-title">参数调整</div></div>
      <div class="section-body" style="display:flex;flex-direction:column;gap:0;padding:10px 12px;">
        ${renderPresets()}
        <div style="border-top:1px solid var(--color-border);margin:8px 0;"></div>

        <div class="ctrl-group">
          <div class="ctrl-group-title">裁剪比例（点击进入裁剪预览，不会自动保存）</div>
          <div class="crop-ratios" id="crop-ratios">${ratioBtns}</div>
          <div class="crop-hint" id="crop-hint" style="font-size:11px;color:var(--color-text-muted);margin-top:6px;">选个比例 → 拖动裁剪框 → 点顶部「保存」</div>
        </div>

        <div style="border-top:1px solid var(--color-border);margin:8px 0;"></div>
        ${renderBasicGroup()}
        <div style="border-top:1px solid var(--color-border);margin:8px 0;"></div>
        ${renderDetailGroup()}
        <div style="border-top:1px solid var(--color-border);margin:8px 0;"></div>
        <button id="btn-reset-all">🔄 重置全部参数</button>
      </div>
    </div>
  `;
}

function renderPresets() {
  return `
    <div class="presets-area">
      <div class="presets-label">效果预设</div>
      <div class="presets-grid" id="presets-grid">
        ${PRESETS.map(p => `<button class="preset-btn" data-preset="${p.id}">${p.label}</button>`).join('')}
      </div>
    </div>
  `;
}

function renderBasicGroup() {
  return `
    <div class="ctrl-group">
      <div class="ctrl-group-title">基础调节</div>
      ${PARAMS.slice(0, 4).map(p => renderSlider(p)).join('')}
    </div>
  `;
}

function renderDetailGroup() {
  return `
    <div class="ctrl-group">
      <div class="ctrl-group-title">细节调节</div>
      ${PARAMS.slice(4).map(p => renderSlider(p)).join('')}
    </div>
  `;
}

function renderSlider({ id, label, min, max, defaultVal }) {
  return `
    <div class="slider-group" data-slider="${id}">
      <label>${label}</label>
      <input type="range" min="${min}" max="${max}" value="${defaultVal}" step="1"/>
      <span class="val">${defaultVal}</span>
    </div>
  `;
}

// ===== INIT =====
export function initImageEditPage(frame) {
  if (!frame || !frame.sourceDataUrl) return;

  versionsCache = { ...(frame.versionsCache || {}) };
  mode = 'source';
  cropRatioId = null;
  selectedVersionKey = null;
  undoStack = [];
  hasUnsavedFilterChange = false;
  window._editCurrentFrame = frame;

  editCanvas = document.getElementById('edit-canvas');
  if (!editCanvas) return;
  editCtx = editCanvas.getContext('2d');

  const img = new Image();
  img.onload = () => {
    sourceImageEl = img;
    sourceImageW = img.naturalWidth;
    sourceImageH = img.naturalHeight;
    baseImageEl = img;

    resetAllSliders();
    sizeCanvasForImage(img);
    drawBaseWithFilters();
    refreshUI();
    bindControlEvents();

    // 若上一次点击的是其它图的某个版本，init 后切到 view 模式
    const pending = window._pendingVersionSelect;
    if (pending && pending.frameId === frame.id && versionsCache[pending.versionKey]) {
      window._pendingVersionSelect = null;
      enterViewMode(pending.versionKey);
    } else {
      window._pendingVersionSelect = null;
    }
  };
  img.src = frame.sourceDataUrl;
}

function sizeCanvasForImage(img) {
  const wrap = document.getElementById('preview-canvas-wrap');
  const maxW = wrap?.clientWidth ? wrap.clientWidth - 16 : 560;
  const maxH = 480;
  const scale = Math.min(maxW / img.naturalWidth, maxH / img.naturalHeight, 1);
  editCanvasW = Math.max(50, Math.round(img.naturalWidth * scale));
  editCanvasH = Math.max(50, Math.round(img.naturalHeight * scale));
  editCanvas.width = editCanvasW;
  editCanvas.height = editCanvasH;
}

// ===== MODE TRANSITIONS =====
function enterSourceMode() {
  mode = 'source';
  cropRatioId = null;
  selectedVersionKey = null;
  crop.active = false;
  crop.ratio = null;
  resetAllSliders();
  setBaseImage(sourceImageEl);
}

function enterCropMode(ratioId) {
  mode = 'crop';
  cropRatioId = ratioId;
  selectedVersionKey = null;
  const rDef = CROP_RATIOS.find(r => r.id === ratioId);
  crop.ratio = rDef?.ratio || null;
  crop.active = true;
  // 重新基于 source 显示，再 fit crop box（滤镜保留，让用户先调色再裁）
  setBaseImage(sourceImageEl, () => {
    fitCropToRatio(crop.ratio);
  });
}

function enterViewMode(versionKey) {
  if (!versionsCache[versionKey]) {
    enterSourceMode();
    refreshUI();
    return;
  }
  mode = 'view';
  selectedVersionKey = versionKey;
  cropRatioId = null;
  crop.active = false;
  crop.ratio = null;
  // 版本本身已含滤镜，sliders 重置避免双重叠加
  resetAllSliders();
  const verImg = new Image();
  verImg.onload = () => {
    setBaseImage(verImg);
    refreshUI();
  };
  verImg.src = versionsCache[versionKey];
}

function setBaseImage(img, afterSize) {
  baseImageEl = img;
  sizeCanvasForImage(img);
  if (afterSize) afterSize();
  drawBaseWithFilters();
  refreshUI();
}

// ===== DRAWING =====
function drawBaseWithFilters() {
  if (!editCtx || !baseImageEl) return;
  editCtx.clearRect(0, 0, editCanvasW, editCanvasH);
  editCtx.drawImage(baseImageEl, 0, 0, editCanvasW, editCanvasH);

  const v = getCurrentFilterValues();
  applyFiltersToContext(editCtx, editCanvasW, editCanvasH, v);

  // Cache snapshot for crop overlay
  if (!filteredSnapshot) filteredSnapshot = document.createElement('canvas');
  filteredSnapshot.width = editCanvasW;
  filteredSnapshot.height = editCanvasH;
  const sc = filteredSnapshot.getContext('2d');
  sc.clearRect(0, 0, editCanvasW, editCanvasH);
  sc.drawImage(editCanvas, 0, 0);

  if (mode === 'crop' && crop.active) drawCropOverlay();
}

function drawCropOverlay() {
  if (!editCtx || !filteredSnapshot) return;
  // 1) 底层先画 filtered 全图（保持上一次状态可见）
  editCtx.clearRect(0, 0, editCanvasW, editCanvasH);
  editCtx.drawImage(filteredSnapshot, 0, 0);
  // 2) 整体盖一层暗色遮罩
  editCtx.fillStyle = 'rgba(0,0,0,0.55)';
  editCtx.fillRect(0, 0, editCanvasW, editCanvasH);
  // 3) 裁剪区把 filteredSnapshot 的那块再贴回去（看起来"亮"）
  const { x, y, w, h } = crop;
  editCtx.drawImage(filteredSnapshot, x, y, w, h, x, y, w, h);
  // 4) 边框 + 三分线 + 角点
  editCtx.strokeStyle = '#ffffff';
  editCtx.lineWidth = 2;
  editCtx.strokeRect(x + 0.5, y + 0.5, w, h);

  editCtx.strokeStyle = 'rgba(255,255,255,0.4)';
  editCtx.lineWidth = 1;
  for (let i = 1; i < 3; i++) {
    editCtx.beginPath();
    editCtx.moveTo(x + (w / 3) * i, y); editCtx.lineTo(x + (w / 3) * i, y + h); editCtx.stroke();
    editCtx.beginPath();
    editCtx.moveTo(x, y + (h / 3) * i); editCtx.lineTo(x + w, y + (h / 3) * i); editCtx.stroke();
  }

  editCtx.fillStyle = '#ffffff';
  [[x, y], [x + w, y], [x, y + h], [x + w, y + h]].forEach(([cx, cy]) => {
    editCtx.fillRect(cx - 5, cy - 5, 10, 10);
  });
  // 边中点把手
  [[x + w / 2, y], [x + w / 2, y + h], [x, y + h / 2], [x + w, y + h / 2]].forEach(([cx, cy]) => {
    editCtx.fillRect(cx - 4, cy - 4, 8, 8);
  });

  // 尺寸 label
  const labelText = `${Math.round(crop.w)}×${Math.round(crop.h)} · ${cropRatioId}`;
  editCtx.font = 'bold 12px monospace';
  const lw = editCtx.measureText(labelText).width;
  const lx = x + w / 2 - lw / 2 - 6;
  const ly = y + h + 6;
  editCtx.fillStyle = 'rgba(0,0,0,0.75)';
  editCtx.fillRect(lx, ly, lw + 12, 20);
  editCtx.fillStyle = '#ffffff';
  editCtx.fillText(labelText, lx + 6, ly + 14);
}

function fitCropToRatio(ratio) {
  if (!ratio) {
    crop.x = Math.round(editCanvasW * 0.1);
    crop.y = Math.round(editCanvasH * 0.1);
    crop.w = Math.round(editCanvasW * 0.8);
    crop.h = Math.round(editCanvasH * 0.8);
    return;
  }
  const maxW = Math.round(editCanvasW * 0.85);
  const maxH = Math.round(editCanvasH * 0.85);
  let w = maxW;
  let h = w / ratio;
  if (h > maxH) { h = maxH; w = h * ratio; }
  w = Math.round(w); h = Math.round(h);
  crop.x = Math.round((editCanvasW - w) / 2);
  crop.y = Math.round((editCanvasH - h) / 2);
  crop.w = w; crop.h = h;
}

// ===== FILTER PIPELINE =====
function getCurrentFilterValues() {
  const v = {};
  PARAMS.forEach(p => { v[p.id] = getSliderVal(p.id); });
  return v;
}

function applyFiltersToContext(ctx, w, h, v) {
  if (v.brightness === 0 && v.contrast === 0 && v.saturation === 0 &&
      v.temperature === 0 && v.shadows === 0 && v.highlights === 0) {
    // 仅 sharpness/vignette/blur 时也要走下面，先判断
    if (v.sharpness === 0 && v.vignette === 0 && v.blur === 0) return;
  }
  const imgData = ctx.getImageData(0, 0, w, h);
  const data = imgData.data;
  const cfactor = (v.contrast + 100) / 100;
  const bc = (v.brightness / 100) * 255;
  const tr = 1 + v.temperature / 100;
  const tb = 1 - v.temperature / 100;
  const s = (v.saturation + 100) / 100;

  for (let i = 0; i < data.length; i += 4) {
    let r = data[i], g = data[i + 1], b = data[i + 2];
    r = r * cfactor + bc; g = g * cfactor + bc; b = b * cfactor + bc;
    r *= tr; b *= tb;
    const gray = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    r = gray * (1 - s) + r * s; g = gray * (1 - s) + g * s; b = gray * (1 - s) + b * s;
    const lum = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
    if (v.shadows !== 0) {
      const sm = Math.max(0, (128 - lum) / 128);
      r += v.shadows * sm * 0.5; g += v.shadows * sm * 0.5; b += v.shadows * sm * 0.5;
    }
    if (v.highlights !== 0) {
      const hm = Math.max(0, (lum - 128) / 128);
      r -= v.highlights * hm * 0.5; g -= v.highlights * hm * 0.5; b -= v.highlights * hm * 0.5;
    }
    data[i] = r < 0 ? 0 : r > 255 ? 255 : r;
    data[i + 1] = g < 0 ? 0 : g > 255 ? 255 : g;
    data[i + 2] = b < 0 ? 0 : b > 255 ? 255 : b;
  }
  ctx.putImageData(imgData, 0, 0);

  if (v.sharpness > 0) applySharpnessOn(ctx, w, h, v.sharpness / 100);
  if (v.vignette > 0) applyVignetteOn(ctx, w, h, v.vignette / 100);
  if (v.blur > 0) applyBlurOn(ctx, w, h, v.blur);
}

function applySharpnessOn(ctx, w, h, k) {
  const src = ctx.getImageData(0, 0, w, h).data;
  const dst = ctx.createImageData(w, h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      for (let c = 0; c < 3; c++) {
        const i = (y * w + x) * 4 + c;
        const val = src[i] * (1 + 4 * k) + src[i - 4] * (-k) + src[i + 4] * (-k) + src[i - w * 4] * (-k) + src[i + w * 4] * (-k);
        dst.data[i] = val < 0 ? 0 : val > 255 ? 255 : val;
      }
      dst.data[(y * w + x) * 4 + 3] = src[(y * w + x) * 4 + 3];
    }
  }
  ctx.putImageData(dst, 0, 0);
}

function applyVignetteOn(ctx, w, h, intensity) {
  const cx = w / 2, cy = h / 2, maxR = Math.sqrt(cx * cx + cy * cy);
  const imgData = ctx.getImageData(0, 0, w, h);
  const d = imgData.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const fade = Math.max(0, 1 - (Math.sqrt((x - cx) ** 2 + (y - cy) ** 2) / maxR) * intensity * 2.2);
      const i = (y * w + x) * 4;
      d[i] *= fade; d[i + 1] *= fade; d[i + 2] *= fade;
    }
  }
  ctx.putImageData(imgData, 0, 0);
}

function applyBlurOn(ctx, w, h, px) {
  const tmp = document.createElement('canvas');
  tmp.width = w; tmp.height = h;
  tmp.getContext('2d').drawImage(ctx.canvas, 0, 0);
  ctx.filter = `blur(${px}px)`;
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(tmp, 0, 0);
  ctx.filter = 'none';
}

// ===== EVENTS =====
function bindControlEvents() {
  document.getElementById('presets-grid')?.addEventListener('click', e => {
    const btn = e.target.closest('.preset-btn');
    if (!btn) return;
    const preset = PRESETS.find(p => p.id === btn.dataset.preset);
    if (!preset) return;
    applyPreset(preset.params);
    document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  });

  document.getElementById('crop-ratios')?.addEventListener('click', e => {
    const btn = e.target.closest('.crop-ratio-btn');
    if (!btn) return;
    const ratioId = btn.dataset.ratio;
    if (ratioId === 'original') {
      enterSourceMode();
    } else {
      enterCropMode(ratioId);
    }
  });

  document.getElementById('btn-save-current')?.addEventListener('click', () => {
    saveVersion({ asNew: false });
  });
  document.getElementById('btn-save-new')?.addEventListener('click', () => {
    saveVersion({ asNew: true });
  });
  document.getElementById('btn-undo')?.addEventListener('click', performUndo);
  document.getElementById('btn-delete-frame')?.addEventListener('click', handleDeleteCurrentFrame);

  document.querySelectorAll('[data-slider]').forEach(group => {
    const slider = group.querySelector('input');
    const valEl = group.querySelector('.val');
    slider.addEventListener('input', () => {
      valEl.textContent = slider.value;
      hasUnsavedFilterChange = true;
      drawBaseWithFilters();
    });
  });

  document.getElementById('btn-reset-all')?.addEventListener('click', () => {
    resetAllSliders();
    drawBaseWithFilters();
  });

  // 左侧素材列表 — 行点击 = 切换源图（进 source 模式）
  document.getElementById('edit-img-list')?.addEventListener('click', e => {
    // 删除按钮 — 不切换图片，不触发版本/行点击
    const delBtn = e.target.closest('.ver-del');
    if (delBtn) {
      e.stopPropagation();
      const frameId = delBtn.dataset.frameId;
      const versionKey = delBtn.dataset.versionKey;
      handleDeleteVersion(frameId, versionKey);
      return;
    }
    // 折叠/展开按钮 — 不切换图片
    const expandBtn = e.target.closest('[data-expand-toggle]');
    if (expandBtn) {
      e.stopPropagation();
      const group = expandBtn.closest('.img-list-group');
      if (!group) return;
      const wasExpanded = group.classList.contains('expanded');
      // 手风琴：先关闭其他所有，再切换自己
      document.querySelectorAll('#edit-img-list .img-list-group.expanded').forEach(g => {
        if (g !== group) g.classList.remove('expanded');
      });
      group.classList.toggle('expanded', !wasExpanded);
      return;
    }
    const verRow = e.target.closest('.ver-row');
    if (verRow) {
      const frameId = verRow.dataset.frameId;
      const action = verRow.dataset.action;
      const versionKey = verRow.dataset.versionKey;
      if (frameId !== getCurrentFrameId()) {
        // 切到别的源图 — 选了哪个版本就显示哪个版本
        if (confirmDiscardUnsaved()) {
          window.editPageSwitchImage(frameId);
          // 暂存目标 ver，等 init 完成后切到 view 模式
          if (action === 'select-version' && versionKey) {
            window._pendingVersionSelect = { frameId, versionKey };
          }
        }
        return;
      }
      if (action === 'select-source') {
        if (confirmDiscardUnsaved()) enterSourceMode();
      } else if (action === 'select-version' && versionKey) {
        if (confirmDiscardUnsaved()) enterViewMode(versionKey);
      }
      return;
    }
    const row = e.target.closest('.img-list-row');
    if (row) {
      const frameId = row.dataset.imgRowId;
      if (frameId === getCurrentFrameId()) {
        // 点击当前 group 的行 = 切换展开/收起
        const group = row.closest('.img-list-group');
        if (!group) return;
        const wasExpanded = group.classList.contains('expanded');
        document.querySelectorAll('#edit-img-list .img-list-group.expanded').forEach(g => {
          if (g !== group) g.classList.remove('expanded');
        });
        group.classList.toggle('expanded', !wasExpanded);
        return;
      }
      if (confirmDiscardUnsaved()) {
        window.editPageSwitchImage(frameId);
      }
    }
  });

  // Crop 拖动事件
  editCanvas?.addEventListener('mousedown', onCropMouseDown);
  document.addEventListener('mousemove', onCropMouseMove);
  document.addEventListener('mouseup', onCropMouseUp);
  editCanvas?.addEventListener('mousemove', onCanvasHover);
}

function getCurrentFrameId() {
  // 通过 active group 推断
  const active = document.querySelector('.img-list-group.active');
  return active?.dataset.imgGroupId || null;
}

function confirmDiscardUnsaved() {
  if (!hasUnsavedFilterChange) return true;
  const ok = window.confirm('当前调色未保存，切换后会丢失。继续？');
  if (ok) hasUnsavedFilterChange = false;
  return ok;
}

// ===== SAVE =====
function saveVersion({ asNew }) {
  if (mode === 'source') {
    showToast('请先点击一个裁剪比例进入裁剪预览');
    return;
  }

  // 重复比例提示：仅 asNew 且当前比例已存在
  if (asNew) {
    const baseKey = mode === 'crop'
      ? cropRatioId
      : (selectedVersionKey ? selectedVersionKey.split(' ')[0] : null);
    if (baseKey && versionsCache[baseKey]) {
      const ok = window.confirm(`当前素材已存在「${baseKey}」版本，是否仍另存为新版本？\n（确定 = 保存为 ${uniqueKey(baseKey)}；取消 = 不保存）`);
      if (!ok) return;
    }
  }

  pushUndo();

  if (mode === 'crop') {
    // 从 source 原分辨率 + 滤镜重新生成
    const dataUrl = generateCroppedDataUrlFromSource();
    // P0防线：无效 dataUrl 不允许写入 versionsCache
    if (!dataUrl || !dataUrl.startsWith('data:')) {
      showToast('保存失败：裁剪数据无效，请重新选择比例后保存');
      return;
    }
    // 保存当前：用比例 id 作为 key，重名则覆盖
    // 另存新：用 uniqueKey 加 (2)(3) 后缀
    const key = asNew ? uniqueKey(cropRatioId) : cropRatioId;
    versionsCache[key] = dataUrl;
    onSaveCallback?.({ versionKey: key, dataUrl, versionsCache: { ...versionsCache } });
    hasUnsavedFilterChange = false;
    showToast(asNew ? `已另存：${key}` : `已保存：${key}`);
    // 切到 view 模式查看刚保存的
    enterViewMode(key);
  } else if (mode === 'view') {
    // 当前正在看某个版本，把当前 canvas（含滤镜）落盘
    const dataUrl = editCanvas.toDataURL('image/png');
    // P0防线：空 dataUrl 不写入
    if (!dataUrl || !dataUrl.startsWith('data:')) {
      showToast('保存失败：版本数据无效，请重新保存');
      return;
    }
    let key = selectedVersionKey;
    if (asNew) {
      // 取 base ratio 部分作为前缀
      const base = selectedVersionKey.split(' ')[0];
      key = uniqueKey(base);
    }
    versionsCache[key] = dataUrl;
    onSaveCallback?.({ versionKey: key, dataUrl, versionsCache: { ...versionsCache } });
    hasUnsavedFilterChange = false;
    showToast(asNew ? `已另存：${key}` : `已保存：${key}`);
    if (asNew) enterViewMode(key);
    else refreshUI();
  }
}

function uniqueKey(baseKey) {
  if (!versionsCache[baseKey]) return baseKey;
  let n = 2;
  while (versionsCache[`${baseKey} (${n})`]) n++;
  return `${baseKey} (${n})`;
}

function handleDeleteVersion(frameId, versionKey) {
  if (!versionKey) return;
  // 只允许操作当前 frame 的版本（避免跨 frame 状态错乱）
  if (frameId !== getCurrentFrameId()) {
    showToast('请先切换到该素材再删除其版本');
    return;
  }
  if (!versionsCache[versionKey]) return;
  if (!window.confirm(`确定删除版本「${versionKey}」？此操作无法撤销直接生效，但仍可使用顶部「撤销」恢复。`)) return;

  pushUndo();
  const wasCurrent = (mode === 'view' && selectedVersionKey === versionKey)
    || (mode === 'crop' && cropRatioId === versionKey);
  const remainingKeys = Object.keys(versionsCache).filter(k => k !== versionKey);
  delete versionsCache[versionKey];
  onSaveCallback?.({ versionsCache: { ...versionsCache }, silent: true });
  hasUnsavedFilterChange = false;
  showToast(`已删除版本：${versionKey}`);

  if (wasCurrent) {
    // 删除的是当前正在看/正在裁剪的版本 — 切回上一个版本，没有则回原图
    if (remainingKeys.length > 0) {
      enterViewMode(remainingKeys[remainingKeys.length - 1]);
    } else {
      enterSourceMode();
      refreshUI();
    }
  } else {
    refreshUI();
  }
}

// 删除整个素材（包括所有版本）
function handleDeleteCurrentFrame() {
  const frameId = getCurrentFrameId();
  if (!frameId) return;
  // 从传入的 frameList 中查找（通过 renderImageListItem 闭包可访问）
  const frame = window._editCurrentFrame;
  if (!frame) return;
  const matName = frame.materialName || frameId;
  if (!window.confirm(`确定删除素材「${matName}」及其所有版本？此操作无法撤销。`)) return;

  // 通过 callback 通知 app 层处理（app 层才持有 state）
  onSaveCallback?.({ deleteFrameId: frameId });
  showToast(`已删除素材：${matName}`);
}

function generateCroppedDataUrlFromSource() {
  // crop 框是基于 editCanvas 显示坐标，映射到 source 原分辨率
  // P0防线：只有当 crop 有效时才生成，否则返回空字符串（不让脏数据进入 versionsCache）
  if (!crop.active || crop.w <= 0 || crop.h <= 0) {
    console.warn('[ImageEdit] generateCroppedDataUrlFromSource: crop not active or invalid dimensions, skip save');
    return '';
  }
  const scaleX = sourceImageW / editCanvasW;
  const scaleY = sourceImageH / editCanvasH;
  const sx = Math.max(0, crop.x * scaleX);
  const sy = Math.max(0, crop.y * scaleY);
  const sw = Math.min(sourceImageW - sx, crop.w * scaleX);
  const sh = Math.min(sourceImageH - sy, crop.h * scaleY);
  // 防御：确保宽高为正
  if (sw <= 0 || sh <= 0) {
    console.warn('[ImageEdit] generateCroppedDataUrlFromSource: invalid source crop dimensions', sw, sh);
    return '';
  }

  const out = document.createElement('canvas');
  out.width = Math.max(1, Math.round(sw));
  out.height = Math.max(1, Math.round(sh));
  const oc = out.getContext('2d');
  oc.drawImage(sourceImageEl, sx, sy, sw, sh, 0, 0, out.width, out.height);

  const v = getCurrentFilterValues();
  applyFiltersToContext(oc, out.width, out.height, v);

  return out.toDataURL('image/png');
}

function pushUndo() {
  undoStack.push({
    versionsCache: JSON.parse(JSON.stringify(versionsCache)),
    mode, cropRatioId, selectedVersionKey,
  });
  if (undoStack.length > 10) undoStack.shift();
}

function performUndo() {
  if (undoStack.length === 0) return;
  const prev = undoStack.pop();
  versionsCache = prev.versionsCache;
  onSaveCallback?.({ versionsCache: { ...versionsCache }, silent: true });
  // 恢复模式
  if (prev.mode === 'source') enterSourceMode();
  else if (prev.mode === 'crop') enterCropMode(prev.cropRatioId);
  else if (prev.mode === 'view') {
    if (versionsCache[prev.selectedVersionKey]) enterViewMode(prev.selectedVersionKey);
    else enterSourceMode();
  }
  showToast('已撤销一步');
}

// ===== CROP DRAG =====
function getCropCanvasPos(e) {
  const rect = editCanvas.getBoundingClientRect();
  return {
    x: (e.clientX - rect.left) * (editCanvasW / rect.width),
    y: (e.clientY - rect.top) * (editCanvasH / rect.height),
  };
}

function hitTestCropCorner(px, py) {
  if (!crop.active) return null;
  const { x, y, w, h } = crop;
  const cs = 12;
  const corners = [
    { name: 'nw', cx: x, cy: y }, { name: 'ne', cx: x + w, cy: y },
    { name: 'sw', cx: x, cy: y + h }, { name: 'se', cx: x + w, cy: y + h },
  ];
  for (const c of corners) if (Math.abs(px - c.cx) <= cs && Math.abs(py - c.cy) <= cs) return c.name;
  const edges = [
    { name: 'n', cx: x + w / 2, cy: y }, { name: 's', cx: x + w / 2, cy: y + h },
    { name: 'w', cx: x, cy: y + h / 2 }, { name: 'e', cx: x + w, cy: y + h / 2 },
  ];
  for (const ed of edges) if (Math.abs(px - ed.cx) <= cs && Math.abs(py - ed.cy) <= cs) return ed.name;
  if (px >= x && px <= x + w && py >= y && py <= y + h) return 'move';
  return null;
}

function onCanvasHover(e) {
  if (!crop.active || crop.dragging) return;
  const { x: px, y: py } = getCropCanvasPos(e);
  const hit = hitTestCropCorner(px, py);
  const cursorMap = {
    nw: 'nwse-resize', se: 'nwse-resize',
    ne: 'nesw-resize', sw: 'nesw-resize',
    n: 'ns-resize', s: 'ns-resize',
    w: 'ew-resize', e: 'ew-resize',
    move: 'move',
  };
  editCanvas.style.cursor = cursorMap[hit] || 'default';
}

function onCropMouseDown(e) {
  if (!crop.active) return;
  const { x: px, y: py } = getCropCanvasPos(e);
  const hit = hitTestCropCorner(px, py);
  if (!hit) return;
  crop.dragging = true;
  crop.draggingCorner = hit;
  crop.dragOffset = { x: px - crop.x, y: py - crop.y };
  e.preventDefault();
}

function onCropMouseMove(e) {
  if (!crop.dragging || !crop.active) return;
  const { x: px, y: py } = getCropCanvasPos(e);
  if (crop.draggingCorner === 'move') {
    crop.x = Math.max(0, Math.min(editCanvasW - crop.w, px - crop.dragOffset.x));
    crop.y = Math.max(0, Math.min(editCanvasH - crop.h, py - crop.dragOffset.y));
  } else {
    resizeCrop(crop.draggingCorner, px, py);
  }
  drawCropOverlay();
}

function onCropMouseUp() {
  crop.dragging = false;
  crop.draggingCorner = null;
}

function resizeCrop(handle, px, py) {
  const ratio = crop.ratio;
  let { x, y, w, h } = crop;
  const right = x + w;
  const bottom = y + h;
  const MIN = 40;

  if (ratio) {
    // 锁比例：以指定 handle 作为驱动维度，另一维等比缩放
    if (handle === 'se') {
      w = Math.max(MIN, px - x);
      h = w / ratio;
      if (y + h > editCanvasH) { h = editCanvasH - y; w = h * ratio; }
    } else if (handle === 'ne') {
      w = Math.max(MIN, px - x);
      h = w / ratio;
      const newY = bottom - h;
      if (newY < 0) { h = bottom; w = h * ratio; y = 0; } else y = newY;
    } else if (handle === 'sw') {
      w = Math.max(MIN, right - px);
      h = w / ratio;
      const newX = right - w;
      if (newX < 0) { w = right; h = w / ratio; x = 0; } else x = newX;
      if (y + h > editCanvasH) { h = editCanvasH - y; w = h * ratio; x = right - w; }
    } else if (handle === 'nw') {
      w = Math.max(MIN, right - px);
      h = w / ratio;
      let newX = right - w;
      let newY = bottom - h;
      if (newX < 0) { w = right; h = w / ratio; newX = 0; newY = bottom - h; }
      if (newY < 0) { h = bottom; w = h * ratio; newY = 0; newX = right - w; }
      x = newX; y = newY;
    } else if (handle === 'e') {
      w = Math.max(MIN, px - x);
      h = w / ratio;
      const dh = h - crop.h;
      y -= dh / 2;
      if (y < 0) y = 0;
      if (y + h > editCanvasH) y = editCanvasH - h;
    } else if (handle === 'w') {
      w = Math.max(MIN, right - px);
      h = w / ratio;
      x = right - w;
      const dh = h - crop.h;
      y -= dh / 2;
      if (x < 0) { x = 0; w = right; h = w / ratio; }
      if (y < 0) y = 0;
      if (y + h > editCanvasH) y = editCanvasH - h;
    } else if (handle === 'n') {
      h = Math.max(MIN, bottom - py);
      w = h * ratio;
      y = bottom - h;
      const dw = w - crop.w;
      x -= dw / 2;
      if (y < 0) { y = 0; h = bottom; w = h * ratio; }
      if (x < 0) x = 0;
      if (x + w > editCanvasW) x = editCanvasW - w;
    } else if (handle === 's') {
      h = Math.max(MIN, py - y);
      w = h * ratio;
      const dw = w - crop.w;
      x -= dw / 2;
      if (y + h > editCanvasH) { h = editCanvasH - y; w = h * ratio; }
      if (x < 0) x = 0;
      if (x + w > editCanvasW) x = editCanvasW - w;
    }
  } else {
    // 自由比例
    if (handle.includes('e')) w = Math.max(MIN, px - x);
    if (handle.includes('s')) h = Math.max(MIN, py - y);
    if (handle.includes('w')) { const nx = Math.min(right - MIN, px); w = right - nx; x = nx; }
    if (handle.includes('n')) { const ny = Math.min(bottom - MIN, py); h = bottom - ny; y = ny; }
  }

  x = Math.max(0, x); y = Math.max(0, y);
  w = Math.max(MIN, Math.min(editCanvasW - x, w));
  h = Math.max(MIN, Math.min(editCanvasH - y, h));

  crop.x = Math.round(x); crop.y = Math.round(y);
  crop.w = Math.round(w); crop.h = Math.round(h);
}

// ===== UI HELPERS =====
function refreshUI() {
  // Mode tag
  const tag = document.getElementById('edit-mode-tag');
  if (tag) {
    const labels = {
      source: '<span class="mt-source">查看原图</span>',
      crop: `<span class="mt-crop">裁剪预览：${cropRatioId}（未保存）</span>`,
      view: `<span class="mt-view">查看版本：${selectedVersionKey}</span>`,
    };
    tag.innerHTML = labels[mode] || '';
  }
  // Preview hint
  const hint = document.getElementById('preview-hint');
  if (hint) {
    hint.textContent = mode === 'source' ? '原图（无裁剪）'
      : mode === 'crop' ? `裁剪预览 ${cropRatioId} — 拖动调整后点「保存」`
      : `已保存版本：${selectedVersionKey}`;
  }
  // Banner
  const banner = document.getElementById('edit-mode-banner');
  if (banner) {
    if (mode === 'crop') {
      banner.textContent = `${cropRatioId}（预览中，未保存）`;
      banner.className = 'edit-mode-banner show banner-crop';
    } else if (mode === 'view') {
      banner.textContent = `版本：${selectedVersionKey}`;
      banner.className = 'edit-mode-banner show banner-view';
    } else {
      banner.className = 'edit-mode-banner';
    }
  }
  // Ratio buttons active state
  document.querySelectorAll('.crop-ratio-btn').forEach(b => {
    if (mode === 'crop' && b.dataset.ratio === cropRatioId) b.classList.add('active');
    else if (mode === 'source' && b.dataset.ratio === 'original') b.classList.add('active');
    else b.classList.remove('active');
  });
  // Undo button
  const undoBtn = document.getElementById('btn-undo');
  if (undoBtn) undoBtn.disabled = undoStack.length === 0;
  // Save current button — 在 source 模式禁用
  const btnCur = document.getElementById('btn-save-current');
  if (btnCur) btnCur.disabled = mode === 'source';
  const btnNew = document.getElementById('btn-save-new');
  if (btnNew) btnNew.disabled = mode === 'source';
  // 左树版本列表更新
  refreshVersionTree();
}

function refreshVersionTree() {
  const list = document.getElementById('edit-img-list');
  if (!list) return;
  // 只更新当前 frame 的版本部分
  const currentFrameId = getCurrentFrameId();
  if (!currentFrameId) return;
  const group = list.querySelector(`.img-list-group[data-img-group-id="${currentFrameId}"]`);
  if (!group) return;

  const verContainer = group.querySelector('.img-list-versions');
  if (!verContainer) return;

  const frameImgSrc = group.querySelector('.img-list-thumb img')?.src || '';
  const versionKeys = Object.keys(versionsCache);

  verContainer.innerHTML = `
    <div class="ver-row source-ver ${mode === 'source' ? 'active' : ''}" data-frame-id="${currentFrameId}" data-action="select-source">
      <span class="ver-bullet">└</span>
      <span class="ver-thumb"><img src="${frameImgSrc}" draggable="false"></span>
      <span class="ver-label">原图</span>
    </div>
    ${versionKeys.map(key => `
      <div class="ver-row ${mode === 'view' && selectedVersionKey === key ? 'active' : ''} ${mode === 'crop' && cropRatioId === key ? 'editing' : ''}"
           data-frame-id="${currentFrameId}" data-version-key="${key}" data-action="select-version">
        <span class="ver-bullet">└</span>
        <span class="ver-thumb"><img src="${versionsCache[key]}" draggable="false"></span>
        <span class="ver-label" title="${key}">${key}</span>
        <button class="ver-del" data-frame-id="${currentFrameId}" data-version-key="${key}" title="删除此版本">×</button>
      </div>
    `).join('')}
  `;

  // 顶部版本计数（包含原图，与展开显示数一致）
  const count = group.querySelector('.ver-count');
  if (count) count.textContent = `${versionKeys.length + 1}版本`;
}

function applyPreset(params) {
  Object.entries(params).forEach(([id, val]) => {
    const g = document.querySelector(`[data-slider="${id}"]`);
    if (!g) return;
    g.querySelector('input').value = val;
    g.querySelector('.val').textContent = val;
  });
  hasUnsavedFilterChange = true;
  drawBaseWithFilters();
}

function resetAllSliders() {
  PARAMS.forEach(p => {
    const g = document.querySelector(`[data-slider="${p.id}"]`);
    if (!g) return;
    g.querySelector('input').value = p.defaultVal;
    g.querySelector('.val').textContent = p.defaultVal;
  });
  hasUnsavedFilterChange = false;
}

function getSliderVal(id) {
  const el = document.querySelector(`[data-slider="${id}"] input`);
  return el ? parseInt(el.value) : 0;
}

function showToast(msg) {
  let toast = document.querySelector('.toast');
  if (!toast) { toast = document.createElement('div'); toast.className = 'toast'; document.body.appendChild(toast); }
  toast.textContent = msg;
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => toast.remove(), 2200);
}
