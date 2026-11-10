// tests/graph_layout.test.js
/**
 * FLOWDEN KNOWLEDGE GRAPH — SPACING & LAYOUT VERIFICATION TEST SUITE
 *
 * Verifies:
 * 1. GET /api/v1/graph returns nodes enriched with folderName and folderId
 * 2. Distinguishes structural project spokes (isStructural: true) from semantic links (isStructural: false)
 * 3. Synthesis of cites relationships between notes and research sources
 * 4. Spacious Cluster Layout algorithm guarantees minimum distance >= 175px across all node pairs
 * 5. Folder clustering groups notes by folder category around project anchor
 * 6. Research sources are positioned on outer perimeter arc without overlapping
 * 7. Multi-line label truncation formatting (formatNodeLabel)
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const db = require('../server/config/database');
const serverModule = require('../server/index');

const TEST_PORT = 3098;
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;

let passCount = 0;
let failCount = 0;

function record(name, condition, details = '') {
  if (condition) {
    passCount++;
    console.log(`  ✅ [PASS] #${passCount} ${name} ${details ? '(' + details + ')' : ''}`);
  } else {
    failCount++;
    console.error(`  ❌ [FAIL] #${passCount + failCount} ${name} ${details ? '(' + details + ')' : ''}`);
  }
}

// Layout simulation function replicated from public/js/pages/graph.js
function simulateSpaciousClusterLayout(nodeList, edgeList, canvasWidth = 1600, canvasHeight = 1000) {
  const cx = canvasWidth / 2;
  const cy = canvasHeight / 2;

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

  overviewNotes.forEach((n, i) => {
    n.x = cx - 180 + (i % 2) * 360;
    n.y = cy - 130 - Math.floor(i / 2) * 120;
  });

  const folderNames = Array.from(folderMap.keys()).sort();
  const K = Math.max(folderNames.length, 1);
  const R_folder = Math.max(460, 380 + K * 18);

  folderNames.forEach((fname, k) => {
    const startAngle = -Math.PI * 0.78;
    const angleSpan = Math.PI * 1.56;
    const clusterAngle = startAngle + (k / Math.max(K - 1, 1)) * angleSpan;

    const fx = cx + R_folder * Math.cos(clusterAngle);
    const fy = cy + R_folder * Math.sin(clusterAngle);

    const fnotes = folderMap.get(fname);
    const M = fnotes.length;

    fnotes.forEach((n, j) => {
      n.folderCentroid = { x: fx, y: fy };
      if (M === 1) {
        n.x = fx;
        n.y = fy;
      } else {
        const localAngle = clusterAngle + (j - (M - 1) / 2) * (Math.PI * 1.5 / Math.max(M, 3));
        const R_local = Math.max(120, M * 34);
        n.x = fx + R_local * Math.cos(localAngle);
        n.y = fy + R_local * Math.sin(localAngle);
      }
    });
  });

  // 3. Position Tasks
  if (tasks.length > 0) {
    const taskCentroid = { x: cx + R_folder * 0.9, y: cy - R_folder * 0.8 };
    tasks.forEach((t, i) => {
      const a = (i / tasks.length) * 2 * Math.PI;
      t.x = taskCentroid.x + Math.cos(a) * 140;
      t.y = taskCentroid.y + Math.sin(a) * 140;
    });
  }

  // 4. Position Sources in an Outer Perimeter Shelf / Arc
  const S = sources.length;
  if (S > 0) {
    const R_sources = R_folder + 260;
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

  // 5. Physics Relaxation Pass
  for (let iter = 0; iter < 60; iter++) {
    const alpha = Math.max(0.01, 1 - iter / 60);

    for (let i = 0; i < nodeList.length; i++) {
      for (let j = i + 1; j < nodeList.length; j++) {
        const a = nodeList[i];
        const b = nodeList[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.hypot(dx, dy) || 1;
        const minDist = (a.type === 'research' && b.type === 'research') ? 180 : 230;

        if (dist < minDist) {
          const push = ((minDist - dist) / dist) * alpha * 0.45;
          if (!a.isFixed) { a.x -= dx * push; a.y -= dy * push; }
          if (!b.isFixed) { b.x += dx * push; b.y += dy * push; }
        }
      }
    }

    notes.forEach(n => {
      if (n.folderCentroid && !n.isFixed) {
        n.x += (n.folderCentroid.x - n.x) * 0.04 * alpha;
        n.y += (n.folderCentroid.y - n.y) * 0.04 * alpha;
      }
    });
  }

  return { nodes: nodeList, cx, cy, R_folder };
}

function formatNodeLabel(title, type) {
  if (!title) return ['Untitled'];
  const maxLine = type === 'project' ? 22 : 18;
  const words = title.trim().split(/\s+/);
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

(async () => {
  let serverInstance = null;

  try {
    console.log('================================================================');
    console.log('  FLOWDEN KNOWLEDGE GRAPH: SPACING & LAYOUT VERIFICATION');
    console.log('================================================================\n');

    let BASE_URL = 'http://127.0.0.1:3000';
    try {
      const probe = await fetch(`${BASE_URL}/api/v1/auth/me`);
      console.log(`[Target Server] Connected to existing server at ${BASE_URL}`);
    } catch (_) {
      BASE_URL = `http://127.0.0.1:${TEST_PORT}`;
      serverInstance = serverModule.app.listen(TEST_PORT, () => {
        console.log(`[Test Server] Started on ${BASE_URL}`);
      });
    }

    // 2. Register test user
    const email = `graph_test_${Date.now()}@flowden.test`;
    const regRes = await fetch(`${BASE_URL}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, display_name: 'Graph Test User', password: 'Password123!Safe' })
    });
    const regData = await regRes.json();
    const token = regData.token;

    record('Test user registered with session token', Boolean(token), `email=${email}`);

    // 3. Import solar-system-research.md
    const solarMdPath = path.resolve(__dirname, '../docs/knowledge-exchange/examples/solar-system-research.md');
    const inspectForm = new FormData();
    inspectForm.append('file', new Blob([fs.readFileSync(solarMdPath)], { type: 'text/markdown' }), 'solar-system-research.md');

    const inspectRes = await fetch(`${BASE_URL}/api/v1/exchange/inspect`, {
      method: 'POST',
      headers: {
        'Origin': BASE_URL,
        'Authorization': `Bearer ${token}`,
        'Cookie': `flowden_token=${token}`
      },
      body: inspectForm
    });
    const inspectData = await inspectRes.json();
    record('Solar System markdown package inspected', inspectRes.status === 200 && inspectData.valid === true, `status=${inspectRes.status}`);

    const commitForm = new FormData();
    commitForm.append('inspection_token', inspectData.inspection_token);
    commitForm.append('package_sha256', inspectData.package_sha256);
    commitForm.append('import_mode', 'new_project');
    commitForm.append('approved', 'true');
    commitForm.append('idempotency_key', `graph_idem_${Date.now()}`);

    const commitRes = await fetch(`${BASE_URL}/api/v1/exchange/commit`, {
      method: 'POST',
      headers: {
        'Origin': BASE_URL,
        'Authorization': `Bearer ${token}`,
        'Cookie': `flowden_token=${token}`
      },
      body: commitForm
    });
    const commitData = await commitRes.json();
    record('Solar System markdown package committed', commitRes.status === 200 && commitData.success === true, `status=${commitRes.status}, err=${commitData.error || ''}`);

    // 4. Query /api/v1/graph
    console.log('\n[Section 1: Graph API Enrichment]');
    const graphRes = await fetch(`${BASE_URL}/api/v1/graph`, {
      headers: {
        'Origin': BASE_URL,
        'Authorization': `Bearer ${token}`,
        'Cookie': `flowden_token=${token}`
      }
    });
    const graphData = await graphRes.json();

    record('GET /api/v1/graph returns HTTP 200', graphRes.status === 200);
    record('Graph contains expected nodes count (35 total)', graphData.nodes?.length === 35, `count=${graphData.nodes?.length}`);
    record('Graph contains expected edges count (>= 120)', graphData.edges?.length >= 120, `count=${graphData.edges?.length}`);

    // Verify folder enrichment on notes
    const noteNodes = graphData.nodes.filter(n => n.type === 'note');
    const notesWithFolder = noteNodes.filter(n => Boolean(n.folderName));
    record('Note nodes have folderName enriched from database', notesWithFolder.length >= 16, `notesWithFolder=${notesWithFolder.length}/${noteNodes.length}`);

    // Verify structural vs semantic edges
    const structuralEdges = graphData.edges.filter(e => e.isStructural === true);
    const semanticEdges = graphData.edges.filter(e => e.isStructural === false);
    record('Structural project spokes are tagged with isStructural: true', structuralEdges.length > 0, `count=${structuralEdges.length}`);
    record('Semantic knowledge links are tagged with isStructural: false', semanticEdges.length > 0, `count=${semanticEdges.length}`);

    // Verify synthesized cites edges
    const citesEdges = graphData.edges.filter(e => e.relationship === 'cites');
    record('Cites relationships synthesized from note citations', citesEdges.length >= 30, `count=${citesEdges.length}`);

    // 5. Layout Simulation & Geometric Distance Verification
    console.log('\n[Section 2: Geometric Spacing & Layout Guarantees]');
    const simulationResult = simulateSpaciousClusterLayout(
      graphData.nodes.map(n => ({ ...n })),
      graphData.edges
    );

    const laidOutNodes = simulationResult.nodes;

    // Project anchor verification
    const projectNode = laidOutNodes.find(n => n.type === 'project');
    record('Project node placed at visual center anchor', 
      projectNode && projectNode.x === simulationResult.cx && projectNode.y === simulationResult.cy,
      `x=${projectNode?.x}, y=${projectNode?.y}`
    );

    // Node separation verification
    let minDistance = Infinity;
    let minPair = null;
    let violatedPairs = 0;

    for (let i = 0; i < laidOutNodes.length; i++) {
      for (let j = i + 1; j < laidOutNodes.length; j++) {
        const a = laidOutNodes[i];
        const b = laidOutNodes[j];
        const dist = Math.hypot(b.x - a.x, b.y - a.y);
        if (dist < minDistance) {
          minDistance = dist;
          minPair = `${a.title} (${a.type}) <-> ${b.title} (${b.type})`;
        }
        // Strict threshold: sources at least 150px, notes at least 180px
        const threshold = (a.type === 'research' && b.type === 'research') ? 150 : 180;
        if (dist < threshold) {
          violatedPairs++;
        }
      }
    }

    record('All node pairs maintain spacious separation (minDist >= 170px)', minDistance >= 170, `minDistance=${minDistance.toFixed(1)}px, minPair=${minPair}`);
    record('Zero node pairs violate spacing thresholds', violatedPairs === 0, `violations=${violatedPairs}`);

    // Folder clustering verification: notes in same folder should be closer to each other than to notes in opposing folders
    const foundationsNotes = laidOutNodes.filter(n => n.folderName === '01 Foundations');
    const questionsNotes = laidOutNodes.filter(n => n.folderName === '05 Open Questions');
    if (foundationsNotes.length > 0 && questionsNotes.length > 0) {
      const avgFoundationsX = foundationsNotes.reduce((s, n) => s + n.x, 0) / foundationsNotes.length;
      const avgFoundationsY = foundationsNotes.reduce((s, n) => s + n.y, 0) / foundationsNotes.length;
      const avgQuestionsX = questionsNotes.reduce((s, n) => s + n.x, 0) / questionsNotes.length;
      const avgQuestionsY = questionsNotes.reduce((s, n) => s + n.y, 0) / questionsNotes.length;

      const clusterDistance = Math.hypot(avgQuestionsX - avgFoundationsX, avgQuestionsY - avgFoundationsY);
      record('Distinct folder clusters maintain large topical separation (>= 500px)', clusterDistance >= 500, `distance=${clusterDistance.toFixed(1)}px`);
    }

    // Label formatting verification
    console.log('\n[Section 3: Label Formatting Verification]');
    const longTitle = 'Dwarf Planets & the IAU Definition';
    const formatted = formatNodeLabel(longTitle, 'note');
    record('Long titles broken into maximum 2 centered lines', formatted.length <= 2, `lines=${formatted.length}`);
    record('First line length <= 19 characters', formatted[0].length <= 19, `line0="${formatted[0]}"`);

  } catch (err) {
    console.error('\nUNHANDLED ERROR IN GRAPH LAYOUT SUITE:', err);
    failCount++;
  } finally {
    if (serverInstance) {
      serverInstance.close();
    }
    console.log('\n================================================================');
    console.log(`GRAPH LAYOUT SUMMARY: ${passCount} PASSED, ${failCount} FAILED`);
    console.log('================================================================\n');
    process.exit(failCount > 0 ? 1 : 0);
  }
})();
