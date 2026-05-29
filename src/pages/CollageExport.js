// ===== 拼图导出 / 出成品图工作台 (第一版可用) =====
//
// 与 app.js 契约：
//   renderCollageExport({ frames, editResults, editProjects, collage, onToast }) -> HTML
//   initCollageExport()  绑定事件、加载图片、首次绘制
//
// 设计空间(design space)：按所选比例确定 designW×designH（长边 1080）。
// 所有布局/文字/贴图坐标都在 design 空间；预览按 sPrev 缩放，导出按 1:1（可选HD 2x）。
// 不接 AI / 不联网 / 不引入外部依赖；ZIP 用内置 store 实现。
//
// ===== TODO（后续“批量操作 / 批量处理”，本轮未做，勿遗漏）=====
// 成图编辑页(EditWorkbench)：多选图片 / 批量保存 / 批量应用裁剪 / 批量调色 /
//   批量清晰 / 批量字幕裁切 / 批量改比例(3:4、4:3 等)。
// 拼图导出页(本文件)：多个拼图工程统一导出 / ZIP 批量打包 / 批量导出单图·拼图·文案。
// 当前已具备单工程 ZIP(拼图+单图+copy.txt)，批量为多工程循环导出，后续补。
// 后续「画布与边框/背景」增强(本轮未做)：
//   小红书风背景(备忘录/便签纸/手账纸/网格纸/撕纸/拍立得白边/杂志卡片/奶油纸/豆沙纸/牛皮纸)，
//   优先 CSS/SVG/本地绘制，不接外部素材 API。
//   外部导入背景：上传图片为背景 / Ctrl+V 粘贴为背景 / 替换背景 / 清除背景 / 背景缩放·位置·透明度。
//   (本轮已支持：粘贴图「置为背景」+ 右侧背景图调整面板，作为外部背景的基础。)

import { ART_PRESETS, ART_GROUP_A, ART_GROUP_B, ART_GROUP_C } from './EditWorkbench.js';

const FONT_STACK = '"Microsoft YaHei","PingFang SC",Arial,sans-serif';
const LH = 1.3;

// 发布场景 → 比例
const PUBLISH_PRESETS = [
  { id: 'xhs34', label: '小红书竖图', ratio: '3:4' },
  { id: 'xhs45', label: '小红书封面', ratio: '4:5' },
  { id: 'dy916', label: '抖音/视频号', ratio: '9:16' },
  { id: 'sq11', label: '方图', ratio: '1:1' },
  { id: 'cover169', label: '横版封面', ratio: '16:9' },
  { id: 'wide21', label: '宽图', ratio: '2:1' },
  { id: 'cinema', label: '电影感', ratio: '2.35:1' },
];
const RATIOS = ['1:1', '3:4', '4:5', '9:16', '16:9', '4:3', '2:3', '2:1', '2.35:1', '自定义'];

const LAYOUTS = [
  { id: 'single', label: '单图', cols: 1 },
  { id: 'g2', label: '2拼', cols: 2 },
  { id: 'g3', label: '3拼', cols: 3 },
  { id: 'g4', label: '4拼', cols: 2 },
  { id: 'g6', label: '6拼', cols: 3 },
  { id: 'g8', label: '8拼', cols: 4 },
  { id: 'g9', label: '9拼', cols: 3 },
  { id: 'long', label: '长图', cols: 1 },
  { id: 'custom', label: '自定义', cols: 2 },
];

// 外框模板
const FRAMES = ['无边框', '细白边', '细黑边', '奶油边框', '圆角卡片', '小红书白卡', '国风宣纸', '木纹菜单', '黑金高级', '虚线手账', '拍立得', '胶片'];

// 拼图样式（规则宫格 + 不规则版式 + 自由摆放）
const PIN_STYLES = [
  { id: 'single', label: '单图成品' },
  { id: 'grid', label: '规则宫格' },
  { id: 'left-big-2', label: '左大右二' },
  { id: 'right-big-2', label: '右大左二' },
  { id: 'top-big-2', label: '上大下二' },
  { id: 'bottom-big-2', label: '下大上二' },
  { id: 'one-big-3', label: '一大三小' },
  { id: 'one-big-4', label: '一大四小' },
  { id: 'magazine', label: '杂志风' },
  { id: 'scattered', label: '错落卡片' },
  { id: 'polaroid-stack', label: '拍立得叠放' },
  { id: 'free', label: '自由摆放' },
];
// 不规则版式槽位（content 区内的分数坐标 {x,y,w,h,rot?}），按参与图前 N 张填充
function slotsFor(style, n) {
  const g = 0; // 间距由 gap 在外部统一处理（这里返回基础分数，绘制时收缩）
  switch (style) {
    case 'single': return [{ x: 0, y: 0, w: 1, h: 1 }];
    case 'left-big-2': return [{ x: 0, y: 0, w: 0.62, h: 1 }, { x: 0.64, y: 0, w: 0.36, h: 0.49 }, { x: 0.64, y: 0.51, w: 0.36, h: 0.49 }];
    case 'right-big-2': return [{ x: 0.38, y: 0, w: 0.62, h: 1 }, { x: 0, y: 0, w: 0.36, h: 0.49 }, { x: 0, y: 0.51, w: 0.36, h: 0.49 }];
    case 'top-big-2': return [{ x: 0, y: 0, w: 1, h: 0.62 }, { x: 0, y: 0.64, w: 0.49, h: 0.36 }, { x: 0.51, y: 0.64, w: 0.49, h: 0.36 }];
    case 'bottom-big-2': return [{ x: 0, y: 0.38, w: 1, h: 0.62 }, { x: 0, y: 0, w: 0.49, h: 0.36 }, { x: 0.51, y: 0, w: 0.49, h: 0.36 }];
    case 'one-big-3': return [{ x: 0, y: 0, w: 0.6, h: 1 }, { x: 0.62, y: 0, w: 0.38, h: 0.32 }, { x: 0.62, y: 0.34, w: 0.38, h: 0.32 }, { x: 0.62, y: 0.68, w: 0.38, h: 0.32 }];
    case 'one-big-4': return [{ x: 0, y: 0, w: 1, h: 0.58 }, { x: 0, y: 0.6, w: 0.235, h: 0.4 }, { x: 0.255, y: 0.6, w: 0.235, h: 0.4 }, { x: 0.51, y: 0.6, w: 0.235, h: 0.4 }, { x: 0.765, y: 0.6, w: 0.235, h: 0.4 }];
    case 'magazine': return [{ x: 0, y: 0, w: 0.64, h: 0.64 }, { x: 0.66, y: 0, w: 0.34, h: 0.64 }, { x: 0, y: 0.66, w: 0.32, h: 0.34 }, { x: 0.34, y: 0.66, w: 0.32, h: 0.34 }, { x: 0.68, y: 0.66, w: 0.32, h: 0.34 }];
    case 'scattered': return [{ x: 0.02, y: 0.04, w: 0.5, h: 0.46, rot: -4 }, { x: 0.48, y: 0.02, w: 0.5, h: 0.46, rot: 5 }, { x: 0.04, y: 0.52, w: 0.5, h: 0.46, rot: 3 }, { x: 0.46, y: 0.52, w: 0.52, h: 0.46, rot: -5 }];
    case 'polaroid-stack': return [{ x: 0.06, y: 0.1, w: 0.52, h: 0.62, rot: -7 }, { x: 0.4, y: 0.16, w: 0.52, h: 0.62, rot: 6 }, { x: 0.24, y: 0.3, w: 0.52, h: 0.62, rot: -2 }];
    default: return null;
  }
}

// 背景预设
const BG_PRESETS = [
  { id: 'white', label: '纯白', type: 'solid', color: '#ffffff' },
  { id: 'cream', label: '奶油', type: 'solid', color: '#fdf6e3' },
  { id: 'gray', label: '浅灰', type: 'solid', color: '#f0f2f5' },
  { id: 'pink', label: '粉', type: 'solid', color: '#ffeef0' },
  { id: 'dark', label: '深色', type: 'solid', color: '#1a1a1a' },
  { id: 'warm-grad', label: '暖渐变', type: 'grad', color: '#ffe7c2', color2: '#ffd0a6' },
  { id: 'green-grad', label: '清新渐变', type: 'grad', color: '#e8f5e9', color2: '#c8e6c9' },
  { id: 'blue-grad', label: '冷渐变', type: 'grad', color: '#e3f2fd', color2: '#bbdefb' },
  // 小红书风（本地 Canvas pattern 绘制，零素材成本）
  { id: 'memo', label: '备忘录', type: 'pattern', color: '#fffaee', line: 'rgba(184,148,86,0.35)' },
  { id: 'sticky', label: '便签纸', type: 'pattern', color: '#fff9c4' },
  { id: 'journal', label: '手账纸', type: 'pattern', color: '#fffaf2', dot: '#d8c9a8' },
  { id: 'grid-paper', label: '网格纸', type: 'pattern', color: '#fafaf2', line: '#e6e2d2' },
  { id: 'torn', label: '撕纸', type: 'pattern', color: '#ffffff' },
  { id: 'polaroid-card', label: '拍立得白边', type: 'pattern', color: '#ffffff' },
  { id: 'magazine-card', label: '杂志卡片', type: 'pattern', color: '#fbf7f0' },
  { id: 'cream-paper', label: '奶油纸', type: 'pattern', color: '#fef3df' },
  { id: 'redbean-paper', label: '豆沙纸', type: 'pattern', color: '#efd8c4' },
  { id: 'kraft-paper', label: '牛皮纸', type: 'pattern', color: '#d9b787' },
];

// 内置贴图（emoji + 文字标签胶囊，零素材成本）
const STICKERS = [
  { stype: 'emoji', glyph: '👍', name: '点赞' },
  { stype: 'emoji', glyph: '❤️', name: '爱心' },
  { stype: 'emoji', glyph: '⭐', name: '星星' },
  { stype: 'emoji', glyph: '🔥', name: '火' },
  { stype: 'emoji', glyph: '✅', name: '对号' },
  { stype: 'emoji', glyph: '➡️', name: '箭头' },
  { stype: 'emoji', glyph: '⬇️', name: '下箭头' },
  { stype: 'emoji', glyph: '📌', name: '图钉' },
  { stype: 'emoji', glyph: '🌟', name: '亮星' },
  { stype: 'emoji', glyph: '🍲', name: '汤' },
  { stype: 'emoji', glyph: '🥢', name: '筷子' },
  { stype: 'emoji', glyph: '😋', name: '馋' },
  { stype: 'emoji', glyph: '💯', name: '满分' },
  { stype: 'emoji', glyph: '👇', name: '指下' },
  { stype: 'pill', text: '关注', bg: '#ff2d55', color: '#ffffff' },
  { stype: 'pill', text: '收藏', bg: '#ffb300', color: '#3a2a00' },
  { stype: 'pill', text: '点赞', bg: '#ff5252', color: '#ffffff' },
  { stype: 'pill', text: '爆款', bg: '#d42a2a', color: '#fff200' },
  { stype: 'pill', text: '推荐', bg: '#1aa760', color: '#ffffff' },
  { stype: 'pill', text: '必学', bg: '#111111', color: '#ffd24d' },
  { stype: 'pill', text: '家常', bg: '#8b5a2b', color: '#fff3e0' },
  { stype: 'pill', text: '养生', bg: '#2d7a4f', color: '#ffffff' },
  { stype: 'pill', text: '低脂', bg: '#43b049', color: '#ffffff' },
  { stype: 'pill', text: '减脂', bg: '#00897b', color: '#ffffff' },
  { stype: 'pill', text: '超简单', bg: '#ff8a3d', color: '#ffffff' },
  { stype: 'pill', text: '0失败', bg: '#7b1fa2', color: '#ffffff' },
  { stype: 'pill', text: '好吃', bg: '#e91e63', color: '#ffffff' },
  { stype: 'pill', text: '今日菜', bg: '#3949ab', color: '#ffffff' },
  // 补齐成套
  { stype: 'emoji', glyph: '❌', name: '打叉' },
  { stype: 'emoji', glyph: '⬆️', name: '上箭头' },
  { stype: 'emoji', glyph: '⬅️', name: '左箭头' },
  { stype: 'emoji', glyph: '👎', name: '点踩' },
  { stype: 'emoji', glyph: '🤍', name: '空心心' },
  { stype: 'emoji', glyph: '✨', name: '闪光' },
  { stype: 'emoji', glyph: '♨️', name: '热气' },
  { stype: 'emoji', glyph: '❗', name: '重点' },
  { stype: 'emoji', glyph: '💬', name: '评论' },
  { stype: 'emoji', glyph: '🔁', name: '转发' },
  { stype: 'pill', text: '重点', bg: '#ff9800', color: '#ffffff' },
  { stype: 'pill', text: '避坑', bg: '#455a64', color: '#ffeb3b' },
  { stype: 'pill', text: '营养', bg: '#00897b', color: '#ffffff' },
  { stype: 'pill', text: '评论', bg: '#3949ab', color: '#ffffff' },
  { stype: 'pill', text: '转发', bg: '#0277bd', color: '#ffffff' },
];

const COLOR_PRESETS = ['#ffffff', '#000000', '#ffd24d', '#ff5252', '#3aa0ff', '#1aa760'];

// ===== 模块状态 =====
let framesRef = [];
let editResultsRef = {};
let editProjectsRef = {};
let C = null;            // collage 状态对象（来自 app.state.collage，引用持久化）
let onToastCb = null;

let canvas = null, ctx = null;
let designW = 1080, designH = 1080;
let sPrev = 1, previewW = 0, previewH = 0, previewDpr = 1;
let imgCache = {};       // frameId / 贴图layerId -> HTMLImageElement
let selectedLayerId = null;
let cellSel = null;      // 选中的格子 itemId（规则/不规则模式内拖动缩放小图）
let cellDrag = { active: false, sx: 0, sy: 0, ox0: 0, oy0: 0, maxX: 0, maxY: 0 };
let lastCells = [];      // 最近一次绘制的格子 [{itemId,x,y,w,h,rot}]（design 坐标）
let rightTab = 'set';    // set | text（窄屏 tab）
let awaitingReplace = false;  // 自由图片"替换图片"待选状态
let pasteAsBg = false;        // 下一次 Ctrl+V 作为"背景图"处理
let undoStackC = [];     // 撤销快照栈（最近10步）
let accordion = { scheme: true, pub: true, layout: true, pin: true, canvas: false, bgimg: true, export: false, tstyle: false, tobj: true, sticker: false, small: false };

let bgTemplates = [];  // 背景模板，从 IndexedDB 加载

let drag = { active: false, id: null, ox: 0, oy: 0 };
let resize = { active: false, id: null, handle: null, sx: 0, sy: 0, startFont: 0, startW: 0, startBoxW: 0, startBoxH: 0, startSize: 0 };
let rotateDrag = { active: false, id: null, cx: 0, cy: 0, a0: 0, r0: 0 };
let inlineEdit = { active: false, id: null, el: null };

// ===== 入口 =====
export function renderCollageExport({ frames, editResults, editProjects, collage, onToast }) {
  framesRef = frames || [];
  editResultsRef = editResults || {};
  editProjectsRef = editProjects || {};
  onToastCb = onToast || null;
  C = collage;
  if (!C.textDefault) C.textDefault = defaultText();
  imgCache = {};
  selectedLayerId = null;

  syncItems();
  applyRatio(C.settings.ratio);
  if (isFreeMode()) ensureFreeImages();

  const sources = sourceList();
  if (sources.length === 0) {
    return `
      <div class="no-video-state">
        <div class="nv-icon">🧩</div>
        <div class="nv-title">还没有可拼图的成品</div>
        <div class="nv-desc">请先在「成图编辑」里处理并「保存当前」，保存后的成图会自动出现在这里参与拼图。</div>
        <button class="primary" data-nav="workbench">前往成图编辑</button>
      </div>`;
  }

  return `
    <div class="cx">
      <div class="cx-main">
        <div class="cx-toolbar">
          <span class="cx-title">拼图导出 / 出成品图</span>
          <span style="flex:1"></span>
          <button id="cx-undo" class="cx-tbtn" ${undoStackC.length === 0 ? 'disabled' : ''}>↶ 撤销</button>
          <button id="cx-savescheme" class="cx-tbtn">💾 保存当前拼图</button>
          <button id="cx-copy" class="cx-tbtn">📋 复制文案</button>
          <button id="cx-export" class="cx-tbtn primary">⬇ 导出当前拼图</button>
        </div>
        <div class="cx-canvas-area" id="cx-canvas-area">
          <div class="cx-canvas-wrap" id="cx-canvas-wrap">
            <canvas id="cx-canvas"></canvas>
            <div class="cx-handles" id="cx-handles"></div>
          </div>
        </div>
        ${renderQueue()}
      </div>
      ${renderRight()}
    </div>
  `;
}

// 同步参与项：为新出现的源补默认项，移除已消失的
function syncItems() {
  if (!Array.isArray(C.items)) C.items = [];
  const ids = sourceList().map(s => s.id);
  C.items = C.items.filter(it => ids.includes(it.frameId));
  ids.forEach(id => { if (!C.items.find(it => it.frameId === id)) C.items.push({ frameId: id, on: true }); });
}

// 拼图素材来源：优先已保存成图，其次成图编辑底图，再次原图
function sourceList() {
  return framesRef.map((f, i) => {
    const r = editResultsRef[f.id];
    const p = editProjectsRef[f.id];
    const dataUrl = (r && r.dataUrl) || (p && p.baseDataUrl) || f.sourceDataUrl;
    const saved = !!(r && r.dataUrl);
    return { id: f.id, dataUrl, saved, name: f.materialName || ('素材' + String(i + 1).padStart(4, '0')) };
  }).filter(s => s.dataUrl && s.dataUrl.startsWith('data:'));
}
function srcById(id) { return sourceList().find(s => s.id === id); }
function participants() { return C.items.filter(it => it.on).map(it => srcById(it.frameId)).filter(Boolean); }
// 格子显示图：item.imgUrl 覆盖(替换/粘贴) 优先，否则用原素材图
function itemDisplay(it) { if (it && it.imgUrl) return { key: 'ov-' + it.frameId, url: it.imgUrl }; const s = srcById(it.frameId); return { key: it.frameId, url: s ? s.dataUrl : null }; }

function applyRatio(r) {
  let rw = 1, rh = 1;
  if (r && r !== '自定义' && r.includes(':')) { const [a, b] = r.split(':').map(Number); rw = a; rh = b; }
  else if (r === '自定义' && C.settings.customW && C.settings.customH) { rw = C.settings.customW; rh = C.settings.customH; }
  const long = 1080;
  if (rw >= rh) { designW = long; designH = Math.round(long * rh / rw); }
  else { designH = long; designW = Math.round(long * rw / rh); }
}

// ===== 底部队列 =====
function renderQueue() {
  return `
    <div class="cx-queue" id="cx-queue">
      <div class="cx-queue-scroll">
        ${C.items.map((it, idx) => {
          const s = srcById(it.frameId); if (!s) return '';
          return `
            <div class="cx-qcard ${it.on ? 'on' : 'off'}" data-it="${it.frameId}" draggable="true">
              <div class="cx-qorder">${it.on ? participants().findIndex(p => p.id === it.frameId) + 1 : '—'}</div>
              <div class="cx-qthumb"><img src="${s.dataUrl}" draggable="false"></div>
              <div class="cx-qname">${escapeHTML(s.name)}${s.saved ? '' : ' <span class="cx-raw">原图</span>'}</div>
              <div class="cx-qrow">
                <button class="cx-qtoggle" data-toggle="${it.frameId}">${it.on ? '参与中' : '不参与'}</button>
                <button class="cx-qmv" data-mv="up" data-id="${it.frameId}" title="左移">‹</button>
                <button class="cx-qmv" data-mv="down" data-id="${it.frameId}" title="右移">›</button>
              </div>
              <div class="cx-qrow">
                <button class="cx-qadd" data-addcanvas="${it.frameId}" title="把这张图作为自由图片加到画布">＋画布</button>
                <button class="cx-qrep ${imgSelected() ? '' : 'dim'}" data-replace="${it.frameId}" title="替换当前选中的画布图片（保留位置/大小/旋转/层级）">替换选中图</button>
              </div>
            </div>`;
        }).join('')}
      </div>
    </div>
  `;
}

// ===== 右侧控制（双工作区：拼图设置 / 成品文字）=====
function renderRight() {
  return `
    <div class="cx-right" id="cx-right">
      <div class="cx-right-tabs" id="cx-right-tabs">
        <button data-rtab="set" class="${rightTab === 'set' ? 'active' : ''}">拼图设置</button>
        <button data-rtab="text" class="${rightTab === 'text' ? 'active' : ''}">成品文字</button>
      </div>
      <div class="cx-right-dual" data-rtab="${rightTab}" id="cx-right-dual">
        <div class="cx-ws cx-ws-set">
          <div class="cx-ws-title">拼图设置</div>
          ${sec('scheme', '① 拼图工程 / 版式模板', renderSchemeBlock())}
          ${sec('pub', '② 发布与比例', renderPub())}
          ${sec('layout', '③ 拼图布局', renderLayout())}
          ${sec('pin', '④ 拼图样式', renderPinStyle())}
          ${sec('canvas', '⑤ 画布与边框', renderCanvasBlock())}
          ${sec('bgimg', '⑥ 背景图设置', renderBgPanel())}
          ${sec('export', '⑦ 导出设置', renderExportBlock())}
        </div>
        <div class="cx-ws cx-ws-text">
          <div class="cx-ws-title">成品文字 / 文案工具</div>
          <div class="cx-block-h">① 上图文字</div>
          <div class="cx-addrow">
            <button class="cx-add" data-addtext="title">+ 总标题</button>
            <button class="cx-add" data-addtext="subtitle">+ 副标题</button>
            <button class="cx-add" data-addtext="body">+ 说明</button>
            <button class="cx-add" data-addtext="tag">+ 标签</button>
          </div>
          <div class="cx-block-h">② 发布正文 / 公众号正文</div>
          ${renderStep2Body()}
          ${sec('tstyle', '③ 文字样式 / 文字格式', renderStyleOnly())}
          ${sec('tobj', '④ 当前选中对象', renderObjPanel())}
          ${sec('sticker', '⑤ 贴图素材', renderStickerBlock())}
          ${sec('small', '⑥ 小图样式', renderSmall())}
        </div>
      </div>
    </div>
  `;
}
function sec(key, title, body) {
  const open = accordion[key];
  return `<div class="cx-acc ${open ? 'open' : ''}" data-acc="${key}">
    <div class="cx-acc-head" data-acc-toggle="${key}"><span>${title}</span><span>${open ? '▾' : '▸'}</span></div>
    <div class="cx-acc-body">${body}</div></div>`;
}
function renderPinStyle() {
  return `
    <div class="cx-chips">${PIN_STYLES.map(p => `<button class="cx-chip ${C.settings.pinstyle === p.id ? 'active' : ''}" data-pin="${p.id}">${p.label}</button>`).join('')}</div>
    <div class="cx-note">规则宫格用上方「列数」；不规则样式按参与图前几张填充大小格；自由摆放可任意拖动/缩放/旋转每张图。</div>
    ${C.settings.pinstyle !== 'free' && cellSel ? `<div class="cx-slider" data-cellzoom="1"><label>选中格缩放</label><input type="range" min="100" max="260" step="5" value="${Math.round((itemById(cellSel)?.scale || 1) * 100)}"><span class="cx-val">${Math.round((itemById(cellSel)?.scale || 1) * 100)}</span></div><div class="cx-note">点画布里的小图可选中，拖动平移、用此滑杆或滚轮缩放。</div>` : ''}
    ${isFreeMode() ? `<button class="cx-add" id="cx-free-reset" style="width:100%;margin-top:6px">重新铺开自由图片</button>` : ''}
  `;
}

function renderPub() {
  return `
    <div class="cx-flabel">发布场景</div>
    <div class="cx-chips">${PUBLISH_PRESETS.map(p => `<button class="cx-chip ${C.settings.ratio === p.ratio ? 'active' : ''}" data-pub="${p.ratio}">${p.label}<br><span class="cx-sub">${p.ratio}</span></button>`).join('')}</div>
    <div class="cx-flabel">成品比例</div>
    <div class="cx-chips">${RATIOS.map(r => `<button class="cx-chip ${C.settings.ratio === r ? 'active' : ''}" data-ratio="${r}">${r}</button>`).join('')}</div>
    ${C.settings.ratio === '自定义' ? `<div class="cx-row"><label>宽:高</label><input type="number" id="cx-cw" value="${C.settings.customW || 3}" min="1" style="width:54px"> : <input type="number" id="cx-ch" value="${C.settings.customH || 4}" min="1" style="width:54px"></div>` : ''}
  `;
}
function renderLayout() {
  return `
    <div class="cx-flabel">布局预设</div>
    <div class="cx-chips">${LAYOUTS.map(l => `<button class="cx-chip ${C.settings.layout === l.id ? 'active' : ''}" data-layout="${l.id}">${l.label}</button>`).join('')}</div>
    <div class="cx-slider" data-set="cols"><label>列数</label><input type="range" min="1" max="4" step="1" value="${C.settings.cols}"><span class="cx-val">${C.settings.cols}</span></div>
    <div class="cx-note">列数决定每行几张，行数随参与图片自动排。长图=1列，9拼=3列+9张。</div>
  `;
}
function renderCanvasBlock() {
  const bg = C.settings.bg;
  return `
    <div class="cx-flabel">背景</div>
    <div class="cx-chips">${BG_PRESETS.map(b => `<button class="cx-chip ${bg.id === b.id ? 'active' : ''}" data-bg="${b.id}">${b.label}</button>`).join('')}</div>
    <div class="cx-row"><label>自定义底色</label><input type="color" data-set-color="bgColor" value="${bg.type === 'solid' ? bg.color : '#ffffff'}"></div>
    <div class="cx-slider" data-set="outerPad"><label>外留白</label><input type="range" min="0" max="160" step="2" value="${C.settings.outerPad}"><span class="cx-val">${C.settings.outerPad}</span></div>
    <div class="cx-flabel">大图外框</div>
    <div class="cx-chips">${FRAMES.map(f => `<button class="cx-chip ${C.settings.frame === f ? 'active' : ''}" data-frame="${f}">${f}</button>`).join('')}</div>
  `;
}
function renderSmall() {
  const s = C.settings.small;
  return `
    <div class="cx-slider" data-set="gap"><label>图间距</label><input type="range" min="0" max="60" step="2" value="${C.settings.gap}"><span class="cx-val">${C.settings.gap}</span></div>
    <div class="cx-row cx-check"><label><input type="checkbox" data-small="borderOn" ${s.borderOn ? 'checked' : ''}> 小图边框</label><input type="color" data-small="borderColor" value="${s.borderColor}"></div>
    <div class="cx-slider" data-set="smallBorderW"><label>边框粗细</label><input type="range" min="0" max="20" step="1" value="${s.borderWidth}"><span class="cx-val">${s.borderWidth}</span></div>
    <div class="cx-slider" data-set="smallRadius"><label>小图圆角</label><input type="range" min="0" max="60" step="2" value="${s.radius}"><span class="cx-val">${s.radius}</span></div>
    <div class="cx-row cx-check"><label><input type="checkbox" data-small="shadowOn" ${s.shadowOn ? 'checked' : ''}> 小图阴影</label></div>
  `;
}
function itemById(id) { return C.items.find(it => it.frameId === id); }
function renderSchemeBlock() {
  const schemes = getSchemes(), presets = getPresets();
  return `
    <div class="cx-block-desc"><b>当前拼图工程</b>：保存这张拼图的完整工程（图片、文字、贴图、所有设置），可继续编辑。<br><b>版式模板</b>：只保存布局和样式，不保存具体图片，适合以后换一组图片复用。</div>
    <div class="cx-flabel">当前拼图工程 <span class="cx-q" title="保存当前这张拼图的完整工程，包含图片、文字、贴图和所有设置，可继续编辑。">?</span></div>
    <div class="cx-row"><select id="cx-scheme-sel" style="flex:1"><option value="">— 选择拼图工程 —</option>${schemes.map((s, i) => `<option value="${i}">${escapeHTML(s.name)}</option>`).join('')}</select></div>
    <div class="cx-addrow">
      <button class="cx-add" id="cx-new-blank" title="清空当前画布的文字/贴图/自由图层，开始一张新拼图，不删除底部素材。">新建空白拼图</button>
      <button class="cx-add primary" id="cx-scheme-save" title="保存当前这张拼图，之后可以继续编辑。">保存当前拼图</button>
      <button class="cx-add" id="cx-scheme-copy" title="复制一份当前拼图，方便做第二张相似成品。">复制当前拼图</button>
      <button class="cx-add" id="cx-scheme-del" title="删除选中的拼图工程（不影响底部素材）。">删除当前拼图</button>
    </div>
    <button class="cx-add" id="cx-clear-canvas" style="width:100%;margin-top:4px" title="清掉当前画布上的文字/贴图/自由图层，保留底部素材与设置。">清空当前画布</button>
    <div class="cx-flabel" style="margin-top:12px">版式模板 <span class="cx-q" title="只保存版式与样式，不保存具体图片，适合以后换图复用。">?</span></div>
    <div class="cx-row"><select id="cx-preset-sel" style="flex:1"><option value="">— 选择版式模板 —</option>${presets.map((p, i) => `<option value="${i}">${escapeHTML(p.name)}</option>`).join('')}</select></div>
    <div class="cx-addrow">
      <button class="cx-add primary" id="cx-preset-apply" title="把模板版式套到当前已选图片上，不带模板原图片。">套用到当前图片</button>
      <button class="cx-add" id="cx-preset-save" title="保存当前布局、边框、文字和贴图样式，方便以后复用。">保存当前版式为模板</button>
      <button class="cx-add" id="cx-preset-update" title="用当前版式覆盖选中的模板。">更新当前模板</button>
    </div>
    <div class="cx-note">「保存当前拼图」=可回来继续编辑；「导出」=生成最终文件，两者不同。</div>
  `;
}
// 汇总第二步(成图编辑)各参与图的正文
function collectStep2Body() {
  const out = [];
  C.items.filter(it => it.on).forEach(it => {
    const p = editProjectsRef[it.frameId];
    const body = p && p.scripts && (p.scripts.body || '').trim();
    if (body) { const s = srcById(it.frameId); out.push({ name: s ? s.name : it.frameId, body }); }
  });
  return out;
}
function renderStep2Body() {
  const list = collectStep2Body();
  return `
    <div class="cx-pubbody">
      <div class="cx-block-desc" style="margin-bottom:6px">正文是发布文案（公众号/小红书/视频号），<b>默认不上图</b>，也不参与图层。要上图请用总标题/副标题/标签。</div>
      <textarea id="cx-pubbody-text" rows="6" placeholder="在此撰写发布正文（不会出现在图片上）">${escapeHTML(C.copyBody || '')}</textarea>
      <div class="cx-addrow" style="margin-top:6px">
        <button class="cx-add" id="cx-import-body" ${list.length ? '' : 'disabled'}>从第二步正文导入</button>
        <button class="cx-add" id="cx-copy-pubbody">复制正文</button>
        <button class="cx-add" id="cx-clear-pubbody">清空正文</button>
      </div>
      ${list.length ? `<div class="cx-step2-list">${list.map(x => `<div class="cx-step2-item"><b>${escapeHTML(x.name)}</b>：${escapeHTML(x.body.slice(0, 40))}${x.body.length > 40 ? '…' : ''}</div>`).join('')}</div>` : `<div class="cx-note">第二步「成图编辑」写了正文并保存后，会在此列出，可一键导入。</div>`}
    </div>`;
}
// 选中文字时操作该文字；否则操作 C.textDefault（默认/新文字样式）
function styleTarget() { const l = curLayer(); return (l && l.kind === 'text') ? l : (C.textDefault || (C.textDefault = defaultText())); }
function isTargetLayer() { const l = curLayer(); return !!(l && l.kind === 'text'); }
// ③ 文字样式 / 文字格式（只放样式，不含内容/图层/删除）
function renderStyleOnly() {
  const l = styleTarget();
  const head = isTargetLayer() ? '当前文字样式' : '默认新文字样式（添加文字时使用）';
  const col = (v, d) => (typeof v === 'string' && /^#/.test(v)) ? v : d;
  return `
    <div class="cx-flabel">${head}</div>` + renderStyleControls(l, col);
}
function renderStyleControls(l, col) {
  return `
    <div class="cx-slider2" data-ls="fontSize"><label>字号</label><input type="range" min="16" max="200" step="2" value="${l.fontSize || 48}"><span class="cx-val">${l.fontSize || 48}</span></div>
    <div class="cx-row"><label>颜色</label><input type="color" data-lp="color" value="${col(l.color, '#ffffff')}">
      <div class="cx-sw">${COLOR_PRESETS.map(c => `<button class="cx-swatch" data-colorfor="color" data-color="${c}" style="background:${c}"></button>`).join('')}</div></div>
    <div class="cx-row cx-check"><label><input type="checkbox" data-lp="bold" ${l.bold ? 'checked' : ''}> 加粗</label>
      <label><input type="checkbox" data-lp="strokeOn" ${l.strokeOn ? 'checked' : ''}> 描边</label><input type="color" data-lp="strokeColor" value="${col(l.strokeColor, '#000000')}"></div>
    <div class="cx-slider2" data-ls="strokeWidth"><label>描边粗细</label><input type="range" min="0" max="24" step="1" value="${l.strokeWidth || 0}"><span class="cx-val">${l.strokeWidth || 0}</span></div>
    <div class="cx-row cx-check"><label><input type="checkbox" data-lp="bgOn" ${l.bgOn ? 'checked' : ''}> 背景板</label><input type="color" data-lp="bgColor" value="${col(l.bgColor, '#000000')}"></div>
    <div class="cx-slider2" data-ls="bgRadius"><label>圆角</label><input type="range" min="0" max="40" step="1" value="${l.bgRadius || 0}"><span class="cx-val">${l.bgRadius || 0}</span></div>
    <div class="cx-row cx-check"><label><input type="checkbox" data-lp="shadowOn" ${l.shadowOn ? 'checked' : ''}> 阴影</label>
      <label><input type="checkbox" data-lp="borderOn" ${l.borderOn ? 'checked' : ''}> 边框</label><input type="color" data-lp="borderColor" value="${col(l.borderColor, '#000000')}"></div>
    <div class="cx-slider2" data-ls="lineHeightX10"><label>行距</label><input type="range" min="8" max="26" step="1" value="${Math.round((l.lineHeight || LH) * 10)}"><span class="cx-val">${Math.round((l.lineHeight || LH) * 10)}</span></div>
    <div class="cx-row"><label>对齐</label><div class="cx-btng">${['left', 'center', 'right'].map(a => `<button data-align="${a}" class="${l.align === a ? 'active' : ''}">${a === 'left' ? '左' : a === 'center' ? '中' : '右'}</button>`).join('')}</div></div>
    <div class="cx-row"><label>旋转</label><input type="number" data-lpn="rotate" value="${Math.round(l.rotate || 0)}" min="-180" max="180" style="width:58px"> °
      <div class="cx-btng"><button data-rot="-15">⟲</button><button data-rot="0">归零</button><button data-rot="15">⟳</button></div></div>
    <div class="cx-flabel">常用艺术字</div>
    <div class="cx-art">${ART_GROUP_A.slice(0, 6).map(id => `<button class="cx-artbtn" data-art="${id}">${ART_PRESETS[id].label}</button>`).join('')}</div>
    <div class="cx-flabel">更多艺术字</div>
    <div class="cx-art">${[...ART_GROUP_B.slice(0, 5), ...ART_GROUP_C].map(id => `<button class="cx-artbtn" data-art="${id}">${ART_PRESETS[id].label}</button>`).join('')}</div>
  `;
}
// ④ 当前选中对象（内容/图层/删除/置为背景）
function renderObjPanel() {
  const l = curLayer();
  if (!l) return `<div class="cx-empty">当前未选中对象。可先用上方加标题/副标题/说明/标签，或点击画布上的文字/图片/贴图。</div>`;
  if (l.asBg) return `<div class="cx-note">这张图已设为背景。请到左侧「拼图设置 → ⑥ 背景图设置」中调整、恢复为浮层或删除。</div>`;
  if (l.kind === 'image') return `<div class="cx-flabel">当前选中：图片</div>${renderImageLayerPanel(l)}`;
  if (l.kind === 'sticker') {
    return `
      <div class="cx-flabel">当前选中：贴图</div>
      ${layerOrderBar()}
      ${bgToggleBtn(l)}
      <button class="cx-del" data-dellayer="1">删除贴图</button>`;
  }
  // 文字
  return `
    <div class="cx-flabel">当前选中：文字</div>
    <div class="cx-field"><label class="cx-flabel">当前文字内容</label><textarea id="cx-seltext" rows="2">${escapeHTML(l.text || '')}</textarea></div>
    ${layerOrderBar()}
    <div class="cx-note">更多样式（字号/颜色/描边/艺术字等）在上方「③ 文字样式」里调整。</div>
    <button class="cx-del" data-dellayer="1">删除文字</button>`;
}
function layerOrderBar() {
  return `<div class="cx-row"><label>图层</label><div class="cx-btng">
    <button data-order="up" title="上移一层">上移</button>
    <button data-order="down" title="下移一层">下移</button>
    <button data-order="top" title="置顶">置顶</button>
    <button data-order="bottom" title="置底">置底</button>
  </div></div>`;
}
function bgToggleBtn(l) {
  // 已置为背景：不在「成品文字」里管理，提示去左侧「背景图设置」；否则给出「置为背景」按钮
  if (l.asBg) return `<div class="cx-note" style="margin-bottom:6px">该图已置为背景。请在左侧「拼图设置 → 背景图设置」中调整或「恢复为浮层」。</div>`;
  return `<button class="cx-add" data-bgtoggle="1" style="width:100%;margin-bottom:6px">置为背景（放到拼图格子下面）</button>`;
}
function bgLayer() { return (C.layers || []).find(l => l.asBg) || null; }
function renderBgTemplateSection(hasBgImg) {
  const tplOpts = bgTemplates.map((t, i) => `<option value="${i}">${escapeHTML(t.name)}</option>`).join('');
  return `
    <div class="cx-flabel" style="margin-top:10px">背景模板</div>
    <div class="cx-block-desc" style="margin-bottom:4px">保存背景图（位置/缩放/透明度），以后快速复用。</div>
    <div class="cx-row" style="gap:4px">
      <select id="cx-bgtpl-sel" style="flex:1;min-width:0"><option value="">— 选择背景模板 —</option>${tplOpts}</select>
      <button class="cx-add" id="cx-bgtpl-apply" ${bgTemplates.length === 0 ? 'disabled' : ''}>套用</button>
      <button class="cx-add" id="cx-bgtpl-del" ${bgTemplates.length === 0 ? 'disabled' : ''}>删除</button>
    </div>
    ${hasBgImg ? `<button class="cx-add primary" id="cx-bgtpl-save" style="width:100%;margin-top:4px">保存当前为背景模板</button>` : ''}
  `;
}
function renderBgPanel() {
  const l = bgLayer();
  if (!l) {
    const sel = curLayer();
    const canSetBg = sel && (sel.kind === 'image' || sel.kind === 'sticker') && !sel.asBg;
    return `
      <div class="cx-block-desc">当前没有背景图。可上传图片、粘贴图片为背景，或把当前选中图片设为背景。</div>
      <input type="file" id="cx-bgupload" accept="image/*" style="display:none">
      <div class="cx-addrow">
        <button class="cx-add primary" id="cx-bgupload-btn">上传背景图</button>
        <button class="cx-add ${pasteAsBg ? 'primary' : ''}" id="cx-bgpaste-btn">${pasteAsBg ? '等待粘贴…' : '粘贴图片作为背景'}</button>
      </div>
      ${canSetBg ? `<button class="cx-add" data-bgtoggle="1" style="width:100%;margin-top:6px">把当前选中图片设为背景</button>` : ''}
      <div class="cx-addrow"><button class="cx-add" data-bgctl="del" disabled>清除背景图</button></div>
      ${renderBgTemplateSection(false)}`;
  }
  const op = l.opacity != null ? l.opacity : 1;
  return `
    <div class="cx-block-desc" style="margin-bottom:6px">这里调整的是背景图在画布里的位置，不是图层顺序。要回普通图层，请点「恢复为浮层」。</div>
    <div class="cx-row"><label>大小</label><div class="cx-btng">
      <button data-bgctl="zin">放大</button><button data-bgctl="zout">缩小</button>
    </div></div>
    <div class="cx-row"><label>位置</label><div class="cx-btng">
      <button data-bgctl="up">背景上移</button><button data-bgctl="down">背景下移</button>
      <button data-bgctl="left">背景左移</button><button data-bgctl="right">背景右移</button>
    </div></div>
    <div class="cx-slider2" data-bgop="1"><label>透明度</label><input type="range" min="20" max="100" step="5" value="${Math.round(op * 100)}"><span class="cx-val">${Math.round(op * 100)}</span></div>
    <input type="file" id="cx-bgupload" accept="image/*" style="display:none">
    <div class="cx-addrow">
      <button class="cx-add primary" id="cx-bgupload-btn">替换背景图（上传）</button>
      <button class="cx-add ${pasteAsBg ? 'primary' : ''}" id="cx-bgpaste-btn">${pasteAsBg ? '等待粘贴…' : '粘贴替换背景'}</button>
    </div>
    <div class="cx-addrow">
      <button class="cx-add" data-bgctl="reset">重置背景</button>
      <button class="cx-add" data-bgctl="restore">恢复为浮层</button>
      <button class="cx-add" data-bgctl="del">删除背景图</button>
    </div>
    ${renderBgTemplateSection(true)}
  `;
}
function renderImageLayerPanel(l) {
  return `
    <div class="cx-note" style="margin-bottom:5px;font-size:11px">图层拖动/缩放调整整张图片的位置和大小；图片取景调整图片框里显示的内容。</div>
    <div class="cx-flabel">图层操作</div>
    <div class="cx-row"><div class="cx-btng">
      <button data-order="up">上移</button>
      <button data-order="down">下移</button>
      <button data-order="top">置顶</button>
      <button data-order="bottom">置底</button>
      <button data-bgtoggle="1">置为背景</button>
    </div></div>
    <div class="cx-addrow" style="margin-top:4px">
      <button class="cx-add ${awaitingReplace ? 'primary' : ''}" id="cx-img-replace">${awaitingReplace ? '点底部图替换…' : '替换图片'}</button>
      <button class="cx-del" data-dellayer="1">删除图片</button>
    </div>
    <div class="cx-flabel" style="margin-top:6px">图片取景</div>
    <div class="cx-row"><div class="cx-btng">
      <button data-nudge="zin">取景放大</button><button data-nudge="zout">取景缩小</button>
      <button data-nudge="up">取景上移</button><button data-nudge="down">取景下移</button>
      <button data-nudge="left">取景左移</button><button data-nudge="right">取景右移</button>
      <button id="cx-img-resetview">重置取景</button>
    </div></div>
    <div class="cx-slider2" data-img="innerScale"><label>取景缩放</label><input type="range" min="100" max="280" step="5" value="${Math.round((l.innerScale || 1) * 100)}"><span class="cx-val">${Math.round((l.innerScale || 1) * 100)}</span></div>
    <div class="cx-slider2" data-img="innerOffX"><label>取景左右</label><input type="range" min="-100" max="100" step="5" value="${Math.round((l.innerOffX || 0) * 100)}"><span class="cx-val">${Math.round((l.innerOffX || 0) * 100)}</span></div>
    <div class="cx-slider2" data-img="innerOffY"><label>取景上下</label><input type="range" min="-100" max="100" step="5" value="${Math.round((l.innerOffY || 0) * 100)}"><span class="cx-val">${Math.round((l.innerOffY || 0) * 100)}</span></div>
  `;
}
function renderStickerBlock() {
  return `
    <div class="cx-stickers">${STICKERS.map((s, i) => `<button class="cx-stk" data-stk="${i}" title="${escapeHTML(s.name || s.text)}">${s.stype === 'emoji' ? s.glyph : `<span class="cx-stk-pill" style="background:${s.bg};color:${s.color}">${escapeHTML(s.text)}</span>`}</button>`).join('')}</div>
    <div class="cx-addrow" style="margin-top:8px">
      <button class="cx-add" id="cx-upload-btn">上传贴图</button>
      <input type="file" id="cx-upload" accept="image/*" style="display:none">
    </div>
    <div class="cx-note">点击添加到画布；可拖动/缩放/旋转/删除。也可直接 Ctrl+V 粘贴外部图片作为贴图。</div>
  `;
}
function renderExportBlock() {
  const e = C.settings.exp;
  return `
    <div class="cx-row"><label>格式</label><div class="cx-btng"><button data-fmt="png" class="${e.format === 'png' ? 'active' : ''}">PNG</button><button data-fmt="jpg" class="${e.format === 'jpg' ? 'active' : ''}">JPG</button></div></div>
    <div class="cx-slider" data-set="quality"><label>质量</label><input type="range" min="60" max="100" step="5" value="${e.quality}"><span class="cx-val">${e.quality}</span></div>
    <div class="cx-row cx-check"><label><input type="checkbox" data-hd ${e.hd ? 'checked' : ''}> 高清导出(2x)</label></div>
    <div class="cx-flabel">导出内容（用于ZIP）</div>
    <label class="cx-ckline"><input type="checkbox" data-zip="collage" ${e.zipCollage ? 'checked' : ''}> 当前拼图</label>
    <label class="cx-ckline"><input type="checkbox" data-zip="singles" ${e.zipSingles ? 'checked' : ''}> 参与拼图的单图</label>
    <label class="cx-ckline"><input type="checkbox" data-zip="copy" ${e.zipCopy ? 'checked' : ''}> 文案 copy.txt</label>
    <div class="cx-addrow" style="margin-top:8px">
      <button class="cx-add primary" id="cx-export2">导出当前拼图</button>
      <button class="cx-add" id="cx-zip">导出 ZIP 包</button>
    </div>
    <button class="cx-add" id="cx-copy2" style="width:100%;margin-top:6px">📋 复制文案</button>
  `;
}

// ===== INIT =====
export function initCollageExport() {
  canvas = document.getElementById('cx-canvas');
  if (!canvas) return;
  ctx = canvas.getContext('2d');
  loadImages(() => { autoFitSingleImages(); sizeCanvas(); redraw(); });
  bindAll();
  // 异步加载背景模板，加载完刷新面板
  loadBgTemplates().then(list => { bgTemplates = list || []; refreshBgPanel(); });
}

function loadImages(cb) {
  const jobs = [];
  // 参与图（含格子覆盖图）
  C.items.filter(it => it.on).forEach(it => { const d = itemDisplay(it); if (d.url && !imgCache[d.key]) jobs.push({ key: d.key, url: d.url }); });
  // 自由图片层
  (C.layers || []).forEach(l => { if (l.kind === 'image') { const s = srcById(l.frameId); if (s && !imgCache[l.frameId]) jobs.push({ key: l.frameId, url: s.dataUrl }); } });
  (C.layers || []).forEach(l => { if (l.kind === 'sticker' && l.stype === 'img' && l.dataUrl && !imgCache[l.id]) jobs.push({ key: l.id, url: l.dataUrl }); });
  let pending = jobs.length;
  if (pending === 0) { cb?.(); return; }
  jobs.forEach(j => {
    const img = new Image();
    img.onload = () => { imgCache[j.key] = img; if (--pending === 0) cb?.(); };
    img.onerror = () => { if (--pending === 0) cb?.(); };
    img.src = j.url;
  });
}

function sizeCanvas() {
  const area = document.getElementById('cx-canvas-area');
  if (!area || !canvas) return;
  const maxW = area.clientWidth - 24, maxH = area.clientHeight - 24;
  sPrev = Math.min(maxW / designW, maxH / designH, 1);
  previewW = Math.max(40, Math.round(designW * sPrev));
  previewH = Math.max(40, Math.round(designH * sPrev));
  // 预览用设备像素比放大内部分辨率，避免发糊；CSS 仍按 previewW 显示
  previewDpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(previewW * previewDpr);
  canvas.height = Math.round(previewH * previewDpr);
  canvas.style.width = previewW + 'px';
  canvas.style.height = previewH + 'px';
}

// ===== 绘制 =====
function redraw() {
  if (!ctx) return;
  const s = sPrev * (previewDpr || 1);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  ctx.setTransform(s, 0, 0, s, 0, 0);
  drawDesign(ctx);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  renderHandles();
}

function drawDesign(c) {
  drawBackground(c);
  const framePad = framePadOf(C.settings.frame);
  const pad = C.settings.outerPad + framePad;
  const cx0 = pad, cy0 = pad, cw = designW - pad * 2, ch = designH - pad * 2;
  lastCells = [];
  const layers = C.layers || [];
  const bgLayers = layers.filter(l => l.asBg);     // 被设为背景的层（置于拼图格子下方）
  const fgLayers = layers.filter(l => !l.asBg);    // 浮层
  if (isFreeMode()) {
    drawFrame(c, C.settings.frame);
    if (!layers.length) {
      c.fillStyle = '#8096b8'; c.font = `${Math.round(designW * 0.032)}px ${FONT_STACK}`; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText('请从底部选择图片添加到画布', designW / 2, designH / 2);
      c.textAlign = 'left'; c.textBaseline = 'alphabetic';
    }
    // 背景层 → 其余层（按数组顺序，受图层顺序控制）
    bgLayers.forEach(l => drawLayer(c, l));
    fgLayers.forEach(l => drawLayer(c, l));
  } else {
    // 总背景层(被设为背景的粘贴图) → 拼图格子层 → 浮层(文字/贴图/未设背景的图)
    bgLayers.forEach(l => drawLayer(c, l));
    drawCells(c, cx0, cy0, cw, ch);
    drawFrame(c, C.settings.frame);
    fgLayers.filter(l => l.kind !== 'image').forEach(l => drawLayer(c, l));
  }
}

function drawBackground(c) {
  const bg = C.settings.bg;
  if (bg.type === 'grad') {
    const g = c.createLinearGradient(0, 0, designW, designH);
    g.addColorStop(0, bg.color); g.addColorStop(1, bg.color2 || bg.color);
    c.fillStyle = g;
    c.fillRect(0, 0, designW, designH);
    return;
  }
  if (bg.type === 'pattern') { drawPatternBg(c, bg); return; }
  c.fillStyle = bg.color || '#ffffff';
  c.fillRect(0, 0, designW, designH);
}
// 小红书风背景：本地 Canvas 绘制，无外部素材
function drawPatternBg(c, bg) {
  const W = designW, H = designH;
  c.fillStyle = bg.color || '#ffffff'; c.fillRect(0, 0, W, H);
  switch (bg.id) {
    case 'memo': {
      // 苹果备忘录风：暖米黄底 + 极淡细横线 + 极淡左侧竖线
      c.strokeStyle = bg.line || 'rgba(184,148,86,0.35)'; c.lineWidth = Math.max(1, W * 0.0012);
      const gap = Math.max(40, W * 0.052);
      for (let y = gap * 1.4; y < H; y += gap) { c.beginPath(); c.moveTo(W * 0.06, y); c.lineTo(W * 0.94, y); c.stroke(); }
      c.strokeStyle = 'rgba(184,148,86,0.15)';
      c.beginPath(); c.moveTo(W * 0.06, 0); c.lineTo(W * 0.06, H); c.stroke(); break;
    }
    case 'sticky': {
      c.fillStyle = 'rgba(0,0,0,0.05)'; c.fillRect(0, H * 0.94, W, H * 0.06);
      c.fillStyle = 'rgba(255,200,0,0.12)'; c.fillRect(0, 0, W, H * 0.06); break;
    }
    case 'journal': {
      c.fillStyle = bg.dot || '#d8c9a8'; const step = Math.max(20, W * 0.022), r = Math.max(1, W * 0.0018);
      for (let y = step; y < H; y += step) for (let x = step; x < W; x += step) { c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill(); }
      break;
    }
    case 'grid-paper': {
      c.strokeStyle = bg.line || '#e6e2d2'; c.lineWidth = Math.max(1, W * 0.0012);
      const g = Math.max(24, W * 0.028);
      for (let x = g; x < W; x += g) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, H); c.stroke(); }
      for (let y = g; y < H; y += g) { c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke(); }
      break;
    }
    case 'torn': {
      // 上下边缘锯齿撕纸
      const t = Math.max(10, W * 0.012), w = Math.max(14, W * 0.018);
      c.fillStyle = '#f4ecdd';
      c.beginPath(); c.moveTo(0, 0); c.lineTo(W, 0); c.lineTo(W, t);
      for (let x = W; x >= 0; x -= w) c.lineTo(x, t + ((x / w) % 2 === 0 ? -t * 0.5 : t * 0.5));
      c.lineTo(0, t); c.closePath(); c.fill();
      c.beginPath(); c.moveTo(0, H); c.lineTo(W, H); c.lineTo(W, H - t);
      for (let x = W; x >= 0; x -= w) c.lineTo(x, H - t + ((x / w) % 2 === 0 ? -t * 0.5 : t * 0.5));
      c.lineTo(0, H - t); c.closePath(); c.fill();
      break;
    }
    case 'polaroid-card': {
      // 白底 + 下方厚边 + 整体卡片阴影感
      c.fillStyle = '#ffffff'; c.fillRect(0, 0, W, H);
      c.fillStyle = '#ffffff'; c.fillRect(0, H * 0.84, W, H * 0.16);
      c.strokeStyle = '#e6e6e6'; c.lineWidth = Math.max(1, W * 0.0015);
      c.strokeRect(W * 0.025, W * 0.025, W - W * 0.05, H - W * 0.025 - H * 0.18); break;
    }
    case 'magazine-card': {
      c.fillStyle = '#fbf7f0'; c.fillRect(0, 0, W, H);
      c.fillStyle = '#ffffff'; const m = W * 0.04;
      roundRect(c, m, m, W - m * 2, H - m * 2, W * 0.018); c.fill();
      c.strokeStyle = '#ece3d2'; c.lineWidth = Math.max(1, W * 0.0018); c.stroke(); break;
    }
    case 'cream-paper': case 'redbean-paper': case 'kraft-paper': {
      // 轻微纸纹噪点
      const a = bg.id === 'kraft-paper' ? 0.08 : 0.05;
      const n = Math.round(W * H / 6000);
      c.fillStyle = `rgba(0,0,0,${a})`;
      for (let i = 0; i < n; i++) { const x = Math.random() * W, y = Math.random() * H, s = Math.random() * 1.4 + 0.4; c.fillRect(x, y, s, s); }
      break;
    }
  }
}

function drawCells(c, x0, y0, w, h) {
  const ps = participants();
  const n = ps.length;
  if (n === 0) {
    c.fillStyle = 'rgba(0,0,0,0.04)'; c.fillRect(x0, y0, w, h);
    c.fillStyle = '#8096b8'; c.font = `${Math.round(designW * 0.03)}px ${FONT_STACK}`;
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('请在底部勾选参与拼图的图片', x0 + w / 2, y0 + h / 2);
    c.textAlign = 'left'; c.textBaseline = 'alphabetic';
    return;
  }
  const gap = C.settings.gap;
  const slots = slotsFor(C.settings.pinstyle, n);
  let rects = [];
  if (slots) {
    for (let i = 0; i < slots.length; i++) {
      const s = slots[i];
      rects.push({ item: ps[i] || null, x: x0 + s.x * w + gap / 2, y: y0 + s.y * h + gap / 2, w: s.w * w - gap, h: s.h * h - gap, rot: s.rot || 0 });
    }
  } else {
    const cols = Math.max(1, Math.min(4, C.settings.cols));
    const rows = Math.ceil(n / cols);
    const cellW = (w - gap * (cols - 1)) / cols, cellH = (h - gap * (rows - 1)) / rows;
    ps.forEach((s, i) => { const r = Math.floor(i / cols), col = i % cols; rects.push({ item: s, x: x0 + col * (cellW + gap), y: y0 + r * (cellH + gap), w: cellW, h: cellH, rot: 0 }); });
  }
  rects.forEach(rc => {
    if (!rc.item) { // 空位提示
      c.save(); if (rc.rot) { const ccx = rc.x + rc.w / 2, ccy = rc.y + rc.h / 2; c.translate(ccx, ccy); c.rotate(rc.rot * Math.PI / 180); c.translate(-ccx, -ccy); }
      c.fillStyle = 'rgba(29,95,231,0.06)'; roundRect(c, rc.x, rc.y, rc.w, rc.h, C.settings.small.radius); c.fill();
      c.strokeStyle = '#9aa7c0'; c.setLineDash([8, 6]); c.lineWidth = 2; c.stroke(); c.setLineDash([]);
      c.fillStyle = '#8096b8'; c.font = `${Math.round(Math.min(rc.w, rc.h) * 0.12)}px ${FONT_STACK}`; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText('请添加图片', rc.x + rc.w / 2, rc.y + rc.h / 2); c.textAlign = 'left'; c.textBaseline = 'alphabetic';
      c.restore(); return;
    }
    drawCell(c, rc.item, rc.x, rc.y, rc.w, rc.h, rc.rot);
    lastCells.push({ itemId: rc.item.id, x: rc.x, y: rc.y, w: rc.w, h: rc.h, rot: rc.rot });
  });
}
function drawCell(c, src, x, y, w, h, rot) {
  const sm = C.settings.small;
  const it = itemById(src.id) || {};
  const img = imgCache[itemDisplay(it).key];
  const sel = src.id === cellSel;
  c.save();
  if (rot) { const ccx = x + w / 2, ccy = y + h / 2; c.translate(ccx, ccy); c.rotate(rot * Math.PI / 180); c.translate(-ccx, -ccy); }
  c.save();
  if (sm.shadowOn || rot) { c.shadowColor = 'rgba(0,0,0,0.28)'; c.shadowBlur = 14; c.shadowOffsetY = 5; }
  roundRect(c, x, y, w, h, sm.radius); c.clip();
  if (rot) { c.fillStyle = '#fff'; c.fillRect(x, y, w, h); }
  if (img) drawCover(c, img, x, y, w, h, it.scale || 1, it.offX || 0, it.offY || 0);
  else { c.fillStyle = '#dde5f3'; c.fillRect(x, y, w, h); }
  c.restore();
  if (sm.borderOn && sm.borderWidth > 0) { c.save(); c.lineWidth = sm.borderWidth; c.strokeStyle = sm.borderColor; roundRect(c, x + sm.borderWidth / 2, y + sm.borderWidth / 2, w - sm.borderWidth, h - sm.borderWidth, Math.max(0, sm.radius - sm.borderWidth / 2)); c.stroke(); c.restore(); }
  if (sel) { c.save(); c.lineWidth = 4; c.strokeStyle = '#1d5fe7'; roundRect(c, x + 2, y + 2, w - 4, h - 4, sm.radius); c.stroke(); c.restore(); }
  c.restore();
}
function drawCover(c, img, x, y, w, h, scale, offX, offY) {
  scale = scale || 1;
  const ir = img.naturalWidth / img.naturalHeight, cr = w / h;
  let dw, dh;
  if (ir > cr) { dh = h * scale; dw = dh * ir; } else { dw = w * scale; dh = dw / ir; }
  const maxX = (dw - w) / 2, maxY = (dh - h) / 2;
  const dx = x + (w - dw) / 2 + (offX || 0) * maxX, dy = y + (h - dh) / 2 + (offY || 0) * maxY;
  c.drawImage(img, dx, dy, dw, dh);
}
function drawImageLayer(c, l) {
  const img = imgCache[l.frameId];
  if (!img) { l._box = null; return; }
  const base = designW * 0.4 * (l.scale || 1);
  const ir = img.naturalWidth / img.naturalHeight;
  let w = base, h = base / ir;
  const cx0 = l.xPct * designW, cy0 = l.yPct * designH;
  const rot = (l.rotate || 0) * Math.PI / 180;
  c.save(); c.translate(cx0, cy0); if (rot) c.rotate(rot);
  if (l.opacity != null) c.globalAlpha = l.opacity;
  if (!l.asBg) { c.shadowColor = 'rgba(0,0,0,0.25)'; c.shadowBlur = 12; c.shadowOffsetY = 4; }
  c.save();
  roundRect(c, -w / 2, -h / 2, w, h, 4); c.clip();
  // 框内取景：innerScale 放大、innerOff 平移
  drawCover(c, img, -w / 2, -h / 2, w, h, l.innerScale || 1, l.innerOffX || 0, l.innerOffY || 0);
  c.restore();
  c.restore();
  l._box = { x: cx0 - w / 2, y: cy0 - h / 2, w, h };
}

function framePadOf(frame) {
  if (frame === '无边框') return 0;
  if (frame === '拍立得') return Math.round(designW * 0.05);
  if (frame === '胶片') return Math.round(designW * 0.055);
  if (['细白边', '细黑边'].includes(frame)) return Math.round(designW * 0.012);
  return Math.round(designW * 0.03);
}
function drawFrame(c, frame) {
  if (frame === '无边框') return;
  const W = designW, H = designH;
  c.save();
  const stroke = (col, t, inset, rad) => { c.lineWidth = t; c.strokeStyle = col; roundRect(c, inset, inset, W - inset * 2, H - inset * 2, rad || 0); c.stroke(); };
  const fp = framePadOf(frame);
  switch (frame) {
    case '细白边': stroke('#ffffff', Math.max(6, W * 0.01), W * 0.006, 0); break;
    case '细黑边': stroke('#111111', Math.max(6, W * 0.01), W * 0.006, 0); break;
    case '奶油边框': c.fillStyle = '#fdf6e3'; outerBand(c, fp); stroke('#e8d9a8', W * 0.006, fp * 0.4, 8); break;
    case '圆角卡片': c.fillStyle = '#ffffff'; outerBand(c, fp); stroke('#e6ebf5', W * 0.004, fp * 0.5, 18); break;
    case '小红书白卡': c.fillStyle = '#ffffff'; outerBand(c, fp); break;
    case '国风宣纸': c.fillStyle = '#f3ead2'; outerBand(c, fp); stroke('#c9a96a', W * 0.005, fp * 0.45, 4); break;
    case '木纹菜单': c.fillStyle = '#7a4a23'; outerBand(c, fp); stroke('#4d2e15', W * 0.012, fp * 0.4, 6); break;
    case '黑金高级': c.fillStyle = '#111111'; outerBand(c, fp); stroke('#c9a44a', W * 0.006, fp * 0.45, 4); break;
    case '虚线手账': c.setLineDash([W * 0.02, W * 0.012]); stroke('#9aa7c0', W * 0.006, fp * 0.5, 14); c.setLineDash([]); break;
    case '拍立得': c.fillStyle = '#ffffff'; outerBand(c, fp); c.fillRect(0, H - fp * 1.6, W, fp * 1.6); break;
    case '胶片': drawFilm(c, fp); break;
  }
  c.restore();
}
function outerBand(c, fp) {
  // 在画布四周 fp 宽度内填充边框底色（中间镂空给内容）
  c.fillRect(0, 0, designW, fp);
  c.fillRect(0, designH - fp, designW, fp);
  c.fillRect(0, 0, fp, designH);
  c.fillRect(designW - fp, 0, fp, designH);
}
function drawFilm(c, fp) {
  c.fillStyle = '#111111'; outerBand(c, fp);
  c.fillStyle = '#f5f5f5';
  const hole = fp * 0.35, gap = fp * 0.55, y1 = fp * 0.3, y2 = designH - fp * 0.65;
  for (let x = fp; x < designW - fp; x += hole + gap) {
    c.fillRect(x, y1, hole, hole); c.fillRect(x, y2, hole, hole);
  }
}

function roundRect(c, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  c.beginPath();
  c.moveTo(x + r, y); c.lineTo(x + w - r, y); c.quadraticCurveTo(x + w, y, x + w, y + r);
  c.lineTo(x + w, y + h - r); c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  c.lineTo(x + r, y + h); c.quadraticCurveTo(x, y + h, x, y + h - r);
  c.lineTo(x, y + r); c.quadraticCurveTo(x, y, x + r, y); c.closePath();
}
function hexA(hex, a) {
  const c = String(hex || '#000').replace('#', '');
  return `rgba(${parseInt(c.substr(0, 2), 16) || 0},${parseInt(c.substr(2, 2), 16) || 0},${parseInt(c.substr(4, 2), 16) || 0},${a})`;
}

// ===== 图层（文字 / 贴图）=====
function drawLayer(c, l) {
  if (inlineEdit.active && l.id === inlineEdit.id) { return; }
  if (l.kind === 'image') return drawImageLayer(c, l);
  if (l.kind === 'sticker') return drawSticker(c, l);
  return drawText(c, l);
}
function drawText(c, l) {
  if (!l.text || !l.text.trim()) { l._box = null; return; }
  const fs = l.fontSize, lh = fs * (l.lineHeight || LH);
  c.font = `${l.bold ? 'bold ' : ''}${fs}px ${FONT_STACK}`;
  c.textBaseline = 'alphabetic'; c.textAlign = 'left';
  const maxW = (l.textWidth || designW * 0.9);
  const lines = wrap(c, l.text, maxW);
  const sm = c.measureText('字');
  const asc = sm.actualBoundingBoxAscent || fs * 0.82, dsc = sm.actualBoundingBoxDescent || fs * 0.2;
  const lw = lines.map(t => c.measureText(t || ' ').width);
  const mlw = Math.max(...lw, 1), vh = asc + (lines.length - 1) * lh + dsc;
  const padX = Math.max(10, fs * 0.32), padY = Math.max(6, fs * 0.2);
  const bx0 = l.xPct * designW, by0 = l.yPct * designH;
  const lineX = i => l.align === 'right' ? bx0 + mlw - lw[i] : l.align === 'center' ? bx0 + (mlw - lw[i]) / 2 : bx0;
  const bx = bx0 - padX, by = by0 - asc - padY, bw = mlw + padX * 2, bh = vh + padY * 2;
  const rot = (l.rotate || 0) * Math.PI / 180;
  c.save();
  if (rot) { const ccx = bx + bw / 2, ccy = by + bh / 2; c.translate(ccx, ccy); c.rotate(rot); c.translate(-ccx, -ccy); }
  if (l.bgOn) { c.save(); c.fillStyle = hexA(l.bgColor, l.bgAlpha != null ? l.bgAlpha : 0.55); roundRect(c, bx, by, bw, bh, (l.bgRadius || 0)); c.fill(); if (l.borderOn && l.borderWidth > 0) { c.lineWidth = l.borderWidth; c.strokeStyle = l.borderColor; c.stroke(); } c.restore(); }
  else if (l.borderOn && l.borderWidth > 0) { c.save(); c.lineWidth = l.borderWidth; c.strokeStyle = l.borderColor; roundRect(c, bx, by, bw, bh, (l.bgRadius || 0)); c.stroke(); c.restore(); }
  if (l.shadowOn) { c.save(); c.shadowColor = l.shadowColor || '#000'; c.shadowBlur = 6; c.shadowOffsetX = 3; c.shadowOffsetY = 3; c.fillStyle = l.color; lines.forEach((t, i) => t && c.fillText(t, lineX(i), by0 + i * lh)); c.restore(); }
  if (l.glow) { c.save(); c.shadowColor = l.glowColor || l.color; c.shadowBlur = 16; c.fillStyle = l.color; for (let g = 0; g < 3; g++) lines.forEach((t, i) => t && c.fillText(t, lineX(i), by0 + i * lh)); c.restore(); }
  if (l.strokeOn && l.strokeWidth > 0) { c.save(); c.lineJoin = 'round'; c.miterLimit = 2; c.lineWidth = l.strokeWidth; c.strokeStyle = l.strokeColor; lines.forEach((t, i) => t && c.strokeText(t, lineX(i), by0 + i * lh)); c.restore(); }
  c.save(); c.fillStyle = l.color; lines.forEach((t, i) => t && c.fillText(t, lineX(i), by0 + i * lh)); c.restore();
  c.restore();
  l._box = { x: bx, y: by, w: bw, h: bh };
}
function drawSticker(c, l) {
  const size = l.size || 120;
  const cx0 = l.xPct * designW, cy0 = l.yPct * designH;
  const rot = (l.rotate || 0) * Math.PI / 180;
  c.save();
  c.translate(cx0, cy0); if (rot) c.rotate(rot);
  if (l.opacity != null) c.globalAlpha = l.opacity;
  let bw, bh;
  if (l.stype === 'img') {
    const img = imgCache[l.id];
    if (img) { const ir = img.naturalWidth / img.naturalHeight; bw = size; bh = size / ir; c.drawImage(img, -bw / 2, -bh / 2, bw, bh); }
    else { bw = size; bh = size; c.fillStyle = '#dde5f3'; c.fillRect(-bw / 2, -bh / 2, bw, bh); }
  } else if (l.stype === 'emoji') {
    c.font = `${size}px ${FONT_STACK}`; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(l.glyph, 0, 0);
    bw = size; bh = size;
  } else {
    const fs = size * 0.5;
    c.font = `bold ${fs}px ${FONT_STACK}`; c.textAlign = 'center'; c.textBaseline = 'middle';
    const tw = c.measureText(l.text).width, padX = fs * 0.5, padY = fs * 0.32;
    bw = tw + padX * 2; bh = fs + padY * 2;
    c.fillStyle = l.bg || '#ff2d55'; roundRect(c, -bw / 2, -bh / 2, bw, bh, bh / 2); c.fill();
    c.fillStyle = l.color || '#fff'; c.fillText(l.text, 0, 0);
  }
  c.restore();
  c.textAlign = 'left'; c.textBaseline = 'alphabetic';
  l._box = { x: cx0 - bw / 2, y: cy0 - bh / 2, w: bw, h: bh };
}
function wrap(c, text, maxW) {
  const out = [];
  text.split('\n').forEach(raw => {
    if (!raw) { out.push(''); return; }
    let cur = '';
    for (const ch of Array.from(raw)) { const t = cur + ch; if (maxW > 0 && c.measureText(t).width > maxW && cur) { out.push(cur); cur = ch; } else cur = t; }
    if (cur) out.push(cur);
  });
  return out.length ? out : [''];
}

// ===== 控制点 =====
function curLayer() { return (C.layers || []).find(l => l.id === selectedLayerId) || null; }
function renderHandles() {
  const wrapEl = document.getElementById('cx-handles');
  if (!wrapEl || !canvas) return;
  wrapEl.innerHTML = '';
  if (inlineEdit.active) return;
  const l = curLayer(); if (!l || !l._box) return;
  const b = l._box; const x = b.x * sPrev, y = b.y * sPrev, w = b.w * sPrev, h = b.h * sPrev;
  const box = document.createElement('div'); box.className = 'cx-selbox';
  box.style.cssText = `left:${x}px;top:${y}px;width:${w}px;height:${h}px;`; wrapEl.appendChild(box);
  const hs = 7;
  const uniform = l.kind === 'sticker' || l.kind === 'image';
  const handles = uniform
    ? [['se', w, h, 'nwse-resize']]
    : [['nw', 0, 0, 'nwse-resize'], ['ne', w, 0, 'nesw-resize'], ['sw', 0, h, 'nesw-resize'], ['se', w, h, 'nwse-resize'], ['e', w, h / 2, 'ew-resize'], ['w', 0, h / 2, 'ew-resize'], ['n', w / 2, 0, 'ns-resize'], ['s', w / 2, h, 'ns-resize']];
  handles.forEach(([hh, hx, hy, cur]) => { const d = document.createElement('div'); d.className = 'cx-rh'; d.dataset.rh = hh; d.style.cssText = `left:${x + hx - hs}px;top:${y + hy - hs}px;cursor:${cur};`; wrapEl.appendChild(d); });
  // 删除按钮（选中框右上角）
  const del = document.createElement('div'); del.className = 'cx-delbtn'; del.dataset.delbtn = '1'; del.title = '删除'; del.textContent = '×';
  del.style.cssText = `left:${x + w - 4}px;top:${y - 14}px;`; wrapEl.appendChild(del);
  // 旋转手柄
  const rs = document.createElement('div'); rs.className = 'cx-rot-stem'; rs.style.cssText = `left:${x + w / 2}px;top:${y - 24}px;height:24px;`; wrapEl.appendChild(rs);
  const rh = document.createElement('div'); rh.className = 'cx-rot'; rh.dataset.rot = '1'; rh.style.cssText = `left:${x + w / 2 - 9}px;top:${y - 24 - 9}px;`; wrapEl.appendChild(rh);
}

// ===== 事件 =====
function bindAll() {
  bindCanvas(); bindRight(); bindQueue(); window.addEventListener('resize', onResize); bindTop();
  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('paste', handlePaste);
}
function onResize() { sizeCanvas(); redraw(); }
function bindTop() {
  document.getElementById('cx-copy')?.addEventListener('click', copyCopy);
  document.getElementById('cx-export')?.addEventListener('click', () => exportCurrent());
  document.getElementById('cx-undo')?.addEventListener('click', undoCollageExport);
  document.getElementById('cx-savescheme')?.addEventListener('click', schemeSave);
}

function bindCanvas() {
  const wrapEl = document.getElementById('cx-canvas-wrap');
  if (!wrapEl || !canvas) return;
  const isFree = () => isFreeMode();
  canvas.addEventListener('mousedown', e => {
    const r = canvas.getBoundingClientRect();
    const px = (e.clientX - r.left) / sPrev, py = (e.clientY - r.top) / sPrev;
    if (inlineEdit.active) commitInline();
    const layers = C.layers || [];
    let hit = null;
    for (let i = layers.length - 1; i >= 0; i--) { const l = layers[i]; if (l.kind === 'image' && !isFree()) continue; const b = l._box; if (b && px >= b.x - 6 && px <= b.x + b.w + 6 && py >= b.y - 6 && py <= b.y + b.h + 6) { hit = l; break; } }
    if (hit) {
      const changed = selectedLayerId !== hit.id; selectedLayerId = hit.id; cellSel = null;
      pushUndoC();
      drag = { active: true, id: hit.id, ox: px - hit.xPct * designW, oy: py - hit.yPct * designH };
      if (changed) { refreshTextStyle(); refreshBgPanel(); }
      redraw(); e.preventDefault(); return;
    }
    // 命中格子（规则/不规则模式）→ 选中并可平移小图
    if (!isFree()) {
      const cell = [...lastCells].reverse().find(rc => px >= rc.x && px <= rc.x + rc.w && py >= rc.y && py <= rc.y + rc.h);
      if (cell) {
        cellSel = cell.itemId; selectedLayerId = null;
        const it = itemById(cell.itemId) || {};
        pushUndoC();
        cellDrag = { active: true, id: cell.itemId, sx: px, sy: py, ox0: it.offX || 0, oy0: it.offY || 0, cw: cell.w, ch: cell.h };
        refreshTextStyle(); refreshPinZoom(); redraw(); e.preventDefault(); return;
      }
    }
    if (selectedLayerId || cellSel) { selectedLayerId = null; cellSel = null; refreshTextStyle(); refreshBgPanel(); refreshPinZoom(); redraw(); }
  });
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
  canvas.addEventListener('wheel', e => {
    if (isFree() || !cellSel) return;
    e.preventDefault();
    const it = itemById(cellSel); if (!it) return;
    it.scale = Math.max(1, Math.min(2.6, (it.scale || 1) + (e.deltaY < 0 ? 0.06 : -0.06)));
    redraw(); refreshPinZoom();
  }, { passive: false });
  wrapEl.addEventListener('mousedown', e => {
    const db = e.target.closest('.cx-delbtn');
    if (db) { e.preventDefault(); e.stopPropagation(); delLayer(); return; }
    const rot = e.target.closest('.cx-rot');
    if (rot) { const l = curLayer(); if (!l || !l._box) return; e.preventDefault(); e.stopPropagation(); pushUndoC();
      const r = canvas.getBoundingClientRect(); const ccx = (l._box.x + l._box.w / 2), ccy = (l._box.y + l._box.h / 2);
      const px = (e.clientX - r.left) / sPrev, py = (e.clientY - r.top) / sPrev;
      rotateDrag = { active: true, id: l.id, cx: ccx, cy: ccy, a0: Math.atan2(py - ccy, px - ccx), r0: l.rotate || 0 }; return; }
    const hd = e.target.closest('.cx-rh');
    if (hd) { const l = curLayer(); if (!l || !l._box) return; e.preventDefault(); e.stopPropagation(); pushUndoC();
      resize = { active: true, id: l.id, handle: hd.dataset.rh, sx: e.clientX, sy: e.clientY, startFont: l.fontSize || 0, startW: l.textWidth || designW * 0.9, startBoxW: l._box.w, startBoxH: l._box.h, startSize: l.size || 0, startScale: l.scale || 1 }; }
  });
  canvas.addEventListener('dblclick', e => {
    const r = canvas.getBoundingClientRect();
    const px = (e.clientX - r.left) / sPrev, py = (e.clientY - r.top) / sPrev;
    const layers = C.layers || [];
    for (let i = layers.length - 1; i >= 0; i--) { const b = layers[i]._box; if (b && layers[i].kind === 'text' && px >= b.x - 6 && px <= b.x + b.w + 6 && py >= b.y - 6 && py <= b.y + b.h + 6) { selectedLayerId = layers[i].id; refreshTextStyle(); editInline(layers[i]); break; } }
  });
}
function onMove(e) {
  const r = canvas?.getBoundingClientRect(); if (!r) return;
  const px = (e.clientX - r.left) / sPrev, py = (e.clientY - r.top) / sPrev;
  if (cellDrag.active) { const it = itemById(cellDrag.id); if (!it) return; it.offX = Math.max(-1, Math.min(1, cellDrag.ox0 + (px - cellDrag.sx) / (cellDrag.cw * 0.5))); it.offY = Math.max(-1, Math.min(1, cellDrag.oy0 + (py - cellDrag.sy) / (cellDrag.ch * 0.5))); redraw(); return; }
  if (rotateDrag.active) { const l = layerById(rotateDrag.id); if (!l) return; const a = Math.atan2(py - rotateDrag.cy, px - rotateDrag.cx); let d = rotateDrag.r0 + (a - rotateDrag.a0) * 180 / Math.PI; d = ((d + 180) % 360 + 360) % 360 - 180; l.rotate = Math.round(d); redraw(); return; }
  if (drag.active) { const l = layerById(drag.id); if (!l) return; l.xPct = (px - drag.ox) / designW; l.yPct = (py - drag.oy) / designH; redraw(); return; }
  if (resize.active) {
    const l = layerById(resize.id); if (!l) return;
    const dx = e.clientX - resize.sx, dy = e.clientY - resize.sy;
    if (l.kind === 'sticker' || l.kind === 'image') { const base = Math.max(20, resize.startBoxW * sPrev); const f = Math.max(0.2, (base + dx) / base); if (l.kind === 'image') l.scale = Math.max(0.1, (resize.startScale || 1) * f); else l.size = Math.max(24, Math.round(resize.startSize * f)); }
    else if (['nw', 'ne', 'sw', 'se'].includes(resize.handle)) { const dirX = (resize.handle === 'se' || resize.handle === 'ne') ? 1 : -1; const dirY = (resize.handle === 'se' || resize.handle === 'sw') ? 1 : -1; const eff = Math.abs(dx * dirX) >= Math.abs(dy * dirY) ? dx * dirX : dy * dirY; const base = Math.max(20, resize.startBoxW * sPrev); const f = Math.max(0.2, (base + eff) / base); l.fontSize = Math.max(12, Math.round(resize.startFont * f)); l.textWidth = Math.max(40, Math.round(resize.startW * f)); }
    else if (resize.handle === 'e' || resize.handle === 'w') { const dir = resize.handle === 'w' ? -1 : 1; l.textWidth = Math.max(40, Math.round(resize.startW + (dx * dir) / sPrev)); }
    else { const dir = resize.handle === 's' ? 1 : -1; const base = Math.max(20, resize.startBoxH * sPrev); const f = Math.max(0.2, (base + dy * dir) / base); l.fontSize = Math.max(12, Math.round(resize.startFont * f)); }
    redraw(); syncStyleVals(l); return;
  }
}
function onUp() { drag.active = false; resize.active = false; cellDrag.active = false; if (rotateDrag.active) { rotateDrag.active = false; refreshTextStyle(); } }
function layerById(id) { return (C.layers || []).find(l => l.id === id); }

// 画布内联编辑
function editInline(l) {
  commitInline();
  const wrapEl = document.getElementById('cx-canvas-wrap'); if (!wrapEl || !l._box) return;
  const b = l._box;
  const ta = document.createElement('textarea'); ta.className = 'cx-inline'; ta.value = l.text || '';
  const fpx = Math.min(40, Math.max(15, (l.fontSize || 48) * sPrev));
  const w = Math.min(previewW - 8, Math.max(140, b.w * sPrev));
  let left = Math.max(2, Math.min(b.x * sPrev, previewW - w - 2));
  let top = Math.max(2, Math.min(b.y * sPrev, previewH - 50));
  ta.style.cssText = `left:${left}px;top:${top}px;width:${w}px;font-size:${fpx}px;text-align:${l.align || 'center'};max-height:${Math.max(120, previewH - top - 6)}px;`;
  wrapEl.appendChild(ta); inlineEdit = { active: true, id: l.id, el: ta };
  const grow = () => { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, previewH - top - 6) + 'px'; };
  ta.focus(); ta.setSelectionRange(0, ta.value.length); grow();
  ta.addEventListener('input', () => { const x = layerById(inlineEdit.id); if (!x) return; x.text = ta.value; grow(); redraw(); const s = document.getElementById('cx-seltext'); if (s) s.value = ta.value; });
  ta.addEventListener('keydown', ev => { if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); commitInline(); } else if (ev.key === 'Escape') { ev.preventDefault(); commitInline(); } });
  ta.addEventListener('blur', () => commitInline());
}
function commitInline() {
  if (!inlineEdit.active) return;
  const el = inlineEdit.el, id = inlineEdit.id; inlineEdit = { active: false, id: null, el: null };
  if (el && el.parentNode) el.parentNode.removeChild(el);
  const l = layerById(id); if (l && el) l.text = el.value;
  refreshTextStyle(); redraw();
}

function bindRight() {
  const right = document.getElementById('cx-right'); if (!right) return;
  right.addEventListener('click', e => {
    const rt = e.target.closest('[data-rtab]'); if (rt && rt.parentElement && rt.parentElement.id === 'cx-right-tabs') { rightTab = rt.dataset.rtab; const d = document.getElementById('cx-right-dual'); if (d) d.dataset.rtab = rightTab; document.querySelectorAll('#cx-right-tabs [data-rtab]').forEach(b => b.classList.toggle('active', b === rt)); return; }
    const acc = e.target.closest('[data-acc-toggle]'); if (acc) { const k = acc.dataset.accToggle; accordion[k] = !accordion[k]; refreshRight(); return; }
    handleRightClick(e);
  });
  right.addEventListener('input', handleRightInput);
  right.addEventListener('change', e => { if (e.target.id === 'cx-upload') handleUpload(e); });
  // 左侧 ⑥ 背景图设置的上传 input 在 cx-ws-set 内（也在 #cx-right 里），用同一委托
  right.addEventListener('change', e => { if (e.target.id === 'cx-bgupload') handleBgUpload(e); });
}
function handleRightClick(e) {
  const t = e.target;
  const pub = t.closest('[data-pub]'); if (pub) { C.settings.ratio = pub.dataset.pub; applyRatio(C.settings.ratio); refreshRight(); sizeCanvas(); redraw(); return; }
  const ra = t.closest('[data-ratio]'); if (ra) { C.settings.ratio = ra.dataset.ratio; applyRatio(C.settings.ratio); refreshRight(); sizeCanvas(); redraw(); return; }
  const la = t.closest('[data-layout]'); if (la) { pushUndoC(); const L = LAYOUTS.find(x => x.id === la.dataset.layout); C.settings.layout = L.id; C.settings.cols = L.cols; C.settings.pinstyle = 'grid'; if (participants().length === 0) toast('请先在底部选择要参与拼图的图片'); refreshRight(); loadImages(() => { autoFitSingleImages(); redraw(); }); return; }
  const pin = t.closest('[data-pin]'); if (pin) { pushUndoC(); C.settings.pinstyle = pin.dataset.pin; cellSel = null; if (isFreeMode()) ensureFreeImages(); else if (participants().length === 0) toast('请先在底部选择要参与拼图的图片'); refreshRight(); loadImages(() => { autoFitSingleImages(); redraw(); }); return; }
  if (t.id === 'cx-free-reset') { resetFreeImages(); loadImages(() => redraw()); return; }
  const bg = t.closest('[data-bg]'); if (bg) { const b = BG_PRESETS.find(x => x.id === bg.dataset.bg); C.settings.bg = { ...b }; refreshRight(); redraw(); return; }
  const fr = t.closest('[data-frame]'); if (fr) { C.settings.frame = fr.dataset.frame; refreshRight(); redraw(); return; }
  // 上传贴图
  if (t.id === 'cx-upload-btn') { document.getElementById('cx-upload')?.click(); return; }
  if (t.id === 'cx-bgupload-btn') { document.getElementById('cx-bgupload')?.click(); return; }
  if (t.id === 'cx-bgpaste-btn') { pasteAsBg = !pasteAsBg; refreshBgPanel(); if (pasteAsBg) toast('已开启：下次 Ctrl+V 粘贴将作为背景图'); return; }
  // 背景模板
  if (t.id === 'cx-bgtpl-save') {
    const l = bgLayer(); if (!l) { toast('请先添加背景图'); return; }
    const name = prompt('背景模板名称：', '背景模板' + (bgTemplates.length + 1)); if (!name) return;
    if (bgTemplates.length >= BG_TPL_MAX) { toast(`最多保存 ${BG_TPL_MAX} 个背景模板，请先删除一些`); return; }
    const dataUrl = l.stype === 'img' ? l.dataUrl : null;
    const tpl = { name: name.trim(), dataUrl, xPct: l.xPct || 0.5, yPct: l.yPct || 0.5, scale: l.scale || 2.5, opacity: l.opacity != null ? l.opacity : 1 };
    addBgTemplate(tpl).then(id => { tpl.id = id; bgTemplates.push(tpl); refreshBgPanel(); toast('已保存背景模板：' + tpl.name); }).catch(() => toast('保存失败，请重试')); return;
  }
  if (t.id === 'cx-bgtpl-apply') {
    const sel = document.getElementById('cx-bgtpl-sel'); if (!sel || sel.value === '') { toast('请先选择一个背景模板'); return; }
    const tpl = bgTemplates[+sel.value]; if (!tpl) return;
    if (!tpl.dataUrl) { toast('该模板没有背景图，无法套用'); return; }
    setBgFromDataUrl(tpl.dataUrl);
    // 套用位置/缩放/透明度
    setTimeout(() => { const bl = bgLayer(); if (!bl) return; bl.xPct = tpl.xPct; bl.yPct = tpl.yPct; bl.scale = tpl.scale; bl.opacity = tpl.opacity; redraw(); refreshBgPanel(); toast('已套用背景模板：' + tpl.name); }, 60); return;
  }
  if (t.id === 'cx-bgtpl-del') {
    const sel = document.getElementById('cx-bgtpl-sel'); if (!sel || sel.value === '') { toast('请先选择要删除的背景模板'); return; }
    const idx = +sel.value; const tpl = bgTemplates[idx]; if (!tpl) return;
    if (!window.confirm(`删除背景模板「${tpl.name}」？`)) return;
    removeBgTemplate(tpl.id).then(() => { bgTemplates.splice(idx, 1); refreshBgPanel(); toast('已删除背景模板'); }); return;
  }
  // 拼图工程
  if (t.id === 'cx-new-blank') { newBlank(); return; }
  if (t.id === 'cx-clear-canvas') { clearCanvas(); return; }
  if (t.id === 'cx-scheme-save') { schemeSave(); return; }
  if (t.id === 'cx-scheme-copy') { schemeCopyCurrent(); return; }
  if (t.id === 'cx-scheme-del') { schemeDel(); return; }
  if (t.id === 'cx-preset-apply') { presetApply(); return; }
  if (t.id === 'cx-preset-save') { presetSave(); return; }
  if (t.id === 'cx-preset-update') { presetUpdate(); return; }
  // 图层顺序
  if (t.closest('[data-bgtoggle]')) { const l = curLayer(); if (l) { pushUndoC(); l.asBg = !l.asBg; if (l.asBg) { l.xPct = 0.5; l.yPct = 0.5; if (l.kind === 'sticker') l.size = Math.max(designW, designH) * 1.15; else l.scale = 2.5; l.rotate = 0; if (l.opacity == null) l.opacity = 1; } redraw(); refreshRight(); toast(l.asBg ? '已置为背景' : '已恢复为浮层'); } return; }
  const bgc = t.closest('[data-bgctl]'); if (bgc) {
    const l = bgLayer(); if (!l) return; pushUndoC(); const k = bgc.dataset.bgctl;
    if (k === 'zin') { if (l.kind === 'sticker') l.size *= 1.1; else l.scale = (l.scale || 1) * 1.1; }
    else if (k === 'zout') { if (l.kind === 'sticker') l.size = Math.max(40, l.size * 0.9); else l.scale = Math.max(0.2, (l.scale || 1) * 0.9); }
    else if (k === 'up') l.yPct -= 0.04; else if (k === 'down') l.yPct += 0.04;
    else if (k === 'left') l.xPct -= 0.04; else if (k === 'right') l.xPct += 0.04;
    else if (k === 'reset') { l.xPct = 0.5; l.yPct = 0.5; l.rotate = 0; l.opacity = 1; if (l.kind === 'sticker') l.size = Math.max(designW, designH) * 1.15; else l.scale = 2.5; }
    else if (k === 'restore') { l.asBg = false; selectedLayerId = l.id; redraw(); refreshRight(); toast('已恢复为浮层'); return; }
    else if (k === 'del') { if (!window.confirm('删除背景图？')) return; C.layers = C.layers.filter(x => x !== l); redraw(); refreshRight(); toast('已删除背景图'); return; }
    redraw(); refreshBgPanel(); return;
  }
  const ord = t.closest('[data-order]'); if (ord) { reorderLayer(ord.dataset.order); return; }
  // 自由图片取景/替换
  const nd = t.closest('[data-nudge]'); if (nd) { const l = curLayer(); if (l && l.kind === 'image') { pushUndoC(); const k = nd.dataset.nudge; if (k === 'zin') l.innerScale = Math.min(2.8, (l.innerScale || 1) + 0.1); else if (k === 'zout') l.innerScale = Math.max(1, (l.innerScale || 1) - 0.1); else if (k === 'up') l.innerOffY = Math.max(-1, (l.innerOffY || 0) - 0.1); else if (k === 'down') l.innerOffY = Math.min(1, (l.innerOffY || 0) + 0.1); else if (k === 'left') l.innerOffX = Math.max(-1, (l.innerOffX || 0) - 0.1); else if (k === 'right') l.innerOffX = Math.min(1, (l.innerOffX || 0) + 0.1); redraw(); refreshTextStyle(); } return; }
  if (t.id === 'cx-img-resetview') { const l = curLayer(); if (l) { l.innerScale = 1; l.innerOffX = 0; l.innerOffY = 0; redraw(); refreshTextStyle(); } return; }
  if (t.id === 'cx-img-replace') { awaitingReplace = !awaitingReplace; refreshTextStyle(); if (awaitingReplace) toast('请点击底部素材，替换当前选中图片'); return; }
  if (t.id === 'cx-import-body') { const list = collectStep2Body(); if (!list.length) { toast('暂无第二步正文'); return; } const merged = list.map(x => `${x.name}：\n${x.body}`).join('\n\n'); C.copyBody = (C.copyBody || '').trim() ? (C.copyBody.trim() + '\n\n' + merged) : merged; const ta = document.getElementById('cx-pubbody-text'); if (ta) ta.value = C.copyBody; toast('已导入到发布正文（不上图）'); return; }
  if (t.id === 'cx-copy-pubbody') { const text = (C.copyBody || '').trim(); if (!text) { toast('正文为空'); return; } if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(() => toast('已复制正文')).catch(() => fallbackCopy(text)); else fallbackCopy(text); return; }
  if (t.id === 'cx-clear-pubbody') { if (!(C.copyBody || '').trim()) return; if (!window.confirm('清空发布正文？')) return; C.copyBody = ''; const ta = document.getElementById('cx-pubbody-text'); if (ta) ta.value = ''; toast('已清空正文'); return; }
  const at = t.closest('[data-addtext]'); if (at) { addText(at.dataset.addtext); return; }
  const al = t.closest('[data-align]'); if (al) { const tg = styleTarget(); tg.align = al.dataset.align; if (isTargetLayer()) redraw(); refreshTextStyle(); return; }
  const sw = t.closest('[data-colorfor]'); if (sw) { const tg = styleTarget(); tg[sw.dataset.colorfor] = sw.dataset.color; if (isTargetLayer()) redraw(); refreshTextStyle(); return; }
  const rb = t.closest('[data-rot]'); if (rb) { const tg = styleTarget(); const d = +rb.dataset.rot; let nr = d === 0 ? 0 : (tg.rotate || 0) + d; nr = ((nr + 180) % 360 + 360) % 360 - 180; tg.rotate = nr; if (isTargetLayer()) redraw(); refreshTextStyle(); return; }
  const art = t.closest('[data-art]'); if (art) { const tg = styleTarget(); Object.assign(tg, ART_PRESETS[art.dataset.art].style); if (isTargetLayer()) redraw(); refreshTextStyle(); return; }
  const stk = t.closest('[data-stk]'); if (stk) { addSticker(+stk.dataset.stk); return; }
  if (t.closest('[data-dellayer]')) { delLayer(); return; }
  const fmt = t.closest('[data-fmt]'); if (fmt) { C.settings.exp.format = fmt.dataset.fmt; refreshRight(); return; }
  if (t.id === 'cx-export2') { exportCurrent(); return; }
  if (t.id === 'cx-zip') { exportZip(); return; }
  if (t.id === 'cx-copy2') { copyCopy(); return; }
}
function handleRightInput(e) {
  const t = e.target;
  if (t.id === 'cx-pubbody-text') { C.copyBody = t.value; return; }
  const bgop = t.closest('[data-bgop]'); if (bgop) { const l = bgLayer(); if (l) { l.opacity = parseFloat(t.value) / 100; const sp = bgop.querySelector('.cx-val'); if (sp) sp.textContent = Math.round(parseFloat(t.value)); redraw(); } return; }
  if (t.id === 'cx-scheme-sel') { if (t.value !== '') schemeLoad(+t.value); return; }
  const cz = t.closest('[data-cellzoom]'); if (cz) { const it = itemById(cellSel); if (it) { it.scale = parseFloat(t.value) / 100; const sp = cz.querySelector('.cx-val'); if (sp) sp.textContent = Math.round(parseFloat(t.value)); redraw(); } return; }
  const im = t.closest('[data-img]'); if (im) { const l = curLayer(); if (l) { const k = im.dataset.img; const v = parseFloat(t.value); if (k === 'innerScale') l.innerScale = v / 100; else l[k] = v / 100; const sp = im.querySelector('.cx-val'); if (sp) sp.textContent = Math.round(v); redraw(); } return; }
  const set = t.closest('[data-set]'); if (set) { const k = set.dataset.set; const v = parseFloat(t.value); setNum(k, v); const sp = set.querySelector('.cx-val'); if (sp) sp.textContent = Math.round(v); redraw(); return; }
  if (t.dataset.setColor) { C.settings.bg = { id: 'custom', type: 'solid', color: t.value }; redraw(); return; }
  if (t.dataset.small) { const k = t.dataset.small; C.settings.small[k] = t.type === 'checkbox' ? t.checked : t.value; redraw(); return; }
  if (t.id === 'cx-cw') { C.settings.customW = parseInt(t.value) || 1; applyRatio('自定义'); sizeCanvas(); redraw(); return; }
  if (t.id === 'cx-ch') { C.settings.customH = parseInt(t.value) || 1; applyRatio('自定义'); sizeCanvas(); redraw(); return; }
  if (t.dataset.hd !== undefined && t.type === 'checkbox') { C.settings.exp.hd = t.checked; return; }
  if (t.dataset.zip) { const map = { collage: 'zipCollage', singles: 'zipSingles', copy: 'zipCopy' }; C.settings.exp[map[t.dataset.zip]] = t.checked; return; }
  // 文字样式
  if (t.id === 'cx-seltext') { const l = curLayer(); if (l) { l.text = t.value; redraw(); } return; }
  const lp = t.dataset.lp; if (lp) { const tg = styleTarget(); tg[lp] = t.type === 'checkbox' ? t.checked : t.value; if (isTargetLayer()) redraw(); return; }
  const lpn = t.dataset.lpn; if (lpn) { const tg = styleTarget(); let v = parseFloat(t.value) || 0; if (lpn === 'rotate') v = Math.max(-180, Math.min(180, v)); tg[lpn] = v; if (isTargetLayer()) redraw(); return; }
  const ls = t.closest('[data-ls]'); if (ls) { const tg = styleTarget(); const k = ls.dataset.ls; const v = parseFloat(t.value); if (k === 'lineHeightX10') tg.lineHeight = v / 10; else tg[k] = v; const sp = ls.querySelector('.cx-val'); if (sp) sp.textContent = Math.round(v); if (isTargetLayer()) redraw(); return; }
}
function setNum(k, v) {
  if (k === 'cols') C.settings.cols = v;
  else if (k === 'gap') C.settings.gap = v;
  else if (k === 'outerPad') C.settings.outerPad = v;
  else if (k === 'smallBorderW') C.settings.small.borderWidth = v;
  else if (k === 'smallRadius') C.settings.small.radius = v;
  else if (k === 'quality') C.settings.exp.quality = v;
}

function bindQueue() {
  const q = document.getElementById('cx-queue'); if (!q) return;
  q.addEventListener('click', e => {
    const add = e.target.closest('[data-addcanvas]'); if (add) { addFreeImageFromSource(add.dataset.addcanvas); return; }
    const rep = e.target.closest('[data-replace]'); if (rep) { replaceSelectedImage(rep.dataset.replace); return; }
    const tg = e.target.closest('[data-toggle]'); if (tg) { const it = C.items.find(x => x.frameId === tg.dataset.toggle); if (it) it.on = !it.on; loadImages(() => { refreshQueue(); redraw(); }); return; }
    const mv = e.target.closest('[data-mv]'); if (mv) { moveItem(mv.dataset.id, mv.dataset.mv === 'up' ? -1 : 1); return; }
    // 右侧"替换图片"待选状态下点卡片也可替换
    if (awaitingReplace) { const card = e.target.closest('.cx-qcard'); if (card) { replaceSelectedImage(card.dataset.it); return; } }
  });
  // 拖拽排序
  let dragId = null;
  q.querySelectorAll('.cx-qcard').forEach(card => {
    card.addEventListener('dragstart', () => { dragId = card.dataset.it; });
    card.addEventListener('dragover', e => e.preventDefault());
    card.addEventListener('drop', e => { e.preventDefault(); const tgt = card.dataset.it; reorder(dragId, tgt); });
  });
}
function imgSelected() { const l = curLayer(); return !!(l && l.kind === 'image'); }
// 把底部素材作为自由图片层加到画布（自动切到自由摆放）
function addFreeImageFromSource(frameId) {
  const s = srcById(frameId); if (!s) return;
  C.layers = C.layers || [];
  if (C.settings.pinstyle !== 'free') { C.settings.pinstyle = 'free'; }
  const id = 'IMG-' + frameId + '-' + Math.random().toString(36).slice(2, 5);
  const n = C.layers.filter(l => l.kind === 'image').length;
  C.layers.push({ id, kind: 'image', frameId, xPct: 0.3 + (n % 2) * 0.4, yPct: 0.3 + Math.floor(n / 2) * 0.3, scale: 1, rotate: 0, innerScale: 1, innerOffX: 0, innerOffY: 0 });
  selectedLayerId = id; awaitingReplace = false;
  refreshRight(); loadImages(() => { autoFitSingleImages(); sizeCanvas(); redraw(); });
  toast('已添加到画布（自由摆放）');
}
function replaceSelectedImage(frameId) {
  pushUndoC();
  const l = curLayer();
  if (l && l.kind === 'image') { // 自由图片层替换
    l.frameId = frameId; l.innerScale = 1; l.innerOffX = 0; l.innerOffY = 0;
    awaitingReplace = false; loadImages(() => { redraw(); refreshTextStyle(); }); toast('已替换选中图片'); return;
  }
  if (cellSel) { // 规则/不规则格子替换：用该源图覆盖格子，重置取景
    const it = itemById(cellSel); const s = srcById(frameId);
    if (it && s) { delete imgCache['ov-' + it.frameId]; it.imgUrl = s.dataUrl; it.offX = 0; it.offY = 0; it.scale = 1; loadImages(() => { redraw(); refreshPinZoom(); }); toast('已替换当前格子图片'); }
    return;
  }
  toast('请先在画布上选中一张图片或一个拼图格子，再点"替换选中图"');
}
function moveItem(id, dir) { const i = C.items.findIndex(x => x.frameId === id); const j = i + dir; if (i < 0 || j < 0 || j >= C.items.length) return; pushUndoC(); [C.items[i], C.items[j]] = [C.items[j], C.items[i]]; refreshQueue(); redraw(); }
function reorder(srcId, tgtId) { if (!srcId || srcId === tgtId) return; pushUndoC(); const from = C.items.findIndex(x => x.frameId === srcId); const to = C.items.findIndex(x => x.frameId === tgtId); if (from < 0 || to < 0) return; const [m] = C.items.splice(from, 1); C.items.splice(to, 0, m); refreshQueue(); redraw(); }

// ===== 图层操作 =====
function defaultText() {
  return { fontSize: 64, color: '#ffffff', bold: true, align: 'center', lineHeight: LH, textWidth: Math.round(designW * 0.9),
    strokeOn: true, strokeColor: '#000000', strokeWidth: 6, bgOn: false, bgColor: '#000000', bgAlpha: 0.55, bgRadius: 12,
    borderOn: false, borderColor: '#000000', borderWidth: 2, shadowOn: false, shadowColor: '#000000', rotate: 0, vertical: false, glow: false, glowColor: '#00e5ff' };
}
function defaultSettings() {
  return { ratio: '3:4', customW: 3, customH: 4, layout: 'g4', cols: 2, pinstyle: 'grid', gap: 12, outerPad: 24,
    bg: { id: 'white', type: 'solid', color: '#ffffff' }, frame: '无边框',
    small: { borderOn: false, borderColor: '#ffffff', borderWidth: 6, radius: 12, shadowOn: false },
    exp: { format: 'png', quality: 92, hd: false, zipCollage: true, zipSingles: true, zipCopy: true } };
}
// 兜底补齐颜色等字段，避免 input[type=color] 收到 undefined
function normalizeLayer(l) {
  if (!l) return l;
  if (l.kind === 'text') {
    const d = defaultText();
    ['color', 'strokeColor', 'bgColor', 'borderColor', 'shadowColor', 'glowColor'].forEach(k => { if (typeof l[k] !== 'string' || !/^#/.test(l[k])) l[k] = d[k]; });
    ['fontSize', 'strokeWidth', 'bgRadius', 'borderWidth', 'lineHeight', 'bgAlpha'].forEach(k => { if (l[k] == null) l[k] = d[k]; });
    if (l.align == null) l.align = 'center';
  } else if (l.kind === 'sticker') {
    if (l.stype !== 'img') { if (typeof l.bg !== 'string') l.bg = '#ff2d55'; if (typeof l.color !== 'string') l.color = '#ffffff'; }
  }
  return l;
}
function addText(kind) {
  pushUndoC();
  C.layers = C.layers || [];
  const map = { title: { text: '总标题', fontSize: 84 }, subtitle: { text: '副标题', fontSize: 52 }, body: { text: '说明文字', fontSize: 38, strokeOn: false, bgOn: true }, tag: { text: '标签', fontSize: 40, bgOn: true, bgColor: '#d42a2a', color: '#fff200', strokeOn: false } };
  const yPos = { title: 0.08, subtitle: 0.2, body: 0.85, tag: 0.04 };
  // 合并默认新文字样式(C.textDefault)，让 ③ 文字样式未选中时的设置对新文字生效
  const l = { id: 'T-' + Date.now() + Math.random().toString(36).slice(2, 5), kind: 'text', ...defaultText(), ...(C.textDefault || {}), ...map[kind], xPct: 0.1, yPct: yPos[kind] || 0.1 + (C.layers.length * 0.05) };
  C.layers.push(l); selectedLayerId = l.id; refreshTextStyle(); refreshBgPanel(); redraw();
}
function addSticker(i) {
  const s = STICKERS[i]; if (!s) return; pushUndoC(); C.layers = C.layers || [];
  const l = { id: 'S-' + Date.now() + Math.random().toString(36).slice(2, 5), kind: 'sticker', stype: s.stype, glyph: s.glyph, text: s.text, bg: s.bg, color: s.color, size: 140, xPct: 0.5, yPct: 0.5, rotate: 0 };
  C.layers.push(l); selectedLayerId = l.id; redraw(); renderHandles();
}
function addImageSticker(dataUrl) {
  pushUndoC();
  C.layers = C.layers || [];
  const l = { id: 'S-' + Date.now() + Math.random().toString(36).slice(2, 5), kind: 'sticker', stype: 'img', dataUrl, size: designW * 0.3, xPct: 0.5, yPct: 0.5, rotate: 0 };
  C.layers.push(l); selectedLayerId = l.id;
  loadImages(() => { redraw(); renderHandles(); });
}
function delLayer() { const i = (C.layers || []).findIndex(l => l.id === selectedLayerId); if (i < 0) return; pushUndoC(); C.layers.splice(i, 1); selectedLayerId = null; refreshTextStyle(); redraw(); }

// 自由摆放/单图成品：用图片图层承载
function isFreeMode() { return C.settings.pinstyle === 'free' || C.settings.pinstyle === 'single'; }
function ensureFreeImages() {
  C.layers = C.layers || [];
  const ps = participants();
  const single = C.settings.pinstyle === 'single';
  const have = new Set(C.layers.filter(l => l.kind === 'image').map(l => l.frameId));
  // 移除已不参与的图片层
  C.layers = C.layers.filter(l => l.kind !== 'image' || ps.find(p => p.id === l.frameId));
  ps.forEach((p, i) => {
    if (have.has(p.id)) return;
    if (single) {
      // 单图成品：居中，_autoFitNeeded 标记加载后自动计算 cover scale
      C.layers.push({ id: 'IMG-' + p.id, kind: 'image', frameId: p.id, xPct: 0.5, yPct: 0.5, scale: 2.5, rotate: 0, _autoFitNeeded: true });
    } else {
      const col = i % 2, row = Math.floor(i / 2);
      C.layers.push({ id: 'IMG-' + p.id, kind: 'image', frameId: p.id, xPct: 0.3 + col * 0.4, yPct: 0.28 + row * 0.32, scale: 1, rotate: 0 });
    }
  });
}
function resetFreeImages() { C.layers = (C.layers || []).filter(l => l.kind !== 'image'); ensureFreeImages(); selectedLayerId = null; }
function refreshPinZoom() { const acc = document.querySelector('.cx-acc[data-acc="pin"] .cx-acc-body'); if (acc) acc.innerHTML = renderPinStyle(); }
function refreshBgPanel() { const acc = document.querySelector('.cx-acc[data-acc="bgimg"] .cx-acc-body'); if (acc) acc.innerHTML = renderBgPanel(); }

// 单图成品：图像加载后自动计算 cover scale，让图填满画布
function autoFitSingleImages() {
  if (C.settings.pinstyle !== 'single') return;
  C.layers.filter(l => l.kind === 'image' && l._autoFitNeeded).forEach(l => {
    const img = imgCache[l.frameId];
    if (!img || !img.naturalWidth) return;
    const ir = img.naturalWidth / img.naturalHeight;
    // box: w = designW*0.4*scale, h = w/ir; 需同时覆盖 designW、designH
    const scaleForW = designW / (designW * 0.4);          // 2.5
    const scaleForH = (designH * ir) / (designW * 0.4);
    l.scale = Math.max(scaleForW, scaleForH) + 0.15;      // 留一点取景余量
    delete l._autoFitNeeded;
  });
}

// ===== 背景模板（IndexedDB，支持大 dataUrl）=====
const BG_TPL_DB = 'cx-bg-templates-v1';
const BG_TPL_STORE = 'templates';
const BG_TPL_MAX = 30; // 最多保存 30 个模板

function openBgTplDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(BG_TPL_DB, 1);
    req.onupgradeneeded = ev => {
      const db = ev.target.result;
      if (!db.objectStoreNames.contains(BG_TPL_STORE)) {
        db.createObjectStore(BG_TPL_STORE, { keyPath: 'id', autoIncrement: true });
      }
    };
    req.onsuccess = ev => resolve(ev.target.result);
    req.onerror = () => reject(req.error);
  });
}
async function loadBgTemplates() {
  try {
    const db = await openBgTplDb();
    return new Promise(resolve => {
      const tx = db.transaction(BG_TPL_STORE, 'readonly');
      const req = tx.objectStore(BG_TPL_STORE).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    });
  } catch { return []; }
}
async function addBgTemplate(tpl) {
  const db = await openBgTplDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(BG_TPL_STORE, 'readwrite');
    const req = tx.objectStore(BG_TPL_STORE).add(tpl);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function removeBgTemplate(id) {
  try {
    const db = await openBgTplDb();
    return new Promise(resolve => {
      const tx = db.transaction(BG_TPL_STORE, 'readwrite');
      tx.objectStore(BG_TPL_STORE).delete(id);
      tx.oncomplete = () => resolve();
    });
  } catch {}
}

// ===== 方案 / 模板（localStorage，带容量保护）=====
function safeSet(key, arr) {
  try { localStorage.setItem(key, JSON.stringify(arr)); return true; }
  catch (e) {
    if (e && (e.name === 'QuotaExceededError' || /quota/i.test(e.message || ''))) toast('浏览器本地存储不足：请减少方案数量、删除旧方案，或导出后清理。本次未保存。');
    else toast('保存失败：' + (e.message || '未知错误'));
    return false;
  }
}
function getSchemes() { try { return JSON.parse(localStorage.getItem('cxSchemes') || '[]'); } catch { return []; } }
function setSchemes(a) { return safeSet('cxSchemes', a); }
function getPresets() { try { return JSON.parse(localStorage.getItem('cxPresets') || '[]'); } catch { return []; } }
function setPresets(a) { return safeSet('cxPresets', a); }
// 工程快照：只存结构 + frameId（不重复存参与图片 dataUrl）；贴图上传图保留 dataUrl
function snapshot() { return JSON.parse(JSON.stringify({ items: C.items, layers: (C.layers || []).map(l => { const { _box, ...r } = l; return r; }), settings: C.settings, copyBody: C.copyBody || '', textDefault: C.textDefault || defaultText() })); }
// ===== 撤销 =====
function pushUndoC() { undoStackC.push(snapshot()); if (undoStackC.length > 10) undoStackC.shift(); refreshUndoBtn(); }
function refreshUndoBtn() { const b = document.getElementById('cx-undo'); if (b) b.disabled = undoStackC.length === 0; }
export function undoCollageExport() {
  if (undoStackC.length === 0) { toast('没有可撤销的操作'); return; }
  const snap = undoStackC.pop();
  loadSnapshot(snap); selectedLayerId = null; cellSel = null; awaitingReplace = false;
  applyRatio(C.settings.ratio); imgCache = {};
  if (isFreeMode()) ensureFreeImages();
  refreshRight(); refreshQueue(); loadImages(() => { autoFitSingleImages(); sizeCanvas(); redraw(); }); refreshUndoBtn();
  toast('已撤销');
}
function loadSnapshot(s) { C.items = JSON.parse(JSON.stringify(s.items || [])); C.layers = (JSON.parse(JSON.stringify(s.layers || []))).map(normalizeLayer); C.settings = Object.assign(defaultSettings(), JSON.parse(JSON.stringify(s.settings || {}))); if (!C.settings.small) C.settings.small = defaultSettings().small; C.copyBody = s.copyBody || ''; C.textDefault = s.textDefault || defaultText(); }
function schemeSave() { const sel = document.getElementById('cx-scheme-sel'); const a = getSchemes(); if (sel && sel.value !== '') { a[+sel.value].snap = snapshot(); if (setSchemes(a)) toast('已保存当前拼图'); } else { const name = prompt('拼图工程名称：', '拼图' + (a.length + 1)); if (!name) return; a.push({ name: name.trim(), snap: snapshot() }); if (setSchemes(a)) { toast('已保存当前拼图'); refreshRight(); } } }
function schemeCopyCurrent() { const a = getSchemes(); const name = prompt('复制为新拼图，名称：', '拼图副本'); if (!name) return; a.push({ name: name.trim(), snap: snapshot() }); if (setSchemes(a)) { toast('已复制为新拼图工程'); refreshRight(); } }
function schemeDel() { const sel = document.getElementById('cx-scheme-sel'); const a = getSchemes(); if (!sel || sel.value === '') { toast('请先在下拉里选择要删除的拼图工程'); return; } if (!window.confirm('删除该拼图工程？（不影响底部素材）')) return; a.splice(+sel.value, 1); setSchemes(a); toast('已删除'); refreshRight(); }
function schemeLoad(i) { const a = getSchemes(); if (!a[i]) return; loadSnapshot(a[i].snap); selectedLayerId = null; cellSel = null; awaitingReplace = false; applyRatio(C.settings.ratio); imgCache = {}; if (isFreeMode()) ensureFreeImages(); refreshRight(); refreshQueue(); loadImages(() => { autoFitSingleImages(); sizeCanvas(); redraw(); }); toast(`已载入：${a[i].name}`); }
function clearItemsState() { C.items.forEach(it => { it.on = false; delete it.offX; delete it.offY; delete it.scale; delete it.imgUrl; }); }
function newBlank() {
  if (!window.confirm('新建空白拼图？将清空画布内容与参与图片选择（不删除底部素材库）。')) return;
  pushUndoC();
  C.layers = []; clearItemsState();
  C.settings.pinstyle = 'free';           // 空白未选择：自由摆放、无图
  selectedLayerId = null; cellSel = null; awaitingReplace = false;
  refreshRight(); refreshQueue(); loadImages(() => { sizeCanvas(); redraw(); });
  toast('已新建空白拼图，请从底部选择图片添加到画布');
}
function clearCanvas() {
  if (!window.confirm('清空当前画布？将清掉文字/贴图/自由图层与拼图格子里的图片（保留底部素材与比例/背景/边框）。')) return;
  pushUndoC();
  C.layers = []; clearItemsState();
  selectedLayerId = null; cellSel = null; awaitingReplace = false;
  refreshRight(); refreshQueue(); loadImages(() => { sizeCanvas(); redraw(); });
  toast('已清空画布');
}
function reorderLayer(dir) { const i = (C.layers || []).findIndex(l => l.id === selectedLayerId); if (i < 0) return; pushUndoC(); const a = C.layers; if (dir === 'up' && i < a.length - 1) { [a[i], a[i + 1]] = [a[i + 1], a[i]]; } else if (dir === 'down' && i > 0) { [a[i], a[i - 1]] = [a[i - 1], a[i]]; } else if (dir === 'top') { a.push(a.splice(i, 1)[0]); } else if (dir === 'bottom') { a.unshift(a.splice(i, 1)[0]); } redraw(); }
function presetSnapshot() { const s = JSON.parse(JSON.stringify(C.settings)); const layers = (C.layers || []).filter(l => l.kind !== 'image').map(l => { const { _box, dataUrl, ...r } = l; return r; }); return { settings: s, layers }; }
function presetSave() { const name = prompt('版式模板名称：'); if (!name) return; const a = getPresets(); a.push({ name: name.trim(), ...presetSnapshot() }); if (setPresets(a)) { toast('已保存版式模板（不含图片）'); refreshRight(); } }
function presetUpdate() { const sel = document.getElementById('cx-preset-sel'); const a = getPresets(); if (!sel || sel.value === '') { toast('请先选择要更新的版式模板'); return; } const ps = presetSnapshot(); a[+sel.value].settings = ps.settings; a[+sel.value].layers = ps.layers; if (setPresets(a)) toast('已更新模板'); }
function presetApply() {
  const sel = document.getElementById('cx-preset-sel'); const a = getPresets();
  if (!sel || sel.value === '') { toast('请先选择一个版式模板'); return; }
  const p = a[+sel.value];
  C.settings = Object.assign(defaultSettings(), JSON.parse(JSON.stringify(p.settings || {})));
  // 套用版式：保留当前已选图片（grid/不规则自动进入图片位；free 用 ensureFreeImages 把当前图铺入）
  C.layers = JSON.parse(JSON.stringify(p.layers || [])).map(normalizeLayer);
  applyRatio(C.settings.ratio);
  if (isFreeMode()) ensureFreeImages();
  selectedLayerId = null; cellSel = null; awaitingReplace = false;
  refreshRight(); refreshQueue(); loadImages(() => { autoFitSingleImages(); sizeCanvas(); redraw(); });
  const n = participants().length, slots = slotsFor(C.settings.pinstyle, n);
  if (slots && n < slots.length) toast(`已套用模板：${p.name}。该版式需 ${slots.length} 张，当前 ${n} 张，空位显示"请添加图片"`);
  else toast(`已套用模板：${p.name}（已用当前已选图片）`);
}

// ===== 上传 / 粘贴贴图 =====
function handleUpload(e) {
  const f = e.target.files && e.target.files[0]; if (!f) return;
  const rd = new FileReader(); rd.onload = ev => addImageSticker(ev.target.result); rd.readAsDataURL(f);
  e.target.value = '';
}
// 上传作为背景：若已有背景图则替换其内容，否则新建一个 asBg 贴层
function handleBgUpload(e) {
  const f = e.target.files && e.target.files[0]; if (!f) { return; }
  const rd = new FileReader(); rd.onload = ev => setBgFromDataUrl(ev.target.result);
  rd.readAsDataURL(f); e.target.value = '';
}
function setBgFromDataUrl(dataUrl) {
  pushUndoC();
  C.layers = C.layers || [];
  const ex = bgLayer();
  if (ex) {
    delete imgCache[ex.id]; ex.dataUrl = dataUrl; ex.stype = 'img';
    loadImages(() => { redraw(); refreshBgPanel(); });
    toast('已替换背景图');
    return;
  }
  const id = 'BG-' + Date.now() + Math.random().toString(36).slice(2, 5);
  C.layers.unshift({ id, kind: 'sticker', stype: 'img', dataUrl, size: Math.max(designW, designH) * 1.15, xPct: 0.5, yPct: 0.5, rotate: 0, asBg: true, opacity: 1 });
  selectedLayerId = null;
  loadImages(() => { redraw(); refreshBgPanel(); refreshTextStyle(); });
  toast('已设为背景图');
}
function handlePaste(e) {
  if (!document.getElementById('cx-canvas')) return; // 非本页
  const items = (e.clipboardData || {}).items; if (!items) return;
  for (const it of items) {
    if (it.type && it.type.indexOf('image') === 0) {
      const f = it.getAsFile(); if (!f) continue;
      const rd = new FileReader();
      rd.onload = ev => {
        const url = ev.target.result;
        if (pasteAsBg) { setBgFromDataUrl(url); pasteAsBg = false; toast('已粘贴为背景图'); }
        else if (C.settings.pinstyle !== 'free' && cellSel) {
          pushUndoC(); const item = itemById(cellSel); if (item) { delete imgCache['ov-' + item.frameId]; item.imgUrl = url; item.offX = 0; item.offY = 0; item.scale = 1; loadImages(() => { redraw(); refreshPinZoom(); }); toast('已替换当前图片'); }
        } else {
          addImageSticker(url); toast('已作为图片贴层加入画布');
        }
      };
      rd.readAsDataURL(f); e.preventDefault(); break;
    }
  }
}
function onKeyDown(e) {
  if (!document.getElementById('cx-canvas')) return; // 非本页
  const tag = (document.activeElement && document.activeElement.tagName) || '';
  if (tag === 'INPUT' || tag === 'TEXTAREA' || inlineEdit.active) return;
  if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) { e.preventDefault(); undoCollageExport(); return; }
  if ((e.key === 'Delete' || e.key === 'Backspace') && selectedLayerId) { e.preventDefault(); delLayer(); }
}

// ===== 导出 =====
// 导出倍率：普通 2x、勾选高清 3x（始终比 1080 大，保证清晰）
function exportScale() { return C.settings.exp.hd ? 3 : 2; }
function renderFull(scale) {
  const W = Math.round(designW * scale), H = Math.round(designH * scale);
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const cc = cv.getContext('2d'); cc.imageSmoothingEnabled = true; cc.imageSmoothingQuality = 'high'; cc.scale(scale, scale); drawDesign(cc);
  return cv;
}
function exportCurrent() {
  commitInline();
  const scale = exportScale();
  const cv = renderFull(scale);
  const fmt = C.settings.exp.format;
  const mime = fmt === 'jpg' ? 'image/jpeg' : 'image/png';
  const data = cv.toDataURL(mime, C.settings.exp.quality / 100);
  downloadData(data, `拼图_${Date.now()}.${fmt === 'jpg' ? 'jpg' : 'png'}`);
  toast('已导出当前拼图');
}
function downloadData(dataUrl, name) { const a = document.createElement('a'); a.href = dataUrl; a.download = name; document.body.appendChild(a); a.click(); a.remove(); }

function buildCopyText() {
  const onImg = (C.layers || []).filter(l => l.kind === 'text' && l.text && l.text.trim()).map(l => l.text.trim());
  const parts = [];
  if (onImg.length) parts.push(onImg.join('\n'));
  if ((C.copyBody || '').trim()) parts.push(C.copyBody.trim());
  return parts.join('\n\n');
}
function copyCopy() {
  const txt = buildCopyText();
  if (!txt) { toast('当前没有可复制的文案，请先加文字'); return; }
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(() => toast('文案已复制')).catch(() => fallbackCopy(txt));
  else fallbackCopy(txt);
}
function fallbackCopy(txt) { const ta = document.createElement('textarea'); ta.value = txt; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); toast('文案已复制'); } catch (e) { toast('复制失败，请手动复制'); } ta.remove(); }

function exportZip() {
  commitInline();
  const e = C.settings.exp;
  if (!e.zipCollage && !e.zipSingles && !e.zipCopy) { toast('请至少选择一个导出内容（当前拼图 / 单图 / 文案）'); return; }
  const files = [];
  if (e.zipCollage) { const cv = renderFull(exportScale()); const ext = e.format === 'jpg' ? 'jpg' : 'png'; files.push({ name: `拼图.${ext}`, data: dataUrlToBytes(cv.toDataURL(e.format === 'jpg' ? 'image/jpeg' : 'image/png', e.quality / 100)) }); }
  if (e.zipSingles) { participants().forEach((s, i) => { const safe = (s.name || ('素材' + (i + 1))).replace(/[\\/:*?"<>|]/g, '_'); files.push({ name: `single_${String(i + 1).padStart(2, '0')}_${safe}.png`, data: dataUrlToBytes(s.dataUrl) }); }); }
  if (e.zipCopy) { const txt = buildCopyText() || '暂无正文'; files.push({ name: 'copy.txt', data: strToUtf8(txt) }); }
  if (files.length === 0) { toast('当前没有可导出的内容'); return; }
  const zip = makeZip(files);
  const blob = new Blob([zip], { type: 'application/zip' });
  const url = URL.createObjectURL(blob);
  downloadData(url, `成品包_${Date.now()}.zip`);
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  toast('已导出 ZIP 包');
}
function dataUrlToBytes(dataUrl) { const b64 = dataUrl.split(',')[1]; const bin = atob(b64); const arr = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i); return arr; }
function strToUtf8(s) { return new TextEncoder().encode(s); }

// 内置 ZIP（store，无压缩）+ CRC32，零依赖、可离线
const CRC_TABLE = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(bytes) { let c = 0xFFFFFFFF; for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
function makeZip(files) {
  const enc = new TextEncoder();
  const locals = [], centrals = []; let offset = 0;
  files.forEach(f => {
    const name = enc.encode(f.name), data = f.data, crc = crc32(data);
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

// ===== 局部刷新 =====
function refreshRight() {
  const old = document.getElementById('cx-right'); if (!old) return;
  // 记录右侧两列滚动位置，刷新后恢复，避免操作后跳回顶部
  const setTop = old.querySelector('.cx-ws-set')?.scrollTop || 0;
  const textTop = old.querySelector('.cx-ws-text')?.scrollTop || 0;
  old.outerHTML = renderRight(); bindRight();
  const neu = document.getElementById('cx-right'); if (!neu) return;
  const s = neu.querySelector('.cx-ws-set'); if (s) s.scrollTop = setTop;
  const tx = neu.querySelector('.cx-ws-text'); if (tx) tx.scrollTop = textTop;
}
function refreshQueue() { const old = document.getElementById('cx-queue'); if (!old) return; old.outerHTML = renderQueue(); bindQueue(); }
function refreshTextStyle() {
  const a = document.querySelector('.cx-acc[data-acc="tstyle"] .cx-acc-body'); if (a) a.innerHTML = renderStyleOnly();
  const b = document.querySelector('.cx-acc[data-acc="tobj"] .cx-acc-body'); if (b) b.innerHTML = renderObjPanel();
}
function syncStyleVals(l) { const fs = document.querySelector('[data-ls="fontSize"]'); if (fs) { const i = fs.querySelector('input'); const v = fs.querySelector('.cx-val'); if (i) i.value = l.fontSize; if (v) v.textContent = Math.round(l.fontSize); } }

// ===== 工具 =====
function escapeHTML(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function toast(m) { if (onToastCb) onToastCb(m); let t = document.querySelector('.toast'); if (!t) { t = document.createElement('div'); t.className = 'toast'; document.body.appendChild(t); } t.textContent = m; clearTimeout(toast._t); toast._t = setTimeout(() => t.remove(), 2200); }
