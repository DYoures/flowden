const express = require('express');
const db = require('../config/database');
const authenticateToken = require('../middleware/auth');
const SearchService = require('../services/searchService');

const router = express.Router();
router.use(authenticateToken);

// GET /api/v1/graph - Knowledge Graph using Canonical SearchService & Entity Pipeline
router.get('/', async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { project_id, types } = req.query;

    const allowedTypes = types
      ? types.split(',').map(t => t.trim().toLowerCase())
      : ['note', 'project', 'task', 'research'];

    const activeProjectId = project_id ? parseInt(project_id, 10) : null;
    const graphOptions = activeProjectId ? { activeProjectId } : {};

    const rawGraph = await SearchService.getGraph(db, userId, graphOptions);

    // Fetch folder info for notes
    const noteFolderMap = new Map();
    try {
      const noteRows = await db.query(`
        SELECT n.id, n.folder_id, f.name AS folder_name
        FROM notes n
        LEFT JOIN note_folders f ON f.id = n.folder_id
        WHERE n.deleted_at IS NULL
      `);
      const rows = Array.isArray(noteRows[0]) ? noteRows[0] : noteRows;
      for (const nr of rows) {
        noteFolderMap.set(nr.id, {
          folderId: nr.folder_id || null,
          folderName: nr.folder_name || null
        });
      }
    } catch (e) {
      console.warn('Could not query note folders for graph:', e.message);
    }

    const nodes = [];
    const edges = [];
    const nodeIds = new Set();

    // 1. Format Nodes
    for (const n of (rawGraph.nodes || [])) {
      if (!allowedTypes.includes(n.entity_type)) continue;

      const rawId = n.entity_id;
      const type = n.entity_type;
      const nodeId = `${type}_${rawId}`;

      let color = '#7c5cbf';
      let radius = 12;
      let link = `#/${type}`;

      if (type === 'project') {
        color = '#7c5cbf';
        radius = 24; // Anchor node prominence
        link = `#/projects/${rawId}`;
      } else if (type === 'note') {
        color = '#5b8fd9';
        radius = 15;
        link = `#/vault/${rawId}`;
      } else if (type === 'task') {
        color = '#5dba6e';
        radius = 12;
        link = `#/workflow`;
      } else if (type === 'research') {
        color = '#dba54a';
        radius = 14;
        link = `#/research`;
      }

      const folderInfo = type === 'note' ? (noteFolderMap.get(rawId) || {}) : {};

      nodes.push({
        id: nodeId,
        rawId,
        type,
        title: n.title || 'Untitled',
        color,
        radius,
        projectId: n.primary_project_id || null,
        folderId: folderInfo.folderId || null,
        folderName: folderInfo.folderName || null,
        link
      });
      nodeIds.add(nodeId);
    }

    // 2. Synthesize 'part_of' Project Edges when entity has primary_project_id and project node exists
    for (const n of (rawGraph.nodes || [])) {
      if (!allowedTypes.includes(n.entity_type)) continue;
      if (n.entity_type === 'project') continue;

      if (n.primary_project_id) {
        const projNodeId = `project_${n.primary_project_id}`;
        const entityNodeId = `${n.entity_type}_${n.entity_id}`;

        if (nodeIds.has(projNodeId) && nodeIds.has(entityNodeId)) {
          const rel = n.entity_type === 'task' ? 'task_of' : (n.entity_type === 'research' ? 'references' : 'part_of');
          const label = n.entity_type === 'task' ? 'task of' : (n.entity_type === 'research' ? 'references' : 'part of');
          edges.push({
            id: `edge_p_${n.primary_project_id}_${n.entity_type}_${n.entity_id}`,
            source: projNodeId,
            target: entityNodeId,
            relationship: rel,
            label,
            isStructural: true
          });
        }
      }
    }

    // 3. Canonical Semantic Edges from entity_links (SearchService.getGraph already filters deleted_at IS NULL and is_confirmed = TRUE)
    const seenEdgePairs = new Set();
    for (const el of (rawGraph.edges || [])) {
      if (el.origin === 'ai_suggested' && !el.is_confirmed) {
        continue; // Exclude unconfirmed AI edges
      }

      const src = `${el.source_type}_${el.source_id}`;
      const tgt = `${el.target_type}_${el.target_id}`;

      if (nodeIds.has(src) && nodeIds.has(tgt)) {
        const pairKey = `${src}__${tgt}__${el.link_type}`;
        if (seenEdgePairs.has(pairKey)) continue;
        seenEdgePairs.add(pairKey);

        edges.push({
          id: `edge_${el.id}`,
          source: src,
          target: tgt,
          relationship: el.link_type,
          label: String(el.link_type || 'related_to').replace(/_/g, ' '),
          isStructural: false
        });
      }
    }

    // 4. Synthesize note -> research 'cites' edges for research documents cited in notes
    try {
      const noteContents = await db.query(`
        SELECT n.id, n.project_id, n.content
        FROM notes n
        WHERE n.project_id IS NOT NULL AND n.deleted_at IS NULL
      `);
      const nRows = Array.isArray(noteContents[0]) ? noteContents[0] : noteContents;

      const researchByProject = new Map();
      const resDocs = await db.query(`
        SELECT r.id, r.project_id, r.title
        FROM research_documents r
        WHERE r.project_id IS NOT NULL AND r.deleted_at IS NULL
        ORDER BY r.id ASC
      `);
      const rRows = Array.isArray(resDocs[0]) ? resDocs[0] : resDocs;
      for (const rd of rRows) {
        if (!researchByProject.has(rd.project_id)) researchByProject.set(rd.project_id, []);
        researchByProject.get(rd.project_id).push(rd);
      }

      for (const n of nRows) {
        if (!n.content || !researchByProject.has(n.project_id)) continue;
        const projectResearch = researchByProject.get(n.project_id);
        const noteNodeId = `note_${n.id}`;
        if (!nodeIds.has(noteNodeId)) continue;

        // Find citation patterns [src-1], [src-2] etc.
        const srcMatches = n.content.match(/\[src-(\d+)\]/g);
        if (srcMatches) {
          const matchedIndices = new Set(srcMatches.map(m => parseInt(m.replace(/[^\d]/g, ''), 10) - 1));
          matchedIndices.forEach(idx => {
            if (idx >= 0 && idx < projectResearch.length) {
              const targetDoc = projectResearch[idx];
              const targetNodeId = `research_${targetDoc.id}`;
              if (nodeIds.has(targetNodeId)) {
                const edgeKey = `${noteNodeId}__${targetNodeId}__cites`;
                if (!seenEdgePairs.has(edgeKey)) {
                  seenEdgePairs.add(edgeKey);
                  edges.push({
                    id: `edge_cite_${n.id}_${targetDoc.id}`,
                    source: noteNodeId,
                    target: targetNodeId,
                    relationship: 'cites',
                    label: 'cites',
                    isStructural: false
                  });
                }
              }
            }
          });
        }
      }
    } catch (citeErr) {
      console.warn('Could not synthesize citation edges for graph:', citeErr.message);
    }

    res.json({
      nodes,
      edges,
      stats: {
        totalNodes: nodes.length,
        totalEdges: edges.length
      }
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
