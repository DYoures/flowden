const express = require('express');
const db = require('../config/database');
const authenticateToken = require('../middleware/auth');
const SearchService = require('../services/searchService');

const router = express.Router();
router.use(authenticateToken);

// GET /api/v1/search?q=query
router.get('/', async (req, res, next) => {
  try {
    const queryStr = (req.query.q || '').trim();
    if (!queryStr) {
      return res.json({
        query: '',
        total: 0,
        results: { projects: [], notes: [], tasks: [], research: [], excerpts: [], boards: [], decisions: [] },
        entities: []
      });
    }

    // Authoritative MySQL Execution
    if (db.isConnectedToMySQL) {
      const entities = await SearchService.universalSearch(db, req.user.id, queryStr, {
        limit: parseInt(req.query.limit, 10) || 50
      });

      const results = {
        projects: [],
        notes: [],
        tasks: [],
        research: [],
        excerpts: [],
        boards: [],
        decisions: []
      };

      for (const ent of (entities || [])) {
        if (ent.entity_type === 'project') results.projects.push(ent);
        else if (ent.entity_type === 'note') results.notes.push(ent);
        else if (ent.entity_type === 'task') results.tasks.push(ent);
        else if (ent.entity_type === 'research') results.research.push(ent);
        else if (ent.entity_type === 'excerpt') results.excerpts.push(ent);
        else if (ent.entity_type === 'board') {
          let boardProjectId = ent.project_id || ent.primary_project_id || null;
          if (!boardProjectId && (ent.entity_id || ent.id)) {
            const bRows = await db.query(
              'SELECT project_id FROM boards WHERE id = ? AND deleted_at IS NULL LIMIT 1',
              [ent.entity_id || ent.id]
            );
            if (bRows && bRows[0] && bRows[0].project_id) {
              boardProjectId = bRows[0].project_id;
            }
          }
          ent.project_id = boardProjectId;
          ent.primary_project_id = ent.primary_project_id || boardProjectId;
          results.boards.push(ent);
        }
        else if (ent.entity_type === 'decision') results.decisions.push(ent);
      }

      return res.json({
        query: queryStr,
        total: (entities || []).length,
        results,
        entities: entities || []
      });
    }

    // Resilient Fallback Mode when MySQL is unavailable
    const projects = await db.query(
      'SELECT id, title, description, color, created_at FROM projects WHERE user_id = ?',
      [req.user.id]
    );

    const notes = await db.query(
      'SELECT id, title, content, is_pinned, created_at FROM notes WHERE user_id = ?',
      [req.user.id]
    );

    const tasks = await db.query(
      'SELECT id, title, description, status, priority, due_date FROM tasks WHERE user_id = ?',
      [req.user.id]
    );

    const research = await db.query(
      'SELECT id, title, original_filename, file_type, summary FROM research_documents WHERE user_id = ?',
      [req.user.id]
    );

    const boards = await db.query(
      'SELECT id, project_id, title, description, created_at FROM boards WHERE user_id = ?',
      [req.user.id]
    );

    const q = queryStr.toLowerCase();

    const matchedProjects = (projects || []).filter(p =>
      (p.title && p.title.toLowerCase().includes(q)) ||
      (p.description && p.description.toLowerCase().includes(q))
    );

    const matchedNotes = (notes || []).filter(n =>
      (n.title && n.title.toLowerCase().includes(q)) ||
      (n.content && n.content.toLowerCase().includes(q))
    );

    const matchedTasks = (tasks || []).filter(t =>
      (t.title && t.title.toLowerCase().includes(q)) ||
      (t.description && t.description.toLowerCase().includes(q))
    );

    const matchedResearch = (research || []).filter(r =>
      (r.title && r.title.toLowerCase().includes(q)) ||
      (r.summary && r.summary.toLowerCase().includes(q)) ||
      (r.original_filename && r.original_filename.toLowerCase().includes(q))
    );

    const matchedBoards = (boards || []).filter(b =>
      !b.deleted_at && (
        (b.title && b.title.toLowerCase().includes(q)) ||
        (b.description && b.description.toLowerCase().includes(q))
      )
    ).map(b => ({
      ...b,
      entity_type: 'board',
      entity_id: b.id,
      primary_project_id: b.project_id
    }));

    const total = matchedProjects.length + matchedNotes.length + matchedTasks.length + matchedResearch.length + matchedBoards.length;

    const entities = [
      ...matchedProjects.map(p => ({ id: p.id, entity_type: 'project', entity_id: p.id, title: p.title, owner_user_id: req.user.id })),
      ...matchedNotes.map(n => ({ id: n.id, entity_type: 'note', entity_id: n.id, title: n.title, owner_user_id: req.user.id })),
      ...matchedTasks.map(t => ({ id: t.id, entity_type: 'task', entity_id: t.id, title: t.title, owner_user_id: req.user.id })),
      ...matchedResearch.map(r => ({ id: r.id, entity_type: 'research', entity_id: r.id, title: r.title, owner_user_id: req.user.id })),
      ...matchedBoards.map(b => ({ id: b.id, entity_type: 'board', entity_id: b.id, project_id: b.project_id, primary_project_id: b.project_id, title: b.title, owner_user_id: req.user.id }))
    ];

    res.json({
      query: queryStr,
      total,
      results: {
        projects: matchedProjects,
        notes: matchedNotes,
        tasks: matchedTasks,
        research: matchedResearch,
        excerpts: [],
        boards: matchedBoards,
        decisions: []
      },
      entities
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/search/autocomplete?q=query
router.get('/autocomplete', async (req, res, next) => {
  try {
    const queryStr = (req.query.q || '').trim();
    if (!queryStr) {
      return res.json({ suggestions: [] });
    }

    if (db.isConnectedToMySQL) {
      const suggestions = await SearchService.autocompleteWikilinks(db, req.user.id, queryStr);
      return res.json({ suggestions: suggestions || [] });
    }

    // Fallback autocomplete
    const notes = await db.query('SELECT id, title FROM notes WHERE user_id = ?', [req.user.id]);
    const q = queryStr.toLowerCase();
    const suggestions = (notes || [])
      .filter(n => n.title && n.title.toLowerCase().includes(q))
      .map(n => ({
        id: n.id,
        entity_type: 'note',
        entity_id: n.id,
        title: n.title,
        wikilink: `[[note:${n.id}|${n.title}]]`
      }));

    res.json({ suggestions });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/search/backlinks?type=:type&id=:id
router.get('/backlinks', async (req, res, next) => {
  try {
    const { type, id } = req.query;
    if (!type || !id) {
      return res.status(400).json({ error: 'Missing type or id' });
    }

    if (db.isConnectedToMySQL) {
      const backlinks = await SearchService.getBacklinks(db, req.user.id, {
        entityType: type,
        entityId: parseInt(id, 10)
      });
      return res.json({ backlinks: backlinks || [] });
    }

    // Fallback backlinks
    if (type === 'note') {
      const links = await db.query(
        'SELECT nl.*, n.title AS source_title FROM note_links nl JOIN notes n ON n.id = nl.source_note_id WHERE nl.target_note_id = ?',
        [parseInt(id, 10)]
      );
      return res.json({ backlinks: links || [] });
    }

    res.json({ backlinks: [] });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
