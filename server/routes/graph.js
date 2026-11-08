const express = require('express');
const db = require('../config/database');
const authenticateToken = require('../middleware/auth');

const router = express.Router();
router.use(authenticateToken);

// GET /api/v1/graph
router.get('/', async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { project_id, types } = req.query;

    const allowedTypes = types ? types.split(',').map(t => t.trim().toLowerCase()) : ['note', 'project', 'task', 'research'];

    const nodes = [];
    const edges = [];
    const nodeIds = new Set();

    // 1. Projects
    if (allowedTypes.includes('project')) {
      let pSql = 'SELECT id, title, color, status FROM projects WHERE user_id = ?';
      const pParams = [userId];
      if (project_id) {
        pSql += ' AND id = ?';
        pParams.push(parseInt(project_id, 10));
      }
      const projects = await db.query(pSql, pParams);
      projects.forEach(p => {
        const nodeId = `project_${p.id}`;
        nodes.push({
          id: nodeId,
          rawId: p.id,
          type: 'project',
          title: p.title,
          color: p.color || '#7c5cbf',
          radius: 18,
          link: `#/projects/${p.id}`
        });
        nodeIds.add(nodeId);
      });
    }

    // 2. Notes
    if (allowedTypes.includes('note')) {
      let nSql = 'SELECT id, title, project_id, folder_id FROM notes WHERE user_id = ?';
      const nParams = [userId];
      if (project_id) {
        nSql += ' AND project_id = ?';
        nParams.push(parseInt(project_id, 10));
      }
      const notes = await db.query(nSql, nParams);
      notes.forEach(n => {
        const nodeId = `note_${n.id}`;
        nodes.push({
          id: nodeId,
          rawId: n.id,
          type: 'note',
          title: n.title,
          color: '#5b8fd9',
          radius: 12,
          projectId: n.project_id,
          link: `#/vault/${n.id}`
        });
        nodeIds.add(nodeId);

        // Edge: note belongs to project
        if (n.project_id && nodeIds.has(`project_${n.project_id}`)) {
          edges.push({
            id: `edge_p_${n.project_id}_n_${n.id}`,
            source: `project_${n.project_id}`,
            target: nodeId,
            relationship: 'part_of',
            label: 'part of'
          });
        }
      });

      // Wiki Links between notes
      const links = await db.query('SELECT source_note_id, target_note_id FROM note_links');
      links.forEach((l, idx) => {
        const src = `note_${l.source_note_id}`;
        const tgt = `note_${l.target_note_id}`;
        if (nodeIds.has(src) && nodeIds.has(tgt)) {
          edges.push({
            id: `wiki_link_${idx}_${l.source_note_id}_${l.target_note_id}`,
            source: src,
            target: tgt,
            relationship: 'related_to',
            label: 'links to'
          });
        }
      });
    }

    // 3. Tasks
    if (allowedTypes.includes('task')) {
      let tSql = 'SELECT id, title, project_id, status, priority FROM tasks WHERE user_id = ?';
      const tParams = [userId];
      if (project_id) {
        tSql += ' AND project_id = ?';
        tParams.push(parseInt(project_id, 10));
      }
      const tasks = await db.query(tSql, tParams);
      tasks.forEach(t => {
        const nodeId = `task_${t.id}`;
        nodes.push({
          id: nodeId,
          rawId: t.id,
          type: 'task',
          title: t.title,
          color: '#5dba6e',
          radius: 10,
          projectId: t.project_id,
          link: `#/workflow`
        });
        nodeIds.add(nodeId);

        if (t.project_id && nodeIds.has(`project_${t.project_id}`)) {
          edges.push({
            id: `edge_p_${t.project_id}_t_${t.id}`,
            source: `project_${t.project_id}`,
            target: nodeId,
            relationship: 'task_of',
            label: 'task of'
          });
        }
      });
    }

    // 4. Research Documents
    if (allowedTypes.includes('research')) {
      let rSql = 'SELECT id, title, project_id, file_type FROM research_documents WHERE user_id = ?';
      const rParams = [userId];
      if (project_id) {
        rSql += ' AND project_id = ?';
        rParams.push(parseInt(project_id, 10));
      }
      const research = await db.query(rSql, rParams);
      research.forEach(r => {
        const nodeId = `research_${r.id}`;
        nodes.push({
          id: nodeId,
          rawId: r.id,
          type: 'research',
          title: r.title,
          color: '#dba54a',
          radius: 12,
          projectId: r.project_id,
          link: `#/research`
        });
        nodeIds.add(nodeId);

        if (r.project_id && nodeIds.has(`project_${r.project_id}`)) {
          edges.push({
            id: `edge_p_${r.project_id}_r_${r.id}`,
            source: `project_${r.project_id}`,
            target: nodeId,
            relationship: 'references',
            label: 'references'
          });
        }
      });
    }

    // 5. Canonical Semantic Relationships from entity_links
    const entityLinks = await db.query(
      'SELECT id, source_type, source_id, target_type, target_id, link_type FROM entity_links WHERE user_id = ? AND deleted_at IS NULL',
      [userId]
    );
    const addedEdgePairs = new Set();
    entityLinks.forEach(el => {
      const src = `${el.source_type}_${el.source_id}`;
      const tgt = `${el.target_type}_${el.target_id}`;
      if (nodeIds.has(src) && nodeIds.has(tgt)) {
        const pairKey = src < tgt ? `${src}__${tgt}` : `${tgt}__${src}`;
        addedEdgePairs.add(pairKey);
        edges.push({
          id: `entity_link_${el.id}`,
          source: src,
          target: tgt,
          relationship: el.link_type,
          label: el.link_type.replace(/_/g, ' ')
        });
      }
    });

    // 6. Legacy Smart Connections fallback (skip if pair already added by entity_links)
    const smartConns = await db.query('SELECT * FROM smart_connections WHERE user_id = ?', [userId]);
    smartConns.forEach(sc => {
      const src = `${sc.source_type}_${sc.source_id}`;
      const tgt = `${sc.target_type}_${sc.target_id}`;
      const pairKey = src < tgt ? `${src}__${tgt}` : `${tgt}__${src}`;
      if (nodeIds.has(src) && nodeIds.has(tgt) && !addedEdgePairs.has(pairKey)) {
        addedEdgePairs.add(pairKey);
        edges.push({
          id: `smart_conn_${sc.id}`,
          source: src,
          target: tgt,
          relationship: sc.relationship,
          label: sc.relationship.replace(/_/g, ' ')
        });
      }
    });

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

