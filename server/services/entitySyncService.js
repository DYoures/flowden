// server/services/entitySyncService.js
const crypto = require('crypto');

/**
 * Utility to extract clean plain text from markdown for search_text
 */
function stripMarkdown(md) {
  if (!md) return '';
  return md
    .replace(/^#+\s+/gm, '')
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/(\*|_)(.*?)\1/g, '$2')
    .replace(/\[\[(?:[^|\]]*\|)?([^\]]+)\]\]/g, '$1') // wikilinks: keep alias or target
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/`{1,3}[^`]*`{1,3}/g, '')
    .replace(/>\s+/gm, '')
    .trim();
}

/**
 * Helper to normalize query results
 */
function extractRows(result) {
  if (!result) return [];
  if (Array.isArray(result) && Array.isArray(result[0])) return result[0];
  if (Array.isArray(result)) return result;
  return [];
}

class EntitySyncService {
  /**
   * Synchronize a Note with the canonical entities registry and project_entities
   */
  static async syncNoteEntity(dbOrConn, noteId, userId) {
    const rawNote = await dbOrConn.query(
      'SELECT id, user_id, project_id, title, content, is_pinned, created_at, updated_at FROM notes WHERE id = ? LIMIT 1',
      [noteId]
    );
    const noteRows = extractRows(rawNote);
    if (!noteRows || noteRows.length === 0) return null;
    const note = noteRows[0];

    const cleanTitle = (note.title || 'Untitled Note').trim();
    const searchText = stripMarkdown(note.content || '');
    const projectId = note.project_id ? parseInt(note.project_id, 10) : null;

    // Check if canonical entity exists and retrieve previous primary_project_id
    const rawExisting = await dbOrConn.query(
      'SELECT id, primary_project_id FROM entities WHERE entity_type = "note" AND entity_id = ? LIMIT 1',
      [noteId]
    );
    const existingRows = extractRows(rawExisting);
    const prevPrimaryProjectId = existingRows && existingRows.length > 0 && existingRows[0].primary_project_id
      ? parseInt(existingRows[0].primary_project_id, 10)
      : null;

    // Primary Project Reassignment:
    // If the primary project changed (or was cleared to null), remove the association belonging
    // to the previous primary Project. Unrelated explicit secondary associations are strictly preserved.
    if (prevPrimaryProjectId && prevPrimaryProjectId !== projectId) {
      await dbOrConn.query(
        'DELETE FROM project_entities WHERE entity_type = "note" AND entity_id = ? AND project_id = ?',
        [noteId, prevPrimaryProjectId]
      );
    }

    if (existingRows && existingRows.length > 0) {
      await dbOrConn.query(
        'UPDATE entities SET title = ?, search_text = ?, primary_project_id = ?, deleted_at = NULL, updated_at = NOW() WHERE entity_type = "note" AND entity_id = ?',
        [cleanTitle, searchText, projectId, noteId]
      );
    } else {
      const uuid = crypto.randomUUID();
      await dbOrConn.query(
        'INSERT INTO entities (uuid, entity_type, entity_id, owner_user_id, primary_project_id, title, search_text, created_at, updated_at) VALUES (?, "note", ?, ?, ?, ?, ?, NOW(), NOW())',
        [uuid, noteId, userId || note.user_id, projectId, cleanTitle, searchText]
      );
    }

    // Ensure the primary association exists in project_entities if assigned to a Project
    if (projectId) {
      await dbOrConn.query(
        `INSERT INTO project_entities (project_id, entity_type, entity_id, access_role, added_by, created_at)
         VALUES (?, 'note', ?, 'admin', ?, NOW())
         ON DUPLICATE KEY UPDATE project_entities.access_role = project_entities.access_role`,
        [projectId, noteId, userId || note.user_id]
      );
    }
  }

  /**
   * Synchronize a Task with the canonical entities registry and project_entities
   */
  static async syncTaskEntity(dbOrConn, taskId, userId) {
    const rawTask = await dbOrConn.query(
      'SELECT id, user_id, project_id, title, description, status, priority, due_date, created_at FROM tasks WHERE id = ? LIMIT 1',
      [taskId]
    );
    const taskRows = extractRows(rawTask);
    if (!taskRows || taskRows.length === 0) return null;
    const task = taskRows[0];

    const cleanTitle = (task.title || 'Untitled Task').trim();
    const searchText = (task.description || '').trim();
    const projectId = task.project_id ? parseInt(task.project_id, 10) : null;

    // Check if canonical entity exists and retrieve previous primary_project_id
    const rawExisting = await dbOrConn.query(
      'SELECT id, primary_project_id FROM entities WHERE entity_type = "task" AND entity_id = ? LIMIT 1',
      [taskId]
    );
    const existingRows = extractRows(rawExisting);
    const prevPrimaryProjectId = existingRows && existingRows.length > 0 && existingRows[0].primary_project_id
      ? parseInt(existingRows[0].primary_project_id, 10)
      : null;

    // Primary Project Reassignment:
    // If the primary project changed, remove ONLY the previous primary project association.
    if (prevPrimaryProjectId && prevPrimaryProjectId !== projectId) {
      await dbOrConn.query(
        'DELETE FROM project_entities WHERE entity_type = "task" AND entity_id = ? AND project_id = ?',
        [taskId, prevPrimaryProjectId]
      );
    }

    if (existingRows && existingRows.length > 0) {
      await dbOrConn.query(
        'UPDATE entities SET title = ?, search_text = ?, primary_project_id = ?, deleted_at = NULL, updated_at = NOW() WHERE entity_type = "task" AND entity_id = ?',
        [cleanTitle, searchText, projectId, taskId]
      );
    } else {
      const uuid = crypto.randomUUID();
      await dbOrConn.query(
        'INSERT INTO entities (uuid, entity_type, entity_id, owner_user_id, primary_project_id, title, search_text, created_at, updated_at) VALUES (?, "task", ?, ?, ?, ?, ?, NOW(), NOW())',
        [uuid, taskId, userId || task.user_id, projectId, cleanTitle, searchText]
      );
    }

    if (projectId) {
      await dbOrConn.query(
        `INSERT INTO project_entities (project_id, entity_type, entity_id, access_role, added_by, created_at)
         VALUES (?, 'task', ?, 'admin', ?, NOW())
         ON DUPLICATE KEY UPDATE project_entities.access_role = project_entities.access_role`,
        [projectId, taskId, userId || task.user_id]
      );
    }
  }

  /**
   * Synchronize a Project with the canonical entities registry
   * (Note: Projects are root containers; NEVER inserted into project_entities)
   */
  static async syncProjectEntity(dbOrConn, projectId, userId) {
    const rawProj = await dbOrConn.query(
      'SELECT id, user_id, title, description, status FROM projects WHERE id = ? LIMIT 1',
      [projectId]
    );
    const projRows = extractRows(rawProj);
    if (!projRows || projRows.length === 0) return null;
    const project = projRows[0];

    const cleanTitle = (project.title || 'Untitled Project').trim();
    const searchText = (project.description || '').trim();

    const rawExisting = await dbOrConn.query(
      'SELECT id FROM entities WHERE entity_type = "project" AND entity_id = ? LIMIT 1',
      [projectId]
    );
    const existingRows = extractRows(rawExisting);

    if (existingRows && existingRows.length > 0) {
      await dbOrConn.query(
        'UPDATE entities SET title = ?, search_text = ?, primary_project_id = ?, deleted_at = NULL, updated_at = NOW() WHERE entity_type = "project" AND entity_id = ?',
        [cleanTitle, searchText, projectId, projectId]
      );
    } else {
      const uuid = crypto.randomUUID();
      await dbOrConn.query(
        'INSERT INTO entities (uuid, entity_type, entity_id, owner_user_id, primary_project_id, title, search_text, created_at, updated_at) VALUES (?, "project", ?, ?, ?, ?, ?, NOW(), NOW())',
        [uuid, projectId, userId || project.user_id, projectId, cleanTitle, searchText]
      );
    }
  }

  /**
   * Synchronize a Board with the canonical entities registry and project_entities
   */
  static async syncBoardEntity(dbOrConn, boardId, userId) {
    const rawBoard = await dbOrConn.query(
      'SELECT id, user_id, project_id, title, description FROM boards WHERE id = ? LIMIT 1',
      [boardId]
    );
    const boardRows = extractRows(rawBoard);
    if (!boardRows || boardRows.length === 0) return null;
    const board = boardRows[0];

    const cleanTitle = (board.title || 'Untitled Board').trim();
    const searchText = (board.description || '').trim();
    const projectId = board.project_id ? parseInt(board.project_id, 10) : null;

    const rawExisting = await dbOrConn.query(
      'SELECT id FROM entities WHERE entity_type = "board" AND entity_id = ? LIMIT 1',
      [boardId]
    );
    const existingRows = extractRows(rawExisting);

    if (existingRows && existingRows.length > 0) {
      await dbOrConn.query(
        'UPDATE entities SET title = ?, search_text = ?, primary_project_id = ?, deleted_at = NULL, updated_at = NOW() WHERE entity_type = "board" AND entity_id = ?',
        [cleanTitle, searchText, projectId, boardId]
      );
    } else {
      const uuid = crypto.randomUUID();
      await dbOrConn.query(
        'INSERT INTO entities (uuid, entity_type, entity_id, owner_user_id, primary_project_id, title, search_text, created_at, updated_at) VALUES (?, "board", ?, ?, ?, ?, ?, NOW(), NOW())',
        [uuid, boardId, userId || board.user_id, projectId, cleanTitle, searchText]
      );
    }

    if (projectId) {
      await dbOrConn.query(
        `INSERT INTO project_entities (project_id, entity_type, entity_id, access_role, added_by, created_at)
         VALUES (?, 'board', ?, 'contributor', ?, NOW())
         ON DUPLICATE KEY UPDATE project_entities.access_role = project_entities.access_role`,
        [projectId, boardId, userId || board.user_id]
      );
    }
  }

  /**
   * Synchronize a Research Document with the canonical entities registry and project_entities
   */
  static async syncResearchEntity(dbOrConn, researchId, userId) {
    const rawRes = await dbOrConn.query(
      'SELECT id, user_id, project_id, title, summary, content_text FROM research_documents WHERE id = ? LIMIT 1',
      [researchId]
    );
    const resRows = extractRows(rawRes);
    if (!resRows || resRows.length === 0) return null;
    const doc = resRows[0];

    const cleanTitle = (doc.title || 'Untitled Research').trim();
    const searchText = `${doc.title || ''} ${doc.summary || ''} ${(doc.content_text || '').slice(0, 500)}`.trim();
    const projectId = doc.project_id ? parseInt(doc.project_id, 10) : null;

    const rawExisting = await dbOrConn.query(
      'SELECT id, primary_project_id FROM entities WHERE entity_type = "research" AND entity_id = ? LIMIT 1',
      [researchId]
    );
    const existingRows = extractRows(rawExisting);
    const prevPrimaryProjectId = existingRows && existingRows.length > 0 && existingRows[0].primary_project_id
      ? parseInt(existingRows[0].primary_project_id, 10)
      : null;

    if (prevPrimaryProjectId && prevPrimaryProjectId !== projectId) {
      await dbOrConn.query(
        'DELETE FROM project_entities WHERE entity_type = "research" AND entity_id = ? AND project_id = ?',
        [researchId, prevPrimaryProjectId]
      );
    }

    if (existingRows && existingRows.length > 0) {
      await dbOrConn.query(
        'UPDATE entities SET title = ?, search_text = ?, primary_project_id = ?, deleted_at = NULL, updated_at = NOW() WHERE entity_type = "research" AND entity_id = ?',
        [cleanTitle, searchText, projectId, researchId]
      );
    } else {
      const uuid = crypto.randomUUID();
      await dbOrConn.query(
        'INSERT INTO entities (uuid, entity_type, entity_id, owner_user_id, primary_project_id, title, search_text, created_at, updated_at) VALUES (?, "research", ?, ?, ?, ?, ?, NOW(), NOW())',
        [uuid, researchId, userId || doc.user_id, projectId, cleanTitle, searchText]
      );
    }

    if (projectId) {
      await dbOrConn.query(
        `INSERT INTO project_entities (project_id, entity_type, entity_id, access_role, added_by, created_at)
         VALUES (?, 'research', ?, 'contributor', ?, NOW())
         ON DUPLICATE KEY UPDATE project_entities.access_role = project_entities.access_role`,
        [projectId, researchId, userId || doc.user_id]
      );
    }
  }

  /**
   * Explicitly attach an entity to an authorized secondary project
   */
  static async addProjectAssociation(dbOrConn, projectId, entityType, entityId, accessRole = 'contributor', addedBy = null) {
    const pId = parseInt(projectId, 10);
    const eId = parseInt(entityId, 10);
    if (!pId || !eId) throw new Error('Valid projectId and entityId required');
    await dbOrConn.query(
      `INSERT INTO project_entities (project_id, entity_type, entity_id, access_role, added_by, created_at)
       VALUES (?, ?, ?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE access_role = VALUES(access_role)`,
      [pId, entityType, eId, accessRole, addedBy]
    );
  }

  /**
   * Explicitly remove an entity association from a specific project
   */
  static async removeProjectAssociation(dbOrConn, projectId, entityType, entityId) {
    const pId = parseInt(projectId, 10);
    const eId = parseInt(entityId, 10);
    if (!pId || !eId) throw new Error('Valid projectId and entityId required');
    await dbOrConn.query(
      'DELETE FROM project_entities WHERE project_id = ? AND entity_type = ? AND entity_id = ?',
      [pId, entityType, eId]
    );
  }

  /**
   * Retrieve all project associations for an entity
   */
  static async getProjectAssociations(dbOrConn, entityType, entityId) {
    const eId = parseInt(entityId, 10);
    const raw = await dbOrConn.query(
      'SELECT pe.*, p.title as project_title FROM project_entities pe JOIN projects p ON p.id = pe.project_id WHERE pe.entity_type = ? AND pe.entity_id = ? ORDER BY pe.id ASC',
      [entityType, eId]
    );
    return extractRows(raw);
  }

  /**
   * Soft-delete or remove canonical entity when note is deleted
   */
  static async deleteNoteEntity(dbOrConn, noteId) {
    await dbOrConn.query(
      'UPDATE entities SET deleted_at = NOW() WHERE entity_type = "note" AND entity_id = ?',
      [noteId]
    );
    await dbOrConn.query(
      'DELETE FROM entity_links WHERE (source_type = "note" AND source_id = ?) OR (target_type = "note" AND target_id = ?)',
      [noteId, noteId]
    );
  }

  /**
   * Soft-delete or remove canonical entity when task is deleted
   */
  static async deleteTaskEntity(dbOrConn, taskId) {
    await dbOrConn.query(
      'UPDATE entities SET deleted_at = NOW() WHERE entity_type = "task" AND entity_id = ?',
      [taskId]
    );
    await dbOrConn.query(
      'DELETE FROM entity_links WHERE (source_type = "task" AND source_id = ?) OR (target_type = "task" AND target_id = ?)',
      [taskId, taskId]
    );
  }

  /**
   * Create bidirectional relationship between a Note and a Task
   */
  static async linkNoteAndTask(dbOrConn, userId, noteId, taskId, linkType = 'relates_to') {
    const validLinkTypes = ['relates_to', 'depends_on', 'references', 'supports', 'blocks'];
    const finalLinkType = validLinkTypes.includes(linkType) ? linkType : 'relates_to';

    // Standardize: source_type = 'note', target_type = 'task'
    await dbOrConn.query(`
      INSERT INTO entity_links (user_id, source_type, source_id, target_type, target_id, link_type, origin, is_confirmed, created_at, updated_at)
      VALUES (?, 'note', ?, 'task', ?, ?, 'task_sync', 1, NOW(), NOW())
      ON DUPLICATE KEY UPDATE deleted_at = NULL, is_confirmed = 1, link_type = VALUES(link_type), updated_at = NOW()
    `, [userId, noteId, taskId, finalLinkType]);

    // Return the link record
    const rawLink = await dbOrConn.query(`
      SELECT * FROM entity_links
      WHERE user_id = ? AND source_type = 'note' AND source_id = ? AND target_type = 'task' AND target_id = ? AND deleted_at IS NULL
      LIMIT 1
    `, [userId, noteId, taskId]);
    const linkRows = extractRows(rawLink);
    return linkRows && linkRows[0] ? linkRows[0] : null;
  }

  /**
   * Remove bidirectional relationship between a Note and a Task
   */
  static async unlinkNoteAndTask(dbOrConn, userId, noteId, taskId) {
    await dbOrConn.query(`
      DELETE FROM entity_links
      WHERE user_id = ?
        AND (
          (source_type = 'note' AND source_id = ? AND target_type = 'task' AND target_id = ?)
          OR (source_type = 'task' AND source_id = ? AND target_type = 'note' AND target_id = ?)
        )
    `, [userId, noteId, taskId, taskId, noteId]);
    return true;
  }

  /**
   * Get all tasks linked to a Note
   */
  static async getLinkedTasksForNote(dbOrConn, userId, noteId) {
    const raw = await dbOrConn.query(`
      SELECT t.id, t.title, t.description, t.status, t.priority, t.due_date, t.project_id, t.created_at, t.completed_at,
             el.id AS link_id, el.link_type, el.created_at AS linked_at
      FROM tasks t
      JOIN entity_links el ON (
        (el.source_type = 'note' AND el.source_id = ? AND el.target_type = 'task' AND el.target_id = t.id)
        OR (el.target_type = 'note' AND el.target_id = ? AND el.source_type = 'task' AND el.source_id = t.id)
      )
      WHERE el.user_id = ? AND el.deleted_at IS NULL
      ORDER BY t.created_at DESC
    `, [noteId, noteId, userId]);
    return extractRows(raw);
  }

  /**
   * Get all notes linked to a Task
   */
  static async getLinkedNotesForTask(dbOrConn, userId, taskId) {
    const raw = await dbOrConn.query(`
      SELECT n.id, n.title, n.project_id, n.folder_id, n.is_pinned, n.word_count, n.created_at, n.updated_at,
             el.id AS link_id, el.link_type, el.created_at AS linked_at
      FROM notes n
      JOIN entity_links el ON (
        (el.source_type = 'task' AND el.source_id = ? AND el.target_type = 'note' AND el.target_id = n.id)
        OR (el.target_type = 'task' AND el.target_id = ? AND el.source_type = 'note' AND el.source_id = n.id)
      )
      WHERE el.user_id = ? AND el.deleted_at IS NULL
      ORDER BY n.updated_at DESC
    `, [taskId, taskId, userId]);
    return extractRows(raw);
  }

  /**
   * Create bidirectional semantic relationship between two Notes
   */
  static async linkNotes(dbOrConn, userId, sourceNoteId, targetNoteId, linkType = 'relates_to') {
    const srcId = parseInt(sourceNoteId, 10);
    const tgtId = parseInt(targetNoteId, 10);

    if (!srcId || !tgtId) {
      throw new Error('Both source and target note IDs are required');
    }

    if (srcId === tgtId) {
      throw new Error('Cannot connect a note to itself');
    }

    const validLinkTypes = ['relates_to', 'supports', 'contradicts', 'inspired_by', 'depends_on', 'references'];
    const finalLinkType = validLinkTypes.includes(linkType) ? linkType : 'relates_to';

    // Verify target note exists, is not soft-deleted, and user is authorized
    const targetRows = await dbOrConn.query(`
      SELECT n.id, n.title, n.project_id, n.folder_id
      FROM notes n
      LEFT JOIN project_members pm ON pm.project_id = n.project_id AND pm.user_id = ? AND pm.revoked_at IS NULL
      WHERE n.id = ? AND (n.user_id = ? OR pm.id IS NOT NULL) AND n.deleted_at IS NULL
      LIMIT 1
    `, [userId, tgtId, userId]);
    const targets = extractRows(targetRows);
    if (!targets || targets.length === 0) {
      throw new Error('Target note not found or access denied');
    }

    // Check if relationship already exists in either direction
    const existingRaw = await dbOrConn.query(`
      SELECT * FROM entity_links
      WHERE user_id = ? AND deleted_at IS NULL
        AND (
          (source_type = 'note' AND source_id = ? AND target_type = 'note' AND target_id = ?)
          OR (source_type = 'note' AND source_id = ? AND target_type = 'note' AND target_id = ?)
        )
      LIMIT 1
    `, [userId, srcId, tgtId, tgtId, srcId]);
    const existing = extractRows(existingRaw);

    if (existing && existing.length > 0) {
      if (existing[0].link_type !== finalLinkType) {
        await dbOrConn.query(
          'UPDATE entity_links SET link_type = ?, updated_at = NOW() WHERE id = ?',
          [finalLinkType, existing[0].id]
        );
        existing[0].link_type = finalLinkType;
      }
      return existing[0];
    }

    const insertRes = await dbOrConn.query(`
      INSERT INTO entity_links (user_id, source_type, source_id, target_type, target_id, link_type, origin, is_confirmed, created_at, updated_at)
      VALUES (?, 'note', ?, 'note', ?, ?, 'manual', 1, NOW(), NOW())
    `, [userId, srcId, tgtId, finalLinkType]);

    const insertedId = insertRes.insertId || (insertRes[0] && insertRes[0].insertId);
    const linkRows = await dbOrConn.query('SELECT * FROM entity_links WHERE id = ? LIMIT 1', [insertedId]);
    const rows = extractRows(linkRows);
    return rows[0] || null;
  }

  /**
   * Remove semantic relationship between two Notes
   */
  static async unlinkNotes(dbOrConn, userId, sourceNoteId, targetNoteId) {
    const srcId = parseInt(sourceNoteId, 10);
    const tgtId = parseInt(targetNoteId, 10);

    await dbOrConn.query(`
      DELETE FROM entity_links
      WHERE user_id = ?
        AND (
          (source_type = 'note' AND source_id = ? AND target_type = 'note' AND target_id = ?)
          OR (source_type = 'note' AND source_id = ? AND target_type = 'note' AND target_id = ?)
        )
    `, [userId, srcId, tgtId, tgtId, srcId]);
    return true;
  }

  /**
   * Get all notes connected to a specific Note
   */
  static async getConnectedNotesForNote(dbOrConn, userId, noteId) {
    const nId = parseInt(noteId, 10);
    const raw = await dbOrConn.query(`
      SELECT n.id, n.title, n.project_id, n.folder_id, n.word_count, n.created_at, n.updated_at,
             nf.name AS folder_name,
             el.id AS link_id, el.link_type, el.source_id, el.target_id,
             CASE WHEN el.source_id = ? THEN 'outgoing' ELSE 'incoming' END AS direction,
             el.created_at AS linked_at
      FROM notes n
      LEFT JOIN note_folders nf ON nf.id = n.folder_id
      JOIN entity_links el ON (
        (el.source_type = 'note' AND el.source_id = ? AND el.target_type = 'note' AND el.target_id = n.id)
        OR (el.target_type = 'note' AND el.target_id = ? AND el.source_type = 'note' AND el.source_id = n.id)
      )
      WHERE el.user_id = ? AND el.deleted_at IS NULL AND n.deleted_at IS NULL
      ORDER BY el.created_at DESC
    `, [nId, nId, nId, userId]);
    return extractRows(raw);
  }
}

module.exports = EntitySyncService;

