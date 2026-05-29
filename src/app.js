import { renderImageEditPage, initImageEditPage, PRESETS } from './pages/ImageEdit.js';
import { renderTextOverlayPage, initTextOverlayPage } from './pages/TextOverlay.js';
import { renderEditWorkbench, initEditWorkbench, undoWorkbench, saveCurrentWorkbench, exportCurrentWorkbenchImage, copyCurrentWorkbenchBody, exportCurrentWorkbenchBody } from './pages/EditWorkbench.js';
import { renderCollageExport, initCollageExport } from './pages/CollageExport.js';
import { checkStoredLicense, verifyLicense, storeLicense, clearLicense } from './license.js';

// ===== GLOBAL STATE =====
// 数据模型说明
//
// frame（第一步素材，第二步在它上面生成版本）
//   id, sourceDataUrl, versionsCache, activeRatio, time, edited, source, materialName
//   versionsCache: { '3:4': dataUrl, '4:3': dataUrl, ... } — 第二步生成的纯净比例版本，
//                  绝不包含「加字版」（加字结果只存在 state.textResults，不污染原始版本）
//
// state.textResults[targetId] = { dataUrl, savedAt }
//   第三步保存的「加字成品」，targetId = `${frameId}::${versionKey||'__source__'}`
//
// state.textProjects[targetId] = { layers, scripts, vertical, ... }
//   第三步的工程数据（图层、文案）
//
const state = {
  currentPage: 'video',
  videos: [],
  activeVideoId: '',
  capturedFrames: [],
  selectedFrameId: '',
  editImageId: null,
  // 第三步当前正在编辑的 targetId（不是 frameId）
  textActiveTargetId: null,
  // 第三步成品：targetId -> { dataUrl, savedAt }
  textResults: {},
  // 第三步工程：targetId -> project
  textProjects: {},
  // ===== 成图编辑工作台（新第二步）=====
  workbenchFrameId: null,
  editProjects: {},   // frameId -> { baseDataUrl, layers, scripts, processed, saved, templateName }
  editResults: {},    // frameId -> { dataUrl, savedAt } 加字/处理后的成品图
  // ===== 拼图导出 / 出成品图 =====
  collage: {
    items: [],
    layers: [],
    copyBody: '',
    settings: {
      ratio: '3:4', customW: 3, customH: 4,
      layout: 'g4', cols: 2, pinstyle: 'grid', gap: 12, outerPad: 24,
      bg: { id: 'white', type: 'solid', color: '#ffffff' },
      frame: '无边框',
      small: { borderOn: false, borderColor: '#ffffff', borderWidth: 6, radius: 12, shadowOn: false },
      exp: { format: 'png', quality: 92, hd: false, zipCollage: true, zipSingles: true, zipCopy: true },
    },
  },
  toast: '',
  toastTimeout: null,
  regionSelecting: false,
  regionRect: null,
};

// 素材名计数器（"素材0001" 形式），全局稳定递增，删除素材也不重用
let materialNameCounter = 1;
function nextMaterialName() {
  const n = String(materialNameCounter++).padStart(4, '0');
  return `素材${n}`;
}

// targetId 工具
function makeTargetId(frameId, versionKey) {
  return `${frameId}::${versionKey || '__source__'}`;
}
function parseTargetId(targetId) {
  const [frameId, vk] = targetId.split('::');
  return { frameId, versionKey: vk === '__source__' ? null : vk };
}

// 从 capturedFrames 自动收集"待加字"目标列表
// 规则：每个 frame 的所有 versionsCache 比例版本都自动成为 target
// P0防线：只有versionsCache[versionKey]存在且非空，才加入target列表
// 绝对不允许fallback到sourceDataUrl或其他原图
function collectTextTargets() {
  const targets = [];
  state.capturedFrames.forEach(frame => {
    const vcache = frame.versionsCache || {};
    const keys = Object.keys(vcache);
    keys.forEach(versionKey => {
      const dataUrl = vcache[versionKey];
      if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) {
        // 没有有效finalDataUrl的版本直接跳过，绝不fallback到sourceDataUrl
        console.warn('[TextOverlay] skip target – no valid finalDataUrl:', frame.id, versionKey);
        return;
      }
      targets.push({
        targetId: makeTargetId(frame.id, versionKey),
        frameId: frame.id,
        versionKey,
        materialName: frame.materialName || '未命名素材',
        sourceType: 'version-final',   // 明确标记：只来自纯净成品图
      });
    });
  });
  return targets;
}

const app = document.getElementById('app');

// ===== ROUTER =====
function navigateTo(page, params = {}) {
  state.currentPage = page;
  if ((page === 'edit' || page === 'text') && params.imageId) state.editImageId = params.imageId;
  if (page === 'workbench' && params.imageId) state.workbenchFrameId = params.imageId;
  window.location.hash = page;
  render();
}

// ===== RENDER =====
function render() {
  // 确保进入编辑页时 editImageId 有效
  if (state.currentPage === 'edit') {
    const valid = state.capturedFrames.find(f => f.id === state.editImageId);
    if (!valid) {
      state.editImageId = state.capturedFrames[0]?.id || null;
    }
    if (!state.editImageId) {
      // 没有素材，自动跳回选图页
      state.currentPage = 'video';
    }
  }
  app.innerHTML = `
    ${renderTopbar()}
    <div class="page-content ${(state.currentPage === 'workbench' || state.currentPage === 'export') ? 'page-content-full' : ''}">
      ${state.currentPage === 'video' ? renderVideoPage() : ''}
      ${state.currentPage === 'edit' ? renderEditPage() : ''}
      ${state.currentPage === 'text' ? renderTextPage() : ''}
      ${state.currentPage === 'workbench' ? renderWorkbenchPage() : ''}
      ${state.currentPage === 'export' ? renderExportPage() : ''}
    </div>
    ${state.toast ? `<div class="toast">${state.toast}</div>` : ''}
  `;
  bindGlobalEvents();
  if (state.currentPage === 'video') bindVideoPageEvents();
  if (state.currentPage === 'edit') bindEditPageEvents();
  if (state.currentPage === 'text') bindTextPageEvents();
  if (state.currentPage === 'workbench') bindWorkbenchPage();
  if (state.currentPage === 'export') bindExportPage();
}

function renderTopbar() {
  const pages = [
    { id: 'video',     label: '视频选图', icon: '▶' },
    { id: 'workbench', label: '成图编辑', icon: '✎' },
    { id: 'export',    label: '拼图导出', icon: '▣' },
  ];
  return `
    <header class="app-topbar">
      <div class="topbar-brand">✦ <span>贴图工具</span></div>
      <nav class="topbar-nav">
        ${pages.map(p => `
          <button class="nav-btn ${state.currentPage === p.id ? 'active' : ''}" data-nav="${p.id}">
            <span class="nav-icon">${p.icon}</span>
            ${p.label}
          </button>
        `).join('')}
      </nav>
      <div class="topbar-actions">
        ${state.currentPage === 'workbench' ? `
          <button id="btn-wb-undo" class="wb-top-btn">↶ 撤销</button>
          <button id="btn-wb-copybody" class="wb-top-btn">📋 复制正文</button>
          <button id="btn-wb-exportbody" class="wb-top-btn">📄 导出正文txt</button>
          <button id="btn-wb-export" class="wb-top-btn">⬇ 导出单图</button>
          <button id="btn-wb-save" class="primary wb-top-btn">💾 保存当前</button>
        ` : `<span style="font-size:12px;color:var(--color-text-muted);font-weight:700;">美食养生贴图工具 V1</span>`}
      </div>
    </header>
  `;
}

// ===== VIDEO PAGE =====
function renderVideoPage() {
  return `
    <div class="video-page">
      ${renderUploadHint()}
      ${renderMaterialToolbar()}
      <div class="two-col">
        <div class="left-col">
          ${renderVideoArea()}
          ${renderVideoList()}
          ${renderTimeline()}
          ${renderCaptureActions()}
        </div>
        <div class="right-col">
          ${renderCapturedPool()}
        </div>
      </div>
    </div>
  `;
}

function renderUploadHint() {
  return `
    <div class="upload-hint" style="margin-bottom:10px;">
      <span class="hint-icon">💡</span>
      <span>手机传素材到电脑：优先用 QQ / 数据线 / AirDrop，<strong>不建议用微信直接传图</strong>，微信会压缩图片导致变糊。</span>
    </div>
  `;
}

// 常驻的素材入口工具栏 — 不管当前有没有视频/图片都显示
function renderMaterialToolbar() {
  const vCount = state.videos.length;
  const iCount = state.capturedFrames.length;
  return `
    <div class="material-toolbar">
      <button class="primary" id="btn-add-videos">📹 添加视频${vCount ? `（${vCount}）` : ''}</button>
      <button class="primary" id="btn-add-images">🖼 添加图片</button>
      <div class="material-toolbar-pool-info">📸 素材池：<strong>${iCount}</strong> 张</div>
      <div class="material-toolbar-spacer"></div>
      <span class="material-toolbar-hint">视频和图片都进入下方截图池，可混合使用</span>
    </div>
  `;
}

function renderVideoArea() {
  const activeVideo = getActiveVideo();
  if (!activeVideo) {
    return `
      <div class="video-area">
        <div class="video-placeholder">
          <div class="placeholder-icon">🎬</div>
          <div class="placeholder-text">${state.videos.length === 0 ? '上传视频后在这里播放' : '请从下方视频列表选择一个'}</div>
          <button class="primary" id="btn-add-videos-placeholder" style="margin-top:8px;height:36px;padding:0 18px;border-radius:999px;font-weight:800;">
            ＋ 添加视频
          </button>
        </div>
      </div>
    `;
  }
  return `
    <div class="video-area" id="video-area">
      <video id="main-video" src="${activeVideo.url}" controls playsinline></video>
      <div class="video-badge">${activeVideo.name}</div>
      ${state.regionSelecting ? `
        <div class="region-overlay" id="region-overlay">
          <div class="region-info">拖动框选截图区域</div>
          <button id="btn-confirm-region" class="primary" style="position:absolute;bottom:8px;right:8px;height:32px;padding:0 14px;font-size:13px;font-weight:800;">✓ 确认截取</button>
          <button id="btn-cancel-region" style="position:absolute;bottom:8px;right:130px;height:32px;padding:0 14px;font-size:13px;font-weight:700;">✕ 取消</button>
        </div>
      ` : ''}
    </div>
  `;
}

function renderVideoList() {
  if (state.videos.length === 0) return '';
  return `
    <div style="margin-top:10px;">
      <div class="section-card">
        <div class="section-header">
          <div class="section-title">视频素材</div>
          <div class="section-subtitle">共 ${state.videos.length} 个 · 点击切换 · 删除仅移除视频，保留已截图片</div>
        </div>
        <div class="section-body" style="padding:8px 12px;">
          <div class="video-list">
            ${state.videos.map((v, idx) => `
              <div class="video-list-item ${state.activeVideoId === v.id ? 'active' : ''}" data-video-id="${v.id}">
                <div class="vli-idx">${idx + 1}</div>
                <div class="vli-name" title="${v.name}">${v.name}</div>
                <button class="vli-del" data-del-video="${v.id}" title="删除此视频（保留已截图片）">×</button>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderTimeline() {
  if (!getActiveVideo()) return '';
  return `
    <div style="margin-top:10px;">
      <div class="section-card">
        <div class="section-header">
          <div class="section-title">时间轴</div>
          <div class="section-subtitle">点击跳到对应时间点</div>
        </div>
        <div class="section-body">
          <div class="timeline-strip" id="timeline-strip"></div>
        </div>
      </div>
    </div>
  `;
}

function renderCaptureActions() {
  const hasVideo = !!getActiveVideo();
  return `
    <div style="margin-top:10px;">
      <div class="section-card">
        <div class="section-header"><div class="section-title">截帧操作</div></div>
        <div class="section-body">
          <div class="action-bar">
            <button class="primary btn-capture" id="btn-capture" ${!hasVideo ? 'disabled' : ''}>📷 截取当前帧</button>
            <button id="btn-prev-frame" ${!hasVideo ? 'disabled' : ''}>◀ 上一帧</button>
            <button id="btn-next-frame" ${!hasVideo ? 'disabled' : ''}>下一帧 ▶</button>
          </div>
          <div class="action-bar" style="margin-top:6px;">
            <button id="btn-select-region" ${!hasVideo ? 'disabled' : ''}>✂ 截取选区</button>
            <button id="btn-delete-frame" ${!state.selectedFrameId ? 'disabled' : ''} class="danger" style="margin-left:auto;">🗑 删除选中</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderCapturedPool() {
  const frames = state.capturedFrames;
  const selectedIndex = frames.findIndex(f => f.id === state.selectedFrameId);
  return `
    <div class="section-card">
      <div class="section-header">
        <div class="section-title">📸 截图池</div>
        <div class="section-subtitle">共 ${frames.length} 张${selectedIndex >= 0 ? ` / 当前选中第 ${selectedIndex + 1} 张` : ''}</div>
      </div>
      <div class="section-body">
        <div class="pool-grid" id="captured-pool">
          ${frames.length === 0 ? `
            <div class="pool-empty">
              <span>📷</span><span>素材池还是空的</span>
              <span style="font-size:11px;">添加图片或从视频里截图，素材会出现在这里</span>
            </div>
          ` : ''}
          ${frames.map((f, idx) => renderPoolCard(f, idx)).join('')}
        </div>
        <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
          <button class="primary" id="btn-open-edit" ${!state.selectedFrameId ? 'disabled' : ''} style="height:36px;padding:0 16px;font-size:13px;font-weight:800;">✎ 进入成图编辑</button>
          <button id="btn-clear-pool" ${frames.length === 0 ? 'disabled' : ''} style="height:34px;padding:0 12px;font-size:12px;font-weight:700;">清空全部</button>
        </div>
      </div>
    </div>
  `;
}

function renderPoolCard(f, idx) {
  const vKeys = Object.keys(f.versionsCache || {});
  const thumb = vKeys.length > 0 ? f.versionsCache[vKeys[vKeys.length - 1]] : f.sourceDataUrl;
  const hasVersions = vKeys.length > 0;
  const sourceTag = renderSourceTag(f.source);
  const matName = f.materialName || ('素材' + String(idx + 1).padStart(4, '0'));
  return `
    <div class="pool-card ${state.selectedFrameId === f.id ? 'active' : ''}" data-frame-id="${f.id}">
      <img src="${thumb}" alt="${matName}" draggable="false">
      <div class="pool-card-info">
        <div class="pool-card-label">${matName}${hasVersions ? ` · ${vKeys.length}版` : ''}</div>
        <div class="pool-card-time" title="${sourceTag.title}">${sourceTag.html}</div>
      </div>
      <button class="pool-card-delete" data-delete-frame="${f.id}" title="删除">×</button>
    </div>
  `;
}

function renderSourceTag(source) {
  if (!source) return { html: '—', title: '未知来源' };
  if (source.type === 'upload') {
    return { html: `<span class="src-tag src-upload">🖼 上传</span>`, title: '直接上传的图片' };
  }
  if (source.type === 'video-frame') {
    return {
      html: `<span class="src-tag src-frame" title="${source.videoName} ${source.time}">▶ ${source.videoName?.slice(0, 8) || '视频'} · ${source.time}</span>`,
      title: `${source.videoName} / ${source.time}`,
    };
  }
  if (source.type === 'video-region') {
    return {
      html: `<span class="src-tag src-region" title="${source.videoName} ${source.time}（选区）">▣ ${source.videoName?.slice(0, 8) || '视频'} · ${source.time}</span>`,
      title: `${source.videoName} / ${source.time} 选区`,
    };
  }
  return { html: '—', title: '未知' };
}

// ===== EDIT PAGE =====
function renderEditPage() {
  return renderImageEditPage(state.capturedFrames, state.editImageId, handleEditSave);
}

// ===== 成图编辑工作台（新第二步）=====
function renderWorkbenchPage() {
  if (state.capturedFrames.length === 0) {
    return `
      <div class="no-video-state">
        <div class="nv-icon">🖼</div>
        <div class="nv-title">还没有素材</div>
        <div class="nv-desc">先在「视频选图」里截取或上传图片，再回来做成图编辑。</div>
        <button class="primary" data-nav="video">前往视频选图</button>
      </div>
    `;
  }
  if (!state.capturedFrames.find(f => f.id === state.workbenchFrameId)) {
    state.workbenchFrameId = state.capturedFrames[0].id;
  }
  return renderEditWorkbench({
    frames: state.capturedFrames,
    currentFrameId: state.workbenchFrameId,
    projects: state.editProjects,
    results: state.editResults,
    onSwitchFrame: (id) => { state.workbenchFrameId = id; },
    onSaveResult: ({ frameId, dataUrl }) => { state.editResults[frameId] = { dataUrl, savedAt: Date.now() }; },
    onDeleteFrame: (frameId, newCurrentId) => {
      state.capturedFrames = state.capturedFrames.filter(f => f.id !== frameId);
      delete state.editProjects[frameId];
      delete state.editResults[frameId];
      if (state.selectedFrameId === frameId) state.selectedFrameId = state.capturedFrames[0]?.id || '';
      state.workbenchFrameId = state.capturedFrames.find(f => f.id === newCurrentId) ? newCurrentId : (state.capturedFrames[0]?.id || null);
      render();
    },
  });
}

// ===== 拼图导出页 =====
function renderExportPage() {
  return renderCollageExport({
    frames: state.capturedFrames,
    editResults: state.editResults,
    editProjects: state.editProjects,
    collage: state.collage,
    onToast: (m) => { /* CollageExport 自行弹 toast */ },
  });
}
function bindExportPage() {
  initCollageExport();
}

function bindWorkbenchPage() {
  if (state.capturedFrames.length === 0) return;
  initEditWorkbench();
  document.getElementById('btn-wb-undo')?.addEventListener('click', () => undoWorkbench());
  document.getElementById('btn-wb-export')?.addEventListener('click', () => exportCurrentWorkbenchImage());
  document.getElementById('btn-wb-copybody')?.addEventListener('click', () => copyCurrentWorkbenchBody());
  document.getElementById('btn-wb-exportbody')?.addEventListener('click', () => exportCurrentWorkbenchBody());
  document.getElementById('btn-wb-save')?.addEventListener('click', () => saveCurrentWorkbench());
}

// ===== TEXT PAGE =====
function renderTextPage() {
  const targets = collectTextTargets();
  if (state.capturedFrames.length === 0) {
    return `
      <div class="no-video-state">
        <div class="nv-icon">🖼</div>
        <div class="nv-title">还没有素材</div>
        <div class="nv-desc">先在「视频选图」里截取或上传图片，然后再回来加字。</div>
        <button class="primary" data-nav="video">前往视频选图</button>
      </div>
    `;
  }
  if (targets.length === 0) {
    return `
      <div class="no-video-state">
        <div class="nv-icon">✂</div>
        <div class="nv-title">还没有可加字的图片版本</div>
        <div class="nv-desc">第三步只处理"已选好比例的图片版本"。请先到「图片编辑」里裁出 3:4 / 4:3 / 16:9 等版本，保存后会自动出现在这里。</div>
        <button class="primary" data-nav="edit">前往图片编辑</button>
      </div>
    `;
  }
  // 校验/锁定 textActiveTargetId
  if (!targets.find(t => t.targetId === state.textActiveTargetId)) {
    state.textActiveTargetId = targets[0].targetId;
  }
  return renderTextOverlayPage({
    targets,
    frames: state.capturedFrames,
    activeTargetId: state.textActiveTargetId,
    projects: state.textProjects,
    results: state.textResults,
    onSave: handleTextSave,
    onSwitchTarget: (tid) => { state.textActiveTargetId = tid; },
    onRemoveTarget: handleRemoveTarget,
  });
}

function handleTextSave({ targetId, dataUrl, project }) {
  // 加字成品独立存储，绝不污染 frame.versionsCache
  state.textResults[targetId] = { dataUrl, savedAt: Date.now() };
  if (project) state.textProjects[targetId] = project;
}

// 删除第三步的待加字 target（不影响第二步原始图片/版本）
function handleRemoveTarget(targetId, materialName) {
  if (targetId) {
    // 删除单个版本
    delete state.textResults[targetId];
    delete state.textProjects[targetId];
  } else if (materialName) {
    // 删除整组（通过 materialName 匹配）
    const frame = state.capturedFrames.find(f => f.materialName === materialName);
    if (frame) {
      Object.keys(state.textResults).forEach(tid => {
        if (tid.startsWith(frame.id + '::')) delete state.textResults[tid];
      });
      Object.keys(state.textProjects).forEach(tid => {
        if (tid.startsWith(frame.id + '::')) delete state.textProjects[tid];
      });
    }
  }
  // 强制重新渲染文字页（刷新左侧列表）
  render();
}

function handleEditSave({ versionKey, dataUrl, versionsCache, silent, deleteFrameId }) {
  if (deleteFrameId) {
    // 删除整个素材
    const frameIdx = state.capturedFrames.findIndex(f => f.id === deleteFrameId);
    if (frameIdx >= 0) state.capturedFrames.splice(frameIdx, 1);
    // 清理相关的 textResults（该素材所有版本的加字成品）
    Object.keys(state.textResults).forEach(tid => {
      if (tid.startsWith(deleteFrameId + '::')) delete state.textResults[tid];
    });
    // 清理相关的 textProjects
    Object.keys(state.textProjects).forEach(tid => {
      if (tid.startsWith(deleteFrameId + '::')) delete state.textProjects[tid];
    });
    // 如果当前编辑的就是被删的素材，切到另一个
    if (state.editImageId === deleteFrameId) {
      state.editImageId = state.capturedFrames[0]?.id || null;
    }
    // 强制重新渲染 Edit 页面（因为 capturedFrames 已变）
    render();
    return;
  }
  const frame = state.capturedFrames.find(f => f.id === state.editImageId);
  if (!frame) return;
  if (versionsCache) {
    frame.versionsCache = { ...versionsCache };
  } else if (versionKey && dataUrl) {
    frame.versionsCache = frame.versionsCache || {};
    frame.versionsCache[versionKey] = dataUrl;
  }
  frame.edited = Object.keys(frame.versionsCache || {}).length > 0;
  // 不触发 full render，ImageEdit 内部自己刷新 UI
}

// ===== EVENT BINDING =====
function bindGlobalEvents() {
  document.querySelectorAll('[data-nav]').forEach(btn => {
    btn.addEventListener('click', () => navigateTo(btn.dataset.nav));
  });

  const toastEl = document.querySelector('.toast');
  if (toastEl) {
    if (state.toastTimeout) clearTimeout(state.toastTimeout);
    state.toastTimeout = setTimeout(() => {
      state.toast = '';
      document.querySelector('.toast')?.remove();
    }, 2500);
  }
}

let videoReady = false;
let timelineBuiltForVideoId = '';

function bindVideoPageEvents() {
  // 常驻入口
  document.getElementById('btn-add-videos')?.addEventListener('click', triggerVideoUpload);
  document.getElementById('btn-add-images')?.addEventListener('click', triggerImageUpload);
  document.getElementById('btn-add-videos-placeholder')?.addEventListener('click', triggerVideoUpload);

  // 视频列表
  document.querySelectorAll('.video-list-item').forEach(el => {
    el.addEventListener('click', e => {
      if (e.target.closest('.vli-del')) return; // 删除按钮单独处理
      switchActiveVideo(el.dataset.videoId);
    });
  });
  document.querySelectorAll('[data-del-video]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      deleteVideo(btn.dataset.delVideo);
    });
  });

  const videoEl = document.getElementById('main-video');
  if (videoEl) {
    // 每次 active 切换都需要重新挂 loadedmetadata
    videoEl.addEventListener('loadedmetadata', onVideoLoaded);
    document.getElementById('btn-capture')?.addEventListener('click', captureCurrentFrame);
    document.getElementById('btn-prev-frame')?.addEventListener('click', () => stepFrame(-1));
    document.getElementById('btn-next-frame')?.addEventListener('click', () => stepFrame(1));
    document.getElementById('btn-delete-frame')?.addEventListener('click', deleteSelectedFrame);
    document.getElementById('btn-select-region')?.addEventListener('click', startRegionSelection);
  } else {
    document.getElementById('btn-delete-frame')?.addEventListener('click', deleteSelectedFrame);
  }

  document.getElementById('captured-pool')?.addEventListener('click', onPoolClick);
  document.getElementById('btn-open-edit')?.addEventListener('click', () => {
    if (state.selectedFrameId) navigateTo('workbench', { imageId: state.selectedFrameId });
  });
  document.getElementById('btn-clear-pool')?.addEventListener('click', clearPool);

  document.getElementById('btn-confirm-region')?.addEventListener('click', () => {
    if (state.regionRect) captureRegion();
  });
  document.getElementById('btn-cancel-region')?.addEventListener('click', cancelRegionSelection);

  const videoArea = document.getElementById('video-area');
  if (videoArea) bindRegionDrag(videoArea);
}

function bindEditPageEvents() {
  const currentFrame = state.capturedFrames.find(f => f.id === state.editImageId);
  if (currentFrame?.sourceDataUrl) initImageEditPage(currentFrame);

  window.editPageSwitchImage = (id) => {
    const frame = state.capturedFrames.find(f => f.id === id);
    if (!frame) return;
    state.editImageId = id;
    render();
  };
}

function bindTextPageEvents() {
  if (state.capturedFrames.length === 0) return;
  initTextOverlayPage();
}

// ===== VIDEO MANAGEMENT (多视频) =====
function getActiveVideo() {
  return state.videos.find(v => v.id === state.activeVideoId);
}

function triggerVideoUpload() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'video/*';
  input.multiple = true;
  input.onchange = e => {
    const files = Array.from(e.target.files || []);
    files.forEach(addVideoFile);
  };
  input.click();
}

function addVideoFile(file) {
  const id = `vid-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const url = URL.createObjectURL(file);
  state.videos.push({ id, name: file.name, url, duration: 0 });
  // 第一次添加自动切到这个视频
  if (!state.activeVideoId) state.activeVideoId = id;
  showToast(`已添加视频：${file.name}`);
  render();
}

function switchActiveVideo(videoId) {
  if (state.activeVideoId === videoId) return;
  state.activeVideoId = videoId;
  timelineBuiltForVideoId = ''; // 重建时间轴
  render();
}

function deleteVideo(videoId) {
  const v = state.videos.find(x => x.id === videoId);
  if (!v) return;
  // 默认仅移除视频源，保留已截图片
  const framesFromThisVideo = state.capturedFrames.filter(f =>
    f.source && (f.source.type === 'video-frame' || f.source.type === 'video-region') && f.source.videoId === videoId
  ).length;
  const msg = framesFromThisVideo > 0
    ? `删除视频「${v.name}」？\n（来自这个视频的 ${framesFromThisVideo} 张截图会保留在素材池里）`
    : `删除视频「${v.name}」？`;
  if (!window.confirm(msg)) return;

  URL.revokeObjectURL(v.url);
  state.videos = state.videos.filter(x => x.id !== videoId);
  if (state.activeVideoId === videoId) {
    state.activeVideoId = state.videos[0]?.id || '';
    timelineBuiltForVideoId = '';
  }
  showToast(`已移除视频：${v.name}`);
  render();
}

// ===== IMAGE UPLOAD =====
function triggerImageUpload() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.multiple = true;
  input.onchange = e => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    files.forEach(loadImageFile);
  };
  input.click();
}

function loadImageFile(file) {
  const reader = new FileReader();
  reader.onload = e => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      canvas.getContext('2d').drawImage(img, 0, 0);
      const dataUrl = canvas.toDataURL('image/png');
      const frame = {
        id: `img-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        materialName: nextMaterialName(),
        sourceDataUrl: dataUrl,
        versionsCache: {},
        activeRatio: 'original',
        time: file.name.replace(/\.[^.]+$/, '').slice(0, 14),
        edited: false,
        source: { type: 'upload', name: file.name },
      };
      state.capturedFrames.unshift(frame);
      state.selectedFrameId = frame.id;
      updatePoolDOM();
      updateToolbarCounters();
      showToastDirect(`已加入图片：${file.name}`);
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

// ===== VIDEO LOADED / TIMELINE =====
function onVideoLoaded() {
  const videoEl = document.getElementById('main-video');
  const activeId = state.activeVideoId;
  if (!videoEl || !activeId) return;
  const v = getActiveVideo();
  if (v) v.duration = videoEl.duration;
  if (timelineBuiltForVideoId !== activeId) {
    timelineBuiltForVideoId = activeId;
    buildTimelineStrip();
  }
}

function buildTimelineStrip() {
  const strip = document.getElementById('timeline-strip');
  const v = getActiveVideo();
  const video = document.getElementById('main-video');
  if (!strip || !v || !video || !v.duration) return;
  const count = Math.min(24, Math.ceil(v.duration * 2));

  strip.innerHTML = Array.from({ length: count }, (_, i) => {
    const t = (i / count) * v.duration;
    const mins = String(Math.floor(t / 60)).padStart(2, '0');
    const secs = String(Math.floor(t % 60)).padStart(2, '0');
    return `
      <div class="tl-frame" data-t="${t.toFixed(2)}">
        <canvas class="frame-thumb" width="48" height="34"></canvas>
        <span class="frame-time">${mins}:${secs}</span>
      </div>
    `;
  }).join('');

  strip.querySelectorAll('.tl-frame').forEach(el => {
    el.addEventListener('click', () => {
      const t = parseFloat(el.dataset.t);
      if (video) video.currentTime = t;
      strip.querySelectorAll('.tl-frame').forEach(e => e.classList.remove('active'));
      el.classList.add('active');
    });
  });

  // Draw thumbnails — 串行 seek 以保证每张都拿到
  requestAnimationFrame(() => {
    const cells = Array.from(strip.querySelectorAll('canvas'));
    const orig = video.currentTime;
    let idx = 0;
    const drawNext = () => {
      if (idx >= cells.length) {
        video.currentTime = orig;
        return;
      }
      const canvas = cells[idx];
      const parent = canvas.closest('.tl-frame');
      const t = parseFloat(parent.dataset.t);
      const handler = () => {
        try { canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height); } catch (_) {}
        video.removeEventListener('seeked', handler);
        idx++;
        drawNext();
      };
      video.addEventListener('seeked', handler);
      video.currentTime = t;
    };
    drawNext();
  });
}

function stepFrame(delta) {
  const video = document.getElementById('main-video');
  const v = getActiveVideo();
  if (!video || !v) return;
  const frameDuration = 1 / 30;
  video.currentTime = Math.max(0, Math.min(v.duration || video.duration, video.currentTime + delta * frameDuration));
}

// ===== CAPTURE =====
function captureCurrentFrame() {
  const video = document.getElementById('main-video');
  const v = getActiveVideo();
  if (!video || !v) { showToast('请先添加并选择一个视频'); return; }
  if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) { showToast('视频尚未加载完成'); return; }

  const t = video.currentTime;
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth || 1920;
  canvas.height = video.videoHeight || 1080;
  canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
  const dataUrl = canvas.toDataURL('image/png');

  const frame = {
    id: `frame-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    materialName: nextMaterialName(),
    sourceDataUrl: dataUrl,
    versionsCache: {},
    activeRatio: 'original',
    time: formatTime(t),
    edited: false,
    source: { type: 'video-frame', videoId: v.id, videoName: v.name, time: formatTime(t) },
  };
  state.capturedFrames.unshift(frame);
  state.selectedFrameId = frame.id;

  updatePoolDOM();
  updateToolbarCounters();
  showToastDirect(`已截取 ${formatTime(t)}，共 ${state.capturedFrames.length} 张`);
}

// ===== REGION SELECTION =====
function startRegionSelection() {
  if (!getActiveVideo()) { showToast('请先选择一个视频'); return; }
  state.regionSelecting = true;
  state.regionRect = null;
  showToast('在视频画面上拖动框选区域');
  render();
}

function captureRegion() {
  const video = document.getElementById('main-video');
  const v = getActiveVideo();
  if (!video || !state.regionRect || !v) return;

  const { sx, sy, sw, sh } = state.regionRect;
  const canvas = document.createElement('canvas');
  canvas.width = sw;
  canvas.height = sh;
  canvas.getContext('2d').drawImage(video, sx, sy, sw, sh, 0, 0, sw, sh);
  const dataUrl = canvas.toDataURL('image/png');

  const t = video.currentTime;
  const frame = {
    id: `frame-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    materialName: nextMaterialName(),
    sourceDataUrl: dataUrl,
    versionsCache: {},
    activeRatio: 'original',
    time: formatTime(t) + ' 选区',
    edited: false,
    source: { type: 'video-region', videoId: v.id, videoName: v.name, time: formatTime(t) },
  };
  state.capturedFrames.unshift(frame);
  state.selectedFrameId = frame.id;
  state.regionSelecting = false;
  state.regionRect = null;

  updatePoolDOM();
  updateToolbarCounters();
  showToastDirect(`已截取选区 ${sw}×${sh}，共 ${state.capturedFrames.length} 张`);
}

function cancelRegionSelection() {
  state.regionSelecting = false;
  state.regionRect = null;
  render();
}

function bindRegionDrag(container) {
  if (!state.regionSelecting) return;
  let startX = 0, startY = 0, drawing = false;
  let boxEl = null;

  container.addEventListener('mousedown', e => {
    if (!state.regionSelecting) return;
    if (e.target.id === 'btn-confirm-region' || e.target.id === 'btn-cancel-region') return;
    e.preventDefault();
    drawing = true;
    const rect = container.getBoundingClientRect();
    startX = e.clientX - rect.left;
    startY = e.clientY - rect.top;

    boxEl = document.createElement('div');
    boxEl.className = 'region-box';
    boxEl.style.left = startX + 'px';
    boxEl.style.top = startY + 'px';
    boxEl.style.width = '0px';
    boxEl.style.height = '0px';
    container.appendChild(boxEl);
  }, { passive: false });

  document.addEventListener('mousemove', e => {
    if (!drawing || !boxEl) return;
    const rect = container.getBoundingClientRect();
    const curX = e.clientX - rect.left;
    const curY = e.clientY - rect.top;
    const x = Math.min(startX, curX), y = Math.min(startY, curY);
    const w = Math.abs(curX - startX), h = Math.abs(curY - startY);
    boxEl.style.left = x + 'px';
    boxEl.style.top = y + 'px';
    boxEl.style.width = w + 'px';
    boxEl.style.height = h + 'px';
  });

  document.addEventListener('mouseup', e => {
    if (!drawing) return;
    drawing = false;
    if (!boxEl) return;
    const rect = container.getBoundingClientRect();
    const boxRect = boxEl.getBoundingClientRect();
    const video = document.getElementById('main-video');
    if (!video) return;

    const scaleX = (video.videoWidth || 1920) / rect.width;
    const scaleY = (video.videoHeight || 1080) / rect.height;
    const sx = Math.round((boxRect.left - rect.left) * scaleX);
    const sy = Math.round((boxRect.top - rect.top) * scaleY);
    const sw = Math.round(boxRect.width * scaleX);
    const sh = Math.round(boxRect.height * scaleY);

    if (sw < 20 || sh < 20) { boxEl.remove(); return; }
    state.regionRect = { sx, sy, sw, sh };
    const badge = document.createElement('div');
    badge.style.cssText = 'position:absolute;top:-22px;left:0;background:rgba(0,0,0,0.75);color:#fff;font-size:11px;font-weight:700;padding:2px 8px;border-radius:4px;white-space:nowrap;pointer-events:none;';
    badge.textContent = `${sw}×${sh}`;
    boxEl.appendChild(badge);
    boxEl.style.cursor = 'default';
  });
}

// ===== POOL HANDLERS =====
function onPoolClick(e) {
  const del = e.target.closest('[data-delete-frame]');
  if (del) {
    e.stopPropagation();
    state.capturedFrames = state.capturedFrames.filter(f => f.id !== del.dataset.deleteFrame);
    if (state.selectedFrameId === del.dataset.deleteFrame) state.selectedFrameId = '';
    render(); return;
  }
  const card = e.target.closest('.pool-card');
  if (card) { state.selectedFrameId = card.dataset.frameId; render(); }
}

function deleteSelectedFrame() {
  if (!state.selectedFrameId) return;
  state.capturedFrames = state.capturedFrames.filter(f => f.id !== state.selectedFrameId);
  state.selectedFrameId = '';
  showToast('已删除');
  render();
}

function clearPool() {
  if (!window.confirm('清空整个截图池？（视频不会被删除）')) return;
  state.capturedFrames = [];
  state.selectedFrameId = '';
  showToast('已清空截图池');
  render();
}

// ===== INCREMENTAL DOM UPDATES (避免每次截图触发 full render，让视频继续播放) =====
function updatePoolDOM() {
  const pool = document.getElementById('captured-pool');
  if (!pool) { render(); return; }
  const frames = state.capturedFrames;
  pool.innerHTML = frames.length === 0 ? `
    <div class="pool-empty">
      <span>📷</span><span>素材池还是空的</span>
      <span style="font-size:11px;">添加图片或从视频里截图，素材会出现在这里</span>
    </div>
  ` : frames.map((f, idx) => renderPoolCard(f, idx)).join('');

  // 截图池标题计数
  const subtitle = document.querySelector('.right-col .section-card .section-header .section-subtitle');
  if (subtitle) {
    const selIdx = frames.findIndex(f => f.id === state.selectedFrameId);
    subtitle.textContent = `共 ${frames.length} 张${selIdx >= 0 ? ` / 当前选中第 ${selIdx + 1} 张` : ''}`;
  }

  const btnEdit = document.getElementById('btn-open-edit');
  const btnClear = document.getElementById('btn-clear-pool');
  if (btnEdit) btnEdit.disabled = !state.selectedFrameId;
  if (btnClear) btnClear.disabled = frames.length === 0;
}

function updateToolbarCounters() {
  const btnVid = document.getElementById('btn-add-videos');
  if (btnVid) {
    const vCount = state.videos.length;
    btnVid.textContent = `📹 添加视频${vCount ? `（${vCount}）` : ''}`;
  }
  const poolInfo = document.querySelector('.material-toolbar-pool-info');
  if (poolInfo) {
    poolInfo.innerHTML = `📸 素材池：<strong>${state.capturedFrames.length}</strong> 张`;
  }
}

// ===== HELPERS =====
function showToast(msg) {
  state.toast = msg;
  render();
}

function showToastDirect(msg) {
  let toast = document.querySelector('.toast');
  if (!toast) { toast = document.createElement('div'); toast.className = 'toast'; document.body.appendChild(toast); }
  toast.textContent = msg;
  if (state.toastTimeout) clearTimeout(state.toastTimeout);
  state.toastTimeout = setTimeout(() => { toast.remove(); }, 2500);
}

function formatTime(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

// ===== BOOT =====
window.addEventListener('hashchange', () => {
  const page = window.location.hash.replace('#', '') || 'video';
  if (['video', 'edit', 'text', 'workbench', 'export'].includes(page)) {
    state.currentPage = page;
    render();
  }
});

// ===== 试用码授权入口 =====
function renderLicenseScreen(msg) {
  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="ft-license-screen">
      <div class="ft-license-box">
        <div class="ft-license-logo">✦</div>
        <div class="ft-license-title">美食养生贴图工具</div>
        <div class="ft-license-edition">助理试用版</div>
        <div class="ft-license-label">请输入试用码</div>
        <input type="text" id="ft-license-input" class="ft-license-input" placeholder="粘贴试用码…" autocomplete="off" spellcheck="false">
        <button id="ft-license-btn" class="ft-license-btn">进 入 工 具</button>
        ${msg ? `<div class="ft-license-msg ${msg.type}">${msg.text}</div>` : '<div class="ft-license-msg"></div>'}
        <div class="ft-license-hint">试用码由管理员提供，到期后请联系管理员续期。</div>
      </div>
    </div>
  `;
  const input = document.getElementById('ft-license-input');
  const btn = document.getElementById('ft-license-btn');
  const msgEl = document.querySelector('.ft-license-msg');

  async function doVerify() {
    const code = input.value.trim();
    if (!code) { msgEl.textContent = '请先粘贴试用码'; msgEl.className = 'ft-license-msg error'; return; }
    btn.disabled = true; btn.textContent = '验证中…';
    const result = await verifyLicense(code);
    btn.disabled = false; btn.textContent = '进 入 工 具';
    if (!result.ok) {
      msgEl.textContent = '试用码无效，请检查后重试';
      msgEl.className = 'ft-license-msg error';
      return;
    }
    if (result.expired) {
      msgEl.textContent = '试用已到期，请联系管理员';
      msgEl.className = 'ft-license-msg error';
      return;
    }
    storeLicense(code);
    msgEl.textContent = `验证通过，欢迎 ${result.name}（有效至 ${result.expireDate}）`;
    msgEl.className = 'ft-license-msg ok';
    setTimeout(() => bootApp(), 800);
  }

  btn.addEventListener('click', doVerify);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') doVerify(); });
}

function bootApp() {
  const app = document.getElementById('app');
  app.innerHTML = '';
  const initPage = window.location.hash.replace('#', '') || 'video';
  state.currentPage = ['video', 'edit', 'text', 'workbench', 'export'].includes(initPage) ? initPage : 'video';
  render();
  // 每分钟检查一次试用码是否过期
  setInterval(async () => {
    const result = await checkStoredLicense();
    if (!result.ok || result.expired) {
      clearLicense();
      renderLicenseScreen({ type: 'error', text: '试用已到期，请联系管理员' });
    }
  }, 60 * 1000);
}

async function boot() {
  const result = await checkStoredLicense();
  if (result.ok && !result.expired) {
    bootApp();
  } else {
    if (result.ok && result.expired) {
      clearLicense();
      renderLicenseScreen({ type: 'error', text: '试用已到期，请联系管理员' });
    } else {
      renderLicenseScreen(null);
    }
  }
}

boot();
