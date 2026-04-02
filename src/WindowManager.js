export class DockingManager {
  constructor(rootElementId) {
    this.rootEl = document.getElementById(rootElementId);
    this.dockEl = document.getElementById('dock');
    this.snapPreviewEl = document.getElementById('snap-preview');
    this.dragProxyEl = document.getElementById('drag-proxy');
    
    this.windows = {}; // id -> { dom: HTMLElement, title: string, isMaximized: boolean, stateMemory: Node }
    this.minimized = new Set();
    this.maximizedWindow = null;
    this.tree = null; // Root node of BSP

    // Drag State
    this.dragState = {
      active: false,
      windowId: null,
      startX: 0,
      startY: 0,
      offsetX: 0,
      offsetY: 0,
      targetNode: null,
      snapDir: null // 'left'|'right'|'top'|'bottom'
    };

    // Resize State
    this.resizeState = {
      active: false,
      splitNode: null,
      resizerIdx: 0, // 0 for the first child's ratio
      startX: 0,
      startY: 0,
      startRatio: 0.5
    };

    this._setupGlobalListeners();
  }

  // --- Initialization & API --- //

  registerWindow(id, domElement, title) {
    this.windows[id] = { dom: domElement, title, isMaximized: false };
    
    // Bind buttons
    const minBtn = domElement.querySelector('.minimize');
    if (minBtn) minBtn.addEventListener('pointerdown', (e) => { e.stopPropagation(); this.minimize(id); });
    
    const maxBtn = domElement.querySelector('.maximize');
    if (maxBtn) maxBtn.addEventListener('pointerdown', (e) => { e.stopPropagation(); this.maximize(id); });
    
    const restoreBtn = domElement.querySelector('.restore');
    if (restoreBtn) restoreBtn.addEventListener('pointerdown', (e) => { e.stopPropagation(); this.restore(id); });

    // Header dragging
    const header = domElement.querySelector('.window-header');
    if (header) {
      header.addEventListener('pointerdown', (e) => this._onDragStart(e, id));
    }
  }

  setLayout(treeDef) {
    this.tree = this._buildNode(treeDef, null);
    this.render();
    this.saveLayout();
  }

  // --- Persistency --- //

  loadState(stateParams) {
    if (!stateParams) return;
    
    const { tree, minimized, maximizedWindow } = stateParams;
    
    // Set minimized before layout so render ignores them properly
    if (minimized && Array.isArray(minimized)) {
      this.minimized = new Set(minimized);
    }
    
    if (tree) {
      this.setLayout(tree); // this calls render & saveLayout
    }
    
    if (maximizedWindow && this.windows[maximizedWindow]) {
      this.maximize(maximizedWindow);
    }
  }

  saveLayout() {
    // Avoid saving if we are actively dragging (tree is temporarily missing the node)
    if (this.dragState && this.dragState.active) return;

    const state = {
      tree: this._serializeNode(this.tree),
      minimized: Array.from(this.minimized),
      maximizedWindow: this.maximizedWindow
    };
    localStorage.setItem('quad_world_layout', JSON.stringify(state));
  }

  _serializeNode(node) {
    if (!node) return null;
    const serialized = { type: node.type };
    if (node.type === 'window') {
      serialized.windowId = node.windowId;
    } else if (node.type === 'split') {
      serialized.direction = node.direction;
      serialized.splitRatio = node.splitRatio;
      if (node.children) {
        serialized.children = node.children.map(c => this._serializeNode(c)).filter(Boolean);
      }
    }
    return serialized;
  }

  // --- Rendering --- //

  render() {
    this.rootEl.innerHTML = '';
    
    // Check if we have anything to render
    if (!this.tree) return;
    
    const dom = this._renderNode(this.tree);
    if (dom) this.rootEl.appendChild(dom);

    this._renderDock();
  }

  _buildNode(def, parent) {
    if (!def) return null;
    const node = { ...def, parent };
    if (node.type === 'split' && node.children) {
      node.children = node.children.map(c => this._buildNode(c, node));
    }
    return node;
  }

  _renderNode(node) {
    if (node.type === 'window') {
      const win = this.windows[node.windowId];
      if (!win || this.minimized.has(node.windowId)) return null; // Hidden, return null

      const container = document.createElement('div');
      container.className = 'layout-panel';
      // Store node reference on dom for drop target hit testing
      container._layoutNode = node; 
      
      // Clear inline absolute styles
      win.dom.style.left = ''; win.dom.style.top = ''; win.dom.style.width = ''; win.dom.style.height = '';
      win.dom.style.position = 'relative';

      container.appendChild(win.dom);
      node.dom = container;
      return container;
    }
    
    if (node.type === 'split') {
      const container = document.createElement('div');
      container.className = `layout-split ${node.direction}`;
      node.dom = container;

      // Filter out null children (e.g. minimized windows)
      const validChildrenHtml = node.children.map(c => this._renderNode(c)).filter(Boolean);
      
      if (validChildrenHtml.length === 0) return null;
      if (validChildrenHtml.length === 1) {
        // If split only has one valid child, bypass split
        return validChildrenHtml[0];
      }

      // Appending with resizers
      node.splitRatio = node.splitRatio || 0.5;
      
      const child1 = validChildrenHtml[0];
      child1.style.flex = `${node.splitRatio * 100} 1 0%`;
      container.appendChild(child1);

      const resizer = document.createElement('div');
      resizer.className = 'resizer';
      resizer.addEventListener('pointerdown', (e) => this._onResizeStart(e, node));
      container.appendChild(resizer);

      const child2 = validChildrenHtml[1];
      child2.style.flex = `${(1 - node.splitRatio) * 100} 1 0%`;
      container.appendChild(child2);
      
      return container;
    }
    return null;
  }

  _renderDock() {
    this.dockEl.innerHTML = '';
    this.minimized.forEach(id => {
      const btn = document.createElement('div');
      btn.className = 'dock-item';
      btn.textContent = this.windows[id].title;
      btn.onclick = () => this.restore(id);
      this.dockEl.appendChild(btn);
    });
  }

  // --- Window Actions --- //

  minimize(id) {
    if (this.maximizedWindow === id) this.restore(id);
    this.minimized.add(id);
    this.render();
    this.saveLayout();
  }

  maximize(id) {
    if (this.minimized.has(id)) this.minimized.delete(id);
    this.maximizedWindow = id;
    
    const win = this.windows[id];
    win.isMaximized = true;
    win.dom.classList.add('maximized');
    
    win.dom.querySelector('.maximize').style.display = 'none';
    win.dom.querySelector('.restore').style.display = 'block';

    // Move to body level so it covers layout
    document.body.appendChild(win.dom);
    this.saveLayout();
  }

  restore(id) {
    const win = this.windows[id];
    if (win.isMaximized) {
      win.isMaximized = false;
      win.dom.classList.remove('maximized');
      win.dom.querySelector('.maximize').style.display = 'block';
      win.dom.querySelector('.restore').style.display = 'none';
      this.maximizedWindow = null;
    }
    
    if (this.minimized.has(id)) {
      this.minimized.delete(id);
      // Wait, if it was minimized but had no spot in the tree? 
      // It normally retains its spot in the tree, we just skip rendering it.
      // So restoring just repaints!
    }
    this.render();
    this.saveLayout();
  }

  // --- Tree Manipulation (BSP) --- //

  _removeNode(nodeId) {
    const parentNode = this._findParentOfWindow(this.tree, nodeId);
    if (!parentNode) return;

    if (parentNode === this.tree && !parentNode.children) {
      this.tree = null; // Removed last window
      return;
    }

    const sibling = parentNode.children.find(c => c.type !== 'window' || c.windowId !== nodeId);
    
    // Replace parent with sibling
    if (parentNode.parent) {
      sibling.parent = parentNode.parent;
      const idx = parentNode.parent.children.indexOf(parentNode);
      parentNode.parent.children[idx] = sibling;
    } else {
      this.tree = sibling;
      sibling.parent = null;
    }
  }

  _findParentOfWindow(node, id) {
    if (!node || node.type === 'window') return null;
    if (node.children[0].windowId === id || node.children[1].windowId === id) return node;
    return this._findParentOfWindow(node.children[0], id) || this._findParentOfWindow(node.children[1], id);
  }

  _findNodeByElement(node, element) {
    if (!node) return null;
    if (node.dom === element) return node;
    if (node.children) {
      return this._findNodeByElement(node.children[0], element) || this._findNodeByElement(node.children[1], element);
    }
    return null;
  }

  // --- Drag & Drop (Snapping) Logic --- //

  _onDragStart(e, id) {
    if (this.windows[id].isMaximized) return; // Don't drag globally maximized
    
    this.dragState.active = true;
    this.dragState.windowId = id;
    
    const win = this.windows[id];
    const rect = win.dom.getBoundingClientRect();
    this.dragState.offsetX = e.clientX - rect.left;
    this.dragState.offsetY = e.clientY - rect.top;

    // Remove from Tree immediately
    this._removeNode(id);
    this.render(); // layout repaints without it

    // Setup proxy
    this.dragProxyEl.innerHTML = '';
    this.dragProxyEl.appendChild(win.dom);
    this.dragProxyEl.classList.remove('hidden');
    
    win.dom.style.left = `${e.clientX - this.dragState.offsetX}px`;
    win.dom.style.top = `${e.clientY - this.dragState.offsetY}px`;
    win.dom.style.width = `${rect.width}px`;
    win.dom.style.height = `${rect.height}px`;
    win.dom.classList.add('floating');
  }

  _onResizeStart(e, splitNode) {
    this.resizeState.active = true;
    this.resizeState.splitNode = splitNode;
    this.resizeState.startX = e.clientX;
    this.resizeState.startY = e.clientY;
    this.resizeState.startRatio = splitNode.splitRatio || 0.5;
    
    e.target.classList.add('dragging');
    e.target.setPointerCapture(e.pointerId);
  }

  _setupGlobalListeners() {
    document.addEventListener('pointermove', (e) => {
      if (this.dragState.active) {
        this._updateDrag(e);
      } else if (this.resizeState.active) {
        this._updateResize(e);
      }
    });

    document.addEventListener('pointerup', (e) => {
      if (this.dragState.active) {
        this._endDrag(e);
      }
      if (this.resizeState.active) {
        this.resizeState.active = false;
        document.querySelectorAll('.resizer').forEach(r => r.classList.remove('dragging'));
        this.render(); // Ensure flex values recalculate correctly on end
        this.saveLayout();
      }
    });
  }

  _updateDrag(e) {
    const st = this.dragState;
    const winDom = this.windows[st.windowId].dom;
    winDom.style.left = `${e.clientX - st.offsetX}px`;
    winDom.style.top = `${e.clientY - st.offsetY}px`;

    // Reset snap preview
    st.targetNode = null;
    st.snapDir = null;
    this.snapPreviewEl.classList.add('hidden');

    // Hit test underlying panels
    // We get all elements currently under pointer, filter for layout-panels
    this.dragProxyEl.style.pointerEvents = 'none'; // Ensure we look through it
    const elems = document.elementsFromPoint(e.clientX, e.clientY);
    
    const panelDrop = elems.find(el => el.classList && el.classList.contains('layout-panel'));
    
    if (panelDrop && panelDrop._layoutNode) {
      const rect = panelDrop.getBoundingClientRect();
      const hw = rect.width / 2;
      const hh = rect.height / 2;
      
      const localX = e.clientX - rect.left;
      const localY = e.clientY - rect.top;

      let snapDir = null;
      let snapRect = { ...rect };

      // Calculate Snap Zones (25% on edges)
      const edgeThresholdX = rect.width * 0.3;
      const edgeThresholdY = rect.height * 0.3;

      if (localX < edgeThresholdX) {
        snapDir = 'left';
        snapRect.width /= 2;
      } else if (localX > rect.width - edgeThresholdX) {
        snapDir = 'right';
        snapRect.width /= 2;
        snapRect.left += snapRect.width;
      } else if (localY < edgeThresholdY) {
        snapDir = 'top';
        snapRect.height /= 2;
      } else if (localY > rect.height - edgeThresholdY) {
        snapDir = 'bottom';
        snapRect.height /= 2;
        snapRect.top += snapRect.height;
      } else {
        // Center drop (full replacement/tabbing not implemented, so maybe split half horizontal)
        snapDir = 'right';
        snapRect.width /= 2;
        snapRect.left += snapRect.width;
      }

      if (snapDir) {
        st.targetNode = panelDrop._layoutNode;
        st.snapDir = snapDir;
        
        this.snapPreviewEl.style.left = `${snapRect.left}px`;
        this.snapPreviewEl.style.top = `${snapRect.top}px`;
        this.snapPreviewEl.style.width = `${snapRect.width}px`;
        this.snapPreviewEl.style.height = `${snapRect.height}px`;
        this.snapPreviewEl.classList.remove('hidden');
      }
    }
  }

  _endDrag(e) {
    const st = this.dragState;
    st.active = false;
    
    const win = this.windows[st.windowId];
    win.dom.classList.remove('floating');
    this.dragProxyEl.classList.add('hidden');
    this.snapPreviewEl.classList.add('hidden');

    if (st.targetNode && st.snapDir) {
      // Split the target node
      const newNodeVal = { type: 'window', windowId: st.windowId };
      const oldNodeCopy = { ...st.targetNode, parent: null };
      
      const splitNode = {
        type: 'split',
        parent: st.targetNode.parent,
        direction: (st.snapDir === 'left' || st.snapDir === 'right') ? 'horizontal' : 'vertical',
        splitRatio: 0.5,
        children: []
      };
      
      if (st.snapDir === 'left' || st.snapDir === 'top') {
        splitNode.children = [newNodeVal, oldNodeCopy];
      } else {
        splitNode.children = [oldNodeCopy, newNodeVal];
      }
      
      newNodeVal.parent = splitNode;
      oldNodeCopy.parent = splitNode;

      // Update parent pointer
      if (st.targetNode.parent) {
        const idx = st.targetNode.parent.children.indexOf(st.targetNode);
        st.targetNode.parent.children[idx] = splitNode;
      } else {
        this.tree = splitNode;
      }
    } else {
      // Dropped nowhere, either float or just append to end (fallback)
      // I'll append to root split (if it exists) to prevent losing windows
      if (!this.tree) {
         this.tree = { type: 'window', windowId: st.windowId };
      } else if (this.tree.type === 'split') {
         // Create a wrapper at the root
         const oldRoot = this.tree;
         this.tree = {
           type: 'split',
           direction: 'horizontal',
           splitRatio: 0.5,
           parent: null,
           children: [oldRoot, { type: 'window', windowId: st.windowId }]
         };
         oldRoot.parent = this.tree;
         this.tree.children[1].parent = this.tree;
      }
    }
    
    this.render();
    this.saveLayout();
  }

  _updateResize(e) {
    const res = this.resizeState;
    const split = res.splitNode;
    
    const rect = split.dom.getBoundingClientRect();
    
    let delta = 0;
    if (split.direction === 'horizontal') {
      delta = (e.clientX - res.startX) / rect.width;
    } else {
      delta = (e.clientY - res.startY) / rect.height;
    }

    let newRatio = res.startRatio + delta;
    newRatio = Math.max(0.1, Math.min(0.9, newRatio)); // Clamp limits
    
    split.splitRatio = newRatio;
    
    // Update live DOM immediately without full re-render
    const children = split.dom.children;
    // index 0 is child1, index 1 is resizer, index 2 is child2
    if (children.length >= 3) {
       children[0].style.flex = `${newRatio * 100} 1 0%`;
       children[2].style.flex = `${(1 - newRatio) * 100} 1 0%`;
    }
  }
}
