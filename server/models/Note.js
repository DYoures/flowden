const db = require('../config/database');
const Project = require('./Project');
const EntitySyncService = require('../services/entitySyncService');

class Note {
  static async findAll(userId, { folder_id = null, project_id = null, projectId = null, search = '', tag = '' } = {}) {
    const finalProjectId = project_id || projectId || null;

    let sql = `
      SELECT DISTINCT n.*
      FROM notes n
      LEFT JOIN project_entities pe ON pe.entity_type = 'note' AND pe.entity_id = n.id
      LEFT JOIN project_members pm ON (pm.project_id = n.project_id OR pm.project_id = pe.project_id)
        AND pm.user_id = ? AND pm.revoked_at IS NULL
      WHERE n.deleted_at IS NULL
        AND (n.user_id = ? OR pm.id IS NOT NULL)
    `;
    const params = [userId, userId];

    if (folder_id !== null && folder_id !== undefined && folder_id !== '') {
      if (folder_id === 'root') {
        sql += ' AND n.folder_id IS NULL';
      } else {
        sql += ' AND n.folder_id = ?';
        params.push(parseInt(folder_id, 10));
      }
    }

    if (finalProjectId) {
      sql += ' AND (n.project_id = ? OR pe.project_id = ?)';
      params.push(parseInt(finalProjectId, 10), parseInt(finalProjectId, 10));
    }

    sql += ' ORDER BY n.is_pinned DESC, n.updated_at DESC';
    let notes = await db.query(sql, params);

    if (search && search.trim()) {
      const q = search.trim().toLowerCase();
      notes = notes.filter(n =>
        (n.title && n.title.toLowerCase().includes(q)) ||
        (n.content && n.content.toLowerCase().includes(q))
      );
    }

    // Attach tags scoped to user
    const allTags = await db.query('SELECT * FROM note_tags WHERE user_id = ?', [userId]);
    const tagMaps = allTags.length > 0
      ? await db.query(
          `SELECT ntm.* FROM note_tag_map ntm
           JOIN note_tags nt ON nt.id = ntm.tag_id
           WHERE nt.user_id = ?`,
          [userId]
        )
      : [];
    const tagMapById = new Map();
    allTags.forEach(t => tagMapById.set(t.id, t));

    const noteTagMap = new Map();
    tagMaps.forEach(tm => {
      if (!noteTagMap.has(tm.note_id)) noteTagMap.set(tm.note_id, []);
      const tagObj = tagMapById.get(tm.tag_id);
      if (tagObj) noteTagMap.get(tm.note_id).push(tagObj);
    });

    notes.forEach(n => {
      n.tags = noteTagMap.get(n.id) || [];
      n.content_markdown = n.content || '';
    });

    if (tag && tag.trim()) {
      const tLower = tag.trim().toLowerCase();
      notes = notes.filter(n => n.tags.some(t => t.name.toLowerCase() === tLower));
    }

    return notes;
  }

  static async findById(id, userId) {
    const rows = await db.query(
      `SELECT DISTINCT n.*
       FROM notes n
       LEFT JOIN project_entities pe ON pe.entity_type = 'note' AND pe.entity_id = n.id
       LEFT JOIN project_members pm ON (pm.project_id = n.project_id OR pm.project_id = pe.project_id)
         AND pm.user_id = ? AND pm.revoked_at IS NULL
       WHERE n.id = ?
         AND n.deleted_at IS NULL
         AND (n.user_id = ? OR pm.id IS NOT NULL)
       LIMIT 1`,
      [userId, id, userId]
    );
    if (!rows || rows.length === 0) return null;
    const note = rows[0];

    // Get tags
    const allTags = await db.query('SELECT * FROM note_tags WHERE user_id = ?', [note.user_id]);
    const tagMaps = await db.query('SELECT * FROM note_tag_map WHERE note_id = ?', [id]);
    const tagMapById = new Map(allTags.map(t => [t.id, t]));
    note.tags = tagMaps.map(tm => tagMapById.get(tm.tag_id)).filter(Boolean);

    // Helper to ensure linked notes are accessible to userId before returning
    const findAccessibleLinkedNote = async (linkedNoteId) => {
      const targetRows = await db.query(
        `SELECT DISTINCT n.id, n.title, n.updated_at
         FROM notes n
         LEFT JOIN project_entities pe ON pe.entity_type = 'note' AND pe.entity_id = n.id
         LEFT JOIN project_members pm ON (pm.project_id = n.project_id OR pm.project_id = pe.project_id)
           AND pm.user_id = ? AND pm.revoked_at IS NULL
         WHERE n.id = ?
           AND n.deleted_at IS NULL
           AND (n.user_id = ? OR pm.id IS NOT NULL)
         LIMIT 1`,
        [userId, linkedNoteId, userId]
      );
      return targetRows && targetRows[0] ? targetRows[0] : null;
    };

    // Outgoing links (strictly filtered by access)
    const outgoingLinks = await db.query('SELECT target_note_id FROM note_links WHERE source_note_id = ?', [id]);
    const targetIds = outgoingLinks.map(l => l.target_note_id);
    const targetNotes = [];
    for (const tid of targetIds) {
      const t = await findAccessibleLinkedNote(tid);
      if (t) targetNotes.push({ id: t.id, title: t.title });
    }
    note.outgoing_links = targetNotes;

    // Incoming backlinks (strictly filtered by access)
    const incomingLinks = await db.query('SELECT source_note_id FROM note_links WHERE target_note_id = ?', [id]);
    const sourceIds = incomingLinks.map(l => l.source_note_id);
    const backlinks = [];
    for (const sid of sourceIds) {
      const s = await findAccessibleLinkedNote(sid);
      if (s) backlinks.push(s);
    }
    note.backlinks = backlinks;

    // Unlinked mentions (scoped strictly to user's own non-deleted notes)
    const userNotes = await db.query('SELECT id, title, content FROM notes WHERE user_id = ? AND deleted_at IS NULL AND id != ?', [userId, id]);
    const titleRegex = new RegExp(`\\b${escapeRegExp(note.title)}\\b`, 'i');
    const explicitLinkRegex = new RegExp(`\\[\\[(?:note:${id}(?:\\|.*)?|${escapeRegExp(note.title)})\\]\\]`, 'i');

    const unlinkedMentions = userNotes.filter(un => {
      const alreadyLinked = sourceIds.includes(un.id);
      if (alreadyLinked) return false;
      return un.content && titleRegex.test(un.content) && !explicitLinkRegex.test(un.content);
    }).map(un => ({
      id: un.id,
      title: un.title,
      snippet: extractSnippet(un.content, note.title)
    }));
    note.unlinked_mentions = unlinkedMentions;
    note.content_markdown = note.content || '';

    return note;
  }

  static async create(userIdOrObj, maybeData = {}) {
    let userId = userIdOrObj;
    let data = maybeData;
    if (typeof userIdOrObj === 'object' && userIdOrObj !== null) {
      userId = userIdOrObj.user_id;
      data = userIdOrObj;
    }

    const { title = 'Untitled Note', content = '', content_markdown, project_id = null, folder_id = null, is_pinned = false, tags = [], attachments_json = null } = data || {};
    let resolvedProjectId = null;
    if (project_id !== null && project_id !== undefined && project_id !== '') {
      const projAuth = await Project.validateWriteAccess(project_id, userId, db);
      if (!projAuth.valid) {
        const err = new Error(projAuth.error);
        err.status = projAuth.status;
        throw err;
      }
      resolvedProjectId = projAuth.projectId;
    }

    const effectiveContent = (content !== undefined && content !== null && content !== '') ? content : (content_markdown || '');
    const wordCount = countWords(effectiveContent);

    const result = await db.query(
      'INSERT INTO notes (user_id, project_id, folder_id, title, content, is_pinned, word_count, attachments_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [
        userId,
        resolvedProjectId,
        folder_id || null,
        (title || '').trim() || 'Untitled Note',
        effectiveContent,
        is_pinned ? 1 : 0,
        wordCount,
        attachments_json ? (typeof attachments_json === 'string' ? attachments_json : JSON.stringify(attachments_json)) : null
      ]
    );

    const noteId = result.insertId;

    if (tags && tags.length > 0) {
      await this.syncTags(noteId, userId, tags);
    }

    await this.syncWikiLinks(noteId, userId, effectiveContent);
    await EntitySyncService.syncNoteEntity(db, noteId, userId);

    return this.findById(noteId, userId);
  }

  static async update(id, userId, { title, content, content_markdown, project_id, folder_id, is_pinned, tags, attachments_json }) {
    const existing = await db.query('SELECT * FROM notes WHERE id = ? AND user_id = ? AND deleted_at IS NULL LIMIT 1', [id, userId]);
    if (!existing || existing.length === 0) return null;
    const currentNote = existing[0];
    const effectiveContent = content !== undefined ? content : content_markdown;

    if ((effectiveContent !== undefined && effectiveContent !== currentNote.content) || (title !== undefined && title.trim() !== currentNote.title)) {
      try {
        const lastVersions = await db.query(
          'SELECT version_number, created_at FROM note_versions WHERE note_id = ? AND user_id = ? ORDER BY version_number DESC LIMIT 1',
          [id, userId]
        );
        const lastVer = lastVersions && lastVersions[0];
        const nextVerNum = lastVer ? (lastVer.version_number + 1) : 1;
        const now = new Date();
        const shouldSnapshot = !lastVer || (now - new Date(lastVer.created_at)) >= 15000;

        if (shouldSnapshot) {
          await db.query(
            'INSERT INTO note_versions (note_id, user_id, version_number, title, content_markdown) VALUES (?, ?, ?, ?, ?)',
            [id, userId, nextVerNum, currentNote.title, currentNote.content || '']
          );
        }
      } catch (verErr) {
        console.warn('[Note] Error creating version snapshot:', verErr.message);
      }
    }

    const updates = [];
    const params = [];

    if (title !== undefined) {
      updates.push('title = ?');
      params.push(title.trim() || 'Untitled Note');
    }
    if (effectiveContent !== undefined) {
      updates.push('content = ?');
      params.push(effectiveContent);
      updates.push('word_count = ?');
      params.push(countWords(effectiveContent));
    }
    if (project_id !== undefined) {
      let resolvedProjectId = null;
      if (project_id !== null && project_id !== '') {
        const projAuth = await Project.validateWriteAccess(project_id, userId, db);
        if (!projAuth.valid) {
          const err = new Error(projAuth.error);
          err.status = projAuth.status;
          throw err;
        }
        resolvedProjectId = projAuth.projectId;
      }
      updates.push('project_id = ?');
      params.push(resolvedProjectId);
    }
    if (folder_id !== undefined) {
      updates.push('folder_id = ?');
      params.push(folder_id ? parseInt(folder_id, 10) : null);
    }
    if (is_pinned !== undefined) {
      updates.push('is_pinned = ?');
      params.push(is_pinned ? 1 : 0);
    }
    if (attachments_json !== undefined) {
      updates.push('attachments_json = ?');
      params.push(attachments_json ? (typeof attachments_json === 'string' ? attachments_json : JSON.stringify(attachments_json)) : null);
    }

    if (updates.length > 0) {
      params.push(userId);
      params.push(id);
      await db.query(`UPDATE notes SET ${updates.join(', ')} WHERE user_id = ? AND id = ?`, params);
    }

    if (tags !== undefined) {
      await this.syncTags(id, userId, tags);
    }

    if (effectiveContent !== undefined) {
      await this.syncWikiLinks(id, userId, effectiveContent);
    }

    await EntitySyncService.syncNoteEntity(db, id, userId);

    return this.findById(id, userId);
  }

  static async delete(id, userId, permanentOrOpts = false) {
    const permanent = typeof permanentOrOpts === 'object' && permanentOrOpts !== null
      ? Boolean(permanentOrOpts.permanent)
      : Boolean(permanentOrOpts);
    const existing = await db.query('SELECT id FROM notes WHERE id = ? AND user_id = ? LIMIT 1', [id, userId]);
    if (!existing || existing.length === 0) return false;

    if (!permanent) {
      await db.query('UPDATE notes SET deleted_at = NOW() WHERE id = ? AND user_id = ?', [id, userId]);
      await EntitySyncService.deleteNoteEntity(db, id);
      return true;
    }

    await db.query('DELETE FROM note_links WHERE source_note_id = ? OR target_note_id = ?', [id, id]);
    await db.query('DELETE FROM note_tag_map WHERE note_id = ?', [id]);
    await db.query('DELETE FROM notes WHERE id = ? AND user_id = ?', [id, userId]);
    // Also remove file_uploads entry for this note if permanently deleted
    try {
      await db.query("DELETE FROM file_uploads WHERE entity_type = 'note' AND entity_id = ? AND user_id = ?", [id, userId]);
    } catch (_) {}
    await EntitySyncService.deleteNoteEntity(db, id);
    return true;
  }

  static async findTrash(userId) {
    return db.query('SELECT * FROM notes WHERE user_id = ? AND deleted_at IS NOT NULL ORDER BY deleted_at DESC', [userId]);
  }

  static async findTrashed(userId) {
    return this.findTrash(userId);
  }

  static async restoreFromTrash(id, userId) {
    const existing = await db.query('SELECT id FROM notes WHERE id = ? AND user_id = ? LIMIT 1', [id, userId]);
    if (!existing || existing.length === 0) return null;
    await db.query('UPDATE notes SET deleted_at = NULL WHERE id = ? AND user_id = ?', [id, userId]);
    await EntitySyncService.syncNoteEntity(db, id, userId);
    return this.findById(id, userId);
  }

  static async restore(id, userId) {
    return this.restoreFromTrash(id, userId);
  }

  static async syncTags(noteId, userId, tagNames) {
    await db.query('DELETE FROM note_tag_map WHERE note_id = ?', [noteId]);

    for (const rawName of tagNames) {
      const name = typeof rawName === 'string' ? rawName.trim() : (rawName.name || '').trim();
      if (!name) continue;

      let tagRows = await db.query('SELECT id FROM note_tags WHERE user_id = ? AND name = ? LIMIT 1', [userId, name]);
      let tagId;
      if (tagRows && tagRows.length > 0) {
        tagId = tagRows[0].id;
      } else {
        const ins = await db.query('INSERT INTO note_tags (user_id, name) VALUES (?, ?)', [userId, name]);
        tagId = ins.insertId;
      }
      await db.query('INSERT INTO note_tag_map (note_id, tag_id) VALUES (?, ?)', [noteId, tagId]);
    }
  }

  static async syncWikiLinks(sourceNoteId, userId, content, dbOrConn = null) {
    const executor = dbOrConn || db;
    await executor.query('DELETE FROM note_links WHERE source_note_id = ?', [sourceNoteId]);
    if (!content) return;

    const regex = /\[\[(.*?)\]\]/g;
    let match;
    const directNoteIds = new Set();
    const titleTargets = new Set();

    while ((match = regex.exec(content)) !== null) {
      const raw = match[1].trim();
      if (!raw) continue;

      // Check for durable syntax: note:<id> or note:<id>|<label>
      const durableMatch = raw.match(/^note:(\d+)(?:\|.*)?$/i);
      if (durableMatch) {
        const targetId = parseInt(durableMatch[1], 10);
        if (targetId && targetId !== sourceNoteId) {
          directNoteIds.add(targetId);
        }
      } else {
        const titleOnly = raw.includes('|') ? raw.split('|')[0].trim() : raw;
        if (titleOnly) titleTargets.add(titleOnly);
      }
    }

    // Link durable ID targets
    for (const targetId of directNoteIds) {
      const check = await executor.query(
        'SELECT id FROM notes WHERE id = ? AND deleted_at IS NULL LIMIT 1',
        [targetId]
      );
      if (check && check.length > 0) {
        await executor.query(
          'INSERT INTO note_links (source_note_id, target_note_id) VALUES (?, ?)',
          [sourceNoteId, targetId]
        );
        try {
          await executor.query(
            `INSERT INTO entity_links (user_id, source_type, source_id, target_type, target_id, link_type, origin, is_confirmed, created_at, updated_at)
             VALUES (?, 'note', ?, 'note', ?, 'references', 'inline_link', 1, NOW(), NOW())
             ON DUPLICATE KEY UPDATE is_confirmed = 1, updated_at = NOW()`,
            [userId, sourceNoteId, targetId]
          );
        } catch (_) {}
      }
    }

    // Link legacy title targets
    for (const title of titleTargets) {
      const matching = await executor.query(
        'SELECT id FROM notes WHERE user_id = ? AND deleted_at IS NULL AND title = ? LIMIT 1',
        [userId, title]
      );
      if (matching && matching.length > 0 && matching[0].id !== sourceNoteId) {
        const targetId = matching[0].id;
        if (!directNoteIds.has(targetId)) {
          await executor.query(
            'INSERT INTO note_links (source_note_id, target_note_id) VALUES (?, ?)',
            [sourceNoteId, targetId]
          );
          try {
            await executor.query(
              `INSERT INTO entity_links (user_id, source_type, source_id, target_type, target_id, link_type, origin, is_confirmed, created_at, updated_at)
               VALUES (?, 'note', ?, 'note', ?, 'references', 'inline_link', 1, NOW(), NOW())
               ON DUPLICATE KEY UPDATE is_confirmed = 1, updated_at = NOW()`,
              [userId, sourceNoteId, targetId]
            );
          } catch (_) {}
        }
      }
    }
  }

  static async getFolders(userId) {
    return db.query('SELECT * FROM note_folders WHERE user_id = ? ORDER BY sort_order ASC, name ASC', [userId]);
  }

  static async createFolder(userId, name, parent_folder_id = null) {
    const result = await db.query(
      'INSERT INTO note_folders (user_id, parent_folder_id, name) VALUES (?, ?, ?)',
      [userId, parent_folder_id || null, name.trim() || 'New Folder']
    );
    const rows = await db.query('SELECT * FROM note_folders WHERE id = ? LIMIT 1', [result.insertId]);
    return rows[0];
  }

  static async deleteFolder(id, userId) {
    await db.query('UPDATE notes SET folder_id = NULL WHERE folder_id = ? AND user_id = ?', [id, userId]);
    await db.query('DELETE FROM note_folders WHERE id = ? AND user_id = ?', [id, userId]);
    return true;
  }

  static async getTags(userId) {
    return db.query('SELECT * FROM note_tags WHERE user_id = ? ORDER BY name ASC', [userId]);
  }
}

function countWords(str) {
  if (!str) return 0;
  return str.trim().split(/\s+/).filter(Boolean).length;
}

function escapeRegExp(str) {
  return String(str || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractSnippet(content, term) {
  if (!content) return '';
  const idx = content.toLowerCase().indexOf(term.toLowerCase());
  if (idx === -1) return content.substring(0, 80);
  const start = Math.max(0, idx - 40);
  const end = Math.min(content.length, idx + term.length + 40);
  return (start > 0 ? '...' : '') + content.substring(start, end).trim() + (end < content.length ? '...' : '');
}

module.exports = Note;
