import { DockingManager } from './src/WindowManager.js';
import { Engine } from './src/Engine.js';

// 1. Initialize Window Manager
const dockManager = new DockingManager('layout-root');

// 2. Register Main Windows
const appWindow = document.getElementById('app-window');
dockManager.registerWindow('app-window', appWindow, 'Quad View');

// 3. Create and Register Menu Windows Dynamically
const menus = ['menu1', 'menu2', 'menu3', 'menu4'];
menus.forEach((menuId) => {
  const win = document.createElement('div');
  win.className = 'window glass';
  win.id = menuId;
  
  win.innerHTML = `
    <div class="window-header window-drag-handle">
      <span class="title">Menu ${menuId.replace('menu', '')}</span>
      <div class="controls">
        <button class="win-btn minimize">−</button>
        <button class="win-btn maximize">⬜</button>
        <button class="win-btn restore" style="display:none;">❐</button>
        <button class="win-btn close">✕</button>
      </div>
    </div>
    <div class="window-content" style="padding: 16px;">
      <p style="color: rgba(255,255,255,0.7); font-size: 14px;">Placeholder content for ${menuId}</p>
    </div>
  `;
  
  dockManager.registerWindow(menuId, win, `Menu ${menuId.replace('menu', '')}`);
});

// 4. Define Initial Layout Tree (BSP)
// Split horizontally: Left 60% = app-window, Right 40% = menus grid
const defaultLayout = {
  type: 'split',
  direction: 'horizontal',
  splitRatio: 0.6,
  children: [
    { type: 'window', windowId: 'app-window' },
    {
      type: 'split',
      direction: 'vertical',
      splitRatio: 0.5,
      children: [
        {
          type: 'split',
          direction: 'horizontal',
          splitRatio: 0.5,
          children: [
            { type: 'window', windowId: 'menu1' },
            { type: 'window', windowId: 'menu2' }
          ]
        },
        {
          type: 'split',
          direction: 'horizontal',
          splitRatio: 0.5,
          children: [
            { type: 'window', windowId: 'menu3' },
            { type: 'window', windowId: 'menu4' }
          ]
        }
      ]
    }
  ]
};

// 5. Load State or Render Default Layout
const savedStateJson = localStorage.getItem('quad_world_layout');
if (savedStateJson) {
  try {
    const savedState = JSON.parse(savedStateJson);
    dockManager.loadState(savedState);
  } catch (e) {
    console.error('Failed to load saved layout state', e);
    dockManager.setLayout(defaultLayout);
  }
} else {
  dockManager.setLayout(defaultLayout);
}


// 6. Initialize WebGL physics loop
const engine = new Engine('canvas-container');

// 7. Binding visual UI mode switchers
const orbitBtn = document.getElementById('mode-orbit');
const objectBtn = document.getElementById('mode-object');

if (orbitBtn && objectBtn) {
  orbitBtn.addEventListener('click', () => {
    orbitBtn.classList.add('active');
    objectBtn.classList.remove('active');
    engine.setMode('orbit');
  });

  objectBtn.addEventListener('click', () => {
    objectBtn.classList.add('active');
    orbitBtn.classList.remove('active');
    engine.setMode('object');
  });
}
