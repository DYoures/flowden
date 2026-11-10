// Flowden Knowledge Graph Engine v3.1
// Spacious Hierarchical Layout, Logical Folder Clustering, Readable Multi-Line Typography & Bézier Curves

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

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

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

/**
 * Formats a node title into 1-2 balanced lines to prevent truncation and collisions.
 */
function formatNodeLabel(title, type) {
  if (!title) return ['Untitled'];
  const cleanTitle = String(title).trim();

  if (type === 'research') {
    // If academic citation: "Bouvier, A., & Wadhwa, M. (2010). The age..."
    const citeMatch = cleanTitle.match(/^([A-Za-z\s,.\-&]+)\s*(\(\d{4}\))\s*[.:]\s*(.+)$/);
    if (citeMatch) {
      const firstAuthor = citeMatch[1].split(',')[0].trim();
      const year = citeMatch[2];
      const rest = citeMatch[3].trim();
      const shortRest = rest.length > 22 ? rest.slice(0, 20) + '…' : rest;
      return [`${firstAuthor} ${year}`, shortRest];
    }
  }

  const words = cleanTitle.split(/\s+/);
  if (words.length <= 2 && cleanTitle.length <= 20) {
    return [cleanTitle];
  }

  const maxLine = 19;
  const lines = [];
  let cur = '';
  for (const w of words) {
    if (!cur) {
      cur = w;
    } else if ((cur + ' ' + w).length <= maxLine) {
      cur += ' ' + w;
    } else {
      lines.push(cur);
      cur = w;
      if (lines.length >= 2) break;
    }
  }
  if (cur && lines.length < 2) {
    lines.push(cur);
  } else if (cur && lines.length === 2) {
    if ((lines[1] + ' ' + cur).length <= maxLine + 2) {
      lines[1] += ' ' + cur;
    } else if (!lines[1].endsWith('…')) {
      lines[1] = lines[1].slice(0, maxLine - 2) + '…';
    }
  }

  if (lines.length > 1 && lines[1].length > maxLine + 2 && !lines[1].endsWith('…')) {
    lines[1] = lines[1].slice(0, maxLine - 1) + '…';
  }

  return lines;
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

          <button class="btn btn--secondary btn--sm" id="btn-graph-auto-arrange" title="Re-arrange into spacious folder clusters">
            <span class="graph-btn-label">Auto </span>Arrange
          </button>

          <button class="btn btn--secondary btn--sm" id="btn-graph-fit-view" title="Reset View & Center All Nodes">
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
            <marker id="arrow-graph-default" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6.5" markerHeight="6.5" orient="auto">
              <path d="M 0 1.5 L 9 5 L 0 8.5 z" fill="var(--graph-edge-default, var(--border-secondary))"/>
            </marker>
            <marker id="arrow-graph-focus" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
              <path d="M 0 1.5 L 9 5 L 0 8.5 z" fill="var(--accent-primary)"/>
            </marker>
          </defs>
          <!-- Background Grid Surface -->
          <rect width="100%" height="100%" fill="url(#graph-grid-dots)" pointer-events="none" opacity="0.6" />
          <g id="graph-transform-group">
            <g id="graph-clusters-layer"></g>
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

  // Pre-calculate node connectivity
  const incidentCounts = {};
  rawEdges.forEach(e => {
    incidentCounts[e.source] = (incidentCounts[e.source] || 0) + 1;
    incidentCounts[e.target] = (incidentCounts[e.target] || 0) + 1;
  });

  const width = container.clientWidth || 950;
  const height = container.clientHeight || 700;
  const centerX = width / 2;
  const centerY = height / 2;

  // ------------------------------------------------------------------------
  // Helper Functions: Dimensions, Icons, & Curved Geometry
  // ------------------------------------------------------------------------
  function getNodeRadius(n) {
    if (n.type === 'project') return 24; // Anchor node prominence
    const degree = incidentCounts[n.id] || 0;
    if (degree >= 4) return 18; // Hub node
    if (n.type === 'research') return 14;
    if (n.type === 'task') return 12;
    return 15; // Standard note
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
    if (appearancePrefs.customNodes && appearancePrefs.customNodes[node.id]) {
      return appearancePrefs.customNodes[node.id];
    }
    if (appearancePrefs.mode === 'custom') {
      return appearancePrefs.customGlobal || { start: '#2563EB', end: '#06B6D4' };
    }
    if (appearancePrefs.mode === 'preset') {
      const p = GRADIENT_PRESETS[appearancePrefs.preset] || GRADIENT_PRESETS.ocean;
      return { start: p.start, end: p.end };
    }
    const cat = appearancePrefs.categoryThemes && appearancePrefs.categoryThemes[node.type];
    if (cat) return cat;

    const isLight = document.documentElement.getAttribute('data-theme') === 'light';
    if (node.type === 'note') {
      return isLight ? { start: '#87631E', end: '#C5A15B' } : { start: '#0D9488', end: '#78C8B2' };
    }
    return DEFAULT_CATEGORY_THEMES[node.type] || { start: '#2563EB', end: '#06B6D4' };
  }

  // ------------------------------------------------------------------------
  // Exact Boundary-Attached Bézier Geometry with Outward Sweeping Curves & Cache
  // ------------------------------------------------------------------------
  function getBezierEdgeGeometry(src, tgt, isStructural, edgeObj) {
    if (edgeObj && edgeObj._cachedD &&
        edgeObj._cachedSrcX === src.x && edgeObj._cachedSrcY === src.y &&
        edgeObj._cachedTgtX === tgt.x && edgeObj._cachedTgtY === tgt.y) {
      return { d: edgeObj._cachedD, isLine: edgeObj._cachedIsLine };
    }

    const dx = tgt.x - src.x;
    const dy = tgt.y - src.y;
    const dist = Math.hypot(dx, dy) || 1;

    let d = '';
    let isLine = false;

    // Structural project spokes are drawn as subtle straight lines
    if (isStructural) {
      const startUx = dx / dist;
      const startUy = dy / dist;
      const startX = src.x + startUx * src.radius;
      const startY = src.y + startUy * src.radius;
      const endX = tgt.x - startUx * tgt.radius;
      const endY = tgt.y - startUy * tgt.radius;
      d = `M ${startX} ${startY} L ${endX} ${endY}`;
      isLine = true;
    } else {
      // Semantic relationships: gentle arc that sweeps outward from the center
      const mx = (src.x + tgt.x) / 2;
      const my = (src.y + tgt.y) / 2;
      const fromCenterX = mx - centerX;
      const fromCenterY = my - centerY;

      let nx = -dy / dist;
      let ny = dx / dist;

      // Ensure normal vector points away from the canvas center
      if (nx * fromCenterX + ny * fromCenterY < 0) {
        nx = -nx;
        ny = -ny;
      }

      const curvature = Math.min(32, Math.max(12, dist * 0.08));
      const cx = mx + nx * curvature;
      const cy = my + ny * curvature;

      const startDx = cx - src.x;
      const startDy = cy - src.y;
      const startLen = Math.hypot(startDx, startDy) || 1;
      const startX = src.x + (startDx / startLen) * src.radius;
      const startY = src.y + (startDy / startLen) * src.radius;

      const endDx = tgt.x - cx;
      const endDy = tgt.y - cy;
      const endLen = Math.hypot(endDx, endDy) || 1;
      const endX = tgt.x - (endDx / endLen) * tgt.radius;
      const endY = tgt.y - (endDy / endLen) * tgt.radius;

      d = `M ${startX} ${startY} Q ${cx} ${cy} ${endX} ${endY}`;
      isLine = false;
    }

    if (edgeObj) {
      edgeObj._cachedD = d;
      edgeObj._cachedIsLine = isLine;
      edgeObj._cachedSrcX = src.x;
      edgeObj._cachedSrcY = src.y;
      edgeObj._cachedTgtX = tgt.x;
      edgeObj._cachedTgtY = tgt.y;
    }

    return { d, isLine };
  }

  // ------------------------------------------------------------------------
  // Spacious Hierarchical Layout & Clustering Engine
  // ------------------------------------------------------------------------
  let clusterBadges = [];

  function applySpaciousClusterLayout(nodeList, edgeList, canvasWidth, canvasHeight, forceRecalculate = false) {
    const cx = canvasWidth / 2;
    const cy = canvasHeight / 2;

    const needsLayout = forceRecalculate || nodeList.some(n => !_graphPositionStore.has(n.id));
    if (!needsLayout) {
      nodeList.forEach(n => {
        const p = _graphPositionStore.get(n.id);
        if (p) { n.x = p.x; n.y = p.y; }
      });
      return;
    }

    const projects = nodeList.filter(n => n.type === 'project');
    const notes = nodeList.filter(n => n.type === 'note');
    const sources = nodeList.filter(n => n.type === 'research');
    const tasks = nodeList.filter(n => n.type === 'task');

    // 1. Position Project Anchor
    if (projects.length === 1) {
      projects[0].x = cx;
      projects[0].y = cy;
      projects[0].isFixed = true;
    } else if (projects.length > 1) {
      const projDist = 650;
      projects.forEach((p, i) => {
        const angle = (i / projects.length) * 2 * Math.PI;
        p.x = cx + Math.cos(angle) * projDist;
        p.y = cy + Math.sin(angle) * projDist;
        p.isFixed = true;
      });
    }

    // 2. Group Notes by Folder
    const folderMap = new Map();
    const overviewNotes = [];

    notes.forEach(n => {
      const titleLower = (n.title || '').toLowerCase();
      if (titleLower.includes('project overview') || !n.folderName || n.folderName === 'Overview') {
        overviewNotes.push(n);
      } else {
        const fKey = n.folderName;
        if (!folderMap.has(fKey)) folderMap.set(fKey, []);
        folderMap.get(fKey).push(n);
      }
    });

    // Place overview notes near project anchor (slightly above / offset)
    overviewNotes.forEach((n, i) => {
      n.x = cx - 180 + (i % 2) * 360;
      n.y = cy - 130 - Math.floor(i / 2) * 120;
    });

    // Sort folder names naturally (e.g. "01 Foundations", "02 The Sun & Planets", etc.)
    const folderNames = Array.from(folderMap.keys()).sort();
    const K = Math.max(folderNames.length, 1);
    const R_folder = Math.max(460, 380 + K * 18);

    clusterBadges = [];

    folderNames.forEach((fname, k) => {
      // Distribute folder clusters around the project anchor in balanced angular sectors
      const startAngle = -Math.PI * 0.78;
      const angleSpan = Math.PI * 1.56; // 280 degree arc for note folders
      const clusterAngle = startAngle + (k / Math.max(K - 1, 1)) * angleSpan;

      const fx = cx + R_folder * Math.cos(clusterAngle);
      const fy = cy + R_folder * Math.sin(clusterAngle);

      const fnotes = folderMap.get(fname);
      const M = fnotes.length;

      clusterBadges.push({
        name: fname,
        x: fx,
        y: fy - Math.max(65, M * 14) - 26,
        count: M
      });

      fnotes.forEach((n, j) => {
        n.folderCentroid = { x: fx, y: fy };
        if (M === 1) {
          n.x = fx;
          n.y = fy;
        } else {
          // Circular / arc distribution within folder cluster with minimum 200px separation
          const localAngle = clusterAngle + (j - (M - 1) / 2) * (Math.PI * 1.5 / Math.max(M, 3));
          const R_local = Math.max(120, M * 34);
          n.x = fx + R_local * Math.cos(localAngle);
          n.y = fy + R_local * Math.sin(localAngle);
        }
      });
    });

    // 3. Position Tasks (if any)
    if (tasks.length > 0) {
      const taskCentroid = { x: cx + R_folder * 0.9, y: cy - R_folder * 0.8 };
      tasks.forEach((t, i) => {
        const a = (i / tasks.length) * 2 * Math.PI;
        t.x = taskCentroid.x + Math.cos(a) * 140;
        t.y = taskCentroid.y + Math.sin(a) * 140;
      });
    }

    // 4. Position Sources in an Outer Perimeter Shelf / Arc (Never overlapping)
    const S = sources.length;
    if (S > 0) {
      const R_sources = R_folder + 260; // radius ~720px - 760px
      const noteSourceMap = new Map();
      sources.forEach(s => {
        const citingEdges = edgeList.filter(e => e.target === s.id && e.relationship === 'cites');
        const citedNoteId = citingEdges.length > 0 ? citingEdges[0].source : null;
        if (!noteSourceMap.has(citedNoteId)) noteSourceMap.set(citedNoteId, []);
        noteSourceMap.get(citedNoteId).push(s);
      });

      const sourceStartAngle = Math.PI * 0.10;
      const sourceAngleSpan = Math.PI * 0.80;
      let unassociatedIdx = 0;

      noteSourceMap.forEach((srcList, citedNoteId) => {
        const citedNote = citedNoteId ? notes.find(n => n.id === citedNoteId) : null;
        if (citedNote && citedNote.x !== undefined) {
          const baseAngle = Math.atan2(citedNote.y - cy, citedNote.x - cx);
          srcList.forEach((s, idx) => {
            const spreadOffset = (idx - (srcList.length - 1) / 2) * 0.22;
            const a = baseAngle + spreadOffset;
            s.x = cx + R_sources * Math.cos(a);
            s.y = cy + R_sources * Math.sin(a);
          });
        } else {
          srcList.forEach(s => {
            const a = sourceStartAngle + (unassociatedIdx++ / Math.max(S - 1, 1)) * sourceAngleSpan;
            s.x = cx + R_sources * Math.cos(a);
            s.y = cy + R_sources * Math.sin(a);
          });
        }
      });
    }

    // 5. Physics Relaxation Pass with Continuous Inverse-Square Coulomb Repulsion
    for (let iter = 0; iter < 60; iter++) {
      const alpha = Math.max(0.01, 1 - iter / 60);

      // Repulsion between all node pairs
      for (let i = 0; i < nodeList.length; i++) {
        const a = nodeList[i];
        for (let j = i + 1; j < nodeList.length; j++) {
          const b = nodeList[j];
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const distSq = dx * dx + dy * dy;
          const minDist = (a.type === 'research' && b.type === 'research') ? 180 : 230;
          const minDistSq = minDist * minDist;

          if (distSq < minDistSq && distSq > 0.0001) {
            const dist = Math.sqrt(distSq);
            const push = ((minDist - dist) / dist) * alpha * 0.45;
            if (!a.isFixed) { a.x -= dx * push; a.y -= dy * push; }
            if (!b.isFixed) { b.x += dx * push; b.y += dy * push; }
          }
        }
      }

      // Folder cohesion spring (keeps notes within their folder cluster)
      notes.forEach(n => {
        if (n.folderCentroid && !n.isFixed) {
          n.x += (n.folderCentroid.x - n.x) * 0.04 * alpha;
          n.y += (n.folderCentroid.y - n.y) * 0.04 * alpha;
        }
      });
    }

    // 6. Center cluster badges directly above each settled folder cluster
    clusterBadges = [];
    folderNames.forEach(fname => {
      const fnotes = folderMap.get(fname);
      if (fnotes && fnotes.length > 0) {
        const meanX = fnotes.reduce((acc, n) => acc + n.x, 0) / fnotes.length;
        const minY = Math.min(...fnotes.map(n => n.y));
        clusterBadges.push({
          name: fname,
          x: meanX,
          y: minY - 38,
          count: fnotes.length
        });
      }
    });

    // Persist finalized positions
    nodeList.forEach(n => {
      _graphPositionStore.set(n.id, { x: n.x, y: n.y });
    });
  }

  // Initialize node objects with radii and layout coordinates
  const nodes = rawNodes.map((n) => {
    const r = getNodeRadius(n);
    return {
      ...n,
      x: centerX,
      y: centerY,
      vx: 0,
      vy: 0,
      radius: r
    };
  });

  const edges = rawEdges;

  // Apply spacious cluster layout
  applySpaciousClusterLayout(nodes, edges, width, height, false);

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
  const clustersLayer = document.getElementById('graph-clusters-layer');
  const edgesLayer = document.getElementById('graph-edges-layer');
  const nodesLayer = document.getElementById('graph-nodes-layer');
  const graphDefs = document.getElementById('graph-defs');
  const inspectorPanel = document.getElementById('app-inspector');
  const inspectorBody = document.getElementById('inspector-body');

  // High-performance DOM element & topology indexes
  const nodeDomMap = new Map(); // nodeId -> { id, el, data }
  const edgeDomMap = new Map(); // edgeId -> { id, el, src, tgt, isStructural, isDirectional, data }
  const nodeIncidentEdges = new Map(); // nodeId -> Array of edge entries
  const nodeNeighbors = new Map(); // nodeId -> Set of neighbor node IDs

  // RAF throttles for smooth 60fps+ rendering
  let rafDragScheduled = false;
  let dragNodePending = null;
  let rafTransformScheduled = false;

  function updateTransform() {
    transformGroup.setAttribute('transform', `translate(${panX}, ${panY}) scale(${zoom})`);
  }

  function scheduleTransformUpdate() {
    if (!rafTransformScheduled) {
      rafTransformScheduled = true;
      requestAnimationFrame(() => {
        rafTransformScheduled = false;
        updateTransform();
      });
    }
  }

  function scheduleDragSync(node) {
    dragNodePending = node;
    if (!rafDragScheduled) {
      rafDragScheduled = true;
      requestAnimationFrame(() => {
        rafDragScheduled = false;
        if (dragNodePending) {
          syncSingleNodeDrag(dragNodePending);
          dragNodePending = null;
        }
      });
    }
  }

  function syncSingleNodeDrag(node) {
    const nodeEntry = nodeDomMap.get(node.id);
    if (nodeEntry && nodeEntry.el) {
      nodeEntry.el.setAttribute('transform', `translate(${node.x}, ${node.y})`);
    }
    const incident = nodeIncidentEdges.get(node.id);
    if (incident) {
      for (let i = 0; i < incident.length; i++) {
        const entry = incident[i];
        if (entry && entry.el) {
          const geom = getBezierEdgeGeometry(entry.src, entry.tgt, entry.isStructural, entry.data);
          entry.el.setAttribute('d', geom.d);
        }
      }
    }
  }

  function fitView(smooth = true) {
    const visibleNodes = nodes.filter(n => activeTypes.has(n.type));
    if (visibleNodes.length === 0) return;

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    visibleNodes.forEach(n => {
      const padX = n.radius + 80; // include radius and label space
      const padY = n.radius + 45; // include radius and 2-line label height
      if (n.x - padX < minX) minX = n.x - padX;
      if (n.x + padX > maxX) maxX = n.x + padX;
      if (n.y - n.radius - 24 < minY) minY = n.y - n.radius - 24;
      if (n.y + padY > maxY) maxY = n.y + padY;
    });

    const graphWidth = maxX - minX || 800;
    const graphHeight = maxY - minY || 600;
    const vWidth = viewport.clientWidth || 950;
    const vHeight = viewport.clientHeight || 700;

    const scaleX = (vWidth - 90) / graphWidth;
    const scaleY = (vHeight - 90) / graphHeight;
    const targetZoom = Math.min(Math.max(Math.min(scaleX, scaleY), 0.15), 1.6);

    const targetPanX = (vWidth - graphWidth * targetZoom) / 2 - minX * targetZoom;
    const targetPanY = (vHeight - graphHeight * targetZoom) / 2 - minY * targetZoom;

    if (smooth && typeof requestAnimationFrame === 'function') {
      animateViewTransform(panX, panY, zoom, targetPanX, targetPanY, targetZoom);
    } else {
      panX = targetPanX;
      panY = targetPanY;
      zoom = targetZoom;
      updateTransform();
    }
  }

  function animateViewTransform(startX, startY, startZoom, targetX, targetY, targetZoom, duration = 280) {
    const startTime = performance.now();
    function step(now) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const ease = 1 - Math.pow(1 - progress, 3); // cubic ease-out
      panX = startX + (targetX - startX) * ease;
      panY = startY + (targetY - startY) * ease;
      zoom = startZoom + (targetZoom - startZoom) * ease;
      updateTransform();
      if (progress < 1) {
        requestAnimationFrame(step);
      }
    }
    requestAnimationFrame(step);
  }

  // ------------------------------------------------------------------------
  // Dynamic SVG Gradient Definitions Management
  // ------------------------------------------------------------------------
  function updateGradientDefs() {
    const isLight = document.documentElement.getAttribute('data-theme') === 'light';
    const staticDefs = `
      <pattern id="graph-grid-dots" width="28" height="28" patternUnits="userSpaceOnUse">
        <circle cx="14" cy="14" r="1" fill="var(--canvas-grid-dot)" />
      </pattern>
      <filter id="node-shadow" x="-30%" y="-30%" width="160%" height="160%">
        <feDropShadow dx="0" dy="2" stdDeviation="2.5" flood-color="${isLight ? '#20211F' : '#000000'}" flood-opacity="${isLight ? '0.18' : '0.40'}" />
      </filter>
      <marker id="arrow-graph-default" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6.5" markerHeight="6.5" orient="auto">
        <path d="M 0 1.5 L 9 5 L 0 8.5 z" fill="var(--graph-edge-default, var(--border-secondary))"/>
      </marker>
      <marker id="arrow-graph-focus" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
        <path d="M 0 1.5 L 9 5 L 0 8.5 z" fill="var(--accent-primary)"/>
      </marker>
    `;

    let gradDefs = '';

    ['project', 'note', 'task', 'research'].forEach(type => {
      const colors = getNodeColors({ type, id: `__sample_${type}` });
      gradDefs += `
        <radialGradient id="grad-cat-${type}" cx="35%" cy="35%" r="65%">
          <stop offset="0%" stop-color="#FFFFFF" stop-opacity="0.35" />
          <stop offset="25%" stop-color="${colors.start}" />
          <stop offset="100%" stop-color="${colors.end}" />
        </radialGradient>
      `;
    });

    if (appearancePrefs.customNodes) {
      Object.entries(appearancePrefs.customNodes).forEach(([nodeId, colors]) => {
        gradDefs += `
          <radialGradient id="grad-node-${nodeId}" cx="35%" cy="35%" r="65%">
            <stop offset="0%" stop-color="#FFFFFF" stop-opacity="0.35" />
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
  // Render Cluster Badges
  // ------------------------------------------------------------------------
  function renderClusterBadges() {
    if (!clustersLayer) return;

    if (!activeTypes.has('note') || clusterBadges.length === 0) {
      clustersLayer.innerHTML = '';
      return;
    }

    const isLight = document.documentElement.getAttribute('data-theme') === 'light';
    let html = '';

    clusterBadges.forEach(b => {
      const badgeWidth = Math.max(96, b.name.length * 8 + 26);
      html += `
        <g class="graph-cluster-badge" transform="translate(${b.x}, ${b.y})" opacity="${focusMode && selectedNode ? 0.25 : 0.95}">
          <rect x="${-badgeWidth / 2}" y="-12" width="${badgeWidth}" height="24" rx="12"
                fill="${isLight ? '#F8FAFC' : '#1E293B'}"
                stroke="${isLight ? '#CBD5E1' : '#475569'}"
                stroke-width="1.2" />
          <text text-anchor="middle" y="4"
                fill="${isLight ? '#334155' : '#E2E8F0'}"
                font-family="var(--font-sans)" font-size="11px" font-weight="600"
                letter-spacing="0.5px">
            ${escapeHtml(b.name)}
          </text>
        </g>
      `;
    });

    clustersLayer.innerHTML = html;
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

      const isStructural = Boolean(e.isStructural || e.relationship === 'part_of' || e.relationship === 'task_of' || (e.relationship === 'references' && e.source.startsWith('project_')));

      let strokeColor = isLight ? 'var(--graph-edge-default, var(--border-secondary))' : 'var(--border-secondary)';
      let strokeWidth = isLight ? 1.35 : 1.25;
      let strokeOpacity = isDimmed ? 0.04 : (isLight ? 0.80 : 0.65);
      let dashArray = '';

      if (isStructural) {
        strokeColor = isLight ? 'rgba(100, 116, 139, 0.35)' : 'rgba(148, 163, 184, 0.22)';
        strokeWidth = 1.0;
        strokeOpacity = isDimmed ? 0.03 : 0.35;
        dashArray = 'stroke-dasharray="3 4"';
      } else if (e.relationship === 'supports') {
        strokeColor = 'var(--status-success, #10B981)';
        strokeWidth = 1.6;
      } else if (e.relationship === 'derived_from') {
        strokeColor = '#06B6D4';
        strokeWidth = 1.6;
      } else if (e.relationship === 'cites') {
        strokeColor = 'var(--status-warning, #F59E0B)';
        strokeWidth = 1.5;
        dashArray = 'stroke-dasharray="4 3"';
      } else if (e.relationship === 'contradicts') {
        strokeColor = 'var(--status-error, #EF4444)';
        strokeWidth = 1.6;
        dashArray = 'stroke-dasharray="4 3"';
      } else if (e.relationship === 'depends_on') {
        strokeColor = 'var(--status-warning, #F59E0B)';
        strokeWidth = 1.6;
      } else if (e.relationship === 'inspired_by') {
        strokeColor = 'var(--accent-primary, #6366F1)';
        dashArray = 'stroke-dasharray="3 3"';
      } else if (e.relationship === 'relates_to' || e.relationship === 'related_to' || e.relationship === 'wiki_link') {
        strokeColor = isLight ? 'var(--accent-deep, #4F46E5)' : 'var(--accent-primary, #6366F1)';
        strokeWidth = 1.4;
      }

      if (isConnected) {
        strokeColor = isLight ? 'var(--accent-deep, #4F46E5)' : 'var(--accent-primary, #6366F1)';
        strokeWidth = 2.4;
        strokeOpacity = 1.0;
        dashArray = '';
      }

      const isDirectional = !isStructural && [
        'supports', 'contradicts', 'depends_on', 'inspired_by',
        'related_to', 'relates_to', 'cites', 'derived_from',
        'references', 'wiki_link'
      ].includes(e.relationship);

      const geom = getBezierEdgeGeometry(src, tgt, isStructural, e);

      edgesHtml += `
        <path id="edge-${e.id || `${e.source}-${e.target}`}"
              class="graph-bezier-edge ${isStructural ? 'edge--structural' : ''} ${isConnected ? 'edge--highlighted' : ''} ${isDimmed ? 'edge--dimmed' : ''}"
              d="${geom.d}"
              stroke="${strokeColor}"
              stroke-width="${strokeWidth}"
              stroke-opacity="${strokeOpacity}"
              ${dashArray}
              ${isDirectional ? `marker-end="${isConnected ? 'url(#arrow-graph-focus)' : 'url(#arrow-graph-default)'}"` : ''}
              data-source="${e.source}" data-target="${e.target}" data-directional="${isDirectional}" data-structural="${isStructural}"/>
      `;
    });
    edgesLayer.innerHTML = edgesHtml;

    // Render Circular Nodes with Centered Multi-Line Text Labels
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

      const iconSize = n.radius >= 20 ? 16 : (n.radius >= 16 ? 14 : 12);
      const labelLines = formatNodeLabel(n.title, n.type);

      nodesHtml += `
        <g class="graph-node-circle ${n.type === 'project' ? 'node--project' : ''} ${isSelected ? 'node--selected' : ''}"
           id="node-${n.id}" data-id="${n.id}"
           transform="translate(${n.x}, ${n.y})"
           style="opacity: ${isDimmed ? 0.2 : 1};">
          
          <!-- Accessible SVG Tooltip -->
          <title>${escapeHtml(n.title)}${n.folderName ? ` [Folder: ${escapeHtml(n.folderName)}]` : ''} (${typeInfo.label})</title>

          <!-- Outer Ring on Project Anchor -->
          ${n.type === 'project' ? `<circle class="project-anchor-ring" r="${n.radius + 7}" fill="none" stroke="var(--accent-primary)" stroke-width="1.5" stroke-dasharray="4 4" opacity="0.65" />` : ''}

          <!-- Outer Ring on Selection (Controlled via CSS on .node--selected) -->
          <circle class="node-selection-ring" r="${n.radius + 6}" fill="none" stroke="var(--accent-primary)" stroke-width="2.5" stroke-dasharray="3 3" />

          <!-- Gradient Circular Body with Shadow -->
          <circle class="node-circle-body" r="${n.radius}"
                  fill="url(#${gradId})"
                  stroke="${isLight ? 'rgba(255, 255, 255, 0.90)' : 'rgba(255, 255, 255, 0.25)'}"
                  stroke-width="${n.type === 'project' ? 2 : 1.2}"
                  filter="url(#node-shadow)" />

          <!-- Specular Inner Depth Highlight -->
          <ellipse cx="${-n.radius * 0.25}" cy="${-n.radius * 0.3}" rx="${n.radius * 0.45}" ry="${n.radius * 0.25}" 
                   fill="rgba(255, 255, 255, 0.26)" style="pointer-events: none;" />

          <!-- Center Entity Mini Icon -->
          <svg x="${-iconSize / 2}" y="${-iconSize / 2}" width="${iconSize}" height="${iconSize}" viewBox="0 0 24 24" 
               fill="none" stroke="#FFFFFF" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"
               style="pointer-events: none; opacity: 0.95;">
            ${typeInfo.icon}
          </svg>

          <!-- Floating Centered Text Label Below Node -->
          <text class="graph-node-label"
                text-anchor="middle"
                x="0" y="${n.radius + 15}"
                fill="${isSelected ? 'var(--text-primary)' : 'var(--text-secondary)'}"
                font-weight="${isSelected ? 600 : 500}">
            <tspan x="0" dy="0">${escapeHtml(labelLines[0])}</tspan>
            ${labelLines[1] ? `<tspan x="0" dy="13">${escapeHtml(labelLines[1])}</tspan>` : ''}
          </text>
        </g>
      `;
    });
    nodesLayer.innerHTML = nodesHtml;

    // Index DOM elements & graph topology for sub-millisecond updates
    nodeDomMap.clear();
    edgeDomMap.clear();
    nodeIncidentEdges.clear();
    nodeNeighbors.clear();

    visibleNodes.forEach(n => {
      nodeIncidentEdges.set(n.id, []);
      nodeNeighbors.set(n.id, new Set());
      const el = document.getElementById(`node-${n.id}`);
      nodeDomMap.set(n.id, { id: n.id, el, data: n });
    });

    visibleEdges.forEach(e => {
      const edgeId = e.id || `${e.source}-${e.target}`;
      const src = nodes.find(n => n.id === e.source);
      const tgt = nodes.find(n => n.id === e.target);
      if (!src || !tgt) return;

      const el = document.getElementById(`edge-${edgeId}`);
      const isStructural = Boolean(e.isStructural || e.relationship === 'part_of' || e.relationship === 'task_of' || (e.relationship === 'references' && e.source.startsWith('project_')));
      const isDirectional = !isStructural && [
        'supports', 'contradicts', 'depends_on', 'inspired_by',
        'related_to', 'relates_to', 'cites', 'derived_from',
        'references', 'wiki_link'
      ].includes(e.relationship);

      const entry = { id: edgeId, el, src, tgt, isStructural, isDirectional, data: e };
      edgeDomMap.set(edgeId, entry);

      if (nodeIncidentEdges.has(e.source)) nodeIncidentEdges.get(e.source).push(entry);
      if (nodeIncidentEdges.has(e.target)) nodeIncidentEdges.get(e.target).push(entry);
      if (nodeNeighbors.has(e.source)) nodeNeighbors.get(e.source).add(e.target);
      if (nodeNeighbors.has(e.target)) nodeNeighbors.get(e.target).add(e.source);
    });

    renderClusterBadges();
    updateGraphVisualStates();
  }

  // Fast in-place class and style updater: ZERO DOM destruction or re-creation
  function updateGraphVisualStates(targetHoveredNode = null) {
    const activeFocusNode = targetHoveredNode || selectedNode;
    const isFocusFilterActive = focusMode && Boolean(selectedNode);

    let activeNeighbors = null;
    let activeIncidentEdgeIds = null;
    if (activeFocusNode) {
      activeNeighbors = nodeNeighbors.get(activeFocusNode.id) || null;
      const incident = nodeIncidentEdges.get(activeFocusNode.id) || [];
      activeIncidentEdgeIds = new Set(incident.map(entry => entry.id));
    }

    // 1. Update Edges in-place
    edgeDomMap.forEach((entry, edgeId) => {
      if (!entry.el) return;
      const isConnectedToFocus = activeIncidentEdgeIds ? activeIncidentEdgeIds.has(edgeId) : false;
      const isDimmed = targetHoveredNode
        ? !isConnectedToFocus
        : (isFocusFilterActive && !isConnectedToFocus);

      entry.el.classList.toggle('edge--highlighted', isConnectedToFocus);
      entry.el.classList.toggle('edge--dimmed', isDimmed);

      if (entry.isDirectional) {
        entry.el.setAttribute('marker-end', isConnectedToFocus ? 'url(#arrow-graph-focus)' : 'url(#arrow-graph-default)');
      }
    });

    // 2. Update Nodes in-place
    nodeDomMap.forEach((entry, nodeId) => {
      if (!entry.el) return;
      const isSel = selectedNode && selectedNode.id === nodeId;
      entry.el.classList.toggle('node--selected', Boolean(isSel));

      if (targetHoveredNode) {
        const isConn = nodeId === targetHoveredNode.id || (activeNeighbors && activeNeighbors.has(nodeId));
        entry.el.style.opacity = isConn ? '1' : '0.25';
      } else if (isFocusFilterActive) {
        const isConn = nodeId === selectedNode.id || (activeNeighbors && activeNeighbors.has(nodeId));
        entry.el.style.opacity = isConn ? '1' : '0.2';
      } else {
        entry.el.style.opacity = '1';
      }
    });

    // 3. Update Cluster Badges opacity in-place
    if (clustersLayer) {
      const badgeOpacity = (isFocusFilterActive || targetHoveredNode) ? '0.25' : '0.95';
      clustersLayer.querySelectorAll('.graph-cluster-badge').forEach(b => {
        b.setAttribute('opacity', badgeOpacity);
      });
    }
  }

  // Fast coordinate sync for full re-layouts (e.g. after Auto Arrange)
  function syncDomCoordinates() {
    nodeDomMap.forEach((entry, id) => {
      const n = nodes.find(item => item.id === id);
      if (n && entry.el) {
        entry.el.setAttribute('transform', `translate(${n.x}, ${n.y})`);
      }
    });

    edgeDomMap.forEach((entry) => {
      if (entry.el && entry.src && entry.tgt) {
        const geom = getBezierEdgeGeometry(entry.src, entry.tgt, entry.isStructural, entry.data);
        entry.el.setAttribute('d', geom.d);
      }
    });
  }

  // Event Delegation on nodesLayer: attached ONCE, zero listener recreation
  function initNodeEventDelegation() {
    nodesLayer.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      const nodeG = e.target.closest('.graph-node-circle');
      if (!nodeG) return;
      const nId = nodeG.getAttribute('data-id');
      const node = nodes.find(n => n.id === nId);
      if (!node) return;

      e.stopPropagation();
      activeDragNode = node;
      isNodeDragging = false;
      dragDownX = e.clientX;
      dragDownY = e.clientY;
    });

    nodesLayer.addEventListener('mouseover', (e) => {
      const nodeG = e.target.closest('.graph-node-circle');
      if (!nodeG) return;
      const nId = nodeG.getAttribute('data-id');
      const node = nodes.find(n => n.id === nId);
      if (!node || hoveredNode === node) return;
      hoveredNode = node;
      updateGraphVisualStates(hoveredNode);
    });

    nodesLayer.addEventListener('mouseout', (e) => {
      const nodeG = e.target.closest('.graph-node-circle');
      if (!nodeG) return;
      const relatedG = e.relatedTarget ? e.relatedTarget.closest('.graph-node-circle') : null;
      if (relatedG === nodeG) return;
      hoveredNode = null;
      updateGraphVisualStates(null);
    });

    nodesLayer.addEventListener('dblclick', (e) => {
      const nodeG = e.target.closest('.graph-node-circle');
      if (!nodeG) return;
      const nId = nodeG.getAttribute('data-id');
      const node = nodes.find(n => n.id === nId);
      if (!node) return;
      e.stopPropagation();
      if (node.link) window.Router.navigate(node.link.replace('#', ''));
    });
  }

  initNodeEventDelegation();

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
      
      if (selectedNode) {
        selectedNode = null;
        closeInspector();
        updateGraphVisualStates();
      }
    }
  });

  const onMouseMove = (e) => {
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
        updateGraphVisualStates();
      }
    } else if (isPanning) {
      panX = e.clientX - panStartX;
      panY = e.clientY - panStartY;
      scheduleTransformUpdate();
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
        scheduleDragSync(activeDragNode);
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
      updateTransform();
    }

    if (activeDragNode) {
      if (dragNodePending) {
        syncSingleNodeDrag(dragNodePending);
        dragNodePending = null;
      }
      if (!isNodeDragging) {
        selectedNode = activeDragNode;
        openNodeInspector(selectedNode);
        updateGraphVisualStates();
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
      if (rafDragScheduled) cancelAnimationFrame(rafDragScheduled);
      if (rafTransformScheduled) cancelAnimationFrame(rafTransformScheduled);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      themeObserver.disconnect();
      observer.disconnect();
      selectedNode = null;
      hoveredNode = null;
      if (window.Inspector) {
        window.Inspector.close('graph');
      }
    }
  });
  observer.observe(container, { childList: true });

  // Zoom Handling: Expanded zoom bounds 0.10 to 4.0 with RAF batching
  viewport.addEventListener('wheel', (e) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.09 : 0.91;
    const newZoom = Math.min(Math.max(zoom * factor, 0.10), 4.0);
    const rect = viewport.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    panX = mouseX - (mouseX - panX) * (newZoom / zoom);
    panY = mouseY - (mouseY - panY) * (newZoom / zoom);
    zoom = newZoom;

    scheduleTransformUpdate();
  }, { passive: false });

  // Reset / Fit View Button
  document.getElementById('btn-graph-fit-view').addEventListener('click', () => {
    fitView(true);
  });

  // Auto Arrange Button
  document.getElementById('btn-graph-auto-arrange').addEventListener('click', () => {
    _graphPositionStore.clear();
    applySpaciousClusterLayout(nodes, edges, width, height, true);
    renderAll();
    fitView(true);
    if (typeof window !== 'undefined' && window.showToast) {
      window.showToast('Knowledge graph arranged into spacious folder clusters.', 'success', 2000);
    }
  });

  // Focus Mode Toggle: instant in-place visual update
  const focusBtn = document.getElementById('btn-graph-focus-mode');
  focusBtn.addEventListener('click', () => {
    focusMode = !focusMode;
    const statusSpan = document.getElementById('focus-status-text');
    if (statusSpan) statusSpan.textContent = focusMode ? 'On' : 'Off';
    else focusBtn.textContent = `Focus: ${focusMode ? 'On' : 'Off'}`;
    focusBtn.classList.toggle('btn--primary', focusMode);
    focusBtn.classList.toggle('btn--secondary', !focusMode);
    updateGraphVisualStates();
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
      fitView(true);
    });
  });

  // Node Search: instant pan and focus without DOM destruction
  document.getElementById('graph-search-node').addEventListener('input', (e) => {
    const q = e.target.value.trim().toLowerCase();
    if (!q) return;
    const match = nodes.find(n => n.title.toLowerCase().includes(q));
    if (match) {
      selectedNode = match;
      const vWidth = viewport.clientWidth || 950;
      const vHeight = viewport.clientHeight || 700;
      panX = vWidth / 2 - match.x * zoom;
      panY = vHeight / 2 - match.y * zoom;
      updateTransform();
      updateGraphVisualStates();
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
            if (typeof window !== 'undefined' && window.showToast) {
              window.showToast('Graph appearance reset to defaults.', 'info');
            }
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
            if (typeof window !== 'undefined' && window.showToast) {
              window.showToast('Graph theme updated.', 'success');
            }
          }
        }
      ]
    });

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

      document.querySelectorAll('.preset-card').forEach(card => {
        card.addEventListener('click', () => {
          document.querySelectorAll('.preset-card').forEach(c => c.classList.remove('is-active'));
          card.classList.add('is-active');
          appearancePrefs.preset = card.getAttribute('data-preset');
        });
      });

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

        <h3 style="font-size: var(--text-md); font-weight: 600; margin-bottom: 6px; line-height: 1.3;">${escapeHtml(node.title)}</h3>
        ${node.folderName ? `<div class="text-xs text-secondary" style="margin-bottom: 12px;">📁 ${escapeHtml(node.folderName)}</div>` : ''}

        <!-- Connected Relationships -->
        <div style="margin-bottom: 16px;">
          <span class="form-label" style="margin-bottom: 6px;">Connected Relationships:</span>
          ${incident.map(e => {
            const isSource = e.source === node.id;
            const otherNodeId = isSource ? e.target : e.source;
            const other = nodes.find(n => n.id === otherNodeId);
            let relTag = 'tag--gray';
            if (e.relationship === 'supports') relTag = 'tag--green';
            else if (e.relationship === 'derived_from') relTag = 'tag--cyan';
            else if (e.relationship === 'contradicts') relTag = 'tag--rose';
            else if (e.relationship === 'depends_on' || e.relationship === 'cites') relTag = 'tag--amber';
            else if (e.relationship === 'inspired_by') relTag = 'tag--violet';
            return `
              <div style="padding: 6px 10px; background: var(--bg-tertiary); border: 1px solid var(--border-primary); border-radius: var(--radius-sm); margin-bottom: 4px; font-size: var(--text-xs); display: flex; align-items: center; justify-content: space-between;">
                <span class="text-truncate" style="max-width: 170px;">
                  ${isSource ? '→' : '←'} <strong>${escapeHtml(other ? other.title : 'Node')}</strong>
                </span>
                <span class="tag ${relTag}" style="font-size: 10px;">${escapeHtml(e.label || e.relationship)}</span>
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
          updateGraphVisualStates();
        }
      });
    } else if (inspectorPanel && inspectorBody) {
      inspectorPanel.classList.add('inspector--open');
      inspectorBody.innerHTML = inspectorContentHtml;
      attachInspectorHandlers(node);
    }
  }

  function attachInspectorHandlers(node) {
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
        if (typeof window !== 'undefined' && window.showToast) {
          window.showToast(`Updated custom gradient for "${node.title}".`, 'success');
        }
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
          if (typeof window !== 'undefined' && window.showToast) {
            window.showToast(`Reset gradient for "${node.title}".`, 'info');
          }
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
    updateGraphVisualStates();
  }

  const inspectorCloseBtn = document.getElementById('inspector-close-btn');
  if (inspectorCloseBtn) {
    inspectorCloseBtn.onclick = () => {
      closeInspector();
    };
  }

  // Initial render & optimal view framing
  renderAll();
  fitView(false);

  // Return lifecycle cleanup hook for router
  return () => {
    if (rafDragScheduled) cancelAnimationFrame(rafDragScheduled);
    if (rafTransformScheduled) cancelAnimationFrame(rafTransformScheduled);
    window.removeEventListener('contextmenu', handleContextMenu, true);
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mouseup', onMouseUp);
    themeObserver.disconnect();
    observer.disconnect();
    selectedNode = null;
    hoveredNode = null;
    if (window.Inspector) {
      window.Inspector.close('graph');
    }
  };
}

if (typeof window !== 'undefined') {
  window.renderGraphPage = renderGraphPage;
}
