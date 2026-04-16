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
  
  let menuContent = '';
  let menuTitle = `Menu ${menuId.replace('menu', '')}`;
  
  if (menuId === 'menu1') {
    menuTitle = 'Spawners';
    menuContent = `
      <div style="padding: 16px;">
        <button id="btn-spawn-fauna" style="padding: 8px 16px; background: var(--theme-accent, var(--neon-blue)); border: none; color: black; font-weight: bold; cursor: pointer; border-radius: 4px;">Spawn Fauna</button>
        <p style="margin-top: 12px; font-size: 14px;">Active Fauna: <span id="fauna-counter" style="font-weight: bold; color: var(--theme-accent, var(--neon-blue));">0</span></p>
      </div>
    `;
  } else if (menuId === 'menu2') {
    menuTitle = 'Scoreboard';
    menuContent = `
      <div style="padding: 16px; text-align: center;">
        <h2 style="font-size: 24px; color: var(--theme-accent, var(--neon-blue)); margin-bottom: 8px;">Score</h2>
        <div id="score-display" style="font-size: 48px; font-weight: bold;">0</div>
      </div>
    `;
  } else if (menuId === 'menu3') {
    menuTitle = 'Themes';
    menuContent = `
      <div style="padding: 16px; display: flex; flex-direction: column; gap: 8px;">
        <button class="theme-btn" data-theme="default" style="padding: 8px; background: rgba(0,243,255,0.2); border: 1px solid #00f3ff; color: white; cursor: pointer; border-radius: 4px;">Default (Neon/Teal)</button>
        <button class="theme-btn" data-theme="toxic" style="padding: 8px; background: rgba(0,255,102,0.2); border: 1px solid #00ff66; color: white; cursor: pointer; border-radius: 4px;">Toxic (Ghost Green/Purple)</button>
        <button class="theme-btn" data-theme="cyber" style="padding: 8px; background: rgba(255,0,60,0.2); border: 1px solid #ff003c; color: white; cursor: pointer; border-radius: 4px;">Cyber (Red/Deep Blue)</button>
      </div>
    `;
  } else if (menuId === 'menu4') {
    menuTitle = 'Telemetry';
    menuContent = `
      <div style="padding: 16px; text-align: center;">
        <h3 style="font-size: 16px; margin-bottom: 8px; color: rgba(255,255,255,0.7);">Active Location</h3>
        <div id="location-display" style="font-size: 32px; font-weight: bold; color: var(--theme-accent, var(--neon-blue)); letter-spacing: 2px;">--</div>
      </div>
    `;
  } else {
    menuContent = `
      <div class="window-content" style="padding: 16px;">
        <p style="color: rgba(255,255,255,0.7); font-size: 14px;">Placeholder content for ${menuId}</p>
      </div>
    `;
  }

  win.innerHTML = `
    <div class="window-header window-drag-handle">
      <span class="title">${menuTitle}</span>
      <div class="controls">
        <button class="win-btn minimize">−</button>
        <button class="win-btn maximize">⬜</button>
        <button class="win-btn restore" style="display:none;">❐</button>
        <button class="win-btn close">✕</button>
      </div>
    </div>
    <div class="window-content" style="flex:1;">
      ${menuContent}
    </div>
  `;
  
  dockManager.registerWindow(menuId, win, menuTitle);
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

// 8. Bind new UI actions
const btnSpawnFauna = document.getElementById('btn-spawn-fauna');
if (btnSpawnFauna) {
  btnSpawnFauna.addEventListener('click', () => {
    engine.spawnFauna();
  });
}

engine.onScoreUpdate = (score) => {
  const sd = document.getElementById('score-display');
  if (sd) sd.innerText = score;
};

engine.onFaunaCountChange = (count) => {
  const fc = document.getElementById('fauna-counter');
  if (fc) fc.innerText = count;
};

engine.onFaceChange = (label) => {
  const ld = document.getElementById('location-display');
  if (ld) ld.innerText = label;
};

// 9. Theme Logic
const themeButtons = document.querySelectorAll('.theme-btn');
themeButtons.forEach(btn => {
  btn.addEventListener('click', (e) => {
    const theme = e.target.getAttribute('data-theme');
    document.body.className = `theme-${theme}`;
  });
});
