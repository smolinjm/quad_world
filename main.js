import { initWindow } from './src/WindowManager.js';
import { Engine } from './src/Engine.js';

// Setup Interface Dragging
initWindow('app-window', 'window-header');

// Initialize WebGL physics loop
const engine = new Engine('canvas-container');

// Binding visual UI mode switchers
const orbitBtn = document.getElementById('mode-orbit');
const objectBtn = document.getElementById('mode-object');

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
