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

// 艺术字预设：整套样式（含字号/描边/阴影/背景/边框/旋转/竖排等），不只是改颜色
const ART_PRESETS = {
  'title-yb':   { label: '黄字黑边大标题', style: { fontSize: 96, bold: true, color: '#ffd24d', align: 'center', strokeOn: true, strokeColor: '#000000', strokeWidth: 12, shadowOn: false, bgOn: false, borderOn: false, rotate: 0, vertical: false, lineHeight: 1.2 } },
  'title-wb':   { label: '白字黑边大标题', style: { fontSize: 92, bold: true, color: '#ffffff', align: 'center', strokeOn: true, strokeColor: '#000000', strokeWidth: 10, shadowOn: false, bgOn: false, borderOn: false, rotate: 0, vertical: false, lineHeight: 1.2 } },
  'hot-ry':     { label: '红黄爆款标题', style: { fontSize: 100, bold: true, color: '#fff200', align: 'center', strokeOn: true, strokeColor: '#d42a2a', strokeWidth: 14, shadowOn: true, shadowColor: '#7a0000', bgOn: false, borderOn: false, rotate: 0, vertical: false, lineHeight: 1.15 } },
  'tag-bw':     { label: '黑底白字标签', style: { fontSize: 46, bold: true, color: '#ffffff', align: 'center', strokeOn: false, strokeWidth: 0, shadowOn: false, bgOn: true, bgColor: '#111111', bgAlpha: 0.9, bgRadius: 6, borderOn: false, rotate: 0, vertical: false, lineHeight: 1.2 } },
  'tag-cream':  { label: '米色养生标签', style: { fontSize: 46, bold: true, color: '#5b4327', align: 'center', strokeOn: false, strokeWidth: 0, shadowOn: false, bgOn: true, bgColor: '#f3e6c8', bgAlpha: 0.95, bgRadius: 18, borderOn: true, borderColor: '#caa46a', borderWidth: 3, rotate: 0, vertical: false, lineHeight: 1.2 } },
  'slant':      { label: '斜切封面字', style: { fontSize: 88, bold: true, color: '#ffffff', align: 'center', strokeOn: true, strokeColor: '#1d5fe7', strokeWidth: 8, shadowOn: true, shadowColor: '#000000', bgOn: false, borderOn: false, rotate: -8, vertical: false, lineHeight: 1.2 } },
  'step-num':   { label: '步骤编号贴纸', style: { fontSize: 60, bold: true, color: '#ffffff', align: 'center', strokeOn: false, strokeWidth: 0, shadowOn: false, bgOn: true, bgColor: '#d42a2a', bgAlpha: 1, bgRadius: 999, borderOn: true, borderColor: '#ffffff', borderWidth: 4, rotate: 0, vertical: false, lineHeight: 1 } },
  'bubble':     { label: '圆角气泡字', style: { fontSize: 50, bold: true, color: '#1352d8', align: 'center', strokeOn: false, strokeWidth: 0, shadowOn: true, shadowColor: 'rgba(0,0,0,0.25)', bgOn: true, bgColor: '#ffffff', bgAlpha: 0.95, bgRadius: 28, borderOn: true, borderColor: '#1d5fe7', borderWidth: 3, rotate: 0, vertical: false, lineHeight: 1.2 } },
  'vertical':   { label: '竖排小标签', style: { fontSize: 44, bold: true, color: '#ffffff', align: 'center', strokeOn: true, strokeColor: '#1a6b3a', strokeWidth: 4, shadowOn: false, bgOn: true, bgColor: '#1a9a5a', bgAlpha: 0.92, bgRadius: 10, borderOn: false, rotate: 0, vertical: true, lineHeight: 1.25 } },
  'shadow-3d':  { label: '阴影立体字', style: { fontSize: 84, bold: true, color: '#ffffff', align: 'center', strokeOn: true, strokeColor: '#333333', strokeWidth: 4, shadowOn: true, shadowColor: '#000000', bgOn: false, borderOn: false, rotate: 0, vertical: false, lineHeight: 1.2 } },
  'double-line':{ label: '双层描边标题', style: { fontSize: 90, bold: true, color: '#ff5252', align: 'center', strokeOn: true, strokeColor: '#ffffff', strokeWidth: 14, shadowOn: true, shadowColor: '#000000', bgOn: false, borderOn: false, rotate: 0, vertical: false, lineHeight: 1.2 } },
  'banner':     { label: '半透明横幅标题', style: { fontSize: 64, bold: true, color: '#ffffff', align: 'center', strokeOn: false, strokeWidth: 0, shadowOn: false, bgOn: true, bgColor: '#000000', bgAlpha: 0.5, bgRadius: 4, borderOn: false, rotate: 0, vertical: false, lineHeight: 1.25 } },
  // 创意艺术字（更强形态变化）
  'ink-brush':  { label: '毛笔手写标题', style: { fontSize: 92, bold: true, color: '#1a1a1a', align: 'center', strokeOn: false, strokeWidth: 0, shadowOn: true, shadowColor: 'rgba(0,0,0,0.35)', bgOn: false, borderOn: false, rotate: -4, vertical: false, lineHeight: 1.15, glow: false } },
  'seal':       { label: '朱红印章字', style: { fontSize: 56, bold: true, color: '#ffffff', align: 'center', strokeOn: false, strokeWidth: 0, shadowOn: false, bgOn: true, bgColor: '#c0392b', bgAlpha: 1, bgRadius: 8, borderOn: true, borderColor: '#ffffff', borderWidth: 3, rotate: -3, vertical: true, lineHeight: 1.1, glow: false } },
  'rice-paper': { label: '宣纸国风卡片', style: { fontSize: 52, bold: true, color: '#5b4327', align: 'center', strokeOn: false, strokeWidth: 0, shadowOn: false, bgOn: true, bgColor: '#f3ead2', bgAlpha: 0.96, bgRadius: 14, borderOn: true, borderColor: '#caa46a', borderWidth: 2, rotate: 0, vertical: false, lineHeight: 1.3, glow: false } },
  'wood':       { label: '木牌菜单字', style: { fontSize: 60, bold: true, color: '#fff3e0', align: 'center', strokeOn: false, strokeWidth: 0, shadowOn: true, shadowColor: 'rgba(0,0,0,0.4)', bgOn: true, bgColor: '#7a4a23', bgAlpha: 1, bgRadius: 12, borderOn: true, borderColor: '#4d2e15', borderWidth: 4, rotate: 0, vertical: false, lineHeight: 1.2, glow: false } },
  'boom':       { label: '爆炸贴纸标题', style: { fontSize: 64, bold: true, color: '#d42a2a', align: 'center', strokeOn: true, strokeColor: '#000000', strokeWidth: 3, shadowOn: false, bgOn: true, bgColor: '#fff200', bgAlpha: 1, bgRadius: 4, borderOn: true, borderColor: '#000000', borderWidth: 3, rotate: -6, vertical: false, lineHeight: 1.1, glow: false } },
  'cartoon-3d': { label: '立体卡通字', style: { fontSize: 92, bold: true, color: '#ffffff', align: 'center', strokeOn: true, strokeColor: '#1352d8', strokeWidth: 9, shadowOn: true, shadowColor: '#0a2a6b', bgOn: false, borderOn: false, rotate: 0, vertical: false, lineHeight: 1.15, glow: false } },
  'ribbon':     { label: '丝带横幅字', style: { fontSize: 58, bold: true, color: '#ffffff', align: 'center', strokeOn: false, strokeWidth: 0, shadowOn: true, shadowColor: 'rgba(0,0,0,0.3)', bgOn: true, bgColor: '#c0392b', bgAlpha: 0.95, bgRadius: 4, borderOn: true, borderColor: '#8a2520', borderWidth: 2, rotate: 0, vertical: false, lineHeight: 1.2, glow: false } },
  'sticky':     { label: '便签纸提示字', style: { fontSize: 42, bold: true, color: '#5b4327', align: 'center', strokeOn: false, strokeWidth: 0, shadowOn: true, shadowColor: 'rgba(0,0,0,0.2)', bgOn: true, bgColor: '#fff9c4', bgAlpha: 1, bgRadius: 4, borderOn: false, rotate: -3, vertical: false, lineHeight: 1.3, glow: false } },
  'speech':     { label: '对话框气泡字', style: { fontSize: 50, bold: true, color: '#1352d8', align: 'center', strokeOn: false, strokeWidth: 0, shadowOn: true, shadowColor: 'rgba(0,0,0,0.22)', bgOn: true, bgColor: '#ffffff', bgAlpha: 0.97, bgRadius: 26, borderOn: true, borderColor: '#1d5fe7', borderWidth: 3, rotate: 0, vertical: false, lineHeight: 1.25, glow: false } },
  'neon':       { label: '霓虹描边字', style: { fontSize: 80, bold: true, color: '#ffffff', align: 'center', strokeOn: true, strokeColor: '#00e5ff', strokeWidth: 3, shadowOn: false, bgOn: false, borderOn: false, rotate: 0, vertical: false, lineHeight: 1.2, glow: true, glowColor: '#00e5ff' } },
  // 美食风格
  'sign':       { label: '美食招牌字', style: { fontSize: 78, bold: true, color: '#fff3d6', align: 'center', strokeOn: true, strokeColor: '#6b2e0a', strokeWidth: 6, shadowOn: true, shadowColor: '#3a1500', bgOn: false, borderOn: false, rotate: 0, vertical: false, lineHeight: 1.15, glow: false } },
  'handnote':   { label: '手写便签字', style: { fontSize: 44, bold: true, color: '#3a3a3a', align: 'left', strokeOn: false, strokeWidth: 0, shadowOn: false, bgOn: true, bgColor: '#fffae0', bgAlpha: 1, bgRadius: 6, borderOn: true, borderColor: '#e6d48a', borderWidth: 2, rotate: -2, vertical: false, lineHeight: 1.35, glow: false } },
  'pop-ry':     { label: '爆款红黄描边字', style: { fontSize: 86, bold: true, color: '#fff200', align: 'center', strokeOn: true, strokeColor: '#d42a2a', strokeWidth: 12, shadowOn: true, shadowColor: '#000000', bgOn: false, borderOn: false, rotate: 0, vertical: false, lineHeight: 1.1, glow: false } },
  'dbl-shadow': { label: '双层阴影立体字', style: { fontSize: 88, bold: true, color: '#ffffff', align: 'center', strokeOn: true, strokeColor: '#222222', strokeWidth: 5, shadowOn: true, shadowColor: '#d42a2a', bgOn: false, borderOn: false, rotate: 0, vertical: false, lineHeight: 1.15, glow: false } },
  'circle-mark':{ label: '重点圈画字', style: { fontSize: 64, bold: true, color: '#d42a2a', align: 'center', strokeOn: false, strokeWidth: 0, shadowOn: false, bgOn: false, borderOn: true, borderColor: '#d42a2a', borderWidth: 4, bgRadius: 999, rotate: -3, vertical: false, lineHeight: 1.2, glow: false } },
  'xhs-cover':  { label: '小红书封面字', style: { fontSize: 84, bold: true, color: '#ff2d55', align: 'center', strokeOn: true, strokeColor: '#ffffff', strokeWidth: 10, shadowOn: true, shadowColor: 'rgba(0,0,0,0.25)', bgOn: false, borderOn: false, rotate: 0, vertical: false, lineHeight: 1.15, glow: false } },
  'recipe-step':{ label: '菜谱步骤牌', style: { fontSize: 50, bold: true, color: '#ffffff', align: 'center', strokeOn: false, strokeWidth: 0, shadowOn: false, bgOn: true, bgColor: '#2d7a4f', bgAlpha: 0.95, bgRadius: 10, borderOn: true, borderColor: '#1a5a36', borderWidth: 3, rotate: 0, vertical: false, lineHeight: 1.2, glow: false } },
  'ancient':    { label: '养生古风标题', style: { fontSize: 56, bold: true, color: '#f5e6c8', align: 'center', strokeOn: true, strokeColor: '#5a3010', strokeWidth: 4, shadowOn: true, shadowColor: '#000000', bgOn: true, bgColor: '#3a2415', bgAlpha: 0.85, bgRadius: 8, borderOn: true, borderColor: '#a8824a', borderWidth: 2, rotate: 0, vertical: true, lineHeight: 1.25, glow: false } },
  'fire':       { label: '辣味火焰字', style: { fontSize: 86, bold: true, color: '#ffd24d', align: 'center', strokeOn: true, strokeColor: '#b21500', strokeWidth: 7, shadowOn: false, bgOn: false, borderOn: false, rotate: 0, vertical: false, lineHeight: 1.15, glow: true, glowColor: '#ff5500' } },
  'fresh-green':{ label: '清爽绿色标签', style: { fontSize: 46, bold: true, color: '#ffffff', align: 'center', strokeOn: false, strokeWidth: 0, shadowOn: false, bgOn: true, bgColor: '#43b049', bgAlpha: 0.95, bgRadius: 22, borderOn: false, rotate: 0, vertical: false, lineHeight: 1.2, glow: false } },
  'cream-cute': { label: '奶油可爱字', style: { fontSize: 60, bold: true, color: '#ff8aa8', align: 'center', strokeOn: true, strokeColor: '#ffffff', strokeWidth: 8, shadowOn: true, shadowColor: 'rgba(255,138,168,0.4)', bgOn: false, borderOn: false, rotate: -2, vertical: false, lineHeight: 1.2, glow: false } },
  'black-gold': { label: '黑金高级字', style: { fontSize: 76, bold: true, color: '#e8c878', align: 'center', strokeOn: true, strokeColor: '#3a2e10', strokeWidth: 3, shadowOn: true, shadowColor: '#000000', bgOn: true, bgColor: '#111111', bgAlpha: 0.85, bgRadius: 6, borderOn: true, borderColor: '#c9a44a', borderWidth: 2, rotate: 0, vertical: false, lineHeight: 1.2, glow: false } },
};
const ART_GROUP_A = ['title-yb', 'title-wb', 'hot-ry', 'tag-bw', 'tag-cream', 'slant', 'step-num', 'bubble', 'vertical', 'shadow-3d', 'double-line', 'banner'];
const ART_GROUP_B = ['ink-brush', 'seal', 'rice-paper', 'wood', 'boom', 'cartoon-3d', 'ribbon', 'sticky', 'speech', 'neon'];
const ART_GROUP_C = ['sign', 'handnote', 'pop-ry', 'dbl-shadow', 'circle-mark', 'xhs-cover', 'recipe-step', 'ancient', 'fire', 'fresh-green', 'cream-cute', 'black-gold'];

const COLOR_FX = {
  '原图':     { brightness: 100, contrast: 100, saturate: 100, temp: 0 },
  '提亮':     { brightness: 115, contrast: 102, saturate: 105, temp: 5 },
  '暖色':     { brightness: 104, contrast: 102, saturate: 110, temp: 28 },
  '高对比':   { brightness: 100, contrast: 130, saturate: 110, temp: 0 },
  '柔和':     { brightness: 106, contrast: 92,  saturate: 95,  temp: 6 },
  '冷白':     { brightness: 110, contrast: 104, saturate: 96,  temp: -22 },
  '食欲增强': { brightness: 106, contrast: 112, saturate: 128, temp: 18 },
  '红润肉色': { brightness: 103, contrast: 110, saturate: 122, temp: 24 },
  '清爽蔬菜': { brightness: 108, contrast: 106, saturate: 118, temp: -6 },
  '汤品通透': { brightness: 112, contrast: 104, saturate: 108, temp: 10 },
  '油亮红烧': { brightness: 100, contrast: 120, saturate: 130, temp: 22 },
  '家常自然': { brightness: 104, contrast: 103, saturate: 106, temp: 6 },
  '封面鲜亮': { brightness: 110, contrast: 118, saturate: 124, temp: 8 },
  '暗部提亮': { brightness: 120, contrast: 96,  saturate: 104, temp: 4 },
  '轻微去雾': { brightness: 104, contrast: 122, saturate: 112, temp: 0 },
  '米面白净': { brightness: 114, contrast: 102, saturate: 96,  temp: -10 },
  '夜市烟火': { brightness: 98,  contrast: 124, saturate: 126, temp: 20 },
  '暖锅热气': { brightness: 105, contrast: 114, saturate: 120, temp: 26 },
  '柔焦质感': { brightness: 107, contrast: 94,  saturate: 102, temp: 8 },
  '干净冷光': { brightness: 109, contrast: 108, saturate: 98,  temp: -18 },
};

// ===== 模块状态（每次 render 重置引用）=====
let framesRef = [];
let projectsRef = {};
let resultsRef = {};
let currentFrameId = null;
let onSwitchFrameCb = null;
let onSaveResultCb = null;
let onDeleteFrameCb = null;

let canvasMode = 'text';      // text | crop | watermark
let activeTool = null;        // crop | watermark | color | clarity | subtitle | null
let selectedLayerId = null;

let baseImageEl = null;
let baseW = 0, baseH = 0;
let canvas = null, ctx = null;
let viewW = 0, viewH = 0, viewScale = 1, viewDpr = 1;

let drag = { active: false, layerId: null, ox: 0, oy: 0 };
let resize = { active: false, layerId: null, handle: null, sx: 0, sy: 0, startFont: 0, startWidth: 0, startBoxW: 0, startBoxH: 0 };
let inlineEdit = { active: false, layerId: null, el: null };

let cropRect = null;          // 图片像素坐标 {x,y,w,h}
let cropRatio = '原图';
let cropDrag = { active: false, mode: null, sx: 0, sy: 0, start: null };

let wmRect = null;            // 图片像素坐标 {x,y,w,h}
let wmDrag = { active: false, sx: 0, sy: 0 };
let wmFill = 'auto';          // auto | white | black
let rotateDrag = { active: false, layerId: null, cx: 0, cy: 0, startAngle: 0, startRotate: 0 };

let adj = { brightness: 100, contrast: 100, saturate: 100, temp: 0, sharpen: 0, blur: 0, shadow: 0, highlight: 0, vignette: 0 };
let subtitleFrac = 0.12;

let undoStack = [];

let accordion = { template: true, title: true, steps: false, body: false, style: true, art: false };
let tplBringText = true;   // 成图模板应用方式：true=带入模板文字，false=仅套样式与位置

let batchSelectedIds = new Set();

// ===== 入口 =====
export function renderEditWorkbench({ frames, currentFrameId: cid, projects, results, onSwitchFrame, onSaveResult, onDeleteFrame }) {
  framesRef = frames || [];
  projectsRef = projects || {};
  resultsRef = results || {};
  onSwitchFrameCb = onSwitchFrame || null;
  onSaveResultCb = onSaveResult || null;
  onDeleteFrameCb = onDeleteFrame || null;
  currentFrameId = framesRef.find(f => f.id === cid) ? cid : (framesRef[0]?.id || null);
  selectedLayerId = null;
  activeTool = null;
  canvasMode = 'text';
  cropRect = null; wmRect = null;
  resetAdj();
  undoStack = [];
  batchSelectedIds = new Set();
  ensureProject(currentFrameId);

  return `
    <div class="wb">
      <div class="wb-main">
        <div class="wb-canvas-area" id="wb-canvas-area">
          <div class="wb-mode-badge" id="wb-mode-badge">${modeBadge()}</div>
          <div class="wb-canvas-hint">单击选中 · 拖动移动 · 拖控制点改大小 · <strong>双击文字直接改字</strong></div>
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
        <span class="wb-dock-right">
          <button class="wb-tool" data-tool="apply-selected" title="把当前处理参数应用到队列里勾选的图（第2步补齐）">应用到选中</button>
          <button class="wb-tool primary" id="wb-dock-save" title="保存当前成图（与右上角相同）">💾 保存当前</button>
          ${activeTool ? `<button class="wb-dock-collapse" id="wb-dock-collapse" title="收起">⌄ 收起</button>` : ''}
        </span>
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

// ===== 右侧：双工作区（文字内容 + 文字格式）=====
function renderRight() {
  return `
    <div class="wb-right" id="wb-right">
      <div class="wb-right-tabs" id="wb-right-tabs">
        <button data-rtab="content" class="active">文字内容</button>
        <button data-rtab="format">文字格式</button>
      </div>
      <div class="wb-right-dual" data-rtab="content" id="wb-right-dual">
        <div class="wb-ws wb-ws-content">
          <div class="wb-ws-title">文字内容</div>
          ${section('template', '成图模板', renderTemplateBlock())}
          ${section('title', '① 标题生成', renderTitleBlock())}
          ${section('steps', '② 步骤图文字', renderStepsBlock())}
          ${section('body', '③ 正文编辑', renderBodyBlock())}
        </div>
        <div class="wb-ws wb-ws-format">
          <div class="wb-ws-title">文字格式</div>
          <div id="wb-format">${renderStyleBlock()}</div>
          ${section('art', '艺术字模板', renderArtBlock())}
        </div>
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
        ${tpls.map((t, i) => `<option value="${i}">${escapeHTML(t.name)}（${(t.layers || []).length}层）</option>`).join('')}
      </select>
    </div>
    <div class="wb-tpl-mode">
      <div class="wb-flabel">应用方式</div>
      <label class="wb-radio"><input type="radio" name="tplmode" value="full" ${tplBringText ? 'checked' : ''}> 带入模板文字（默认）</label>
      <label class="wb-radio"><input type="radio" name="tplmode" value="style" ${!tplBringText ? 'checked' : ''}> 仅套用样式和位置</label>
    </div>
    <div class="wb-prow wb-tpl-actions">
      <button class="primary wb-chip" id="wb-tpl-apply">应用到当前图</button>
      <button class="wb-chip" data-apply-selected="template" title="第2步补齐">应用到选中图</button>
    </div>
    <div class="wb-prow wb-tpl-actions">
      <button class="wb-chip" id="wb-tpl-save">保存当前画面为模板</button>
      <button class="wb-chip" id="wb-tpl-update">更新当前模板</button>
    </div>
    <div class="wb-note">成图模板=当前画面上的整套文字层（内容+位置+大小+样式+艺术字/旋转/竖排）。默认应用会把文字一并带入，可直接双击改字。不保存图片本身。</div>
  `;
}

function renderTitleBlock() {
  const p = project();
  return `
    <div class="wb-step-label">步骤 1 · 输入菜名 / 关键词</div>
    <div class="wb-field"><input type="text" id="wb-title-kw" placeholder="例如：京酱肉丝" value="${escapeAttr(p.scripts.keyword || '')}"></div>
    <div class="wb-hint">输入后，下方会自动生成可选标题；也可以直接手动写标题。</div>

    <div class="wb-step-label">步骤 2 · 点击一个候选标题</div>
    <div class="wb-cands" id="wb-title-cands">${buildTitleCandidates(p.scripts.keyword).map(c => `<button class="wb-cand" data-title-cand="${escapeAttr(c)}">${escapeHTML(c)}</button>`).join('')}</div>
    <div class="wb-hint">点击候选标题，会填入下面的标题框。</div>

    <div class="wb-step-label">步骤 3 · 准备加入画布的标题</div>
    <div class="wb-field"><textarea id="wb-title-text" rows="2" placeholder="可手动修改最终标题文字">${escapeHTML(p.scripts.title || '')}</textarea></div>
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
    <div class="wb-srow"><label>旋转</label>
      <input type="number" data-lp-num="rotate" value="${Math.round(l.rotate || 0)}" min="-180" max="180" step="1" style="width:60px;">
      <span id="wb-rot-display" class="wb-rot-display">${Math.round(l.rotate || 0)}°</span>
      <div class="wb-btng"><button data-rot="-15">⟲15</button><button data-rot="0">归零</button><button data-rot="15">⟳15</button></div>
    </div>
    <div class="wb-hint">提示：也可拖动画布上文字框顶部的圆形手柄自由旋转。</div>
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
  const grid = (keys) => `<div class="wb-art-grid">${keys.map(id => `<button class="wb-art" data-art="${id}">${ART_PRESETS[id].label}</button>`).join('')}</div>`;
  return `
    <div class="wb-art-group-label">A · 实用排版</div>
    ${grid(ART_GROUP_A)}
    <div class="wb-art-group-label">B · 创意艺术字</div>
    ${grid(ART_GROUP_B)}
    <div class="wb-art-group-label">C · 美食风格</div>
    ${grid(ART_GROUP_C)}
    <div class="wb-note">点击套用到当前选中文字；未选中会提示先选文字。</div>
  `;
}

// ===== 底部队列 =====
function renderBatchBar() {
  const sel = batchSelectedIds.size;
  return `
    <div class="wb-batch-bar" id="wb-batch-bar">
      <div class="wb-batch-row">
        <button class="wb-batch-btn" id="wb-sel-all">全选</button>
        <button class="wb-batch-btn" id="wb-sel-none">取消</button>
        <span class="wb-batch-count">${sel > 0 ? `已选 ${sel} 张` : '未选图片'}</span>
        <span class="wb-batch-spacer"></span>
        <button class="wb-batch-btn primary" id="wb-batch-export-png" ${sel === 0 ? 'disabled' : ''}>批量导出 PNG</button>
        <button class="wb-batch-btn" id="wb-batch-export-zip" ${sel === 0 ? 'disabled' : ''}>打包 ZIP</button>
      </div>
      <div class="wb-batch-row">
        <span class="wb-batch-label" style="color:#999">批量改比例：后续版本开放</span>
      </div>
    </div>
  `;
}

function renderQueue() {
  return `
    <div class="wb-queue" id="wb-queue">
      ${renderBatchBar()}
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
  const checked = batchSelectedIds.has(f.id) ? 'checked' : '';
  return `
    <div class="wb-qcard ${f.id === currentFrameId ? 'active' : ''}" data-frame-id="${f.id}">
      <label class="wb-qcheck" title="选中批量处理"><input type="checkbox" data-frame-check="${f.id}" ${checked}></label>
      <button class="wb-qdel" data-frame-del="${f.id}" title="删除这张图片">×</button>
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
  // 按设备像素比放大内部分辨率，避免预览发糊；CSS 显示尺寸仍为 viewW/viewH
  viewDpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(viewW * viewDpr);
  canvas.height = Math.round(viewH * viewDpr);
  canvas.style.width = viewW + 'px';
  canvas.style.height = viewH + 'px';
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
  // 重置 + 应用 DPR 缩放（内部分辨率 = viewW*dpr × viewH*dpr，绘制坐标仍按 viewW/viewH）
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  ctx.setTransform(viewDpr, 0, 0, viewDpr, 0, 0);
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
  if (inlineEdit.active && layer.id === inlineEdit.layerId) { return; } // 编辑中：隐藏原文字避免双层重叠
  if (layer.vertical) return drawVerticalLayer(c, layer, w, h, scale);
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

  const rot = (layer.rotate || 0) * Math.PI / 180;
  c.save();
  if (rot) { const cx = bx + bw / 2, cy = by + bh / 2; c.translate(cx, cy); c.rotate(rot); c.translate(-cx, -cy); }

  if (layer.bgOn) {
    c.save();
    c.fillStyle = hexA(layer.bgColor, layer.bgAlpha != null ? layer.bgAlpha : 0.55);
    roundRect(c, bx, by, bw, bh, Math.min((layer.bgRadius || 0) * scale, bw / 2, bh / 2));
    c.fill();
    if (layer.borderOn && layer.borderWidth > 0) { c.lineWidth = layer.borderWidth * scale; c.strokeStyle = layer.borderColor; c.stroke(); }
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
    c.shadowBlur = 6 * scale; c.shadowOffsetX = 3 * scale; c.shadowOffsetY = 3 * scale;
    c.fillStyle = layer.color;
    lines.forEach((ln, i) => { if (ln) c.fillText(ln, lineX(i), boxY + i * lineHeight); });
    c.restore();
  }
  if (layer.glow) {
    c.save();
    c.shadowColor = layer.glowColor || layer.color;
    c.shadowBlur = 16 * scale; c.shadowOffsetX = 0; c.shadowOffsetY = 0;
    c.fillStyle = layer.color;
    for (let g = 0; g < 3; g++) lines.forEach((ln, i) => { if (ln) c.fillText(ln, lineX(i), boxY + i * lineHeight); });
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

  c.restore();
  layer._box = { x: bx, y: by, w: bw, h: bh };
}

// 竖排文字（每个 \n 行=一列，从右往左）
function drawVerticalLayer(c, layer, w, h, scale) {
  const fontSize = layer.fontSize * scale;
  c.font = `${layer.bold ? 'bold ' : ''}${fontSize}px ${FONT_STACK}`;
  c.textBaseline = 'top';
  const cols = layer.text.split('\n');
  const charStep = fontSize * 1.06;
  const colStep = fontSize * (layer.lineHeight || 1.25);
  const maxLen = Math.max(...cols.map(s => Array.from(s).length), 1);
  const totalH = maxLen * charStep;
  const totalW = cols.length * colStep;
  const padX = Math.max(8 * scale, fontSize * 0.28);
  const padY = padX;
  const boxX = layer.xPct * w, boxY = layer.yPct * h;
  const bx = boxX - padX, by = boxY - padY, bw = totalW + padX * 2, bh = totalH + padY * 2;

  const rot = (layer.rotate || 0) * Math.PI / 180;
  c.save();
  if (rot) { const cx = bx + bw / 2, cy = by + bh / 2; c.translate(cx, cy); c.rotate(rot); c.translate(-cx, -cy); }

  if (layer.bgOn) {
    c.save();
    c.fillStyle = hexA(layer.bgColor, layer.bgAlpha != null ? layer.bgAlpha : 0.55);
    roundRect(c, bx, by, bw, bh, Math.min((layer.bgRadius || 0) * scale, bw / 2, bh / 2));
    c.fill();
    if (layer.borderOn && layer.borderWidth > 0) { c.lineWidth = layer.borderWidth * scale; c.strokeStyle = layer.borderColor; c.stroke(); }
    c.restore();
  }
  const drawChars = (fn) => {
    cols.forEach((seg, ci) => {
      const x = boxX + (cols.length - 1 - ci) * colStep;
      Array.from(seg).forEach((ch, j) => {
        const cw = c.measureText(ch).width;
        fn(ch, x + (fontSize - cw) / 2, boxY + j * charStep);
      });
    });
  };
  if (layer.strokeOn && layer.strokeWidth > 0) {
    c.save(); c.lineJoin = 'round'; c.miterLimit = 2; c.lineWidth = layer.strokeWidth * scale; c.strokeStyle = layer.strokeColor;
    drawChars((ch, x, y) => c.strokeText(ch, x, y)); c.restore();
  }
  c.save(); c.fillStyle = layer.color;
  drawChars((ch, x, y) => c.fillText(ch, x, y)); c.restore();

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
  if (inlineEdit.active) return; // 编辑中不画控制点
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
  [['nw', -hs, -hs, 'nwse-resize'], ['ne', b.w - hs, -hs, 'nesw-resize'], ['sw', -hs, b.h - hs, 'nesw-resize'], ['se', b.w - hs, b.h - hs, 'nwse-resize'],
   ['w', -hs, b.h / 2 - hs, 'ew-resize'], ['e', b.w - hs, b.h / 2 - hs, 'ew-resize'],
   ['n', b.w / 2 - hs, -hs, 'ns-resize'], ['s', b.w / 2 - hs, b.h - hs, 'ns-resize']].forEach(([h, x, y, cur]) => {
    const hd = document.createElement('div');
    hd.className = 'wb-rh'; hd.dataset.rh = h; hd.dataset.layerId = layer.id;
    hd.style.cssText = `left:${ox + b.x + x}px;top:${oy + b.y + y}px;cursor:${cur};`;
    wrap.appendChild(hd);
  });
  // 旋转手柄（位于选中框上方中点）
  const rotX = ox + b.x + b.w / 2, rotY = oy + b.y - 26;
  const stem = document.createElement('div');
  stem.className = 'wb-rot-stem';
  stem.style.cssText = `left:${rotX}px;top:${oy + b.y - 26}px;height:26px;`;
  wrap.appendChild(stem);
  const rot = document.createElement('div');
  rot.className = 'wb-rot-handle'; rot.dataset.rotHandle = layer.id; rot.title = '拖动旋转';
  rot.style.cssText = `left:${rotX - 9}px;top:${rotY - 9}px;`;
  wrap.appendChild(rot);
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
  // 模式与裁剪/水印框严格同步：离开对应模式即清掉框，杜绝残留
  if (canvasMode === 'crop') { if (!cropRect) initCropRect(); } else { cropRect = null; }
  if (canvasMode !== 'watermark') { wmRect = null; }
  commitInlineEdit();
  refreshDock();
  refreshModeBadge();
  drawAll();
  renderHandles();
}

function bindDock() {
  const dock = document.getElementById('wb-dock');
  if (!dock) return;
  dock.addEventListener('click', e => {
    if (e.target.id === 'wb-dock-save') { saveCurrentWorkbench(); return; }
    const toolBtn = e.target.closest('[data-tool]');
    if (toolBtn) { setTool(toolBtn.dataset.tool); return; }
    if (e.target.id === 'wb-dock-collapse') { activeTool = null; canvasMode = 'text'; cropRect = null; wmRect = null; refreshDock(); refreshModeBadge(); drawAll(); renderHandles(); return; }
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
  // 先退出裁剪模式并清掉裁剪框，再换底图重绘 —— 避免新尺寸下裁剪框残留/跳动
  activeTool = null; canvasMode = 'text'; cropRect = null;
  refreshDock(); refreshModeBadge();
  setBaseDataUrl(out.toDataURL('image/png'), () => showToast('已应用裁剪'));
}

function applySubtitleCrop() {
  pushUndo();
  const keepH = Math.round(baseH * (1 - subtitleFrac));
  const out = document.createElement('canvas');
  out.width = baseW; out.height = keepH;
  out.getContext('2d').drawImage(baseImageEl, 0, 0, baseW, keepH, 0, 0, baseW, keepH);
  activeTool = null; canvasMode = 'text';
  refreshDock(); refreshModeBadge();
  setBaseDataUrl(out.toDataURL('image/png'), () => showToast('已裁掉底部字幕区'));
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
    if (inlineEdit.active) commitInlineEdit();

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
      if (changed) { refreshStyle(); focusFormatTab(); refreshQueueStatus(); }
      drawAll(); renderHandles(); e.preventDefault();
    } else if (selectedLayerId) {
      selectedLayerId = null; refreshStyle(); drawAll(); renderHandles();
    }
  });

  document.addEventListener('mousemove', onCanvasMove);
  document.addEventListener('mouseup', onCanvasUp);

  // text 缩放控制点 / 旋转手柄
  wrap.addEventListener('mousedown', e => {
    const rh = e.target.closest('.wb-rot-handle');
    if (rh) {
      e.preventDefault(); e.stopPropagation();
      const layer = project().layers.find(l => l.id === rh.dataset.rotHandle);
      if (!layer || !layer._box) return;
      selectedLayerId = layer.id;
      pushUndo();
      const cr = canvas.getBoundingClientRect();
      const cx = layer._box.x + layer._box.w / 2, cy = layer._box.y + layer._box.h / 2;
      const px = e.clientX - cr.left, py = e.clientY - cr.top;
      rotateDrag = { active: true, layerId: layer.id, cx, cy, startAngle: Math.atan2(py - cy, px - cx), startRotate: layer.rotate || 0 };
      return;
    }
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
    resize = { active: true, layerId: layer.id, handle: hd.dataset.rh, sx: e.clientX, sy: e.clientY, startFont: layer.fontSize, startWidth: layer.textWidth || Math.round((baseW || 800) * 0.8), startBoxW: layer._box.w, startBoxH: layer._box.h };
  });

  canvas.addEventListener('dblclick', e => {
    if (canvasMode !== 'text') return;
    const rect = canvas.getBoundingClientRect();
    const px = e.clientX - rect.left, py = e.clientY - rect.top;
    const layers = project().layers;
    let hit = null;
    for (let i = layers.length - 1; i >= 0; i--) {
      const b = layers[i]._box; if (!b) continue;
      if (px >= b.x - 4 && px <= b.x + b.w + 4 && py >= b.y - 4 && py <= b.y + b.h + 4) { hit = layers[i]; break; }
    }
    if (hit) { selectedLayerId = hit.id; refreshStyle(); editLayerInline(hit); }
  });
}

// 画布上直接编辑：在文字层位置叠一个 textarea
function editLayerInline(layer) {
  commitInlineEdit();
  const wrap = document.getElementById('wb-canvas-wrap');
  if (!wrap || !layer._box) return;
  pushUndo();
  const b = layer._box;
  const ta = document.createElement('textarea');
  ta.className = 'wb-inline-edit';
  ta.value = layer.text || '';
  const fontPx = Math.min(48, Math.max(15, layer.fontSize * viewScale));  // 编辑字号取易读区间，过大字号也能看清光标
  ta.style.cssText = `left:${b.x}px;top:${b.y}px;width:${Math.max(120, b.w)}px;min-height:${Math.max(40, Math.min(b.h, 180))}px;`
    + `font-size:${fontPx}px;line-height:1.4;text-align:${layer.align || 'center'};`;
  wrap.appendChild(ta);
  inlineEdit = { active: true, layerId: layer.id, el: ta };
  ta.focus();
  ta.setSelectionRange(0, ta.value.length);  // 全选，明确进入编辑态
  ta.addEventListener('input', () => {
    const l = project().layers.find(x => x.id === inlineEdit.layerId);
    if (!l) return;
    l.text = ta.value;
    drawAll();
    // 同步右侧"当前选中文字"文本框（不重渲染，保持画布编辑焦点）
    const sel = document.getElementById('wb-sel-text');
    if (sel) sel.value = ta.value;
  });
  ta.addEventListener('keydown', ev => {
    if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); commitInlineEdit(); }
    else if (ev.key === 'Escape') { ev.preventDefault(); commitInlineEdit(); }
  });
  ta.addEventListener('blur', () => commitInlineEdit());
}
function commitInlineEdit() {
  if (!inlineEdit.active) return;
  const el = inlineEdit.el;
  const lid = inlineEdit.layerId;
  inlineEdit = { active: false, layerId: null, el: null };
  if (el && el.parentNode) el.parentNode.removeChild(el);
  const l = project().layers.find(x => x.id === lid);
  if (l) l.text = el ? el.value : l.text;
  markDirty();
  refreshStyle();
  drawAll();
  renderHandles();
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

  if (rotateDrag.active) {
    const layer = project().layers.find(l => l.id === rotateDrag.layerId); if (!layer) return;
    const ang = Math.atan2(py - rotateDrag.cy, px - rotateDrag.cx);
    let deg = rotateDrag.startRotate + (ang - rotateDrag.startAngle) * 180 / Math.PI;
    deg = ((deg + 180) % 360 + 360) % 360 - 180; // 归一化到 -180~180
    layer.rotate = Math.round(deg);
    drawAll(); renderHandles(); syncRotateDisplay(layer); return;
  }
  if (drag.active) {
    const layer = project().layers.find(l => l.id === drag.layerId); if (!layer) return;
    layer.xPct = (px - drag.ox) / viewW; layer.yPct = (py - drag.oy) / viewH;
    drawAll(); renderHandles(); return;
  }
  if (resize.active) {
    const layer = project().layers.find(l => l.id === resize.layerId); if (!layer) return;
    const dx = e.clientX - resize.sx;
    const dy = e.clientY - resize.sy;
    const h = resize.handle;
    if (['nw', 'ne', 'sw', 'se'].includes(h)) {
      // 四角：等比改字号（宽度同步），用对角位移取较大者，手感更稳
      const dirX = (h === 'se' || h === 'ne') ? 1 : -1;
      const dirY = (h === 'se' || h === 'sw') ? 1 : -1;
      const eff = Math.abs(dx * dirX) >= Math.abs(dy * dirY) ? dx * dirX : dy * dirY;
      const base = Math.max(20, resize.startBoxW);
      const factor = Math.max(0.2, (base + eff) / base);
      layer.fontSize = Math.max(12, Math.round(resize.startFont * factor));
      layer.textWidth = Math.max(40, Math.round(resize.startWidth * factor));
    } else if (h === 'e' || h === 'w') {
      // 左右：改文字框宽度（自动换行）
      const dir = h === 'w' ? -1 : 1;
      layer.textWidth = Math.max(40, Math.round(resize.startWidth + (dx * dir) / viewScale));
    } else {
      // 上下：改字号（高度跟随，多行区域随之变化）
      const dir = h === 's' ? 1 : -1;
      const base = Math.max(20, resize.startBoxH);
      const factor = Math.max(0.2, (base + dy * dir) / base);
      layer.fontSize = Math.max(12, Math.round(resize.startFont * factor));
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
  if (rotateDrag.active) { rotateDrag.active = false; markDirty(); refreshStyle(); }
  cropDrag.active = false;
  cropHandleDrag.active = false;
  if (wmDrag.active) { wmDrag.active = false; if (wmRect && (wmRect.w < 8 || wmRect.h < 8)) wmRect = null; renderHandles(); }
}
function syncFontSlider(layer) {
  const sl = document.querySelector('[data-lslider="fontSize"]');
  if (sl) { const inp = sl.querySelector('input'); const v = sl.querySelector('.wb-sval'); if (inp) inp.value = layer.fontSize; if (v) v.textContent = Math.round(layer.fontSize); }
}
function syncRotateDisplay(layer) {
  const num = document.querySelector('[data-lp-num="rotate"]');
  if (num) num.value = Math.round(layer.rotate || 0);
  const disp = document.getElementById('wb-rot-display');
  if (disp) disp.textContent = `${Math.round(layer.rotate || 0)}°`;
}

// ===== 右侧事件 =====
function bindRight() {
  const right = document.getElementById('wb-right');
  if (!right) return;

  right.addEventListener('click', e => {
    const rt = e.target.closest('[data-rtab]');
    if (rt && rt.parentElement && rt.parentElement.id === 'wb-right-tabs') {
      const dual = document.getElementById('wb-right-dual');
      if (dual) dual.dataset.rtab = rt.dataset.rtab;
      document.querySelectorAll('#wb-right-tabs [data-rtab]').forEach(b => b.classList.toggle('active', b === rt));
      return;
    }
    const acc = e.target.closest('[data-acc-toggle]');
    if (acc) { const k = acc.dataset.accToggle; accordion[k] = !accordion[k]; refreshRight(); return; }
    handleRightClick(e);
  });
  right.addEventListener('input', handleRightInput);
  // 在编辑样式/文字内容前记录一次撤销点（聚焦即记录，连续微调合并为一步）
  right.addEventListener('focusin', e => {
    if (e.target.id === 'wb-sel-text' || e.target.dataset.lp || e.target.dataset.lpNum || e.target.closest('[data-lslider]')) {
      if (currentLayer()) pushUndo();
    }
  });
}

function handleRightClick(e) {
  const p = project();
  // 模板应用方式切换
  if (e.target.name === 'tplmode') { tplBringText = e.target.value === 'full'; return; }
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
  const rb = e.target.closest('[data-rot]'); if (rb) { const l = currentLayer(); if (!l) { showToast('请先选中文字'); return; } pushUndo(); const d = +rb.dataset.rot; let nr = d === 0 ? 0 : (l.rotate || 0) + d; nr = ((nr + 180) % 360 + 360) % 360 - 180; l.rotate = nr; drawAll(); renderHandles(); syncRotateDisplay(l); markDirty(); return; }
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
  if (e.target.id === 'wb-title-kw') {
    p.scripts.keyword = e.target.value;
    // 候选标题随关键词实时变化（只更新候选区，不动输入框，保住焦点）
    const cands = document.getElementById('wb-title-cands');
    if (cands) cands.innerHTML = buildTitleCandidates(p.scripts.keyword).map(c => `<button class="wb-cand" data-title-cand="${escapeAttr(c)}">${escapeHTML(c)}</button>`).join('');
    return;
  }
  if (e.target.id === 'wb-title-text') { p.scripts.title = e.target.value; return; }
  if (e.target.id === 'wb-body-text') { p.scripts.body = e.target.value; return; }
  if (e.target.classList.contains('wb-step-input')) { const i = +e.target.closest('.wb-step-row').dataset.stepIdx; p.scripts.steps[i] = e.target.value; return; }
  // 当前选中文字
  if (e.target.id === 'wb-sel-text') {
    const l = currentLayer(); if (!l) return;
    l.text = e.target.value; drawAll(); renderHandles(); markDirty(); return;
  }
  // 数值型样式属性（如旋转角度）
  const lpn = e.target.dataset.lpNum;
  if (lpn) {
    const l = currentLayer(); if (!l) return;
    let v = parseFloat(e.target.value) || 0;
    if (lpn === 'rotate') { v = Math.max(-180, Math.min(180, v)); }
    l[lpn] = v;
    const disp = document.getElementById('wb-rot-display'); if (disp && lpn === 'rotate') disp.textContent = `${Math.round(v)}°`;
    drawAll(); renderHandles(); markDirty(); return;
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
    rotate: 0, vertical: false, glow: false, glowColor: '#00e5ff',
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
  refreshStyle(); focusFormatTab(); drawAll(); renderHandles(); refreshQueueStatus();
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
  // 保存完整文字层（含文字内容 text、名称、旋转/竖排等），仅去掉运行时字段
  const { _box, id, ...rest } = l;
  return { ...rest };
}
function placeholderFor(kind) { return kind === 'title' ? '标题文字' : kind === 'step' ? '步骤文字' : kind === 'body' ? '正文文字' : '文字'; }
function saveTemplatePrompt() {
  const p = project();
  if (!p.layers.length) { showToast('当前画面没有文字层，无法保存模板'); return; }
  const name = prompt('成图模板名称（如：美食步骤图-黄字黑边）：');
  if (!name || !name.trim()) return;
  const tpls = getTemplates();
  tpls.push({ name: name.trim(), layers: p.layers.map(layerToTpl) });
  setTemplates(tpls);
  p.templateName = name.trim();
  refreshTemplateBlock();
  showToast(`已保存当前画面为模板（${p.layers.length} 个文字层）`);
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
  p.layers = tpl.layers.map((t, i) => {
    const layer = { ...defaultStyle(), ...t, id: `L-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 5)}` };
    if (!tplBringText) layer.text = placeholderFor(t.kind);  // 仅套样式：用占位文字
    else if (!layer.text) layer.text = placeholderFor(t.kind);
    if (!layer.name) layer.name = placeholderFor(t.kind);
    return layer;
  });
  p.templateName = tpl.name;
  selectedLayerId = p.layers[0]?.id || null;
  markDirty();
  refreshStyle(); focusFormatTab(); drawAll(); renderHandles(); refreshQueueStatus();
  showToast(tplBringText ? `已应用模板：${tpl.name}，可双击画布文字直接改字` : `已套用模板样式：${tpl.name}`);
}

// ===== 队列事件 =====
function bindQueue() {
  const qel = document.getElementById('wb-queue');
  if (!qel) return;
  qel.addEventListener('change', e => {
    const cb = e.target.closest('[data-frame-check]');
    if (cb) {
      const id = cb.dataset.frameCheck;
      if (e.target.checked) batchSelectedIds.add(id);
      else batchSelectedIds.delete(id);
      refreshBatchBar();
    }
  });
  qel.addEventListener('click', e => {
    if (e.target.closest('.wb-qcheck')) { e.stopPropagation(); return; }
    const del = e.target.closest('[data-frame-del]');
    if (del) { e.stopPropagation(); deleteFrame(del.dataset.frameDel); return; }
    if (e.target.id === 'wb-sel-all') { framesRef.forEach(f => batchSelectedIds.add(f.id)); refreshBatchBar(); refreshQueueChecks(); return; }
    if (e.target.id === 'wb-sel-none') { batchSelectedIds.clear(); refreshBatchBar(); refreshQueueChecks(); return; }
    if (e.target.id === 'wb-batch-export-png') { batchExportPNGs(); return; }
    if (e.target.id === 'wb-batch-export-zip') { batchExportZip(); return; }
    const card = e.target.closest('.wb-qcard');
    if (!card) return;
    const id = card.dataset.frameId;
    if (id === currentFrameId) return;
    switchFrame(id);
  });
}
function deleteFrame(id) {
  if (!window.confirm('确定删除这张图片吗？删除后该图的文字、处理结果和保存状态也会一起删除。')) return;
  batchSelectedIds.delete(id);
  commitInlineEdit();
  const idx = framesRef.findIndex(f => f.id === id);
  let newCurrent = currentFrameId;
  if (id === currentFrameId) {
    const next = framesRef[idx + 1] || framesRef[idx - 1];
    newCurrent = next ? next.id : null;
  }
  // app 端负责从素材池移除、清理 editProjects/editResults、修正 selectedFrameId/workbenchFrameId 并整页重渲染
  onDeleteFrameCb?.(id, newCurrent);
}
function switchFrame(id) {
  commitInlineEdit();
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
  commitInlineEdit();
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
// 合成当前图(底图+文字层)为 dataUrl，回调 cb(dataUrl)
function composeCurrent(cb) {
  commitInlineEdit();
  const frame = currentFrame(); const p = project();
  if (!frame || !p) { showToast('没有当前图'); cb && cb(null); return; }
  const img = new Image();
  img.onload = () => {
    const W = img.naturalWidth, H = img.naturalHeight;
    const out = document.createElement('canvas');
    out.width = W; out.height = H;
    const oc = out.getContext('2d');
    oc.imageSmoothingEnabled = true; oc.imageSmoothingQuality = 'high';
    oc.drawImage(img, 0, 0, W, H);
    p.layers.forEach(l => drawLayer(oc, l, W, H, 1));
    cb && cb(out.toDataURL('image/png'), frame, p);
  };
  img.onerror = () => { showToast('底图加载失败'); cb && cb(null); };
  img.src = p.baseDataUrl || frame.sourceDataUrl;
}
export function saveCurrentWorkbench() {
  composeCurrent((dataUrl, frame, p) => {
    if (!dataUrl) return;
    onSaveResultCb?.({ frameId: frame.id, dataUrl });
    p.saved = true;
    refreshQueue();
    showToast('已保存当前成图');
  });
}
// 导出当前单图（PNG）；未保存则自动用当前状态合成
export function exportCurrentWorkbenchImage() {
  composeCurrent((dataUrl, frame) => {
    if (!dataUrl) return;
    const a = document.createElement('a');
    a.href = dataUrl; a.download = `成图_${(frame && frame.materialName) || Date.now()}.png`;
    document.body.appendChild(a); a.click(); a.remove();
    showToast('已导出当前单图');
  });
}
// 复制当前图正文（发布文案，不上图）
export function copyCurrentWorkbenchBody() {
  const body = (project().scripts.body || '').trim();
  if (!body) { showToast('当前正文为空'); return; }
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(body).then(() => showToast('已复制正文')).catch(() => fallbackCopyWb(body));
  else fallbackCopyWb(body);
}
function fallbackCopyWb(t) { const ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); showToast('已复制正文'); } catch (e) { showToast('复制失败'); } ta.remove(); }
// 导出当前图正文为 txt
export function exportCurrentWorkbenchBody() {
  const frame = currentFrame();
  const body = (project().scripts.body || '').trim();
  if (!body) { showToast('当前正文为空'); return; }
  const name = (frame && frame.materialName) || ('素材' + Date.now());
  const blob = new Blob([body], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = `${name}_正文.txt`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  showToast('已导出正文 txt');
}

// ===== 批量处理 =====
function composeFrame(frameId, cb) {
  const frame = framesRef.find(f => f.id === frameId);
  const p = ensureProject(frameId);
  if (!frame || !p) { cb && cb(null); return; }
  const img = new Image();
  img.onload = () => {
    const W = img.naturalWidth, H = img.naturalHeight;
    const out = document.createElement('canvas');
    out.width = W; out.height = H;
    const oc = out.getContext('2d');
    oc.imageSmoothingEnabled = true; oc.imageSmoothingQuality = 'high';
    oc.drawImage(img, 0, 0, W, H);
    (p.layers || []).forEach(l => drawLayer(oc, l, W, H, 1));
    cb && cb(out.toDataURL('image/png'), frame, p);
  };
  img.onerror = () => { cb && cb(null); };
  img.src = p.baseDataUrl || frame.sourceDataUrl;
}

// 批量改比例：后续版本实现为非破坏性导出参数（不修改 baseDataUrl，不写白边进原图，只在导出时临时生成目标比例图片）

function batchExportPNGs() {
  const ids = [...batchSelectedIds].filter(id => framesRef.find(f => f.id === id));
  if (ids.length === 0) { showToast('请先选择要导出的图片'); return; }
  showToast(`正在导出 ${ids.length} 张...`);
  let i = 0;
  function next() {
    if (i >= ids.length) { showToast(`已导出 ${ids.length} 张图片`); return; }
    const id = ids[i++];
    const idx = framesRef.findIndex(f => f.id === id);
    composeFrame(id, dataUrl => {
      if (dataUrl) {
        const a = document.createElement('a');
        a.href = dataUrl; a.download = `image-${String(idx + 1).padStart(3, '0')}.png`;
        document.body.appendChild(a); a.click(); a.remove();
      }
      setTimeout(next, 120);
    });
  }
  next();
}

function batchExportZip() {
  const ids = [...batchSelectedIds].filter(id => framesRef.find(f => f.id === id));
  if (ids.length === 0) { showToast('请先选择要导出的图片'); return; }
  showToast(`正在合成 ${ids.length} 张图片...`);
  const files = [];
  let i = 0;
  function next() {
    if (i >= ids.length) {
      if (files.length === 0) { showToast('没有可打包的图片'); return; }
      const zip = makeZipWb(files);
      const blob = new Blob([zip], { type: 'application/zip' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `成图_批量导出_${Date.now()}.zip`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 3000);
      showToast(`已打包 ${files.length} 张图片`);
      return;
    }
    const id = ids[i++];
    const idx = framesRef.findIndex(f => f.id === id);
    composeFrame(id, dataUrl => {
      if (dataUrl) files.push({ name: `image-${String(idx + 1).padStart(3, '0')}.png`, data: dataUrlToBytesWb(dataUrl) });
      next();
    });
  }
  next();
}

// ===== ZIP 工具（批量导出用）=====
function dataUrlToBytesWb(dataUrl) { const b64 = dataUrl.split(',')[1]; const bin = atob(b64); const arr = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i); return arr; }
const CRC_TABLE_WB = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32Wb(bytes) { let c = 0xFFFFFFFF; for (let i = 0; i < bytes.length; i++) c = CRC_TABLE_WB[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
function makeZipWb(files) {
  const enc = new TextEncoder();
  const locals = [], centrals = []; let offset = 0;
  files.forEach(f => {
    const name = enc.encode(f.name), data = f.data, crc = crc32Wb(data);
    const lh = new Uint8Array(30 + name.length); const dv = new DataView(lh.buffer);
    dv.setUint32(0, 0x04034b50, true); dv.setUint16(4, 20, true); dv.setUint16(6, 0, true); dv.setUint16(8, 0, true);
    dv.setUint16(10, 0, true); dv.setUint16(12, 0, true); dv.setUint32(14, crc, true); dv.setUint32(18, data.length, true); dv.setUint32(22, data.length, true);
    dv.setUint16(26, name.length, true); dv.setUint16(28, 0, true); lh.set(name, 30);
    locals.push(lh, data);
    const ch = new Uint8Array(46 + name.length); const cv = new DataView(ch.buffer);
    cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true); cv.setUint16(8, 0, true); cv.setUint16(10, 0, true);
    cv.setUint16(12, 0, true); cv.setUint16(14, 0, true); cv.setUint32(16, crc, true); cv.setUint32(20, data.length, true); cv.setUint32(24, data.length, true);
    cv.setUint16(28, name.length, true); cv.setUint32(42, offset, true); ch.set(name, 46);
    centrals.push(ch);
    offset += lh.length + data.length;
  });
  const cdSize = centrals.reduce((s, a) => s + a.length, 0); const cdOffset = offset;
  const end = new Uint8Array(22); const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, files.length, true); ev.setUint16(10, files.length, true); ev.setUint32(12, cdSize, true); ev.setUint32(16, cdOffset, true);
  const parts = [...locals, ...centrals, end];
  let total = 0; parts.forEach(p => total += p.length);
  const out = new Uint8Array(total); let pos = 0; parts.forEach(p => { out.set(p, pos); pos += p.length; });
  return out;
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
// 窄屏 Tab 模式下，加入文字/选中后切到「文字格式」工作区（宽屏两栏并排，无副作用）
function focusFormatTab() {
  const dual = document.getElementById('wb-right-dual');
  if (dual) dual.dataset.rtab = 'format';
  document.querySelectorAll('#wb-right-tabs [data-rtab]').forEach(b => b.classList.toggle('active', b.dataset.rtab === 'format'));
}
// 文字格式工作区（含当前选中文字 + 样式）局部刷新
function refreshStyle() {
  const box = document.getElementById('wb-format');
  if (!box) { refreshRight(); return; }
  box.innerHTML = renderStyleBlock();
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
function refreshBatchBar() {
  const bar = document.getElementById('wb-batch-bar');
  if (!bar) { refreshQueue(); return; }
  const tmp = document.createElement('div');
  tmp.innerHTML = renderBatchBar();
  bar.replaceWith(tmp.firstElementChild);
}
function refreshQueueChecks() {
  document.querySelectorAll('[data-frame-check]').forEach(el => {
    el.checked = batchSelectedIds.has(el.dataset.frameCheck);
  });
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

// 供「拼图导出」页复用艺术字预设（纯数据，无副作用）
export { ART_PRESETS, ART_GROUP_A, ART_GROUP_B, ART_GROUP_C };
