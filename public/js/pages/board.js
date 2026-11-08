// Flowden Modern Spatial Workspace Board Engine
// Precision Wires, True Infinite Canvas, Right-Drag Marquee, Robust Mouse Controls & Dual-Button Cancellation

async function renderBoardPage(container, params) {
  const getIcon = window.FlowdenIcons ? window.FlowdenIcons.getIcon : () => '';
  const projectId = params.id;

  container.innerHTML = `
    <div style="height: 100%; width: 100%; display: flex; align-items: center; justify-content: center;">
      <div class="spinner"></div>
    </div>
  `;

  // Fetch project & board
  let project, board;
  try {
    const pData = await window.API.get(`/projects/${projectId}`);
    project = pData.project;
    const bData = await window.API.get(`/boards/project/${projectId}`);
    if (bData.boards && bData.boards.length > 0) {
      const fullBoard = await window.API.get(`/boards/${bData.boards[0].id}`);
      board = fullBoard.board;
    }
  } catch (err) {
    container.innerHTML = `<div class="form-error" style="padding: 24px;">Failed to load board: ${err.message}</div>`;
    return;
  }

  if (!board) {
    container.innerHTML = `
      <div class="empty-state" style="padding: 48px;">
        <div class="empty-state-title">No board found for project</div>
        <button class="btn btn--primary btn--md" id="btn-board-empty-return">Return to Projects</button>
      </div>
    `;
    document.getElementById('btn-board-empty-return')?.addEventListener('click', () => {
      window.Router.navigate('/projects');
    });
    return;
  }

  // Build the Board UI Shell
  container.innerHTML = `
    <div id="spatial-board-wrapper" style="position: relative; width: 100%; height: 100%; overflow: hidden; user-select: none; background-color: var(--bg-primary);">
      
      <!-- Top Floating Toolbar -->
      <div id="board-toolbar" style="position: absolute; top: var(--space-4); left: 50%; transform: translateX(-50%); z-index: 100; background-color: var(--bg-secondary); border: 1px solid var(--border-primary); border-radius: var(--radius-md); box-shadow: var(--shadow-md); padding: 4px; display: flex; align-items: center; gap: 4px;">
        <div style="display: flex; align-items: center; gap: 2px; padding-right: 6px; border-right: 1px solid var(--border-primary); margin-right: 2px;">
          <span style="font-size: var(--text-xs); font-weight: 600; padding: 0 8px; color: var(--text-primary); max-width: 160px;" class="text-truncate">${project.title}</span>
        </div>

        <!-- Add Card Dropdown Trigger -->
        <button class="btn btn--primary btn--sm" id="btn-board-add-card" title="Add Card">
          ${getIcon('plus')}
          <span>Add Card</span>
          ${getIcon('chevron-down')}
        </button>

        <button class="btn btn--secondary btn--sm" id="btn-board-add-group" title="Add Group Container">
          ${getIcon('layout-grid')}
          <span>Group</span>
        </button>

        <!-- Visible Delete Selected Action (Active when items or wires are selected) -->
        <button class="btn btn--danger btn--sm" id="btn-board-delete-selected" style="display: none; align-items: center; gap: 4px;" title="Delete selected cards and wires (Del / Backspace)">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
          <span id="board-delete-count">Delete (0)</span>
        </button>

        <div style="height: 16px; width: 1px; background-color: var(--border-primary); margin: 0 4px;"></div>

        <!-- Undo & Redo -->
        <button class="btn btn--ghost btn--sm btn--icon" id="btn-board-undo" title="Undo (Ctrl+Z)" disabled>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/></svg>
        </button>
        <button class="btn btn--ghost btn--sm btn--icon" id="btn-board-redo" title="Redo (Ctrl+Y)" disabled>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 7v6h-6"/><path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3l3 2.7"/></svg>
        </button>

        <div style="height: 16px; width: 1px; background-color: var(--border-primary); margin: 0 4px;"></div>

        <!-- Snap to Grid Toggle -->
        <button class="btn btn--ghost btn--sm btn--icon" id="btn-board-grid-snap" title="Toggle Snap to Grid (20px)">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/><path d="M3 15h18"/><path d="M9 3v18"/><path d="M15 3v18"/></svg>
        </button>

        <!-- Zoom Controls -->
        <button class="btn btn--ghost btn--sm btn--icon" id="btn-board-zoom-out" title="Zoom Out">-</button>
        <span id="board-zoom-display" style="font-size: 11px; font-family: var(--font-mono); color: var(--text-secondary); min-width: 44px; text-align: center;">100%</span>
        <button class="btn btn--ghost btn--sm btn--icon" id="btn-board-zoom-in" title="Zoom In">+</button>
        <button class="btn btn--ghost btn--sm" id="btn-board-zoom-fit" title="Fit All Content">Fit</button>

        <div style="height: 16px; width: 1px; background-color: var(--border-primary); margin: 0 4px;"></div>
        
        <span id="board-save-status" class="text-xs text-tertiary" style="padding: 0 8px;">Saved</span>
      </div>

      <!-- Compact Mouse Guide Pill below toolbar -->
      <div id="board-mouse-guide" class="board-mouse-guide" style="position: absolute; top: 58px; left: 50%; transform: translateX(-50%); z-index: 90; border-radius: var(--radius-full); padding: 3px 14px; display: flex; align-items: center; gap: 16px; font-size: 11px; pointer-events: none; user-select: none;">
        <!-- Left Drag Item -->
        <div style="display: flex; align-items: center; gap: 7px;">
          <svg width="15" height="19" viewBox="0 0 20 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="2" y="2" width="16" height="20" rx="8" stroke="var(--border-secondary)" stroke-width="1.75"/>
            <line x1="10" y1="2" x2="10" y2="10" stroke="var(--border-secondary)" stroke-width="1.75"/>
            <line x1="2" y1="10" x2="18" y2="10" stroke="var(--border-secondary)" stroke-width="1.75"/>
            <path class="guide-left-drag-fill" d="M10 2H8C4.68629 2 2 4.68629 2 8V10H10V2Z" fill="var(--accent-primary, #14b8a6)"/>
          </svg>
          <div style="display: flex; flex-direction: column; line-height: 1.15;">
            <span class="guide-left-drag" style="font-weight: 700; font-size: 9px; letter-spacing: 0.05em; color: var(--accent-deep, #14b8a6); text-transform: uppercase;">LEFT DRAG</span>
            <span style="color: var(--text-secondary); font-size: 11px;">Pan canvas / Move cards</span>
          </div>
        </div>

        <div style="width: 1px; height: 16px; background-color: var(--border-primary);"></div>

        <!-- Right Drag Item -->
        <div style="display: flex; align-items: center; gap: 7px;">
          <svg width="15" height="19" viewBox="0 0 20 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="2" y="2" width="16" height="20" rx="8" stroke="var(--border-secondary)" stroke-width="1.75"/>
            <line x1="10" y1="2" x2="10" y2="10" stroke="var(--border-secondary)" stroke-width="1.75"/>
            <line x1="2" y1="10" x2="18" y2="10" stroke="var(--border-secondary)" stroke-width="1.75"/>
            <path class="guide-right-drag-fill" d="M10 2H12C15.3137 2 18 4.68629 18 8V10H10V2Z" fill="var(--accent-hover, #38bdf8)"/>
          </svg>
          <div style="display: flex; flex-direction: column; line-height: 1.15;">
            <span class="guide-right-drag" style="font-weight: 700; font-size: 9px; letter-spacing: 0.05em; color: var(--accent-primary, #38bdf8); text-transform: uppercase;">RIGHT DRAG</span>
            <span style="color: var(--text-secondary); font-size: 11px;">Select multiple cards and wires</span>
          </div>
        </div>
      </div>

      <!-- Canvas Viewport with True Infinite Seamless Grid -->
      <div id="spatial-viewport" style="position: absolute; inset: 0; width: 100%; height: 100%; overflow: hidden; cursor: default; background-color: var(--bg-primary); background-image: radial-gradient(var(--canvas-grid-dot, var(--border-secondary)) 1.25px, transparent 1.25px);">
        
        <!-- Marquee Selection Box (Teal translucent) -->
        <div id="selection-marquee"></div>

        <!-- Infinite Canvas Transform Surface -->
        <div id="spatial-canvas" style="position: absolute; top: 0; left: 0; width: 0; height: 0; overflow: visible; transform-origin: 0 0; pointer-events: none;">
          
          <!-- SVG Connections Layer with Visible Overflow -->
          <svg id="board-connections-svg" style="position: absolute; top: 0; left: 0; width: 1px; height: 1px; overflow: visible; pointer-events: none; z-index: 5;">
            <defs>
              <marker id="arrow-default" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M 0 1 L 10 5 L 0 9 z" fill="var(--graph-edge-default, var(--border-secondary))"/>
              </marker>
              <marker id="arrow-active" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M 0 1 L 10 5 L 0 9 z" fill="var(--wire-active-stroke, var(--accent-primary))"/>
              </marker>
              <marker id="arrow-snap" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M 0 1 L 10 5 L 0 9 z" fill="var(--accent-hover, var(--accent-primary))"/>
              </marker>
            </defs>
            <g id="board-connections-group"></g>
            <path id="wire-in-progress" d="" fill="none" stroke="var(--wire-active-stroke, var(--accent-primary))" stroke-width="2.5" stroke-dasharray="5 4" marker-end="url(#arrow-snap)" style="display: none; pointer-events: none;"/>
          </svg>

          <!-- Groups Layer -->
          <div id="board-groups-layer" style="position: absolute; top: 0; left: 0; overflow: visible; z-index: 10; pointer-events: none;"></div>

          <!-- Cards Layer -->
          <div id="board-cards-layer" style="position: absolute; top: 0; left: 0; overflow: visible; z-index: 20; pointer-events: none;"></div>
        </div>
      </div>
    </div>
  `;

  // State
  let zoom = board.zoom_level || 1.0;
  let panX = board.viewport_x || 0;
  let panY = board.viewport_y || 0;
  let snapGrid = true;
  let gridSize = board.grid_size || 20;

  let items = [...(board.items || [])];
  let groups = [...(board.groups || [])];
  let connections = [...(board.connections || [])];

  // Multi-Selection State
  let selectedItemIds = new Set();
  let selectedConnectionIds = new Set();

  // Undo / Redo Stack
  let undoStack = [];
  let redoStack = [];

  // Panning State (Left-drag on empty canvas, middle click, or space)
  let isPanning = false;
  let startPanX = 0;
  let startPanY = 0;
  let isSpacePressed = false;

  // Marquee Selection State (Right-drag on canvas)
  let isMarquee = false;

  // Card Dragging State (Left-drag on cards)
  let isDraggingCards = false;
  let cardDragDistance = 0;
  let dragClientStartX = 0;
  let dragClientStartY = 0;
  let dragPositionsInit = [];

  // Connection Wire Dragging State (Left-drag on connector port)
  let connectingSourceId = null;
  let snapTargetCardId = null;

  // Simultaneous Mouse Button Protection
  let ignoreGesturesUntilRelease = false;

  const wrapper = document.getElementById('spatial-board-wrapper');
  const viewport = document.getElementById('spatial-viewport');
  const canvas = document.getElementById('spatial-canvas');
  const marqueeEl = document.getElementById('selection-marquee');
  const groupsLayer = document.getElementById('board-groups-layer');
  const cardsLayer = document.getElementById('board-cards-layer');
  const connectionsGroup = document.getElementById('board-connections-group');
  const wireInProgress = document.getElementById('wire-in-progress');
  const zoomDisplay = document.getElementById('board-zoom-display');
  const saveStatus = document.getElementById('board-save-status');
  const deleteBtn = document.getElementById('btn-board-delete-selected');
  const deleteCount = document.getElementById('board-delete-count');

  // Precision Marquee Selection State Machine
  let activePointerId = null;
  let pendingMarquee = false;
  let marqueeActive = false;
  let suppressNextContextMenu = false;
  let marqueeStartX = 0;
  let marqueeStartY = 0;
  let contextMenuFallbackTimer = null;

  function isEligibleEmptyCanvas(target) {
    if (!target) return false;
    if (target.closest('.spatial-card, .board-group, .board-toolbar, .board-minimap, input, textarea, select, button, a, [contenteditable="true"], .card-drag-handle, .card-resize-handle, .vault-panel-splitter')) {
      return false;
    }
    return target === viewport || target === canvas || target.id === 'spatial-viewport' || target.id === 'spatial-canvas' || target.id === 'board-connections-svg' || target.id === 'spatial-board-wrapper';
  }

  // Suppress context menu ONLY if a right-mouse-drag marquee occurred (> 5px)
  function handleContextMenu(e) {
    const target = e.target;
    if (target && (target.closest('input, textarea, select') || target.isContentEditable)) {
      return; // Allow standard cut/copy/paste inside text boxes
    }
    if (suppressNextContextMenu) {
      e.preventDefault();
      e.stopPropagation();
      suppressNextContextMenu = false;
      if (contextMenuFallbackTimer) {
        clearTimeout(contextMenuFallbackTimer);
        contextMenuFallbackTimer = null;
      }
    }
    // Simple right click without movement retains standard context menu
  }

  window.addEventListener('contextmenu', handleContextMenu, true);

  // Seamless Infinite Dotted Grid & Transform Updater
  function updateTransform() {
    canvas.style.transform = `translate(${panX}px, ${panY}px) scale(${zoom})`;
    
    // Modulo grid positioning for infinite seamless coverage in every direction
    const scaledGrid = gridSize * zoom;
    const bgX = ((panX % scaledGrid) + scaledGrid) % scaledGrid;
    const bgY = ((panY % scaledGrid) + scaledGrid) % scaledGrid;
    
    viewport.style.backgroundSize = `${scaledGrid}px ${scaledGrid}px`;
    viewport.style.backgroundPosition = `${bgX}px ${bgY}px`;
    zoomDisplay.textContent = `${Math.round(zoom * 100)}%`;
  }

  updateTransform();

  // Helper: check if user is currently typing in an input or textarea
  function isUserTyping() {
    const active = document.activeElement;
    if (!active) return false;
    const tag = active.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || active.isContentEditable;
  }

  // ------------------------------------------------------------------------
  // Cancel Active Gestures (used for simultaneous button clicks, blur & escape)
  // ------------------------------------------------------------------------
  function cancelMarquee() {
    pendingMarquee = false;
    marqueeActive = false;
    isMarquee = false;
    if (activePointerId !== null) {
      if (viewport && viewport.hasPointerCapture && viewport.hasPointerCapture(activePointerId)) {
        try {
          viewport.releasePointerCapture(activePointerId);
        } catch (err) {}
      }
      activePointerId = null;
    }
    if (marqueeEl) marqueeEl.style.display = 'none';
    if (viewport) viewport.classList.remove('is-marquee-selecting');
  }

  function cancelActiveGestures() {
    if (isPanning) {
      isPanning = false;
      viewport.style.cursor = 'default';
    }
    cancelMarquee();
    if (isDraggingCards) {
      isDraggingCards = false;
      // Revert cards to start positions if cancelled mid-drag
      if (dragPositionsInit && dragPositionsInit.length > 0) {
        dragPositionsInit.forEach(({ item: it, startX: itStartX, startY: itStartY }) => {
          it.position_x = itStartX;
          it.position_y = itStartY;
          const el = document.getElementById(`board-card-${it.id}`);
          if (el) {
            el.style.left = `${itStartX}px`;
            el.style.top = `${itStartY}px`;
            el.style.cursor = 'grab';
          }
        });
        renderConnections();
      }
    }
    if (connectingSourceId) {
      connectingSourceId = null;
      snapTargetCardId = null;
      wireInProgress.style.display = 'none';
      items.forEach(it => {
        document.getElementById(`board-card-${it.id}`)?.classList.remove('board-card--snap-target');
      });
    }
    viewport.style.cursor = 'default';
  }

  // ------------------------------------------------------------------------
  // Update Selection UI (direct DOM updates without rebuilding cards)
  // ------------------------------------------------------------------------
  function updateSelectionUI() {
    // 1. Update Card selection classes
    items.forEach(it => {
      const el = document.getElementById(`board-card-${it.id}`);
      if (el) {
        if (selectedItemIds.has(it.id)) {
          el.classList.add('board-card--selected');
        } else {
          el.classList.remove('board-card--selected');
        }
      }
    });

    // 2. Update Wire selection classes and styles
    connections.forEach(conn => {
      const gEl = connectionsGroup.querySelector(`.board-connection-line[data-id="${conn.id}"]`);
      if (gEl) {
        const isSelected = selectedConnectionIds.has(conn.id);
        const pathEl = gEl.querySelector('.wire-path');
        const textEl = gEl.querySelector('text');
        const rectEl = gEl.querySelector('rect');
        if (isSelected) {
          gEl.classList.add('is-selected');
          if (pathEl) {
            pathEl.setAttribute('stroke', 'var(--wire-active-stroke, var(--accent-primary))');
            pathEl.setAttribute('stroke-width', '3.5');
            pathEl.setAttribute('marker-end', 'url(#arrow-active)');
          }
          if (textEl) textEl.setAttribute('fill', 'var(--accent-deep, var(--accent-primary))');
          if (rectEl) {
            rectEl.setAttribute('stroke', 'var(--selection-border, var(--accent-primary))');
            rectEl.setAttribute('stroke-width', '1.5');
          }
        } else {
          gEl.classList.remove('is-selected');
          if (pathEl) {
            pathEl.setAttribute('stroke', 'var(--graph-edge-default, var(--border-secondary))');
            pathEl.setAttribute('stroke-width', '2');
            pathEl.setAttribute('marker-end', 'url(#arrow-default)');
          }
          if (textEl) textEl.setAttribute('fill', 'var(--text-secondary)');
          if (rectEl) {
            rectEl.setAttribute('stroke', 'var(--border-primary)');
            rectEl.setAttribute('stroke-width', '1');
          }
        }
      }
    });

    // 3. Update Toolbar Delete Action Button
    const totalSelected = selectedItemIds.size + selectedConnectionIds.size;
    if (deleteBtn && deleteCount) {
      if (totalSelected > 0) {
        deleteBtn.style.display = 'inline-flex';
        deleteCount.textContent = `Delete (${totalSelected})`;
      } else {
        deleteBtn.style.display = 'none';
      }
    }
  }

  // ------------------------------------------------------------------------
  // Precision Wire Geometry & Boundary Anchor Calculation
  // ------------------------------------------------------------------------
  function getCardBoundaryAnchor(s, t) {
    const sW = s.width || 240;
    const sH = s.height || 160;
    const tW = t.width || 240;
    const tH = t.height || 160;

    const sCenterX = s.position_x + sW / 2;
    const sCenterY = s.position_y + sH / 2;
    const tCenterX = t.position_x + tW / 2;
    const tCenterY = t.position_y + tH / 2;

    const dx = tCenterX - sCenterX;
    const dy = tCenterY - sCenterY;

    let sAnchor, tAnchor;

    if (Math.abs(dx) * sH >= Math.abs(dy) * sW) {
      if (dx >= 0) {
        sAnchor = { x: s.position_x + sW, y: sCenterY, nx: 1, ny: 0 };
        tAnchor = { x: t.position_x, y: tCenterY, nx: -1, ny: 0 };
      } else {
        sAnchor = { x: s.position_x, y: sCenterY, nx: -1, ny: 0 };
        tAnchor = { x: t.position_x + tW, y: tCenterY, nx: 1, ny: 0 };
      }
    } else {
      if (dy >= 0) {
        sAnchor = { x: sCenterX, y: s.position_y + sH, nx: 0, ny: 1 };
        tAnchor = { x: tCenterX, y: t.position_y, nx: 0, ny: -1 };
      } else {
        sAnchor = { x: sCenterX, y: s.position_y, nx: 0, ny: -1 };
        tAnchor = { x: tCenterX, y: t.position_y + tH, nx: 0, ny: 1 };
      }
    }

    return { sAnchor, tAnchor };
  }

  function calculateBoundaryBezier(sAnchor, tAnchor) {
    const dist = Math.hypot(tAnchor.x - sAnchor.x, tAnchor.y - sAnchor.y);
    const handleLen = Math.max(35, Math.min(dist * 0.45, 300));

    const cp1x = sAnchor.x + sAnchor.nx * handleLen;
    const cp1y = sAnchor.y + sAnchor.ny * handleLen;
    const cp2x = tAnchor.x + tAnchor.nx * handleLen;
    const cp2y = tAnchor.y + tAnchor.ny * handleLen;

    const pathData = `M ${sAnchor.x} ${sAnchor.y} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${tAnchor.x} ${tAnchor.y}`;

    const midX = 0.125 * sAnchor.x + 0.375 * cp1x + 0.375 * cp2x + 0.125 * tAnchor.x;
    const midY = 0.125 * sAnchor.y + 0.375 * cp1y + 0.375 * cp2y + 0.125 * tAnchor.y;

    return { pathData, midX, midY };
  }

  function calculateProgressBezier(s, cursorX, cursorY, snapTargetItem) {
    const sW = s.width || 240;
    const sH = s.height || 160;
    const sCenterX = s.position_x + sW / 2;
    const sCenterY = s.position_y + sH / 2;

    if (snapTargetItem) {
      const { sAnchor, tAnchor } = getCardBoundaryAnchor(s, snapTargetItem);
      return calculateBoundaryBezier(sAnchor, tAnchor).pathData;
    }

    const dx = cursorX - sCenterX;
    const dy = cursorY - sCenterY;
    let sAnchor;
    if (Math.abs(dx) * sH >= Math.abs(dy) * sW) {
      if (dx >= 0) sAnchor = { x: s.position_x + sW, y: sCenterY, nx: 1, ny: 0 };
      else sAnchor = { x: s.position_x, y: sCenterY, nx: -1, ny: 0 };
    } else {
      if (dy >= 0) sAnchor = { x: sCenterX, y: s.position_y + sH, nx: 0, ny: 1 };
      else sAnchor = { x: sCenterX, y: s.position_y, nx: 0, ny: -1 };
    }

    const dist = Math.hypot(cursorX - sAnchor.x, cursorY - sAnchor.y);
    const handleLen = Math.max(30, Math.min(dist * 0.4, 200));
    const cp1x = sAnchor.x + sAnchor.nx * handleLen;
    const cp1y = sAnchor.y + sAnchor.ny * handleLen;

    return `M ${sAnchor.x} ${sAnchor.y} Q ${cp1x} ${cp1y}, ${cursorX} ${cursorY}`;
  }

  // Snapping detector: checks if cursor is near any other card
  function findSnapTarget(cursorX, cursorY, excludeId) {
    let bestTarget = null;
    let bestDist = 55;

    for (const item of items) {
      if (item.id === excludeId) continue;
      const w = item.width || 240;
      const h = item.height || 160;

      if (cursorX >= item.position_x && cursorX <= item.position_x + w &&
          cursorY >= item.position_y && cursorY <= item.position_y + h) {
        return item;
      }

      const nearestX = Math.max(item.position_x, Math.min(cursorX, item.position_x + w));
      const nearestY = Math.max(item.position_y, Math.min(cursorY, item.position_y + h));
      const dist = Math.hypot(cursorX - nearestX, cursorY - nearestY);

      if (dist < bestDist) {
        bestDist = dist;
        bestTarget = item;
      }
    }
    return bestTarget;
  }

  // Accurate Wire Path Intersection (Samples actual Bézier curve points & segments)
  function checkWireIntersectsRect(conn, boxX1, boxY1, boxX2, boxY2) {
    const sItem = items.find(i => i.id == conn.source_item_id);
    const tItem = items.find(i => i.id == conn.target_item_id);
    if (!sItem || !tItem) return false;

    // If both connected cards are selected, wire is included
    if (selectedItemIds.has(sItem.id) && selectedItemIds.has(tItem.id)) {
      return true;
    }

    const { sAnchor, tAnchor } = getCardBoundaryAnchor(sItem, tItem);
    const dist = Math.hypot(tAnchor.x - sAnchor.x, tAnchor.y - sAnchor.y);
    const handleLen = Math.max(35, Math.min(dist * 0.45, 300));

    const p0x = sAnchor.x, p0y = sAnchor.y;
    const p1x = sAnchor.x + sAnchor.nx * handleLen, p1y = sAnchor.y + sAnchor.ny * handleLen;
    const p2x = tAnchor.x + tAnchor.nx * handleLen, p2y = tAnchor.y + tAnchor.ny * handleLen;
    const p3x = tAnchor.x, p3y = tAnchor.y;

    function pointInRect(px, py) {
      return px >= boxX1 && px <= boxX2 && py >= boxY1 && py <= boxY2;
    }

    function lineIntersectsLine(x1, y1, x2, y2, x3, y3, x4, y4) {
      const denom = (y4 - y3) * (x2 - x1) - (x4 - x3) * (y2 - y1);
      if (denom === 0) return false;
      const ua = ((x4 - x3) * (y1 - y3) - (y4 - y3) * (x1 - x3)) / denom;
      const ub = ((x2 - x1) * (y1 - y3) - (y2 - y1) * (x1 - x3)) / denom;
      return ua >= 0 && ua <= 1 && ub >= 0 && ub <= 1;
    }

    function lineIntersectsBox(x1, y1, x2, y2) {
      if (lineIntersectsLine(x1, y1, x2, y2, boxX1, boxY1, boxX2, boxY1)) return true;
      if (lineIntersectsLine(x1, y1, x2, y2, boxX1, boxY2, boxX2, boxY2)) return true;
      if (lineIntersectsLine(x1, y1, x2, y2, boxX1, boxY1, boxX1, boxY2)) return true;
      if (lineIntersectsLine(x1, y1, x2, y2, boxX2, boxY1, boxX2, boxY2)) return true;
      return false;
    }

    // Sample 30 points along the Bézier curve path
    let prevX = p0x, prevY = p0y;
    if (pointInRect(prevX, prevY)) return true;

    const SAMPLES = 30;
    for (let i = 1; i <= SAMPLES; i++) {
      const t = i / SAMPLES;
      const oneMinusT = 1 - t;
      const c0 = oneMinusT * oneMinusT * oneMinusT;
      const c1 = 3 * oneMinusT * oneMinusT * t;
      const c2 = 3 * oneMinusT * t * t;
      const c3 = t * t * t;

      const curX = c0 * p0x + c1 * p1x + c2 * p2x + c3 * p3x;
      const curY = c0 * p0y + c1 * p1y + c2 * p2y + c3 * p3y;

      if (pointInRect(curX, curY)) return true;
      if (lineIntersectsBox(prevX, prevY, curX, curY)) return true;

      prevX = curX;
      prevY = curY;
    }

    return false;
  }

  // ------------------------------------------------------------------------
  // Render Connections Layer
  // ------------------------------------------------------------------------
  function renderConnections() {
    let svgHtml = '';
    connections.forEach(conn => {
      const sItem = items.find(i => i.id == conn.source_item_id);
      const tItem = items.find(i => i.id == conn.target_item_id);
      if (!sItem || !tItem) return;

      const { sAnchor, tAnchor } = getCardBoundaryAnchor(sItem, tItem);
      const { pathData, midX, midY } = calculateBoundaryBezier(sAnchor, tAnchor);

      const isSelected = selectedConnectionIds.has(conn.id);
      const strokeColor = isSelected ? 'var(--wire-active-stroke, var(--accent-primary))' : 'var(--graph-edge-default, var(--border-secondary))';
      const strokeWidth = isSelected ? 3.5 : 2;
      const marker = isSelected ? 'url(#arrow-active)' : 'url(#arrow-default)';

      const labelText = conn.label || '';
      const labelW = labelText ? Math.max(labelText.length * 7 + 16, 50) : 0;

      svgHtml += `
        <g class="board-connection-line ${isSelected ? 'is-selected' : ''}" data-id="${conn.id}">
          <!-- Fat invisible hitbox for effortless clicking (20px width) -->
          <path class="wire-hitbox" d="${pathData}" fill="none" stroke="transparent" stroke-width="20" style="pointer-events: stroke; cursor: pointer;"></path>
          <!-- Visible wire -->
          <path class="wire-path" d="${pathData}" fill="none" stroke="${strokeColor}" stroke-width="${strokeWidth}" marker-end="${marker}" style="pointer-events: none;"></path>
          <!-- Readable relationship label pill -->
          ${labelText ? `
            <g class="wire-label" transform="translate(${midX}, ${midY})" style="pointer-events: all; cursor: pointer;">
              <rect x="-${labelW / 2}" y="-10" width="${labelW}" height="20" rx="4" fill="var(--bg-secondary)" stroke="${isSelected ? 'var(--selection-border, var(--accent-primary))' : 'var(--border-primary)'}" stroke-width="${isSelected ? 1.5 : 1}"></rect>
              <text x="0" y="3.5" fill="${isSelected ? 'var(--accent-deep, var(--accent-primary))' : 'var(--text-secondary)'}" font-size="11" font-weight="500" font-family="var(--font-sans)" text-anchor="middle">${labelText}</text>
            </g>
          ` : ''}
        </g>
      `;
    });

    connectionsGroup.innerHTML = svgHtml;

    // Attach wire interaction handlers
    connectionsGroup.querySelectorAll('.board-connection-line').forEach(lineEl => {
      const connId = parseInt(lineEl.getAttribute('data-id'), 10);
      const hitbox = lineEl.querySelector('.wire-hitbox');
      const labelEl = lineEl.querySelector('.wire-label');
      const pathEl = lineEl.querySelector('.wire-path');

      const handleSelectWire = (e) => {
        e.stopPropagation();
        if (e.shiftKey) {
          if (selectedConnectionIds.has(connId)) selectedConnectionIds.delete(connId);
          else selectedConnectionIds.add(connId);
        } else {
          selectedItemIds.clear();
          selectedConnectionIds.clear();
          selectedConnectionIds.add(connId);
        }
        updateSelectionUI();
      };

      if (hitbox) {
        hitbox.addEventListener('click', handleSelectWire);
        hitbox.addEventListener('mouseenter', () => {
          if (!selectedConnectionIds.has(connId)) {
            pathEl.setAttribute('stroke', 'var(--accent-hover, var(--accent-primary))');
            pathEl.setAttribute('stroke-width', '3');
            pathEl.setAttribute('marker-end', 'url(#arrow-snap)');
          }
        });
        hitbox.addEventListener('mouseleave', () => {
          if (!selectedConnectionIds.has(connId)) {
            pathEl.setAttribute('stroke', 'var(--graph-edge-default, var(--border-secondary))');
            pathEl.setAttribute('stroke-width', '2');
            pathEl.setAttribute('marker-end', 'url(#arrow-default)');
          }
        });
      }

      if (labelEl) {
        labelEl.addEventListener('click', handleSelectWire);
      }
    });
  }

  // ------------------------------------------------------------------------
  // Duplicate Connection Prevention & Connection Completion
  // ------------------------------------------------------------------------
  async function completeConnection(srcId, targetId) {
    if (!srcId || !targetId || srcId === targetId) return;

    const existing = connections.find(c =>
      (Number(c.source_item_id) === Number(srcId) && Number(c.target_item_id) === Number(targetId)) ||
      (Number(c.source_item_id) === Number(targetId) && Number(c.target_item_id) === Number(srcId))
    );

    if (existing) {
      selectedItemIds.clear();
      selectedConnectionIds.clear();
      selectedConnectionIds.add(existing.id);
      updateSelectionUI();
      window.showToast('Cards are already connected: selected existing wire.', 'info', 2000);
      return;
    }

    try {
      const res = await window.API.post(`/boards/${board.id}/connections`, {
        source_item_id: srcId,
        target_item_id: targetId,
        connection_type: 'related_to',
        label: 'relates'
      });
      const newConn = res.connection;
      connections.push(newConn);
      selectedConnectionIds.clear();
      selectedConnectionIds.add(newConn.id);

      pushUndoAction({
        type: 'create_connection',
        connection: newConn
      });

      renderConnections();
      updateSelectionUI();
      window.showToast('Cards connected with visual relationship.', 'success');
    } catch (err) {
      window.showToast(err.message, 'error');
    }
  }

  // ------------------------------------------------------------------------
  // Group Boundaries Recalculation
  // ------------------------------------------------------------------------
  function recalculateGroupBounds(g) {
    const memberCards = items.filter(item => {
      const cx = item.position_x + (item.width || 240) / 2;
      const cy = item.position_y + (item.height || 160) / 2;
      return cx >= g.position_x - 30 && cx <= g.position_x + g.width + 30 &&
             cy >= g.position_y - 30 && cy <= g.position_y + g.height + 30;
    });

    if (memberCards.length === 0) return;

    let minX = g.position_x, minY = g.position_y;
    let maxX = g.position_x + g.width, maxY = g.position_y + g.height;

    memberCards.forEach(item => {
      const w = item.width || 240;
      const h = item.height || 160;
      minX = Math.min(minX, item.position_x - 24);
      minY = Math.min(minY, item.position_y - 40);
      maxX = Math.max(maxX, item.position_x + w + 24);
      maxY = Math.max(maxY, item.position_y + h + 24);
    });

    const newW = maxX - minX;
    const newH = maxY - minY;

    if (minX !== g.position_x || minY !== g.position_y || newW !== g.width || newH !== g.height) {
      g.position_x = minX;
      g.position_y = minY;
      g.width = newW;
      g.height = newH;
      renderGroups();
      window.API.put(`/boards/${board.id}/groups/${g.id}`, {
        position_x: g.position_x,
        position_y: g.position_y,
        width: g.width,
        height: g.height
      }).catch(console.error);
    }
  }

  // ------------------------------------------------------------------------
  // Render Groups Layer
  // ------------------------------------------------------------------------
  function renderGroups() {
    groupsLayer.innerHTML = groups.map(g => `
      <div class="board-group-container" id="board-group-${g.id}" data-id="${g.id}" 
           style="position: absolute; left: ${g.position_x}px; top: ${g.position_y}px; width: ${g.width}px; height: ${g.height}px; border: 2px dashed ${g.color || 'var(--project-violet, #9B8AE0)'}; border-radius: var(--radius-lg); pointer-events: auto;">
        <div class="board-group-header" style="height: 32px; padding: 0 12px; display: flex; align-items: center; justify-content: space-between; cursor: grab; border-top-left-radius: var(--radius-lg); border-top-right-radius: var(--radius-lg);">
          <div style="display: flex; align-items: center; gap: 6px;">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="${g.color || 'var(--project-violet, #9B8AE0)'}" stroke-width="2.5"><rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/></svg>
            <span style="font-size: var(--text-xs); font-weight: 600; color: ${g.color || 'var(--project-violet, #9B8AE0)'}; text-transform: uppercase; letter-spacing: 0.04em;">${g.title}</span>
          </div>
          <button class="btn btn--ghost btn--icon btn--sm btn-delete-group" data-id="${g.id}" title="Delete Group" style="width: 20px; height: 20px; color: var(--text-tertiary); display: inline-flex; align-items: center; justify-content: center;"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg></button>
        </div>
      </div>
    `).join('');

    // Attach group dragging
    groups.forEach(g => {
      const gEl = document.getElementById(`board-group-${g.id}`);
      if (!gEl) return;
      const header = gEl.querySelector('.board-group-header');

      gEl.querySelector('.btn-delete-group').addEventListener('click', async (e) => {
        e.stopPropagation();
        await window.API.delete(`/boards/${board.id}/groups/${g.id}`);
        groups = groups.filter(gr => gr.id !== g.id);
        renderGroups();
      });

      let isDraggingGroup = false;
      let startX = 0, startY = 0;
      let initGX = 0, initGY = 0;
      let memberItemsInit = [];

      header.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        if ((e.buttons & 1) && (e.buttons & 2)) {
          cancelActiveGestures();
          ignoreGesturesUntilRelease = true;
          return;
        }
        if (e.target.closest('.btn-delete-group')) return;

        isDraggingGroup = true;
        header.style.cursor = 'grabbing';
        startX = e.clientX;
        startY = e.clientY;
        initGX = g.position_x;
        initGY = g.position_y;

        memberItemsInit = items.filter(item => {
          return item.position_x >= g.position_x &&
                 item.position_x + (item.width || 240) <= g.position_x + g.width &&
                 item.position_y >= g.position_y &&
                 item.position_y + (item.height || 160) <= g.position_y + g.height;
        }).map(item => ({ item, startX: item.position_x, startY: item.position_y }));

        e.stopPropagation();
      });

      window.addEventListener('mousemove', (e) => {
        if (!isDraggingGroup) return;
        if ((e.buttons & 1) && (e.buttons & 2)) {
          isDraggingGroup = false;
          header.style.cursor = 'grab';
          cancelActiveGestures();
          ignoreGesturesUntilRelease = true;
          return;
        }

        let deltaX = (e.clientX - startX) / zoom;
        let deltaY = (e.clientY - startY) / zoom;

        let newX = initGX + deltaX;
        let newY = initGY + deltaY;
        if (snapGrid) {
          newX = Math.round(newX / gridSize) * gridSize;
          newY = Math.round(newY / gridSize) * gridSize;
        }

        g.position_x = newX;
        g.position_y = newY;
        gEl.style.left = `${newX}px`;
        gEl.style.top = `${newY}px`;

        memberItemsInit.forEach(({ item, startX: itemStartX, startY: itemStartY }) => {
          let itemNewX = itemStartX + (newX - initGX);
          let itemNewY = itemStartY + (newY - initGY);
          if (snapGrid) {
            itemNewX = Math.round(itemNewX / gridSize) * gridSize;
            itemNewY = Math.round(itemNewY / gridSize) * gridSize;
          }
          item.position_x = itemNewX;
          item.position_y = itemNewY;
          const iEl = document.getElementById(`board-card-${item.id}`);
          if (iEl) {
            iEl.style.left = `${itemNewX}px`;
            iEl.style.top = `${itemNewY}px`;
          }
        });

        renderConnections();
      });

      window.addEventListener('mouseup', async () => {
        if (!isDraggingGroup) return;
        isDraggingGroup = false;
        header.style.cursor = 'grab';

        await window.API.put(`/boards/${board.id}/groups/${g.id}`, {
          position_x: g.position_x,
          position_y: g.position_y
        });

        if (memberItemsInit.length > 0) {
          const positions = memberItemsInit.map(({ item }) => ({
            id: item.id,
            position_x: item.position_x,
            position_y: item.position_y
          }));
          await window.API.put(`/boards/${board.id}/items/batch`, { positions });
        }
      });
    });
  }

  // ------------------------------------------------------------------------
  // Render Cards Layer
  // ------------------------------------------------------------------------
  const CARD_TYPE_ICONS = {
    note: 'book-open',
    idea: 'bot',
    task: 'check-square',
    research_ref: 'file-search',
    document: 'folder',
    link: 'share-2',
    image: 'folder'
  };

  function renderCards() {
    cardsLayer.innerHTML = items.map(item => {
      const typeIcon = CARD_TYPE_ICONS[item.item_type] || 'book-open';
      const isSelected = selectedItemIds.has(item.id);
      const accentColor = item.color || 'var(--accent-primary)';

      return `
        <div class="card board-card ${isSelected ? 'board-card--selected' : ''}" 
             id="board-card-${item.id}" 
             data-id="${item.id}"
             style="position: absolute; left: ${item.position_x}px; top: ${item.position_y}px; width: ${item.width || 240}px; height: ${item.height || 160}px; padding: 0; display: flex; flex-direction: column; overflow: hidden; pointer-events: auto; border: 1px solid ${isSelected ? 'var(--selection-border)' : 'var(--border-primary)'}; box-shadow: ${isSelected ? 'var(--selection-halo), var(--shadow-lg)' : 'var(--shadow-md)'}; cursor: grab;">
          
          <!-- Top Color Accent Bar -->
          <div style="height: 3px; background-color: ${accentColor}; width: 100%;"></div>

          <!-- Card Header / Drag Handle -->
          <div class="card-drag-handle" style="padding: 8px 10px; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid var(--border-primary); background-color: var(--bg-secondary);">
            <div style="display: flex; align-items: center; gap: 6px; overflow: hidden;">
              <span style="color: ${accentColor}; display: flex;">${getIcon(typeIcon)}</span>
              <span class="text-xs text-secondary" style="font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em;">${item.item_type.replace('_', ' ')}</span>
              ${item.reference_type === 'note' ? `<span class="badge" style="background: var(--accent-soft); color: var(--accent-deep); font-size: 9px; padding: 1px 4px; border-radius: 4px; font-weight: 500;">Vault Note</span>` : ''}
              ${item.reference_type === 'task' ? `<span class="badge badge--projection" style="background: var(--status-success-bg, rgba(52, 211, 153, 0.15)); color: var(--status-success-text, #34d399); font-size: 9px; padding: 1px 4px; border-radius: 4px;">Task [${item.status || 'planned'}]</span>` : ''}
              ${item.reference_type === 'task' && item.priority ? `<span class="badge" style="background: rgba(255, 255, 255, 0.08); color: var(--text-secondary); font-size: 8px; padding: 1px 4px; border-radius: 4px; text-transform: uppercase;">${item.priority}</span>` : ''}
            </div>
            <div style="display: flex; align-items: center; gap: 6px;">
              ${item.reference_type === 'note' && item.reference_id ? `
                <button type="button" class="btn btn--ghost btn--icon btn--sm btn-open-canonical btn-open-original-note" data-type="note" data-id="${item.reference_id}" title="Open Note in Vault" aria-label="Open Note in Vault" style="width: 20px; height: 20px; padding: 0; color: var(--accent-deep); display: inline-flex; align-items: center; justify-content: center;">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                </button>
              ` : ''}
              ${item.reference_type === 'task' && item.reference_id ? `
                <button type="button" class="btn btn--ghost btn--icon btn--sm btn-open-canonical btn-open-original-task" data-type="task" data-id="${item.reference_id}" title="Open Original Task" aria-label="Open Original Task" style="width: 20px; height: 20px; padding: 0; color: var(--status-success-text, #34d399); display: inline-flex; align-items: center; justify-content: center;">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                </button>
              ` : ''}
              <!-- Edit Card Button -->
              <button type="button" class="btn btn--ghost btn--icon btn--sm btn-card-inspect" data-id="${item.id}" title="Edit Card (or double-click body)" style="width: 20px; height: 20px; padding: 0; color: var(--text-tertiary); display: inline-flex; align-items: center; justify-content: center;">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
              </button>
              <!-- Precision Connection Port Handle with Hover Feedback -->
              <div class="card-port-connector" data-id="${item.id}" title="Drag to connect cards" 
                   style="width: 14px; height: 14px; border-radius: var(--radius-full); background: var(--surface-primary); border: 2px solid ${accentColor}; cursor: crosshair; flex-shrink: 0;"></div>
            </div>
          </div>

          <!-- Card Body -->
          <div class="card-body" style="padding: 10px 12px; flex: 1; overflow-y: auto;">
            <div style="font-size: var(--text-sm); font-weight: 600; color: var(--text-primary); margin-bottom: 4px;" class="text-truncate">${item.title}</div>
            <div style="font-size: var(--text-xs); color: var(--text-secondary); line-height: 1.4;">${item.content ? (window.SmartLinkHandler ? window.SmartLinkHandler.renderMarkdownLinks(item.content) : item.content) : '<span class="text-tertiary">Double-click or click edit icon to edit...</span>'}</div>
          </div>

          <!-- Card Resize Handle (Bottom-Right) -->
          <div class="card-resize-handle" data-id="${item.id}" 
               style="position: absolute; bottom: 0; right: 0; width: 14px; height: 14px; cursor: se-resize; border-bottom: 2px solid var(--text-tertiary); border-right: 2px solid var(--text-tertiary);"></div>
        </div>
      `;
    }).join('');

    attachCardInteractions();
    updateSelectionUI();
  }

  function attachCardInteractions() {
    items.forEach(item => {
      const cardEl = document.getElementById(`board-card-${item.id}`);
      if (!cardEl) return;

      const bodyEl = cardEl.querySelector('.card-body');
      const portEl = cardEl.querySelector('.card-port-connector');
      const resizeHandle = cardEl.querySelector('.card-resize-handle');
      const inspectBtn = cardEl.querySelector('.btn-card-inspect');
      const openCanonicalBtn = cardEl.querySelector('.btn-open-canonical');

      if (openCanonicalBtn) {
        openCanonicalBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          const cType = openCanonicalBtn.getAttribute('data-type');
          const cId = openCanonicalBtn.getAttribute('data-id');
          if (cType === 'note') {
            window.Router.navigate(`/vault/${cId}`);
          } else if (cType === 'task') {
            window.Router.navigate(`/workflow?taskId=${cId}`);
          }
        });
      }

      // Edit Button opens Inspector
      if (inspectBtn) {
        inspectBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          selectedItemIds.clear();
          selectedItemIds.add(item.id);
          updateSelectionUI();
          openCardInspector(item);
        });
      }

      // Double-click on card body opens Inspector
      bodyEl.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        selectedItemIds.clear();
        selectedItemIds.add(item.id);
        updateSelectionUI();
        openCardInspector(item);
      });

      // 1. Card Selection and Left-Drag (Moves card or entire multi-selection)
      cardEl.addEventListener('mousedown', (e) => {
        // Only handle primary (left) button for dragging and selecting
        if (e.button !== 0) return;

        // Check simultaneous buttons
        if ((e.buttons & 1) && (e.buttons & 2)) {
          cancelActiveGestures();
          ignoreGesturesUntilRelease = true;
          return;
        }

        if (ignoreGesturesUntilRelease) return;

        // Ignore if clicking connector port, resize handle, or inspect button
        if (e.target.closest('.card-port-connector') || e.target.closest('.card-resize-handle') || e.target.closest('.btn-card-inspect')) {
          return;
        }

        e.stopPropagation();

        // Selection update without tearing down the DOM
        if (e.shiftKey) {
          if (selectedItemIds.has(item.id)) selectedItemIds.delete(item.id);
          else selectedItemIds.add(item.id);
        } else if (!selectedItemIds.has(item.id)) {
          selectedItemIds.clear();
          selectedConnectionIds.clear();
          selectedItemIds.add(item.id);
        }

        updateSelectionUI();

        // Prepare multi-card dragging
        isDraggingCards = true;
        cardDragDistance = 0;
        dragClientStartX = e.clientX;
        dragClientStartY = e.clientY;

        dragPositionsInit = Array.from(selectedItemIds).map(id => {
          const it = items.find(i => i.id === id);
          return it ? { id: it.id, item: it, startX: it.position_x, startY: it.position_y } : null;
        }).filter(Boolean);

        cardEl.style.cursor = 'grabbing';
      });

      // 2. Card Resizing
      let isResizing = false;
      let resizeStartX = 0, resizeStartY = 0;
      let initW = 0, initH = 0;

      resizeHandle.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        isResizing = true;
        resizeStartX = e.clientX;
        resizeStartY = e.clientY;
        initW = item.width || 240;
        initH = item.height || 160;
        e.stopPropagation();
      });

      window.addEventListener('mousemove', (e) => {
        if (!isResizing) return;
        if ((e.buttons & 1) && (e.buttons & 2)) {
          isResizing = false;
          cancelActiveGestures();
          ignoreGesturesUntilRelease = true;
          return;
        }

        let deltaW = (e.clientX - resizeStartX) / zoom;
        let deltaH = (e.clientY - resizeStartY) / zoom;

        let newW = Math.max(initW + deltaW, 160);
        let newH = Math.max(initH + deltaH, 100);

        if (snapGrid) {
          newW = Math.round(newW / gridSize) * gridSize;
          newH = Math.round(newH / gridSize) * gridSize;
        }

        item.width = newW;
        item.height = newH;
        cardEl.style.width = `${newW}px`;
        cardEl.style.height = `${newH}px`;
        renderConnections();
      });

      window.addEventListener('mouseup', async () => {
        if (!isResizing) return;
        isResizing = false;
        await window.API.put(`/boards/${board.id}/items/${item.id}`, {
          width: item.width,
          height: item.height
        });
        groups.forEach(g => recalculateGroupBounds(g));
      });

      // 3. Precision Wire Dragging from Connector Port
      portEl.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        e.stopPropagation();
        connectingSourceId = item.id;
        snapTargetCardId = null;
        viewport.style.cursor = 'crosshair';
      });
    });
  }

  // ------------------------------------------------------------------------
  // Delete Selection (Cards & Wires)
  // ------------------------------------------------------------------------
  async function deleteSelection() {
    if (selectedItemIds.size === 0 && selectedConnectionIds.size === 0) return;

    const countItems = selectedItemIds.size;
    const countConns = selectedConnectionIds.size;
    const itemsToDelete = items.filter(i => selectedItemIds.has(i.id));
    const connsToDelete = connections.filter(c =>
      selectedConnectionIds.has(c.id) ||
      selectedItemIds.has(c.source_item_id) ||
      selectedItemIds.has(c.target_item_id)
    );

    pushUndoAction({
      type: 'delete_selection',
      items: itemsToDelete,
      connections: connsToDelete
    });

    // Delete connections from API
    for (const c of connsToDelete) {
      window.API.delete(`/boards/${board.id}/connections/${c.id}`).catch(console.error);
    }
    connections = connections.filter(c => !connsToDelete.some(dc => dc.id === c.id));

    // Delete items from API
    for (const item of itemsToDelete) {
      window.API.delete(`/boards/${board.id}/items/${item.id}`).catch(console.error);
    }
    items = items.filter(i => !selectedItemIds.has(i.id));

    selectedItemIds.clear();
    selectedConnectionIds.clear();
    closeInspector();
    renderCards();
    renderConnections();
    updateSelectionUI();

    const msg = countItems > 0 && countConns > 0
      ? `Deleted ${countItems} card${countItems > 1 ? 's' : ''} and ${countConns} wire${countConns > 1 ? 's' : ''}`
      : countItems > 0
        ? `Deleted ${countItems} card${countItems > 1 ? 's' : ''}`
        : `Deleted ${countConns} wire${countConns > 1 ? 's' : ''}`;
    window.showToast(msg, 'info', 2000);
  }

  // Toolbar Delete Action Click
  if (deleteBtn) {
    deleteBtn.addEventListener('click', () => {
      deleteSelection();
    });
  }

  // ------------------------------------------------------------------------
  // Undo / Redo Engine
  // ------------------------------------------------------------------------
  function pushUndoAction(action) {
    undoStack.push(action);
    if (undoStack.length > 50) undoStack.shift();
    redoStack = [];
    updateUndoRedoButtons();
  }

  async function handleUndo() {
    if (undoStack.length === 0) return;
    const action = undoStack.pop();

    if (action.type === 'move_items') {
      redoStack.push({ type: 'move_items', positions: action.positions });

      const batchData = [];
      action.positions.forEach(p => {
        const item = items.find(i => i.id === p.id);
        if (item) {
          item.position_x = p.fromX;
          item.position_y = p.fromY;
          const el = document.getElementById(`board-card-${p.id}`);
          if (el) { el.style.left = `${p.fromX}px`; el.style.top = `${p.fromY}px`; }
          batchData.push({ id: p.id, position_x: p.fromX, position_y: p.fromY });
        }
      });
      renderConnections();
      if (batchData.length > 0) {
        window.API.put(`/boards/${board.id}/items/batch`, { positions: batchData }).catch(console.error);
      }
      window.showToast('Undone card movement', 'info', 1500);
    } else if (action.type === 'create_item') {
      redoStack.push({ type: 'create_item', item: action.item });
      items = items.filter(i => i.id !== action.item.id);
      connections = connections.filter(c => c.source_item_id !== action.item.id && c.target_item_id !== action.item.id);
      window.API.delete(`/boards/${board.id}/items/${action.item.id}`).catch(console.error);
      renderCards();
      renderConnections();
      window.showToast('Undone card creation', 'info', 1500);
    } else if (action.type === 'create_connection') {
      redoStack.push({ type: 'create_connection', connection: action.connection });
      connections = connections.filter(c => c.id !== action.connection.id);
      window.API.delete(`/boards/${board.id}/connections/${action.connection.id}`).catch(console.error);
      renderConnections();
      window.showToast('Undone connection wire', 'info', 1500);
    } else if (action.type === 'delete_selection') {
      redoStack.push({ type: 'delete_selection', items: action.items, connections: action.connections });
      for (const it of action.items) {
        try {
          const res = await window.API.post(`/boards/${board.id}/items`, it);
          items.push(res.item);
        } catch (e) { items.push(it); }
      }
      for (const c of action.connections) {
        try {
          const res = await window.API.post(`/boards/${board.id}/connections`, c);
          connections.push(res.connection);
        } catch (e) { connections.push(c); }
      }
      renderCards();
      renderConnections();
      window.showToast('Restored deleted items', 'info', 1500);
    }

    updateUndoRedoButtons();
    updateSelectionUI();
  }

  async function handleRedo() {
    if (redoStack.length === 0) return;
    const action = redoStack.pop();

    if (action.type === 'move_items') {
      undoStack.push({ type: 'move_items', positions: action.positions });

      const batchData = [];
      action.positions.forEach(p => {
        const item = items.find(i => i.id === p.id);
        if (item) {
          item.position_x = p.toX;
          item.position_y = p.toY;
          const el = document.getElementById(`board-card-${p.id}`);
          if (el) { el.style.left = `${p.toX}px`; el.style.top = `${p.toY}px`; }
          batchData.push({ id: p.id, position_x: p.toX, position_y: p.toY });
        }
      });
      renderConnections();
      if (batchData.length > 0) {
        window.API.put(`/boards/${board.id}/items/batch`, { positions: batchData }).catch(console.error);
      }
      window.showToast('Redone card movement', 'info', 1500);
    } else if (action.type === 'create_item') {
      undoStack.push({ type: 'create_item', item: action.item });
      items.push(action.item);
      window.API.post(`/boards/${board.id}/items`, action.item).catch(console.error);
      renderCards();
      renderConnections();
    } else if (action.type === 'create_connection') {
      undoStack.push({ type: 'create_connection', connection: action.connection });
      connections.push(action.connection);
      window.API.post(`/boards/${board.id}/connections`, action.connection).catch(console.error);
      renderConnections();
    } else if (action.type === 'delete_selection') {
      undoStack.push({ type: 'delete_selection', items: action.items, connections: action.connections });
      for (const it of action.items) {
        window.API.delete(`/boards/${board.id}/items/${it.id}`).catch(console.error);
      }
      for (const c of action.connections) {
        window.API.delete(`/boards/${board.id}/connections/${c.id}`).catch(console.error);
      }
      items = items.filter(i => !action.items.some(di => di.id === i.id));
      connections = connections.filter(c => !action.connections.some(dc => dc.id === c.id));
      renderCards();
      renderConnections();
    }

    updateUndoRedoButtons();
    updateSelectionUI();
  }

  function updateUndoRedoButtons() {
    const undoBtn = document.getElementById('btn-board-undo');
    const redoBtn = document.getElementById('btn-board-redo');
    if (undoBtn) undoBtn.disabled = undoStack.length === 0;
    if (redoBtn) redoBtn.disabled = redoStack.length === 0;
  }

  // ------------------------------------------------------------------------
  // Unified Mouse & Gesture Handling (Left Pan, Right Marquee, Simultaneous Guard)
  // ------------------------------------------------------------------------
  viewport.addEventListener('mousedown', (e) => {
    // 0. Simultaneous Button Guard
    const areBothButtonsPressed = (e.buttons & 1) && (e.buttons & 2);
    if (areBothButtonsPressed || ignoreGesturesUntilRelease) {
      cancelActiveGestures();
      ignoreGesturesUntilRelease = true;
      e.preventDefault();
      return;
    }

    // 1. LEFT MOUSE BUTTON (button 0): Pan on empty canvas
    if (e.button === 0) {
      const isOverEmptyCanvas = e.target === viewport || e.target === canvas || e.target.id === 'spatial-board-wrapper' || e.target.id === 'board-connections-svg';
      if (isOverEmptyCanvas || isSpacePressed) {
        isPanning = true;
        startPanX = e.clientX - panX;
        startPanY = e.clientY - panY;
        viewport.style.cursor = 'grabbing';
        e.preventDefault();

        // Clear selection on empty canvas click (unless Shift is held)
        if (!e.shiftKey) {
          selectedItemIds.clear();
          selectedConnectionIds.clear();
          updateSelectionUI();
          closeInspector();
        }
        return;
      }
    }

    // 2. RIGHT MOUSE BUTTON (button 2): Prepare for right-drag marquee selection on empty canvas
    if (e.button === 2) {
      if (!isEligibleEmptyCanvas(e.target)) {
        return; // Started on card, toolbar, input, handle etc. -> do not initiate marquee
      }
      activePointerId = e.pointerId !== undefined ? e.pointerId : 1;
      marqueeStartX = e.clientX;
      marqueeStartY = e.clientY;
      pendingMarquee = true;
      marqueeActive = false;
      suppressNextContextMenu = false;
      if (contextMenuFallbackTimer) {
        clearTimeout(contextMenuFallbackTimer);
        contextMenuFallbackTimer = null;
      }
      return;
    }

    // 3. MIDDLE MOUSE BUTTON (button 1): Pan canvas
    if (e.button === 1) {
      e.preventDefault();
      isPanning = true;
      startPanX = e.clientX - panX;
      startPanY = e.clientY - panY;
      viewport.style.cursor = 'grabbing';
      return;
    }
  });

  window.addEventListener('mousemove', (e) => {
    // Simultaneous buttons pressed: cancel gesture immediately
    const areBothButtonsPressed = (e.buttons & 1) && (e.buttons & 2);
    if (areBothButtonsPressed) {
      cancelActiveGestures();
      ignoreGesturesUntilRelease = true;
      return;
    }

    if (ignoreGesturesUntilRelease) {
      if (e.buttons === 0) {
        ignoreGesturesUntilRelease = false;
      }
      return;
    }

    // Check right button drag threshold (>= 6px) to activate marquee
    if (pendingMarquee && (e.buttons & 2)) {
      const dist = Math.hypot(e.clientX - marqueeStartX, e.clientY - marqueeStartY);
      if (dist >= 6) {
        marqueeActive = true;
        isMarquee = true;
        pendingMarquee = false;
        suppressNextContextMenu = true;

        if (e.pointerId && viewport.setPointerCapture) {
          try { viewport.setPointerCapture(e.pointerId); } catch (err) {}
        }
        viewport.classList.add('is-marquee-selecting');

        if (!e.shiftKey) {
          selectedItemIds.clear();
          selectedConnectionIds.clear();
          updateSelectionUI();
          closeInspector();
        }

        const vpRect = viewport.getBoundingClientRect();
        marqueeEl.style.left = `${marqueeStartX - vpRect.left}px`;
        marqueeEl.style.top = `${marqueeStartY - vpRect.top}px`;
        marqueeEl.style.width = '0px';
        marqueeEl.style.height = '0px';
        marqueeEl.style.display = 'block';
      }
    }

    // 1. Canvas Panning
    if (isPanning) {
      panX = e.clientX - startPanX;
      panY = e.clientY - startPanY;
      updateTransform();
      debouncedSaveViewport();
    }
    // 2. Marquee Multi-Selection (Right-drag)
    else if (isMarquee || marqueeActive) {
      const curX = e.clientX;
      const curY = e.clientY;

      const left = Math.min(curX, marqueeStartX);
      const top = Math.min(curY, marqueeStartY);
      const width = Math.abs(curX - marqueeStartX);
      const height = Math.abs(curY - marqueeStartY);

      const vpRect = viewport.getBoundingClientRect();
      marqueeEl.style.left = `${left - vpRect.left}px`;
      marqueeEl.style.top = `${top - vpRect.top}px`;
      marqueeEl.style.width = `${width}px`;
      marqueeEl.style.height = `${height}px`;

      // Convert marquee bounds to canvas coordinates
      const boxX1 = (left - vpRect.left - panX) / zoom;
      const boxY1 = (top - vpRect.top - panY) / zoom;
      const boxX2 = boxX1 + width / zoom;
      const boxY2 = boxY1 + height / zoom;

      // Select intersecting cards
      items.forEach(item => {
        const iX1 = item.position_x;
        const iY1 = item.position_y;
        const iX2 = iX1 + (item.width || 240);
        const iY2 = iY1 + (item.height || 160);

        const intersects = !(iX2 < boxX1 || iX1 > boxX2 || iY2 < boxY1 || iY1 > boxY2);
        if (intersects) {
          selectedItemIds.add(item.id);
        } else if (!e.shiftKey) {
          selectedItemIds.delete(item.id);
        }
      });

      // Select intersecting wires (following actual visible Bézier path)
      connections.forEach(conn => {
        const intersects = checkWireIntersectsRect(conn, boxX1, boxY1, boxX2, boxY2);
        if (intersects) {
          selectedConnectionIds.add(conn.id);
        } else if (!e.shiftKey) {
          selectedConnectionIds.delete(conn.id);
        }
      });

      updateSelectionUI();
    }
    // 3. Card Dragging (Multi-Card Sync Drag)
    else if (isDraggingCards) {
      cardDragDistance = Math.hypot(e.clientX - dragClientStartX, e.clientY - dragClientStartY);
      if (cardDragDistance > 3) {
        let deltaX = (e.clientX - dragClientStartX) / zoom;
        let deltaY = (e.clientY - dragClientStartY) / zoom;

        dragPositionsInit.forEach(({ item: it, startX: itStartX, startY: itStartY }) => {
          let newX = itStartX + deltaX;
          let newY = itStartY + deltaY;

          if (snapGrid) {
            newX = Math.round(newX / gridSize) * gridSize;
            newY = Math.round(newY / gridSize) * gridSize;
          }

          it.position_x = newX;
          it.position_y = newY;
          const el = document.getElementById(`board-card-${it.id}`);
          if (el) {
            el.style.left = `${newX}px`;
            el.style.top = `${newY}px`;
          }
        });

        renderConnections();
      }
    }
    // 4. Wire Creation Drag
    else if (connectingSourceId) {
      const sItem = items.find(i => i.id === connectingSourceId);
      if (sItem) {
        const rect = viewport.getBoundingClientRect();
        const curCanvasX = (e.clientX - rect.left - panX) / zoom;
        const curCanvasY = (e.clientY - rect.top - panY) / zoom;

        const snapTarget = findSnapTarget(curCanvasX, curCanvasY, connectingSourceId);

        items.forEach(it => {
          const el = document.getElementById(`board-card-${it.id}`);
          if (el) {
            if (snapTarget && it.id === snapTarget.id) {
              el.classList.add('board-card--snap-target');
            } else {
              el.classList.remove('board-card--snap-target');
            }
          }
        });

        snapTargetCardId = snapTarget ? snapTarget.id : null;
        const pathData = calculateProgressBezier(sItem, curCanvasX, curCanvasY, snapTarget);
        wireInProgress.setAttribute('d', pathData);
        wireInProgress.style.display = 'block';
      }
    }
  });

  window.addEventListener('mouseup', async (e) => {
    if (e.buttons === 0) {
      ignoreGesturesUntilRelease = false;
    }

    if (isPanning) {
      isPanning = false;
      viewport.style.cursor = isSpacePressed ? 'grab' : 'default';
    }

    if (e.button === 2 || (e.buttons & 2) === 0) {
      if (marqueeActive || isMarquee) {
        suppressNextContextMenu = true;
        if (contextMenuFallbackTimer) clearTimeout(contextMenuFallbackTimer);
        contextMenuFallbackTimer = setTimeout(() => {
          suppressNextContextMenu = false;
        }, 500);
        updateSelectionUI();
      }
      cancelMarquee();
    }

    if (isDraggingCards) {
      isDraggingCards = false;
      items.forEach(it => {
        const el = document.getElementById(`board-card-${it.id}`);
        if (el) el.style.cursor = 'grab';
      });

      if (cardDragDistance > 3 && dragPositionsInit.length > 0) {
        pushUndoAction({
          type: 'move_items',
          positions: dragPositionsInit.map(({ id, startX, startY, item: it }) => ({
            id,
            fromX: startX,
            fromY: startY,
            toX: it.position_x,
            toY: it.position_y
          }))
        });

        const positions = dragPositionsInit.map(({ item: it }) => ({
          id: it.id,
          position_x: it.position_x,
          position_y: it.position_y
        }));
        await window.API.put(`/boards/${board.id}/items/batch`, { positions });
        groups.forEach(g => recalculateGroupBounds(g));
      }
    }

    if (connectingSourceId) {
      const srcId = connectingSourceId;
      const targetId = snapTargetCardId;
      connectingSourceId = null;
      snapTargetCardId = null;
      wireInProgress.style.display = 'none';
      viewport.style.cursor = isSpacePressed ? 'grab' : 'default';

      items.forEach(it => {
        document.getElementById(`board-card-${it.id}`)?.classList.remove('board-card--snap-target');
      });

      if (targetId && targetId !== srcId) {
        await completeConnection(srcId, targetId);
      }
    }
  });

  // Releasing mouse outside window or pointer cancel prevents stuck states
  window.addEventListener('blur', cancelActiveGestures);
  window.addEventListener('pointercancel', cancelActiveGestures);

  // Wheel Zoom Centered on Pointer
  viewport.addEventListener('wheel', (e) => {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.08 : 0.92;
    const newZoom = Math.min(Math.max(zoom * zoomFactor, 0.2), 3.0);

    const mouseX = e.clientX;
    const mouseY = e.clientY;

    panX = mouseX - (mouseX - panX) * (newZoom / zoom);
    panY = mouseY - (mouseY - panY) * (newZoom / zoom);
    zoom = newZoom;

    updateTransform();
    debouncedSaveViewport();
  }, { passive: false });

  // ------------------------------------------------------------------------
  // Toolbar Zoom & Fit Handlers
  // ------------------------------------------------------------------------
  document.getElementById('btn-board-zoom-in').addEventListener('click', () => {
    zoom = Math.min(zoom * 1.2, 3.0);
    updateTransform();
    debouncedSaveViewport();
  });

  document.getElementById('btn-board-zoom-out').addEventListener('click', () => {
    zoom = Math.max(zoom / 1.2, 0.2);
    updateTransform();
    debouncedSaveViewport();
  });

  // Fit to Content: frames all cards & groups with padding
  function fitToContent() {
    if (items.length === 0 && groups.length === 0) {
      zoom = 1.0;
      panX = (viewport.clientWidth - 400) / 2;
      panY = (viewport.clientHeight - 300) / 2;
      updateTransform();
      debouncedSaveViewport();
      return;
    }

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    items.forEach(item => {
      const w = item.width || 240;
      const h = item.height || 160;
      minX = Math.min(minX, item.position_x);
      minY = Math.min(minY, item.position_y);
      maxX = Math.max(maxX, item.position_x + w);
      maxY = Math.max(maxY, item.position_y + h);
    });

    groups.forEach(g => {
      const w = g.width || 440;
      const h = g.height || 320;
      minX = Math.min(minX, g.position_x);
      minY = Math.min(minY, g.position_y);
      maxX = Math.max(maxX, g.position_x + w);
      maxY = Math.max(maxY, g.position_y + h);
    });

    const contentW = maxX - minX;
    const contentH = maxY - minY;
    const pad = 100;

    const vpW = Math.max(viewport.clientWidth, 400);
    const vpH = Math.max(viewport.clientHeight, 300);

    const scaleX = (vpW - pad * 2) / Math.max(contentW, 100);
    const scaleY = (vpH - pad * 2) / Math.max(contentH, 100);
    zoom = Math.min(Math.max(Math.min(scaleX, scaleY), 0.2), 1.5);

    const contentCenterX = minX + contentW / 2;
    const contentCenterY = minY + contentH / 2;

    panX = vpW / 2 - contentCenterX * zoom;
    panY = vpH / 2 - contentCenterY * zoom;

    updateTransform();
    debouncedSaveViewport();
  }

  document.getElementById('btn-board-zoom-fit').addEventListener('click', fitToContent);

  // Undo & Redo Toolbar Buttons
  document.getElementById('btn-board-undo').addEventListener('click', handleUndo);
  document.getElementById('btn-board-redo').addEventListener('click', handleRedo);

  // Snap to Grid Toggle
  const gridBtn = document.getElementById('btn-board-grid-snap');
  gridBtn.addEventListener('click', () => {
    snapGrid = !snapGrid;
    gridBtn.classList.toggle('btn--primary', snapGrid);
    gridBtn.classList.toggle('btn--ghost', !snapGrid);
    window.showToast(`Snap-to-grid: ${snapGrid ? 'ON (20px)' : 'OFF'}`, 'info', 2000);
  });
  gridBtn.classList.add('btn--primary');

  // Debounced Viewport Persistence
  let saveTimer = null;
  function debouncedSaveViewport() {
    saveStatus.textContent = 'Saving...';
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      try {
        await window.API.put(`/boards/${board.id}/viewport`, {
          zoom_level: zoom,
          viewport_x: panX,
          viewport_y: panY,
          grid_size: gridSize
        });
        saveStatus.textContent = 'Saved';
      } catch (e) {
        saveStatus.textContent = 'Error saving';
      }
    }, 1000);
  }

  // ------------------------------------------------------------------------
  // Global Keyboard Shortcuts (Space, Escape, Delete, Undo/Redo, Select All)
  // ------------------------------------------------------------------------
  function handleKeyDown(e) {
    if (isUserTyping()) return;

    // Spacebar: pan canvas
    if (e.code === 'Space' && !e.repeat) {
      isSpacePressed = true;
      if (!isPanning) viewport.style.cursor = 'grab';
      e.preventDefault();
      return;
    }

    // Escape: clear selection
    if (e.key === 'Escape') {
      selectedItemIds.clear();
      selectedConnectionIds.clear();
      updateSelectionUI();
      closeInspector();
      return;
    }

    // Delete or Backspace: remove selected cards and wires
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (selectedItemIds.size > 0 || selectedConnectionIds.size > 0) {
        e.preventDefault();
        deleteSelection();
      }
      return;
    }

    // Ctrl+A / Cmd+A: Select All
    if ((e.ctrlKey || e.metaKey) && (e.key === 'a' || e.key === 'A')) {
      e.preventDefault();
      items.forEach(i => selectedItemIds.add(i.id));
      connections.forEach(c => selectedConnectionIds.add(c.id));
      updateSelectionUI();
      return;
    }

    // Ctrl+Z: Undo
    if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z') && !e.shiftKey) {
      e.preventDefault();
      handleUndo();
      return;
    }

    // Ctrl+Y or Ctrl+Shift+Z: Redo
    if ((e.ctrlKey || e.metaKey) && ((e.key === 'y' || e.key === 'Y') || ((e.key === 'z' || e.key === 'Z') && e.shiftKey))) {
      e.preventDefault();
      handleRedo();
      return;
    }
  }

  function handleKeyUp(e) {
    if (e.code === 'Space') {
      isSpacePressed = false;
      if (!isPanning) viewport.style.cursor = 'default';
    }
  }

  window.addEventListener('keydown', handleKeyDown);
  window.addEventListener('keyup', handleKeyUp);

  // ------------------------------------------------------------------------
  // Toolbar Actions: Add Card, Add Group
  // ------------------------------------------------------------------------
  const addCardBtn = document.getElementById('btn-board-add-card');
  addCardBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    window.Dropdown.open(addCardBtn, [
      { label: 'Add Existing Vault Note', icon: 'book-open', onClick: () => openProjectNotePicker() },
      { label: 'Add Existing Workflow Task', icon: 'check-square', onClick: () => openProjectTaskPicker() },
      { label: 'Create Standalone Note Card', icon: 'book-open', onClick: () => createNewCard('note') },
      { label: 'Create Standalone Task Card', icon: 'check-square', onClick: () => createNewCard('task') },
      { label: 'Idea Card', icon: 'bot', onClick: () => createNewCard('idea') },
      { label: 'Research Reference', icon: 'file-search', onClick: () => createNewCard('research_ref') },
      { label: 'Document Artifact', icon: 'folder', onClick: () => createNewCard('document') }
    ]);
  });

  async function openProjectNotePicker() {
    let allNotes = [];
    try {
      const res = await window.API.get('/notes');
      allNotes = res.notes || [];
    } catch (e) {
      window.showToast('Failed to load notes: ' + e.message, 'error');
      return;
    }

    if (allNotes.length === 0) {
      window.showToast('No notes found in Knowledge Vault. Create a note first.', 'info');
      return;
    }

    window.Modal.open({
      title: 'Project Note from Vault to Board',
      size: 'md',
      content: `
        <div>
          <p class="text-secondary text-xs" style="margin-bottom: var(--space-3);">
            Select a note to project onto this spatial board. Projections always display the latest content from your Knowledge Vault without duplicating data.
          </p>
          <div class="form-group">
            <label class="form-label" for="select-project-note">Select Vault Note</label>
            <select id="select-project-note" class="select">
              ${allNotes.map(n => `<option value="${n.id}">${n.title}</option>`).join('')}
            </select>
          </div>
        </div>
      `,
      buttons: [
        { text: 'Cancel', variant: 'ghost', onClick: (m, inst) => inst.close() },
        {
          text: 'Add to Board',
          variant: 'primary',
          onClick: async (m, inst) => {
            const noteId = document.getElementById('select-project-note').value;
            const chosen = allNotes.find(n => String(n.id) === String(noteId));
            if (!chosen) return;

            const centerPointX = (-panX + (viewport.clientWidth || 800) / 2 - 120) / zoom;
            const centerPointY = (-panY + (viewport.clientHeight || 600) / 2 - 80) / zoom;
            const posX = snapGrid ? Math.round(centerPointX / gridSize) * gridSize : centerPointX;
            const posY = snapGrid ? Math.round(centerPointY / gridSize) * gridSize : centerPointY;

            try {
              const res = await window.API.post(`/boards/${board.id}/items`, {
                item_type: 'note',
                reference_type: 'note',
                reference_id: chosen.id,
                title: chosen.title,
                content: chosen.content || '',
                position_x: posX,
                position_y: posY,
                width: 260,
                height: 170,
                color: '#C5A15B'
              });

              const newItem = res.item;
              items.push(newItem);
              selectedItemIds.clear();
              selectedItemIds.add(newItem.id);
              renderCards();
              inst.close();
              window.showToast(`Vault Note "${chosen.title}" projected to board`, 'success');
            } catch (err) {
              window.showToast('Failed to add projection: ' + err.message, 'error');
            }
          }
        }
      ]
    });
  }

  async function openProjectTaskPicker() {
    let allTasks = [];
    try {
      const res = await window.API.get('/tasks');
      allTasks = res.tasks || [];
    } catch (e) {
      window.showToast('Failed to load tasks: ' + e.message, 'error');
      return;
    }

    if (allTasks.length === 0) {
      window.showToast('No tasks found in Workflow Tracker. Create a task first.', 'info');
      return;
    }

    window.Modal.open({
      title: 'Add Existing Workflow Task',
      size: 'md',
      content: `
        <div>
          <p class="text-secondary text-xs" style="margin-bottom: var(--space-3);">
            Select an existing task to project onto this spatial board. Projections remain synchronized with Workflow Tracker status and deliverables.
          </p>
          <div class="form-group">
            <label class="form-label" for="select-project-task">Select Workflow Task</label>
            <select id="select-project-task" class="select">
              ${allTasks.map(t => `<option value="${t.id}">${t.title} [${t.status || 'planned'}]${t.priority ? ` (${t.priority})` : ''}</option>`).join('')}
            </select>
          </div>
        </div>
      `,
      buttons: [
        { text: 'Cancel', variant: 'ghost', onClick: (m, inst) => inst.close() },
        {
          text: 'Add to Board',
          variant: 'primary',
          onClick: async (m, inst) => {
            const taskId = document.getElementById('select-project-task').value;
            const chosen = allTasks.find(t => String(t.id) === String(taskId));
            if (!chosen) return;

            const centerPointX = (-panX + (viewport.clientWidth || 800) / 2 - 120) / zoom;
            const centerPointY = (-panY + (viewport.clientHeight || 600) / 2 - 80) / zoom;
            const posX = snapGrid ? Math.round(centerPointX / gridSize) * gridSize : centerPointX;
            const posY = snapGrid ? Math.round(centerPointY / gridSize) * gridSize : centerPointY;

            try {
              const res = await window.API.post(`/boards/${board.id}/items`, {
                item_type: 'task',
                reference_type: 'task',
                reference_id: chosen.id,
                title: chosen.title,
                content: chosen.description || '',
                position_x: posX,
                position_y: posY,
                width: 260,
                height: 170,
                color: '#34d399'
              });

              const newItem = res.item;
              if (newItem) {
                if (!newItem.status && chosen.status) newItem.status = chosen.status;
                if (!newItem.priority && chosen.priority) newItem.priority = chosen.priority;
                newItem.is_projection = true;
                items.push(newItem);
                selectedItemIds.clear();
                selectedItemIds.add(newItem.id);
                renderCards();
              }
              inst.close();
              window.showToast(`Workflow Task "${chosen.title}" projected to board`, 'success');
            } catch (err) {
              window.showToast('Failed to add projection: ' + err.message, 'error');
            }
          }
        }
      ]
    });
  }

  async function createNewCard(type) {
    const centerPointX = (-panX + (viewport.clientWidth || 800) / 2 - 120) / zoom;
    const centerPointY = (-panY + (viewport.clientHeight || 600) / 2 - 80) / zoom;
    const posX = snapGrid ? Math.round(centerPointX / gridSize) * gridSize : centerPointX;
    const posY = snapGrid ? Math.round(centerPointY / gridSize) * gridSize : centerPointY;

    try {
      const res = await window.API.post(`/boards/${board.id}/items`, {
        item_type: type,
        title: `New ${type.replace('_', ' ')}`,
        content: 'Double click or inspect to edit contents...',
        position_x: posX,
        position_y: posY,
        width: 240,
        height: 160,
        color: project.color
      });

      const newItem = res.item;
      items.push(newItem);
      selectedItemIds.clear();
      selectedItemIds.add(newItem.id);

      pushUndoAction({
        type: 'create_item',
        item: newItem
      });

      renderCards();
      openCardInspector(newItem);
      window.showToast('Card added to spatial board.', 'success');
    } catch (err) {
      window.showToast(err.message, 'error');
    }
  }

  document.getElementById('btn-board-add-group').addEventListener('click', async () => {
    const posX = (-panX + (viewport.clientWidth || 800) / 2 - 220) / zoom;
    const posY = (-panY + (viewport.clientHeight || 600) / 2 - 160) / zoom;

    try {
      const res = await window.API.post(`/boards/${board.id}/groups`, {
        title: 'New Workspace Cluster',
        color: project.color || '#9B8AE0',
        position_x: snapGrid ? Math.round(posX / gridSize) * gridSize : posX,
        position_y: snapGrid ? Math.round(posY / gridSize) * gridSize : posY,
        width: 440,
        height: 320
      });

      groups.push(res.group);
      renderGroups();
      window.showToast('Group container added.', 'success');
    } catch (err) {
      window.showToast(err.message, 'error');
    }
  });

  // ------------------------------------------------------------------------
  // Contextual Inspector Panel Handler
  // ------------------------------------------------------------------------
  const inspectorPanel = document.getElementById('app-inspector');
  const inspectorBody = document.getElementById('inspector-body');
  const inspectorCloseBtn = document.getElementById('inspector-close-btn');

  function openCardInspector(item) {
    const cardContentHtml = `
      <form id="form-inspect-card">
        ${item.reference_type === 'task' && item.reference_id ? `
          <div class="card-projection-notice" style="background: var(--status-success-bg, rgba(52, 211, 153, 0.1)); border: 1px solid var(--status-success-border, rgba(52, 211, 153, 0.3)); border-radius: var(--radius-sm); padding: 8px 10px; margin-bottom: var(--space-3);">
            <div style="font-size: var(--text-xs); color: var(--status-success-text, #34d399); font-weight: 600; display: flex; align-items: center; justify-content: space-between;">
              <span style="display: inline-flex; align-items: center; gap: 4px;"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/></svg> Projected Workflow Task</span>
              <span class="badge" style="background: var(--status-success-bg); color: var(--status-success-text); font-size: 9px; padding: 1px 4px; border-radius: 4px;">${item.status || 'planned'}</span>
            </div>
            <p style="font-size: 11px; color: var(--text-secondary); margin: 4px 0 8px 0;">This card is a live projection of a Workflow Task. Changes to task status and deliverables sync automatically.</p>
            <button type="button" class="btn btn--secondary btn--sm btn-open-original-task" id="btn-inspector-open-original-task" style="width: 100%; font-size: var(--text-xs); display: flex; align-items: center; justify-content: center; gap: 6px;">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
              Open Original Task
            </button>
          </div>
        ` : ''}
        ${item.reference_type === 'note' && item.reference_id ? `
          <div class="card-projection-notice" style="background: var(--accent-soft); border: 1px solid var(--accent-border); border-radius: var(--radius-sm); padding: 8px 10px; margin-bottom: var(--space-3);">
            <div style="font-size: var(--text-xs); color: var(--accent-deep); font-weight: 600;">
              <span style="display: inline-flex; align-items: center; gap: 4px;"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/></svg> Projected Vault Note</span>
            </div>
            <p style="font-size: 11px; color: var(--text-secondary); margin: 4px 0 8px 0;">This card is a live projection of a Knowledge Vault Note.</p>
            <button type="button" class="btn btn--secondary btn--sm" id="btn-inspector-open-original-note" style="width: 100%; font-size: var(--text-xs); display: flex; align-items: center; justify-content: center; gap: 6px;">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
              Open Note in Vault
            </button>
          </div>
        ` : ''}
        <div class="form-group">
          <label class="form-label">Card Type</label>
          <select id="inspect-card-type" class="select input--compact">
            <option value="note" ${item.item_type === 'note' ? 'selected' : ''}>Note</option>
            <option value="idea" ${item.item_type === 'idea' ? 'selected' : ''}>Idea</option>
            <option value="task" ${item.item_type === 'task' ? 'selected' : ''}>Task</option>
            <option value="research_ref" ${item.item_type === 'research_ref' ? 'selected' : ''}>Research Reference</option>
            <option value="document" ${item.item_type === 'document' ? 'selected' : ''}>Document</option>
          </select>
        </div>

        <div class="form-group">
          <label class="form-label">Title</label>
          <input type="text" id="inspect-card-title" class="input input--compact" value="${item.title}" />
        </div>

        <div class="form-group">
          <label class="form-label">Content</label>
          <textarea id="inspect-card-content" class="textarea" style="min-height: 120px;">${item.content || ''}</textarea>
        </div>

        <div class="form-group">
          <label class="form-label">Accent Color</label>
          <div style="display: flex; gap: 6px; margin-top: 4px;" id="inspect-color-picker">
            ${['#6B8AFD', '#9B8AE0', '#5BA3D9', '#4DB8A0', '#5DBA6E', '#E0A040', '#D97B4A', '#7A8694'].map(c => `
              <div class="inspect-swatch" data-color="${c}" style="width: 22px; height: 22px; border-radius: var(--radius-sm); background: ${c}; cursor: pointer; border: 2px solid ${item.color === c ? 'var(--text-primary)' : 'transparent'};"></div>
            `).join('')}
          </div>
        </div>

        <hr />

        <div style="display: flex; flex-direction: column; gap: var(--space-2); margin-top: var(--space-4);">
          <button type="button" class="btn btn--primary btn--sm" id="btn-inspect-save">Save Properties</button>
          <button type="button" class="btn btn--danger btn--sm" id="btn-inspect-delete">Delete Card</button>
        </div>
      </form>
    `;

    if (window.Inspector) {
      window.Inspector.open({
        owner: 'board',
        title: 'Card Inspector',
        content: cardContentHtml,
        onMount: (body) => attachBoardInspectorHandlers(item, body),
        onClose: () => {
          updateSelectionUI();
        }
      });
    } else if (inspectorPanel && inspectorBody) {
      inspectorPanel.classList.add('inspector--open');
      inspectorBody.innerHTML = cardContentHtml;
      attachBoardInspectorHandlers(item, inspectorBody);
    }
  }

  function attachBoardInspectorHandlers(item, bodyEl) {
    const contentTextarea = bodyEl.querySelector('#inspect-card-content');
    if (contentTextarea && window.SmartLinkHandler) {
      window.SmartLinkHandler.attachToTextarea(contentTextarea);
    }

    // Open Original Task / Note from Inspector
    const openOrigTaskBtn = bodyEl.querySelector('#btn-inspector-open-original-task');
    if (openOrigTaskBtn) {
      openOrigTaskBtn.addEventListener('click', () => {
        window.Router.navigate(`/workflow?taskId=${item.reference_id}`);
      });
    }
    const openOrigNoteBtn = bodyEl.querySelector('#btn-inspector-open-original-note');
    if (openOrigNoteBtn) {
      openOrigNoteBtn.addEventListener('click', () => {
        window.Router.navigate(`/vault/${item.reference_id}`);
      });
    }

    // Color Swatches
    bodyEl.querySelectorAll('.inspect-swatch').forEach(sw => {
      sw.addEventListener('click', () => {
        bodyEl.querySelectorAll('.inspect-swatch').forEach(s => s.style.borderColor = 'transparent');
        sw.style.borderColor = 'white';
        item.color = sw.getAttribute('data-color');
      });
    });

    // Save
    const saveBtn = document.getElementById('btn-inspect-save');
    if (saveBtn) {
      saveBtn.addEventListener('click', async () => {
        const newTitle = document.getElementById('inspect-card-title').value.trim();
        const newContent = document.getElementById('inspect-card-content').value;
        const newType = document.getElementById('inspect-card-type').value;

        try {
          const updated = await window.API.put(`/boards/${board.id}/items/${item.id}`, {
            title: newTitle,
            content: newContent,
            item_type: newType,
            color: item.color
          });
          const idx = items.findIndex(i => i.id === item.id);
          if (idx !== -1) items[idx] = updated.item;
          renderCards();
          renderConnections();
          window.showToast('Card updated.', 'success');
        } catch (err) {
          window.showToast(err.message, 'error');
        }
      });
    }

    // Delete
    const deleteBtnEl = document.getElementById('btn-inspect-delete');
    if (deleteBtnEl) {
      deleteBtnEl.addEventListener('click', () => {
        window.Modal.confirm({
          title: 'Delete Card',
          message: `Remove "${item.title}" from the spatial board?`,
          confirmText: 'Delete',
          danger: true,
          onConfirm: async () => {
            try {
              await window.API.delete(`/boards/${board.id}/items/${item.id}`);
              items = items.filter(i => i.id !== item.id);
              connections = connections.filter(c => c.source_item_id != item.id && c.target_item_id != item.id);
              closeInspector();
              renderCards();
              renderConnections();
              updateSelectionUI();
              window.showToast('Card removed from board.', 'info');
            } catch (err) {
              window.showToast(err.message, 'error');
            }
          }
        });
      });
    }
  }

  function closeInspector() {
    if (window.Inspector) {
      window.Inspector.close('board');
    } else if (inspectorPanel) {
      inspectorPanel.classList.remove('inspector--open');
    }
  }

  if (inspectorCloseBtn) {
    inspectorCloseBtn.addEventListener('click', closeInspector);
  }

  // Initial Layer Rendering
  renderGroups();
  renderCards();
  renderConnections();

  // Expose board engine interface for inspection and programmatic verification
  window.FlowdenBoard = {
    get items() { return items; },
    get groups() { return groups; },
    get connections() { return connections; },
    get selectedItemIds() { return selectedItemIds; },
    get selectedConnectionIds() { return selectedConnectionIds; },
    updateSelectionUI,
    renderConnections,
    renderCards,
    renderGroups,
    pushUndoAction,
    handleUndo,
    handleRedo,
    deleteSelection,
    fitToContent,
    cancelActiveGestures,
    openCardInspector
  };

  // Cleanup on page route change
  return () => {
    window.removeEventListener('contextmenu', handleContextMenu, true);
    window.removeEventListener('keydown', handleKeyDown);
    window.removeEventListener('keyup', handleKeyUp);
    window.removeEventListener('blur', cancelActiveGestures);
    window.removeEventListener('pointercancel', cancelActiveGestures);
    window.removeEventListener('lostpointercapture', cancelActiveGestures);
    window.FlowdenBoard = null;
    closeInspector();
  };
}

if (typeof window !== 'undefined') {
  window.renderBoardPage = renderBoardPage;
}
