// Flowden Knowledge Graph Engine v3.0
// Elegant Gradient Circular Nodes, Precise Boundary-Attached Bézier Curves, & Customizable Themes

// Persistent node coordinate store across renders/filter toggles
const _graphPositionStore = new Map();

// Storage key for graph appearance preferences
const GRAPH_APPEARANCE_STORAGE_KEY = 'flowden_graph_appearance_v3';

// --------------------------------------------------------------------------
// Gradient Presets Catalog (Ocean is default: NO purple gradients)
// --------------------------------------------------------------------------
const GRADIENT_PRESETS = {
  ocean: {
    name: 'Ocean',
    start: '#2563EB',
    end: '#06B6D4',
    css: 'linear-gradient(135deg, #2563EB, #06B6D4)'
  },
  emerald: {
    name: 'Emerald',
    start: '#059669',
    end: '#34D399',
    css: 'linear-gradient(135deg, #059669, #34D399)'
  },
  sunset: {
    name: 'Sunset',
    start: '#D97706',
    end: '#FB7185',
    css: 'linear-gradient(135deg, #D97706, #FB7185)'
  },
  silver: {
    name: 'Silver',
    start: '#475569',
    end: '#94A3B8',
    css: 'linear-gradient(135deg, #475569, #94A3B8)'
  },
  teal: {
    name: 'Teal & Slate',
    start: '#0D9488',
    end: '#78C8B2',
    css: 'linear-gradient(135deg, #0D9488, #78C8B2)'
  },
  aurora: {
    name: 'Teal & Slate',
    start: '#0D9488',
    end: '#78C8B2',
    css: 'linear-gradient(135deg, #0D9488, #78C8B2)'
  },
  champagne: {
    name: 'Champagne Gold',
    start: '#87631E',
    end: '#C5A15B',
    css: 'linear-gradient(135deg, #87631E, #C5A15B)'
  }
};

const DEFAULT_CATEGORY_THEMES = {
  project: { start: '#2563EB', end: '#06B6D4' }, // Ocean (Blue -> Cyan)
  note: { start: '#0D9488', end: '#78C8B2' },    // Muted Teal (Brand Accent)
  task: { start: '#059669', end: '#34D399' },    // Emerald (Green -> Mint)
  research: { start: '#D97706', end: '#FB7185' } // Sunset (Amber -> Coral)
};

function loadGraphAppearance() {
  try {
    const raw = localStorage.getItem(GRAPH_APPEARANCE_STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return {
    mode: 'category', // 'category' | 'preset' | 'custom'
    preset: 'ocean',
    customGlobal: { start: '#2563EB', end: '#06B6D4' },
    categoryThemes: { ...DEFAULT_CATEGORY_THEMES },
    customNodes: {} // nodeId -> { start, end }
  };
}

function saveGraphAppearance(prefs) {
  try {
    localStorage.setItem(GRAPH_APPEARANCE_STORAGE_KEY, JSON.stringify(prefs));
  } catch (e) {}
}

async function renderGraphPage(container) {
  const getIcon = window.FlowdenIcons ? window.FlowdenIcons.getIcon : () => '';
  let appearancePrefs = loadGraphAppearance();

  container.innerHTML = `
    <div id="graph-workspace" style="display: flex; flex-direction: column; height: 100%; width: 100%; overflow: hidden; position: relative; background-color: var(--bg-primary);">
      
      <!-- Graph Top Controls Bar -->
      <div class="graph-top-bar" id="graph-controls-bar">
        <div style="display: flex; align-items: center; gap: var(--space-3); flex-shrink: 0;">
          <div style="display: flex; align-items: center; gap: var(--space-2);">
            <span style="color: var(--accent-primary); display: flex;">${getIcon('share-2')}</span>
            <span class="graph-title-label" style="font-size: var(--text-sm); font-weight: 600; color: var(--text-primary);">Knowledge Graph</span>
          </div>

          <div style="height: 16px; width: 1px; background-color: var(--border-primary);"></div>

          <!-- Type Filters -->
          <div class="segmented-control" id="graph-type-filters">
            <button class="segmented-btn btn--active filter-type-btn" data-type="note">Notes</button>
            <button class="segmented-btn btn--active filter-type-btn" data-type="project">Projects</button>
            <button class="segmented-btn btn--active filter-type-btn" data-type="task">Tasks</button>
            <button class="segmented-btn btn--active filter-type-btn" data-type="research">Research</button>
          </div>
        </div>

        <div style="display: flex; align-items: center; gap: var(--space-2); flex-shrink: 0;">
          <!-- Search Node Input -->
          <div style="position: relative;">
            <input type="text" id="graph-search-node" class="input input--compact" placeholder="Find node..." style="width: 140px; font-size: 11px;" />
          </div>

          <!-- Appearance Settings Button -->
          <button class="btn btn--secondary btn--sm" id="btn-graph-appearance" title="Customize Graph Themes & Gradients">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="m4.93 4.93 4.24 4.24"/><path d="m14.83 9.17 4.24-4.24"/><path d="m14.83 14.83 4.24 4.24"/><path d="m9.17 14.83-4.24 4.24"/></svg>
            <span class="graph-btn-label">Appearance</span>
          </button>

          <!-- Focus Mode Toggle -->
          <button class="btn btn--secondary btn--sm" id="btn-graph-focus-mode" title="Focus Mode: Dim nodes not connected to selection">
            <span class="graph-btn-label">Focus: </span><span id="focus-status-text">Off</span>
          </button>

          <button class="btn btn--secondary btn--sm" id="btn-graph-auto-arrange" title="Re-simulate layout">
            <span class="graph-btn-label">Auto </span>Arrange
          </button>

          <button class="btn btn--secondary btn--sm" id="btn-graph-fit-view" title="Reset View & Center">
            Reset<span class="graph-btn-label"> View</span>
          </button>
        </div>
      </div>

      <!-- Graph Viewport Container -->
      <div id="graph-viewport" style="flex: 1; position: relative; overflow: hidden; cursor: grab;">
        <svg id="graph-svg" style="width: 100%; height: 100%; transform-origin: 0 0; display: block;">
          <defs id="graph-defs">
            <!-- Canvas Grid Pattern -->
            <pattern id="graph-grid-dots" width="28" height="28" patternUnits="userSpaceOnUse">
              <circle cx="14" cy="14" r="1" fill="var(--canvas-grid-dot)" />
            </pattern>

            <!-- Drop Shadow for Node Depth -->
            <filter id="node-shadow" x="-30%" y="-30%" width="160%" height="160%">
              <feDropShadow dx="0" dy="2" stdDeviation="2.5" flood-color="#000000" flood-opacity="0.30" />
            </filter>

            <!-- Directional Arrowhead Markers -->
            <!-- refX=9 places the arrow tip precisely at the boundary intersection of the destination node -->
            <marker id="arrow-graph-default" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
              <path d="M 0 1.5 L 9 5 L 0 8.5 z" fill="var(--graph-edge-default, var(--border-secondary))"/>
            </marker>
            <marker id="arrow-graph-focus" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6.5" markerHeight="6.5" orient="auto">
              <path d="M 0 1.5 L 9 5 L 0 8.5 z" fill="var(--accent-primary)"/>
            </marker>
          </defs>
          <!-- Background Grid Surface -->
          <rect width="100%" height="100%" fill="url(#graph-grid-dots)" pointer-events="none" opacity="0.6" />
          <g id="graph-transform-group">
            <g id="graph-edges-layer"></g>
            <g id="graph-nodes-layer"></g>
          </g>
        </svg>

        <!-- Right-Drag Selection Box -->
        <div id="graph-marquee" style="position: absolute; display: none; pointer-events: none; z-index: 50; border: 1px solid var(--selection-border, var(--accent-primary)); background: var(--selection-bg); border-radius: 2px;"></div>

        <!-- Empty Graph State -->
        <div id="graph-empty-state" class="empty-state" style="position: absolute; inset: 0; display: none; margin: auto; z-index: 10; pointer-events: none;">
          <div class="empty-state-icon" style="color: var(--accent-primary);">${getIcon('share-2')}</div>
          <div class="empty-state-title">Graph is Empty</div>
          <div class="empty-state-description">Create projects and link notes in the Knowledge Vault using [[Note Title]] to generate visual graph connections.</div>
        </div>
      </div>
    </div>
  `;

  // Fetch Graph Data
  let graphData = { nodes: [], edges: [] };
  try {
    graphData = await window.API.get('/graph');
  } catch (err) {
    console.error('Failed to load graph data:', err);
  }

  const rawNodes = graphData.nodes || [];
  const rawEdges = graphData.edges || [];

  const emptyStateEl = document.getElementById('graph-empty-state');
  if (rawNodes.length === 0) {
    emptyStateEl.style.display = 'flex';
    return;
  }

  // Pre-calculate node connectivity to set visual hierarchy
  const incidentCounts = {};
  rawEdges.forEach(e => {
    incidentCounts[e.source] = (incidentCounts[e.source] || 0) + 1;
    incidentCounts[e.target] = (incidentCounts[e.target] || 0) + 1;
  });

  const width = container.clientWidth || 900;
  const height = container.clientHeight || 650;
  const centerX = width / 2;
  const centerY = height / 2;

  // ------------------------------------------------------------------------
  // Helper Functions: Dimensions, Icons, & Curved Geometry
  // ------------------------------------------------------------------------
  function getNodeRadius(n) {
    const degree = incidentCounts[n.id] || 0;
    if (n.type === 'project' || degree >= 3) {
      return 19; // 38px diameter (Important node)
    }
    return 15; // 30px diameter (Standard node)
  }

  function getNodeTypeIcon(type) {
    if (type === 'project') {
      return {
        label: 'Project',
        icon: '<path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"/>'
      };
    }
    if (type === 'task') {
      return {
        label: 'Task',
        icon: '<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>'
      };
    }
    if (type === 'research') {
      return {
        label: 'Research',
        icon: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><circle cx="11" cy="14" r="3"/>'
      };
    }
    return {
      label: 'Note',
      icon: '<path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z"/><path d="M6 6h10"/><path d="M6 10h10"/>'
    };
  }

  function getNodeColors(node) {
    // 1. Individual node override
    if (appearancePrefs.customNodes && appearancePrefs.customNodes[node.id]) {
      return appearancePrefs.customNodes[node.id];
    }
    // 2. Global Custom
    if (appearancePrefs.mode === 'custom') {
      return appearancePrefs.customGlobal || { start: '#2563EB', end: '#06B6D4' };
    }
    // 3. Global Preset
    if (appearancePrefs.mode === 'preset') {
      const p = GRADIENT_PRESETS[appearancePrefs.preset] || GRADIENT_PRESETS.ocean;
      return { start: p.start, end: p.end };
    }
    // 4. Category-specific theme
    const cat = appearancePrefs.categoryThemes && appearancePrefs.categoryThemes[node.type];
    if (cat) return cat;

    // Theme-mode aware defaults: In Light Mode, notes adopt Champagne Gold (#87631E -> #C5A15B)
    const isLight = document.documentElement.getAttribute('data-theme') === 'light';
    if (node.type === 'note') {
      return isLight ? { start: '#87631E', end: '#C5A15B' } : { start: '#0D9488', end: '#78C8B2' };
    }
    return DEFAULT_CATEGORY_THEMES[node.type] || { start: '#2563EB', end: '#06B6D4' };
  }

  // ------------------------------------------------------------------------
  // Exact Boundary-Attached Bézier Geometry & Tangent Arrow Placement
  // ------------------------------------------------------------------------
  function getBezierEdgeGeometry(src, tgt) {
    const dx = tgt.x - src.x;
    const dy = tgt.y - src.y;
    const dist = Math.hypot(dx, dy) || 1;

    // Curvature height (gentle perpendicular curve)
    const curvature = Math.min(26, dist * 0.12);
    const mx = (src.x + tgt.x) / 2;
    const my = (src.y + tgt.y) / 2;
    const nx = -dy / dist;
    const ny = dx / dist;
    const cx = mx + nx * curvature;
    const cy = my + ny * curvature;

    // Calculate tangent vector leaving source node
    const startDx = cx - src.x;
    const startDy = cy - src.y;
    const startLen = Math.hypot(startDx, startDy) || 1;
    const startUx = startDx / startLen;
    const startUy = startDy / startLen;
    // Boundary point on source node circle
    const startX = src.x + startUx * src.radius;
    const startY = src.y + startUy * src.radius;

    // Calculate tangent vector arriving at target node
    const endDx = tgt.x - cx;
    const endDy = tgt.y - cy;
    const endLen = Math.hypot(endDx, endDy) || 1;
    const endUx = endDx / endLen;
    const endUy = endDy / endLen;
    // Boundary point on destination node circle
    const endX = tgt.x - endUx * tgt.radius;
    const endY = tgt.y - endUy * tgt.radius;

    return {
      d: `M ${startX} ${startY} Q ${cx} ${cy} ${endX} ${endY}`
    };
  }

  // Initialize or restore node objects with radii and positions
  const nodes = rawNodes.map((n, i) => {
    let pos = _graphPositionStore.get(n.id);
    if (!pos) {
      const angle = (i / Math.max(rawNodes.length, 1)) * 2 * Math.PI;
      const radius = 170 + (i % 3) * 65;
      pos = {
        x: centerX + Math.cos(angle) * radius,
        y: centerY + Math.sin(angle) * radius
      };
      _graphPositionStore.set(n.id, pos);
    }
    const r = getNodeRadius(n);
    return {
      ...n,
      x: pos.x,
      y: pos.y,
      vx: 0,
      vy: 0,
      radius: r
    };
  });

  const edges = rawEdges;

  // Viewport & Pan/Zoom State
  let panX = 0, panY = 0, zoom = 1.0;
  let isPanning = false, panStartX = 0, panStartY = 0;
  let activeDragNode = null;
  let isNodeDragging = false;
  let dragDownX = 0, dragDownY = 0;
  let selectedNode = null;
  let hoveredNode = null;
  let focusMode = false;
  let activeTypes = new Set(['note', 'project', 'task', 'research']);

  const viewport = document.getElementById('graph-viewport');
  const transformGroup = document.getElementById('graph-transform-group');
  const edgesLayer = document.getElementById('graph-edges-layer');
  const nodesLayer = document.getElementById('graph-nodes-layer');
  const graphDefs = document.getElementById('graph-defs');
  const inspectorPanel = document.getElementById('app-inspector');
  const inspectorBody = document.getElementById('inspector-body');

  function updateTransform() {
    transformGroup.setAttribute('transform', `translate(${panX}, ${panY}) scale(${zoom})`);
  }

  // ------------------------------------------------------------------------
  // Dynamic SVG Gradient Definitions Management
  // ------------------------------------------------------------------------
  function updateGradientDefs() {
    const isLight = document.documentElement.getAttribute('data-theme') === 'light';
    // Preserve static markers, grid pattern, and theme-adaptive filter
    const staticDefs = `
      <pattern id="graph-grid-dots" width="28" height="28" patternUnits="userSpaceOnUse">
        <circle cx="14" cy="14" r="1" fill="var(--canvas-grid-dot)" />
      </pattern>
      <filter id="node-shadow" x="-30%" y="-30%" width="160%" height="160%">
        <feDropShadow dx="0" dy="2" stdDeviation="2.5" flood-color="${isLight ? '#20211F' : '#000000'}" flood-opacity="${isLight ? '0.18' : '0.40'}" />
      </filter>
      <marker id="arrow-graph-default" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
        <path d="M 0 1.5 L 9 5 L 0 8.5 z" fill="var(--graph-edge-default, var(--border-secondary))"/>
      </marker>
      <marker id="arrow-graph-focus" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6.5" markerHeight="6.5" orient="auto">
        <path d="M 0 1.5 L 9 5 L 0 8.5 z" fill="var(--accent-primary)"/>
      </marker>
    `;

    let gradDefs = '';

    // Category gradients
    ['project', 'note', 'task', 'research'].forEach(type => {
      const colors = getNodeColors({ type, id: `__sample_${type}` });
      gradDefs += `
        <radialGradient id="grad-cat-${type}" cx="35%" cy="35%" r="65%">
          <stop offset="0%" stop-color="#FFFFFF" stop-opacity="0.32" />
          <stop offset="25%" stop-color="${colors.start}" />
          <stop offset="100%" stop-color="${colors.end}" />
        </radialGradient>
      `;
    });

    // Custom individual node overrides
    if (appearancePrefs.customNodes) {
      Object.entries(appearancePrefs.customNodes).forEach(([nodeId, colors]) => {
        gradDefs += `
          <radialGradient id="grad-node-${nodeId}" cx="35%" cy="35%" r="65%">
            <stop offset="0%" stop-color="#FFFFFF" stop-opacity="0.32" />
            <stop offset="25%" stop-color="${colors.start}" />
            <stop offset="100%" stop-color="${colors.end}" />
          </radialGradient>
        `;
      });
    }

    graphDefs.innerHTML = staticDefs + gradDefs;
  }

  updateGradientDefs();

  // ------------------------------------------------------------------------
  // Stable Layout Simulation
  // ------------------------------------------------------------------------
  let animationFrameId = null;
  let alpha = 0.45;

  function runSimulation() {
    if (alpha < 0.005) {
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
      return;
    }

    const visibleNodes = nodes.filter(n => activeTypes.has(n.type));

    // 1. Node Repulsion
    for (let i = 0; i < visibleNodes.length; i++) {
      for (let j = i + 1; j < visibleNodes.length; j++) {
        const a = visibleNodes[i];
        const b = visibleNodes[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const minDist = 180;

        if (dist < minDist) {
          const force = ((minDist - dist) / dist) * alpha * 0.4;
          if (a !== activeDragNode) { a.x -= dx * force; a.y -= dy * force; }
          if (b !== activeDragNode) { b.x += dx * force; b.y += dy * force; }
        }
      }
    }

    // 2. Edge Attraction
    edges.forEach(e => {
      const src = visibleNodes.find(n => n.id === e.source);
      const tgt = visibleNodes.find(n => n.id === e.target);
      if (src && tgt) {
        const dx = tgt.x - src.x;
        const dy = tgt.y - src.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const targetDist = 120;
        const force = ((dist - targetDist) / dist) * alpha * 0.12;

        if (src !== activeDragNode) { src.x += dx * force; src.y += dy * force; }
        if (tgt !== activeDragNode) { tgt.x -= dx * force; tgt.y -= dy * force; }
      }
    });

    // 3. Center Gravity
    visibleNodes.forEach(n => {
      if (n !== activeDragNode) {
        n.x += (centerX - n.x) * 0.008 * alpha;
        n.y += (centerY - n.y) * 0.008 * alpha;
      }
      _graphPositionStore.set(n.id, { x: n.x, y: n.y });
    });

    alpha *= 0.94;
    syncDomCoordinates();

    animationFrameId = requestAnimationFrame(runSimulation);
  }

  // ------------------------------------------------------------------------
  // Render DOM Elements: Gradient Circular Nodes & Curved Connections
  // ------------------------------------------------------------------------
  function renderAll() {
    const isLight = document.documentElement.getAttribute('data-theme') === 'light';
    const visibleNodes = nodes.filter(n => activeTypes.has(n.type));
    const visibleIds = new Set(visibleNodes.map(n => n.id));
    const visibleEdges = edges.filter(e => visibleIds.has(e.source) && visibleIds.has(e.target));

    // Render Edges as Bézier Curves
    let edgesHtml = '';
    visibleEdges.forEach(e => {
      const src = nodes.find(n => n.id === e.source);
      const tgt = nodes.find(n => n.id === e.target);
      if (!src || !tgt) return;

      const isConnected = selectedNode && (e.source === selectedNode.id || e.target === selectedNode.id);
      const isDimmed = focusMode && selectedNode && !isConnected;

      let strokeColor = isLight ? 'var(--graph-edge-default, var(--border-secondary))' : 'var(--border-secondary)';
      let dashArray = '';
      if (e.relationship === 'supports') strokeColor = 'var(--status-success)';
      else if (e.relationship === 'contradicts') { strokeColor = 'var(--status-error)'; dashArray = 'stroke-dasharray="4 3"'; }
      else if (e.relationship === 'depends_on') strokeColor = 'var(--status-warning)';
      else if (e.relationship === 'inspired_by') { strokeColor = isLight ? 'var(--accent-deep, var(--accent-primary))' : 'var(--accent-primary)'; dashArray = 'stroke-dasharray="3 3"'; }

      if (isConnected) strokeColor = isLight ? 'var(--accent-deep, var(--accent-primary))' : 'var(--accent-primary)';

      // Directional check: wiki_link, supports, depends_on, contradicts, inspired_by
      const isDirectional = ['supports', 'contradicts', 'depends_on', 'inspired_by', 'related_to'].includes(e.relationship);

      const geom = getBezierEdgeGeometry(src, tgt);

      edgesHtml += `
        <path id="edge-${e.id || `${e.source}-${e.target}`}"
              class="graph-bezier-edge ${isConnected ? 'edge--highlighted' : ''} ${isDimmed ? 'edge--dimmed' : ''}"
              d="${geom.d}"
              stroke="${strokeColor}" 
              stroke-width="${isConnected ? (isLight ? 2.25 : 2) : (isLight ? 1.35 : 1.25)}" 
              stroke-opacity="${isDimmed ? 0.08 : (isLight ? 0.85 : 0.65)}" 
              ${dashArray}
              ${isDirectional ? `marker-end="${isConnected ? 'url(#arrow-graph-focus)' : 'url(#arrow-graph-default)'}"` : ''}
              data-source="${e.source}" data-target="${e.target}" data-directional="${isDirectional}"/>
      `;
    });
    edgesLayer.innerHTML = edgesHtml;

    // Render Circular Nodes with Floating Text Labels
    let nodesHtml = '';
    visibleNodes.forEach(n => {
      const isSelected = selectedNode && selectedNode.id === n.id;
      const isConnected = selectedNode && visibleEdges.some(e => 
        (e.source === selectedNode.id && e.target === n.id) || 
        (e.target === selectedNode.id && e.source === n.id)
      );
      const isDimmed = focusMode && selectedNode && !isSelected && !isConnected;

      const typeInfo = getNodeTypeIcon(n.type);
      const gradId = (appearancePrefs.customNodes && appearancePrefs.customNodes[n.id]) 
        ? `grad-node-${n.id}` 
        : `grad-cat-${n.type}`;

      const iconSize = n.radius >= 18 ? 14 : 12;
      const truncated = n.title.length > 24 ? n.title.substring(0, 22) + '…' : n.title;

      nodesHtml += `
        <g class="graph-node-circle ${isSelected ? 'node--selected' : ''}" id="node-${n.id}" data-id="${n.id}" 
            transform="translate(${n.x}, ${n.y})"
            style="opacity: ${isDimmed ? 0.2 : 1};">
          
          <!-- Accessible SVG Tooltip -->
          <title>${n.title} (${typeInfo.label})</title>

          <!-- Outer Ring on Selection -->
          ${isSelected ? `<circle class="node-selection-ring" r="${n.radius + 5}" fill="none" stroke="var(--accent-primary)" stroke-width="2" stroke-dasharray="3 3" />` : ''}

          <!-- Gradient Circular Body with Shadow -->
          <circle class="node-circle-body" r="${n.radius}" 
                  fill="url(#${gradId})" 
                  stroke="${isLight ? 'rgba(255, 255, 255, 0.85)' : 'rgba(255, 255, 255, 0.2)'}" 
                  stroke-width="1.2" 
                  filter="url(#node-shadow)" />

          <!-- Specular Inner Depth Highlight -->
          <ellipse cx="${-n.radius * 0.25}" cy="${-n.radius * 0.3}" rx="${n.radius * 0.45}" ry="${n.radius * 0.25}" 
                   fill="rgba(255, 255, 255, 0.24)" style="pointer-events: none;" />

          <!-- Center Entity Mini Icon -->
          <svg x="${-iconSize / 2}" y="${-iconSize / 2}" width="${iconSize}" height="${iconSize}" viewBox="0 0 24 24" 
               fill="none" stroke="#FFFFFF" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"
               style="pointer-events: none; opacity: 0.95;">
            ${typeInfo.icon}
          </svg>

          <!-- Floating Text Label Beside Node -->
          <text class="graph-node-label" 
                x="${n.radius + 7}" y="4" 
                fill="${isSelected ? 'var(--text-primary)' : 'var(--text-secondary)'}"
                font-weight="${isSelected ? 600 : 500}">
            ${truncated}
          </text>
        </g>
      `;
    });
    nodesLayer.innerHTML = nodesHtml;

    bindNodeEvents();
  }

  // Fast direct SVG update for 60fps dragging without DOM reconstruction
  function syncDomCoordinates() {
    nodes.forEach(n => {
      const g = document.getElementById(`node-${n.id}`);
      if (g) {
        g.setAttribute('transform', `translate(${n.x}, ${n.y})`);
      }
    });

    // Update incident Bézier curves with exact boundary attachment
    edgesLayer.querySelectorAll('.graph-bezier-edge').forEach(path => {
      const srcId = path.getAttribute('data-source');
      const tgtId = path.getAttribute('data-target');
      const src = nodes.find(n => n.id === srcId);
      const tgt = nodes.find(n => n.id === tgtId);
      if (src && tgt) {
        const geom = getBezierEdgeGeometry(src, tgt);
        path.setAttribute('d', geom.d);
      }
    });
  }

  // ------------------------------------------------------------------------
  // Precise Click, Drag & Hover Interactions
  // ------------------------------------------------------------------------
  function bindNodeEvents() {
    const visibleNodes = nodes.filter(n => activeTypes.has(n.type));
    const visibleIds = new Set(visibleNodes.map(n => n.id));
    const visibleEdges = edges.filter(e => visibleIds.has(e.source) && visibleIds.has(e.target));

    nodesLayer.querySelectorAll('.graph-node-circle').forEach(el => {
      const nId = el.getAttribute('data-id');
      const node = nodes.find(n => n.id === nId);
      if (!node) return;

      // Mouse Hover Highlighting
      el.addEventListener('mouseenter', () => {
        hoveredNode = node;
        edgesLayer.querySelectorAll('.graph-bezier-edge').forEach(path => {
          const s = path.getAttribute('data-source');
          const t = path.getAttribute('data-target');
          const isConn = (s === node.id || t === node.id);
          if (isConn) {
            path.classList.add('edge--highlighted');
            path.classList.remove('edge--dimmed');
            const isDir = path.getAttribute('data-directional') === 'true';
            if (isDir) path.setAttribute('marker-end', 'url(#arrow-graph-focus)');
          } else {
            path.classList.remove('edge--highlighted');
            path.classList.add('edge--dimmed');
          }
        });

        nodesLayer.querySelectorAll('.graph-node-circle').forEach(circleG => {
          const id = circleG.getAttribute('data-id');
          const isConn = id === node.id || visibleEdges.some(e => 
            (e.source === node.id && e.target === id) || 
            (e.target === node.id && e.source === id)
          );
          circleG.style.opacity = isConn ? '1' : '0.3';
        });
      });

      el.addEventListener('mouseleave', () => {
        hoveredNode = null;
        // Restore highlighting to selectedNode or normal state
        edgesLayer.querySelectorAll('.graph-bezier-edge').forEach(path => {
          const s = path.getAttribute('data-source');
          const t = path.getAttribute('data-target');
          const isConn = selectedNode && (s === selectedNode.id || t === selectedNode.id);
          const isDimmed = focusMode && selectedNode && !isConn;
          path.classList.toggle('edge--highlighted', Boolean(isConn));
          path.classList.toggle('edge--dimmed', Boolean(isDimmed));
          const isDir = path.getAttribute('data-directional') === 'true';
          if (isDir) {
            path.setAttribute('marker-end', isConn ? 'url(#arrow-graph-focus)' : 'url(#arrow-graph-default)');
          }
        });

        nodesLayer.querySelectorAll('.graph-node-circle').forEach(circleG => {
          const id = circleG.getAttribute('data-id');
          const isConn = selectedNode && (id === selectedNode.id || visibleEdges.some(e => 
            (e.source === selectedNode.id && e.target === id) || 
            (e.target === selectedNode.id && e.source === id)
          ));
          const isDimmed = focusMode && selectedNode && !isConn;
          circleG.style.opacity = isDimmed ? '0.2' : '1';
        });
      });

      // Drag vs Click distinction
      el.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        e.stopPropagation();

        activeDragNode = node;
        isNodeDragging = false;
        dragDownX = e.clientX;
        dragDownY = e.clientY;
      });

      el.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        if (node.link) window.Router.navigate(node.link.replace('#', ''));
      });
    });
  }

  // Viewport Panning & Global Mouse Handling
  const marqueeEl = document.getElementById('graph-marquee');
  let activePointerId = null;
  let pendingMarquee = false;
  let marqueeActive = false;
  let suppressNextContextMenu = false;
  let rightDownX = 0;
  let rightDownY = 0;
  let contextMenuFallbackTimer = null;

  function isEligibleGraphEmptyCanvas(target) {
    if (!target) return false;
    if (target.closest('.graph-node, .graph-controls, .graph-legend, .graph-search, input, textarea, select, button, a')) {
      return false;
    }
    return target === viewport || target.id === 'graph-viewport' || target.id === 'graph-svg';
  }

  function handleContextMenu(e) {
    const target = e.target;
    if (target && (target.closest('input, textarea, select') || target.isContentEditable)) {
      return;
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
  }

  window.addEventListener('contextmenu', handleContextMenu, true);

  viewport.addEventListener('mousedown', (e) => {
    // Right button: setup for marquee drag only on empty canvas
    if (e.button === 2) {
      if (!isEligibleGraphEmptyCanvas(e.target)) return;
      activePointerId = e.pointerId !== undefined ? e.pointerId : 1;
      rightDownX = e.clientX;
      rightDownY = e.clientY;
      pendingMarquee = true;
      marqueeActive = false;
      suppressNextContextMenu = false;
      if (contextMenuFallbackTimer) {
        clearTimeout(contextMenuFallbackTimer);
        contextMenuFallbackTimer = null;
      }
      return;
    }

    if (e.button !== 0) return;
    if (e.target === viewport || e.target.id === 'graph-svg') {
      isPanning = true;
      panStartX = e.clientX - panX;
      panStartY = e.clientY - panY;
      viewport.style.cursor = 'grabbing';
      
      // Clicking empty canvas deselects
      if (selectedNode) {
        selectedNode = null;
        closeInspector();
        renderAll();
      }
    }
  });

  const onMouseMove = (e) => {
    // Right-drag marquee activation beyond 6px threshold
    if (pendingMarquee && (e.buttons & 2)) {
      const dist = Math.hypot(e.clientX - rightDownX, e.clientY - rightDownY);
      if (dist >= 6) {
        marqueeActive = true;
        pendingMarquee = false;
        suppressNextContextMenu = true;
        if (marqueeEl) {
          const vpRect = viewport.getBoundingClientRect();
          marqueeEl.style.left = `${rightDownX - vpRect.left}px`;
          marqueeEl.style.top = `${rightDownY - vpRect.top}px`;
          marqueeEl.style.width = '0px';
          marqueeEl.style.height = '0px';
          marqueeEl.style.display = 'block';
        }
      }
    }

    if (marqueeActive && marqueeEl) {
      e.preventDefault();
      const left = Math.min(e.clientX, rightDownX);
      const top = Math.min(e.clientY, rightDownY);
      const width = Math.abs(e.clientX - rightDownX);
      const height = Math.abs(e.clientY - rightDownY);

      const vpRect = viewport.getBoundingClientRect();
      marqueeEl.style.left = `${left - vpRect.left}px`;
      marqueeEl.style.top = `${top - vpRect.top}px`;
      marqueeEl.style.width = `${width}px`;
      marqueeEl.style.height = `${height}px`;

      const boxX1 = (left - vpRect.left - panX) / zoom;
      const boxY1 = (top - vpRect.top - panY) / zoom;
      const boxX2 = boxX1 + width / zoom;
      const boxY2 = boxY1 + height / zoom;

      const hit = (nodes || []).find(n => n.x >= boxX1 && n.x <= boxX2 && n.y >= boxY1 && n.y <= boxY2);
      if (hit && hit !== selectedNode) {
        selectedNode = hit;
        openNodeInspector(selectedNode);
        renderAll();
      }
    } else if (isPanning) {
      panX = e.clientX - panStartX;
      panY = e.clientY - panStartY;
      updateTransform();
    } else if (activeDragNode) {
      const dist = Math.hypot(e.clientX - dragDownX, e.clientY - dragDownY);
      if (!isNodeDragging && dist > 4) {
        isNodeDragging = true;
      }

      if (isNodeDragging) {
        const rect = viewport.getBoundingClientRect();
        activeDragNode.x = (e.clientX - rect.left - panX) / zoom;
        activeDragNode.y = (e.clientY - rect.top - panY) / zoom;
        _graphPositionStore.set(activeDragNode.id, { x: activeDragNode.x, y: activeDragNode.y });
        syncDomCoordinates();
      }
    }
  };

  const onMouseUp = (e) => {
    if (e.button === 2 || (e.buttons & 2) === 0) {
      if (marqueeActive) {
        suppressNextContextMenu = true;
        if (contextMenuFallbackTimer) clearTimeout(contextMenuFallbackTimer);
        contextMenuFallbackTimer = setTimeout(() => {
          suppressNextContextMenu = false;
        }, 500);
      }
      pendingMarquee = false;
      marqueeActive = false;
      if (marqueeEl) marqueeEl.style.display = 'none';
      activePointerId = null;
    }

    if (isPanning) {
      isPanning = false;
      viewport.style.cursor = 'grab';
    }

    if (activeDragNode) {
      if (!isNodeDragging) {
        // Pure click: select node and open inspector without layout shift
        selectedNode = activeDragNode;
        openNodeInspector(selectedNode);
        renderAll();
      }
      activeDragNode = null;
      isNodeDragging = false;
    }
  };

  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup', onMouseUp);

  // Clean up global listeners on unmount
  const themeObserver = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.type === 'attributes' && m.attributeName === 'data-theme') {
        updateGradientDefs();
        renderAll();
      }
    }
  });
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  const observer = new MutationObserver(() => {
    if (!document.getElementById('graph-workspace')) {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
      themeObserver.disconnect();
      observer.disconnect();
    }
  });
  observer.observe(container, { childList: true });

  // Zoom Handling
  viewport.addEventListener('wheel', (e) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.08 : 0.92;
    const newZoom = Math.min(Math.max(zoom * factor, 0.25), 3.0);
    const rect = viewport.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    panX = mouseX - (mouseX - panX) * (newZoom / zoom);
    panY = mouseY - (mouseY - panY) * (newZoom / zoom);
    zoom = newZoom;

    updateTransform();
  }, { passive: false });

  // Reset / Fit View
  document.getElementById('btn-graph-fit-view').addEventListener('click', () => {
    zoom = 1.0;
    panX = 0;
    panY = 0;
    updateTransform();
  });

  // Auto Arrange Button
  document.getElementById('btn-graph-auto-arrange').addEventListener('click', () => {
    alpha = 0.5;
    runSimulation();
    window.showToast('Re-arranging knowledge graph layout.', 'info', 1500);
  });

  // Focus Mode Toggle
  const focusBtn = document.getElementById('btn-graph-focus-mode');
  focusBtn.addEventListener('click', () => {
    focusMode = !focusMode;
    const statusSpan = document.getElementById('focus-status-text');
    if (statusSpan) statusSpan.textContent = focusMode ? 'On' : 'Off';
    else focusBtn.textContent = `Focus: ${focusMode ? 'On' : 'Off'}`;
    focusBtn.classList.toggle('btn--primary', focusMode);
    focusBtn.classList.toggle('btn--secondary', !focusMode);
    renderAll();
  });

  // Filter Segmented Controls
  document.querySelectorAll('.filter-type-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const type = btn.getAttribute('data-type');
      if (activeTypes.has(type)) {
        if (activeTypes.size > 1) {
          activeTypes.delete(type);
          btn.classList.remove('btn--active');
        }
      } else {
        activeTypes.add(type);
        btn.classList.add('btn--active');
      }
      renderAll();
    });
  });

  // Node Search
  document.getElementById('graph-search-node').addEventListener('input', (e) => {
    const q = e.target.value.trim().toLowerCase();
    if (!q) return;
    const match = nodes.find(n => n.title.toLowerCase().includes(q));
    if (match) {
      selectedNode = match;
      const vWidth = viewport.clientWidth || 800;
      const vHeight = viewport.clientHeight || 600;
      panX = vWidth / 2 - match.x * zoom;
      panY = vHeight / 2 - match.y * zoom;
      updateTransform();
      renderAll();
      openNodeInspector(match);
    }
  });

  // ------------------------------------------------------------------------
  // Dedicated Graph Appearance Settings Panel
  // ------------------------------------------------------------------------
  const appearanceBtn = document.getElementById('btn-graph-appearance');
  if (appearanceBtn) {
    appearanceBtn.addEventListener('click', () => {
      openGraphAppearanceModal();
    });
  }

  function openGraphAppearanceModal() {
    window.Modal.open({
      title: 'Graph Appearance & Gradient Themes',
      size: 'md',
      content: `
        <div>
          <p class="text-secondary text-sm" style="margin-bottom: var(--space-4);">
            Customize visual gradients, color schemes, and category aesthetics across the knowledge network.
          </p>

          <!-- Theme Mode Switcher -->
          <div style="margin-bottom: var(--space-4);">
            <label class="form-label">Theme Mode</label>
            <div class="segmented-control" id="modal-theme-mode" style="width: 100%; display: flex;">
              <button class="segmented-btn ${appearancePrefs.mode === 'category' ? 'segmented-btn--active' : ''}" data-mode="category" style="flex: 1;">By Category</button>
              <button class="segmented-btn ${appearancePrefs.mode === 'preset' ? 'segmented-btn--active' : ''}" data-mode="preset" style="flex: 1;">Uniform Preset</button>
              <button class="segmented-btn ${appearancePrefs.mode === 'custom' ? 'segmented-btn--active' : ''}" data-mode="custom" style="flex: 1;">Custom Global</button>
            </div>
          </div>

          <!-- Section A: Presets -->
          <div id="appearance-presets-section" style="margin-bottom: var(--space-5); display: ${appearancePrefs.mode === 'preset' ? 'block' : 'none'};">
            <label class="form-label" style="margin-bottom: 6px;">Select Gradient Preset</label>
            <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px;">
              ${Object.entries(GRADIENT_PRESETS).map(([key, p]) => `
                <div class="preset-card ${appearancePrefs.preset === key ? 'is-active' : ''}" data-preset="${key}">
                  <div class="preset-swatch" style="background: ${p.css};"></div>
                  <div>
                    <div style="font-weight: 600; font-size: var(--text-sm);">${p.name}</div>
                    <div class="text-xs text-tertiary">${p.start} → ${p.end}</div>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>

          <!-- Section B: Category Themes -->
          <div id="appearance-category-section" style="margin-bottom: var(--space-5); display: ${appearancePrefs.mode === 'category' ? 'block' : 'none'};">
            <label class="form-label" style="margin-bottom: 6px;">Entity Category Gradients</label>
            <div style="display: flex; flex-direction: column; gap: 8px;">
              ${[
                { type: 'project', label: 'Projects' },
                { type: 'note', label: 'Notes' },
                { type: 'task', label: 'Tasks' },
                { type: 'research', label: 'Research' }
              ].map(cat => {
                const colors = appearancePrefs.categoryThemes[cat.type] || DEFAULT_CATEGORY_THEMES[cat.type];
                return `
                  <div style="display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; background: var(--bg-tertiary); border: 1px solid var(--border-primary); border-radius: var(--radius-sm);">
                    <div style="font-weight: 500; font-size: var(--text-sm); width: 80px;">${cat.label}</div>
                    <div style="display: flex; align-items: center; gap: 10px;">
                      <div style="display: flex; align-items: center; gap: 4px;">
                        <span class="text-xs text-tertiary">Start</span>
                        <input type="color" class="color-picker-input" data-cat="${cat.type}" data-stop="start" value="${colors.start}" style="width: 28px; height: 24px; border: none; cursor: pointer; background: transparent;" />
                      </div>
                      <div style="display: flex; align-items: center; gap: 4px;">
                        <span class="text-xs text-tertiary">End</span>
                        <input type="color" class="color-picker-input" data-cat="${cat.type}" data-stop="end" value="${colors.end}" style="width: 28px; height: 24px; border: none; cursor: pointer; background: transparent;" />
                      </div>
                      <div id="preview-cat-${cat.type}" style="width: 24px; height: 24px; border-radius: 50%; background: linear-gradient(135deg, ${colors.start}, ${colors.end}); box-shadow: var(--shadow-sm);"></div>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          </div>

          <!-- Section C: Custom Global -->
          <div id="appearance-custom-section" style="margin-bottom: var(--space-5); display: ${appearancePrefs.mode === 'custom' ? 'block' : 'none'};">
            <label class="form-label" style="margin-bottom: 6px;">Custom Gradient Stops</label>
            <div style="display: flex; align-items: center; gap: 16px; padding: 12px; background: var(--bg-tertiary); border: 1px solid var(--border-primary); border-radius: var(--radius-sm);">
              <div style="display: flex; align-items: center; gap: 6px;">
                <span class="text-xs text-secondary">Start Color:</span>
                <input type="color" id="custom-global-start" value="${appearancePrefs.customGlobal.start}" style="width: 32px; height: 28px; border: none; cursor: pointer; background: transparent;" />
              </div>
              <div style="display: flex; align-items: center; gap: 6px;">
                <span class="text-xs text-secondary">End Color:</span>
                <input type="color" id="custom-global-end" value="${appearancePrefs.customGlobal.end}" style="width: 32px; height: 28px; border: none; cursor: pointer; background: transparent;" />
              </div>
              <div id="preview-custom-global" style="width: 32px; height: 32px; border-radius: 50%; background: linear-gradient(135deg, ${appearancePrefs.customGlobal.start}, ${appearancePrefs.customGlobal.end}); margin-left: auto;"></div>
            </div>
          </div>
        </div>
      `,
      buttons: [
        {
          text: 'Reset to Defaults',
          variant: 'ghost',
          onClick: (modal, inst) => {
            appearancePrefs = {
              mode: 'category',
              preset: 'ocean',
              customGlobal: { start: '#2563EB', end: '#06B6D4' },
              categoryThemes: { ...DEFAULT_CATEGORY_THEMES },
              customNodes: {}
            };
            saveGraphAppearance(appearancePrefs);
            updateGradientDefs();
            renderAll();
            inst.close();
            window.showToast('Graph appearance reset to defaults.', 'info');
          }
        },
        {
          text: 'Apply Appearance',
          variant: 'primary',
          onClick: (modal, inst) => {
            saveGraphAppearance(appearancePrefs);
            updateGradientDefs();
            renderAll();
            inst.close();
            window.showToast('Graph theme updated.', 'success');
          }
        }
      ]
    });

    // Handle Modal Event Bindings
    setTimeout(() => {
      const modeBtns = document.querySelectorAll('#modal-theme-mode button');
      const presetsSec = document.getElementById('appearance-presets-section');
      const categorySec = document.getElementById('appearance-category-section');
      const customSec = document.getElementById('appearance-custom-section');

      modeBtns.forEach(btn => {
        btn.addEventListener('click', () => {
          modeBtns.forEach(b => b.classList.remove('segmented-btn--active'));
          btn.classList.add('segmented-btn--active');
          const m = btn.getAttribute('data-mode');
          appearancePrefs.mode = m;

          presetsSec.style.display = m === 'preset' ? 'block' : 'none';
          categorySec.style.display = m === 'category' ? 'block' : 'none';
          customSec.style.display = m === 'custom' ? 'block' : 'none';
        });
      });

      // Preset cards
      document.querySelectorAll('.preset-card').forEach(card => {
        card.addEventListener('click', () => {
          document.querySelectorAll('.preset-card').forEach(c => c.classList.remove('is-active'));
          card.classList.add('is-active');
          appearancePrefs.preset = card.getAttribute('data-preset');
        });
      });

      // Category color inputs
      document.querySelectorAll('.color-picker-input').forEach(input => {
        input.addEventListener('input', (e) => {
          const cat = e.target.getAttribute('data-cat');
          const stop = e.target.getAttribute('data-stop');
          if (!appearancePrefs.categoryThemes[cat]) {
            appearancePrefs.categoryThemes[cat] = { ...DEFAULT_CATEGORY_THEMES[cat] };
          }
          appearancePrefs.categoryThemes[cat][stop] = e.target.value;
          const preview = document.getElementById(`preview-cat-${cat}`);
          if (preview) {
            preview.style.background = `linear-gradient(135deg, ${appearancePrefs.categoryThemes[cat].start}, ${appearancePrefs.categoryThemes[cat].end})`;
          }
        });
      });

      // Custom global inputs
      const cgStart = document.getElementById('custom-global-start');
      const cgEnd = document.getElementById('custom-global-end');
      const cgPreview = document.getElementById('preview-custom-global');
      if (cgStart && cgEnd && cgPreview) {
        const updateCg = () => {
          appearancePrefs.customGlobal.start = cgStart.value;
          appearancePrefs.customGlobal.end = cgEnd.value;
          cgPreview.style.background = `linear-gradient(135deg, ${cgStart.value}, ${cgEnd.value})`;
        };
        cgStart.addEventListener('input', updateCg);
        cgEnd.addEventListener('input', updateCg);
      }
    }, 50);
  }

  // ------------------------------------------------------------------------
  // Contextual Inspector Panel & Individual Node Gradient Customization
  // ------------------------------------------------------------------------
  function openNodeInspector(node) {
    const incident = edges.filter(e => e.source === node.id || e.target === node.id);
    const nodeColors = getNodeColors(node);
    const hasCustomOverride = appearancePrefs.customNodes && appearancePrefs.customNodes[node.id];

    const inspectorContentHtml = `
      <div>
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
          <span class="badge" style="background: var(--bg-tertiary); text-transform: uppercase;">${node.type}</span>
          <span class="text-xs text-tertiary">${incident.length} connection${incident.length === 1 ? '' : 's'}</span>
        </div>

        <h3 style="font-size: var(--text-md); font-weight: 600; margin-bottom: 12px; line-height: 1.3;">${node.title}</h3>

        <!-- Connected Relationships -->
        <div style="margin-bottom: 16px;">
          <span class="form-label" style="margin-bottom: 6px;">Connected Relationships:</span>
          ${incident.map(e => {
            const isSource = e.source === node.id;
            const otherNodeId = isSource ? e.target : e.source;
            const other = nodes.find(n => n.id === otherNodeId);
            let relTag = 'tag--gray';
            if (e.relationship === 'supports') relTag = 'tag--green';
            else if (e.relationship === 'contradicts') relTag = 'tag--rose';
            else if (e.relationship === 'depends_on') relTag = 'tag--amber';
            else if (e.relationship === 'inspired_by') relTag = 'tag--violet';
            return `
              <div style="padding: 6px 10px; background: var(--bg-tertiary); border: 1px solid var(--border-primary); border-radius: var(--radius-sm); margin-bottom: 4px; font-size: var(--text-xs); display: flex; align-items: center; justify-content: space-between;">
                <span class="text-truncate" style="max-width: 170px;">
                  ${isSource ? '→' : '←'} <strong>${other ? other.title : 'Node'}</strong>
                </span>
                <span class="tag ${relTag}" style="font-size: 10px;">${e.label || e.relationship}</span>
              </div>
            `;
          }).join('') || '<div class="text-xs text-tertiary">No connected edges.</div>'}
        </div>

        <!-- Individual Node Gradient Customization -->
        <div style="margin-bottom: 16px; padding: 12px; background: var(--bg-tertiary); border: 1px solid var(--border-primary); border-radius: var(--radius-sm);">
          <span class="form-label" style="margin-bottom: 8px;">Node Custom Gradient:</span>
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
            <div style="display: flex; align-items: center; gap: 4px;">
              <span class="text-xs text-tertiary">Start</span>
              <input type="color" id="inspect-node-start" value="${nodeColors.start}" style="width: 28px; height: 24px; border: none; cursor: pointer; background: transparent;" />
            </div>
            <div style="display: flex; align-items: center; gap: 4px;">
              <span class="text-xs text-tertiary">End</span>
              <input type="color" id="inspect-node-end" value="${nodeColors.end}" style="width: 28px; height: 24px; border: none; cursor: pointer; background: transparent;" />
            </div>
            <div id="inspect-node-preview" style="width: 24px; height: 24px; border-radius: 50%; background: linear-gradient(135deg, ${nodeColors.start}, ${nodeColors.end});"></div>
          </div>
          <div style="display: flex; gap: 6px;">
            <button class="btn btn--secondary btn--sm" id="btn-save-node-color" style="flex: 1;">Save Gradient</button>
            ${hasCustomOverride ? `<button class="btn btn--ghost btn--sm" id="btn-reset-node-color">Reset</button>` : ''}
          </div>
        </div>

        <button class="btn btn--primary btn--sm" style="width: 100%;" id="btn-graph-open-entity">
          Open In ${node.type.toUpperCase()}
        </button>
      </div>
    `;

    if (window.Inspector) {
      window.Inspector.open({
        owner: 'graph',
        title: 'Node Inspector',
        content: inspectorContentHtml,
        onMount: () => {
          attachInspectorHandlers(node);
        },
        onClose: () => {
          selectedNode = null;
          renderAll();
        }
      });
    } else if (inspectorPanel && inspectorBody) {
      inspectorPanel.classList.add('inspector--open');
      inspectorBody.innerHTML = inspectorContentHtml;
      attachInspectorHandlers(node);
    }
  }

  function attachInspectorHandlers(node) {
    // Hook Inspector Color Overrides
    const startInput = document.getElementById('inspect-node-start');
    const endInput = document.getElementById('inspect-node-end');
    const previewEl = document.getElementById('inspect-node-preview');

    const updatePreview = () => {
      if (previewEl && startInput && endInput) {
        previewEl.style.background = `linear-gradient(135deg, ${startInput.value}, ${endInput.value})`;
      }
    };
    if (startInput) startInput.addEventListener('input', updatePreview);
    if (endInput) endInput.addEventListener('input', updatePreview);

    const saveNodeBtn = document.getElementById('btn-save-node-color');
    if (saveNodeBtn) {
      saveNodeBtn.addEventListener('click', () => {
        if (!appearancePrefs.customNodes) appearancePrefs.customNodes = {};
        appearancePrefs.customNodes[node.id] = {
          start: startInput.value,
          end: endInput.value
        };
        saveGraphAppearance(appearancePrefs);
        updateGradientDefs();
        renderAll();
        window.showToast(`Updated custom gradient for "${node.title}".`, 'success');
        openNodeInspector(node);
      });
    }

    const resetNodeBtn = document.getElementById('btn-reset-node-color');
    if (resetNodeBtn) {
      resetNodeBtn.addEventListener('click', () => {
        if (appearancePrefs.customNodes && appearancePrefs.customNodes[node.id]) {
          delete appearancePrefs.customNodes[node.id];
          saveGraphAppearance(appearancePrefs);
          updateGradientDefs();
          renderAll();
          window.showToast(`Reset gradient for "${node.title}".`, 'info');
          openNodeInspector(node);
        }
      });
    }

    const openBtn = document.getElementById('btn-graph-open-entity');
    if (openBtn && node.link) {
      openBtn.addEventListener('click', () => {
        window.Router.navigate(node.link.replace('#', ''));
      });
    }
  }

  function closeInspector() {
    if (window.Inspector) {
      window.Inspector.close('graph');
    } else if (inspectorPanel) {
      inspectorPanel.classList.remove('inspector--open');
    }
    selectedNode = null;
    renderAll();
  }

  const inspectorCloseBtn = document.getElementById('inspector-close-btn');
  if (inspectorCloseBtn) {
    inspectorCloseBtn.onclick = () => {
      closeInspector();
    };
  }

  // Initial render & gentle layout settling
  renderAll();
  updateTransform();
  runSimulation();

  // Return lifecycle cleanup hook for router
  return () => {
    window.removeEventListener('contextmenu', handleContextMenu, true);
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mouseup', onMouseUp);
    if (animationFrameId) cancelAnimationFrame(animationFrameId);
    themeObserver.disconnect();
    observer.disconnect();
    selectedNode = null;
    if (window.Inspector) {
      window.Inspector.close('graph');
    }
  };
}

if (typeof window !== 'undefined') {
  window.renderGraphPage = renderGraphPage;
}
