//#region 导入/依赖
//#endregion

//#region 常量/配置
const WINDOW_IDS = ['utility-window', 'machine-window', 'tracking-window', 'demo-window', 'stats-window'] as const;
const WINDOW_PREFS_KEY = 'pingpong-sim:window-preferences:v1';
//#endregion

//#region 模型/类型
type WindowId = typeof WINDOW_IDS[number];

interface WindowPreferences {
  open?: Partial<Record<WindowId, boolean>>;
  positions?: Partial<Record<WindowId, { left: number; top: number }>>;
}

export interface WindowManagerDeps {
  isMachineActive: () => boolean;
  isTrackingActive: () => boolean;
  isDemoActive: () => boolean;
}
//#endregion

//#region 私有成员
let windowManagerDeps: WindowManagerDeps | null = null;
//#endregion

//#region 公开 API
export function initWindowManager(deps: WindowManagerDeps): { syncWindowIndicators: () => void } {
  windowManagerDeps = deps;

  document.querySelectorAll<HTMLButtonElement>('[data-window-toggle]').forEach(button => {
    button.addEventListener('click', () => {
      const id = button.dataset.windowToggle as WindowId;
      const windowEl = document.getElementById(id);
      if (windowEl) setWindowOpen(id, windowEl.classList.contains('is-closed'));
      syncWindowIndicators();
    });
  });
  document.querySelectorAll<HTMLButtonElement>('[data-window-minimize]').forEach(button => {
    button.addEventListener('click', () => {
      const id = button.dataset.windowMinimize as WindowId;
      setWindowOpen(id, false);
      syncWindowIndicators();
    });
  });

  // Windows can be rearranged without leaving the viewport. Positions are
  // persisted so a preferred layout survives refreshes and future sessions.
  document.querySelectorAll<HTMLElement>('.ui-window').forEach(windowEl => {
    const id = windowEl.dataset.window as WindowId;
    const titlebar = windowEl.querySelector<HTMLElement>('.window-titlebar');
    if (!titlebar) return;
    let dragging = false;
    let offsetX = 0;
    let offsetY = 0;
    titlebar.addEventListener('pointerdown', event => {
      if ((event.target as HTMLElement).closest('button')) return;
      const rect = windowEl.getBoundingClientRect();
      dragging = true;
      offsetX = event.clientX - rect.left;
      offsetY = event.clientY - rect.top;
      // Convert right/bottom anchored defaults to explicit coordinates.
      clampWindowPosition(windowEl, rect.left, rect.top);
      titlebar.classList.add('is-dragging');
      titlebar.setPointerCapture(event.pointerId);
    });
    titlebar.addEventListener('pointermove', event => {
      if (!dragging) return;
      clampWindowPosition(windowEl, event.clientX - offsetX, event.clientY - offsetY);
    });
    const finishDrag = (event: PointerEvent) => {
      if (!dragging) return;
      dragging = false;
      titlebar.classList.remove('is-dragging');
      if (titlebar.hasPointerCapture(event.pointerId)) titlebar.releasePointerCapture(event.pointerId);
      saveWindowPreferences();
    };
    titlebar.addEventListener('pointerup', finishDrag);
    titlebar.addEventListener('pointercancel', finishDrag);
    void id;
  });
  restoreWindowPreferences();
  window.addEventListener('resize', () => {
    document.querySelectorAll<HTMLElement>('.ui-window:not(.is-closed)').forEach(windowEl => {
      const rect = windowEl.getBoundingClientRect();
      clampWindowPosition(windowEl, rect.left, rect.top);
    });
    saveWindowPreferences();
  });

  return { syncWindowIndicators };
}

export function setWindowOpen(id: WindowId, open: boolean): void {
  const windowEl = document.getElementById(id);
  windowEl?.classList.toggle('is-closed', !open);
  document.querySelector<HTMLButtonElement>(`[data-window-toggle="${id}"]`)?.classList.toggle('is-open', open);
  if (open && windowEl) {
    requestAnimationFrame(() => {
      const rect = windowEl.getBoundingClientRect();
      clampWindowPosition(windowEl, rect.left, rect.top);
      saveWindowPreferences();
    });
  } else {
    saveWindowPreferences();
  }
}

/** Close every floating UI window and any open HTML dialog (topic demos want a clear view). */
export function closeAllUiPopups(): void {
  for (const id of WINDOW_IDS) {
    const windowEl = document.getElementById(id);
    windowEl?.classList.add('is-closed');
    document.querySelector<HTMLButtonElement>(`[data-window-toggle="${id}"]`)?.classList.remove('is-open');
  }
  document.querySelectorAll<HTMLDialogElement>('dialog[open]').forEach(dialog => dialog.close());
  saveWindowPreferences();
}

export function clampWindowPosition(windowEl: HTMLElement, left: number, top: number): void {
  const width = windowEl.offsetWidth || windowEl.getBoundingClientRect().width;
  const height = windowEl.offsetHeight || windowEl.getBoundingClientRect().height;
  const margin = 8;
  const maxLeft = Math.max(margin, window.innerWidth - width - margin);
  const maxTop = Math.max(margin, window.innerHeight - height - margin);
  windowEl.style.left = `${Math.round(Math.min(Math.max(left, margin), maxLeft))}px`;
  windowEl.style.top = `${Math.round(Math.min(Math.max(top, margin), maxTop))}px`;
  windowEl.style.right = 'auto';
  windowEl.style.bottom = 'auto';
}
//#endregion

//#region 业务逻辑
export function syncWindowIndicators(): void {
  for (const id of WINDOW_IDS) {
    const windowEl = document.getElementById(id);
    const toggle = document.querySelector<HTMLButtonElement>(`[data-window-toggle="${id}"]`);
    if (!windowEl || !toggle) continue;
    const open = !windowEl.classList.contains('is-closed');
    toggle.classList.toggle('is-open', open);
    toggle.classList.remove('is-active', 'is-warning');
  }
  const machineToggle = document.querySelector<HTMLButtonElement>('[data-window-toggle="machine-window"]');
  if (machineToggle && windowManagerDeps && (windowManagerDeps.isMachineActive() || windowManagerDeps.isTrackingActive())) {
    machineToggle.classList.add('is-active');
  }
  const trackingToggle = document.querySelector<HTMLButtonElement>('[data-window-toggle="tracking-window"]');
  if (trackingToggle && windowManagerDeps?.isTrackingActive()) trackingToggle.classList.add('is-active');
  const demoToggle = document.querySelector<HTMLButtonElement>('[data-window-toggle="demo-window"]');
  if (demoToggle && windowManagerDeps?.isDemoActive()) demoToggle.classList.add('is-active');
}
//#endregion

//#region 方法/工具
function readWindowPreferences(): WindowPreferences {
  try {
    return JSON.parse(localStorage.getItem(WINDOW_PREFS_KEY) ?? '{}') as WindowPreferences;
  } catch {
    return {};
  }
}

function writeWindowPreferences(preferences: WindowPreferences): void {
  try { localStorage.setItem(WINDOW_PREFS_KEY, JSON.stringify(preferences)); } catch { /* private mode */ }
}

function saveWindowPreferences(): void {
  const preferences: WindowPreferences = { open: {}, positions: {} };
  for (const id of WINDOW_IDS) {
    const windowEl = document.getElementById(id);
    if (!windowEl) continue;
    preferences.open![id] = !windowEl.classList.contains('is-closed');
    const left = Number.parseFloat(windowEl.style.left);
    const top = Number.parseFloat(windowEl.style.top);
    if (Number.isFinite(left) && Number.isFinite(top)) preferences.positions![id] = { left, top };
  }
  writeWindowPreferences(preferences);
}

function restoreWindowPreferences(): void {
  const preferences = readWindowPreferences();
  for (const id of WINDOW_IDS) {
    const windowEl = document.getElementById(id);
    if (!windowEl) continue;
    const savedPosition = preferences.positions?.[id];
    if (savedPosition && Number.isFinite(savedPosition.left) && Number.isFinite(savedPosition.top)) {
      // Temporarily show a closed window so its dimensions are measurable.
      const wasClosed = windowEl.classList.contains('is-closed');
      if (wasClosed) windowEl.classList.remove('is-closed');
      clampWindowPosition(windowEl, savedPosition.left, savedPosition.top);
      if (wasClosed) windowEl.classList.add('is-closed');
    }
    if (typeof preferences.open?.[id] === 'boolean') {
      windowEl.classList.toggle('is-closed', !preferences.open[id]);
    }
  }
}
//#endregion
