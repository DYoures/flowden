const db = require('../config/database');

class User {
  static async count() {
    const rows = await db.query('SELECT COUNT(*) as count FROM users');
    return rows[0] ? rows[0].count : 0;
  }

  static async findByEmail(email) {
    if (!email) return null;
    const rows = await db.query('SELECT * FROM users WHERE email = ? LIMIT 1', [email.toLowerCase().trim()]);
    return rows[0] || null;
  }

  static async findById(id) {
    if (!id) return null;
    const rows = await db.query('SELECT id, email, display_name, avatar_url, role, theme_preference, settings_json, created_at, updated_at FROM users WHERE id = ? LIMIT 1', [id]);
    return rows[0] || null;
  }

  static async create({ email, password_hash, display_name }) {
    // If this is the very first user, assign admin role automatically
    const totalUsers = await this.count();
    const role = totalUsers === 0 ? 'admin' : 'user';

    const result = await db.query(
      'INSERT INTO users (email, password_hash, display_name, role, theme_preference) VALUES (?, ?, ?, ?, ?)',
      [email.toLowerCase().trim(), password_hash, display_name.trim(), role, 'dark']
    );

    return this.findById(result.insertId);
  }

  static async updateProfile(id, { display_name, avatar_url, theme_preference, settings_json }) {
    const updates = [];
    const params = [];

    if (display_name !== undefined) {
      updates.push('display_name = ?');
      params.push(display_name.trim());
    }
    if (avatar_url !== undefined) {
      updates.push('avatar_url = ?');
      params.push(avatar_url);
    }
    if (theme_preference !== undefined) {
      updates.push('theme_preference = ?');
      params.push(theme_preference);
    }
    if (settings_json !== undefined) {
      updates.push('settings_json = ?');
      params.push(typeof settings_json === 'string' ? settings_json : JSON.stringify(settings_json));
    }

    if (updates.length === 0) return this.findById(id);

    params.push(id);
    await db.query(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, params);
    return this.findById(id);
  }

  static async updatePassword(id, password_hash) {
    await db.query('UPDATE users SET password_hash = ? WHERE id = ?', [password_hash, id]);
  }

  static async updateRole(id, role) {
    if (!['admin', 'user'].includes(role)) throw new Error('Invalid role');
    await db.query('UPDATE users SET role = ? WHERE id = ?', [role, id]);
    return this.findById(id);
  }

  static async findAll() {
    return db.query('SELECT id, email, display_name, avatar_url, role, theme_preference, created_at, updated_at FROM users ORDER BY id ASC');
  }
}

module.exports = User;

