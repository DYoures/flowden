const db = require('../config/database');

class Project {
  static async findAll(userId, status = null) {
    let sql = `
      SELECT DISTINCT p.*
      FROM projects p
      LEFT JOIN project_members pm ON pm.project_id = p.id AND pm.user_id = ? AND pm.revoked_at IS NULL
      WHERE (p.user_id = ? OR pm.id IS NOT NULL)
    `;
    const params = [userId, userId];

    if (status && typeof status === 'string') {
      sql += ' AND p.status = ?';
      params.push(status);
    }

    sql += ' ORDER BY p.sort_order ASC, p.created_at DESC';
    return db.query(sql, params);
  }

  static async findAllByUser(userId, { status, search } = {}) {
    let projects = await this.findAll(userId, status || null);
    if (search && search.trim()) {
      const q = search.trim().toLowerCase();
      projects = (projects || []).filter(p =>
        (p.title && p.title.toLowerCase().includes(q)) ||
        (p.description && p.description.toLowerCase().includes(q))
      );
    }
    return projects;
  }

  static async findById(id, userId) {
    const rows = await db.query(
      `SELECT DISTINCT p.*
       FROM projects p
       LEFT JOIN project_members pm ON pm.project_id = p.id AND pm.user_id = ? AND pm.revoked_at IS NULL
       WHERE p.id = ? AND (p.user_id = ? OR pm.id IS NOT NULL)
       LIMIT 1`,
      [userId, id, userId]
    );
    return rows && rows[0] ? rows[0] : null;
  }

  static async create(userIdOrObj, maybeData = {}) {
    let userId = userIdOrObj;
    let data = maybeData;
    if (typeof userIdOrObj === 'object' && userIdOrObj !== null) {
      userId = userIdOrObj.user_id;
      data = userIdOrObj;
    }
    const { title, description, color = '#7c5cbf', icon = 'folder' } = data || {};

    const result = await db.query(
      'INSERT INTO projects (user_id, title, description, color, icon, status) VALUES (?, ?, ?, ?, ?, ?)',
      [userId, title.trim(), description ? description.trim() : null, color, icon, 'active']
    );

    const newProjectId = result.insertId;
    await db.query(
      'INSERT INTO boards (project_id, user_id, title, description) VALUES (?, ?, ?, ?)',
      [newProjectId, userId, `${title.trim()} Board`, 'Spatial workspace board']
    );

    // Record owner membership per migration 005 and search authorization requirements
    await db.query(
      'INSERT INTO project_members (project_id, user_id, role, created_at) VALUES (?, ?, "owner", NOW()) ON DUPLICATE KEY UPDATE role = "owner"',
      [newProjectId, userId]
    );

    return this.findById(newProjectId, userId);
  }

  static async update(id, userId, { title, description, color, icon, status, sort_order }) {
    const updates = [];
    const params = [];

    if (title !== undefined) {
      updates.push('title = ?');
      params.push(title.trim());
    }
    if (description !== undefined) {
      updates.push('description = ?');
      params.push(description ? description.trim() : null);
    }
    if (color !== undefined) {
      updates.push('color = ?');
      params.push(color);
    }
    if (icon !== undefined) {
      updates.push('icon = ?');
      params.push(icon);
    }
    if (status !== undefined) {
      updates.push('status = ?');
      params.push(status);
    }
    if (sort_order !== undefined) {
      updates.push('sort_order = ?');
      params.push(sort_order);
    }

    if (updates.length === 0) return this.findById(id, userId);

    params.push(userId);
    params.push(id);
    await db.query(`UPDATE projects SET ${updates.join(', ')} WHERE user_id = ? AND id = ?`, params);
    return this.findById(id, userId);
  }

  static async delete(id, userId) {
    await db.query('DELETE FROM project_members WHERE project_id = ?', [id]);
    const result = await db.query('DELETE FROM projects WHERE user_id = ? AND id = ?', [userId, id]);
    return result.affectedRows > 0;
  }

  static async getStats(id, userId) {
    const project = await this.findById(id, userId);
    if (!project) return null;

    const boards = await db.query('SELECT COUNT(*) as count FROM boards WHERE project_id = ?', [id]);
    const notes = await db.query('SELECT COUNT(*) as count FROM notes WHERE project_id = ? AND deleted_at IS NULL', [id]);
    const tasks = await db.query('SELECT COUNT(*) as count FROM tasks WHERE project_id = ?', [id]);
    const tasksDone = await db.query("SELECT COUNT(*) as count FROM tasks WHERE project_id = ? AND status = 'done'", [id]);
    const research = await db.query('SELECT COUNT(*) as count FROM research_documents WHERE project_id = ?', [id]);

    const totalTasks = tasks[0] ? tasks[0].count : 0;
    const completedTasks = tasksDone[0] ? tasksDone[0].count : 0;
    const progressPercent = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

    return {
      ...project,
      counts: {
        boards: boards[0] ? boards[0].count : 0,
        notes: notes[0] ? notes[0].count : 0,
        tasks: totalTasks,
        tasks_done: completedTasks,
        research: research[0] ? research[0].count : 0
      },
      progress: progressPercent
    };
  }
}

module.exports = Project;
