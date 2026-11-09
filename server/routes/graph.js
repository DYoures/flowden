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
        radius = 18;
        link = `#/projects/${rawId}`;
      } else if (type === 'note') {
        color = '#5b8fd9';
        radius = 12;
        link = `#/vault/${rawId}`;
      } else if (type === 'task') {
        color = '#5dba6e';
        radius = 10;
        link = `#/workflow`;
      } else if (type === 'research') {
        color = '#dba54a';
        radius = 12;
        link = `#/research`;
      }

      nodes.push({
        id: nodeId,
        rawId,
        type,
        title: n.title || 'Untitled',
        color,
        radius,
        projectId: n.primary_project_id || null,
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
            label
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
          label: String(el.link_type || 'related_to').replace(/_/g, ' ')
        });
      }
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
