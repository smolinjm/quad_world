export function initWindow(windowId, headerId) {
  const win = document.getElementById(windowId);
  const header = document.getElementById(headerId);
  
  let isDragging = false;
  let offsetX = 0;
  let offsetY = 0;

  header.addEventListener('pointerdown', (e) => {
    isDragging = true;
    const rect = win.getBoundingClientRect();
    offsetX = e.clientX - rect.left;
    offsetY = e.clientY - rect.top;
    
    // Bring to front
    win.style.zIndex = 100;
  });

  document.addEventListener('pointermove', (e) => {
    if (!isDragging) return;
    win.style.left = `${e.clientX - offsetX}px`;
    win.style.top = `${e.clientY - offsetY}px`;
    win.style.right = 'auto';
    win.style.bottom = 'auto';
  });

  document.addEventListener('pointerup', () => {
    isDragging = false;
  });
}
