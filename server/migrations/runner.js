// server/migrations/runner.js
const fs = require('fs');
const path = require('path');

const LOCK = 'flowden_migrations';

/**
 * Loads default migration files from server/migrations directory.
 * Supports both .js modules exporting `up(conn)` and raw .sql files.
 */
function loadDefaultMigrationFiles(migrationsDir = __dirname) {
  if (!fs.existsSync(migrationsDir)) return [];
  const entries = fs.readdirSync(migrationsDir);
  const files = [];

  for (const entry of entries) {
    const match = entry.match(/^(\d+)_(.+)\.(js|sql)$/);
    if (!match) continue;

    const version = parseInt(match[1], 10);
    const name = entry;
    const fullPath = path.join(migrationsDir, entry);

    if (match[3] === 'js') {
      const mod = require(fullPath);
      if (typeof mod.up === 'function') {
        files.push({ version, name, up: mod.up });
      }
    } else if (match[3] === 'sql') {
      files.push({
        version,
        name,
        up: async (conn) => {
          const sqlContent = fs.readFileSync(fullPath, 'utf8');
          const statements = sqlContent
            .split(';')
            .map(s => s.trim())
            .filter(s => s.length > 0);
          for (const statement of statements) {
            await conn.query(statement);
          }
        }
      });
    }
  }

  return files.sort((a, b) => a.version - b.version);
}

/**
 * Executes unapplied migrations sequentially protected by a MySQL advisory lock.
 *
 * @param {object} pool - mysql2/promise Pool instance
 * @param {Array<{version: number, name: string, up: Function}>} [files] - optional list of migrations
 */
async function runMigrations(pool, files) {
  const migrationsToRun = files || loadDefaultMigrationFiles(__dirname);
  const conn = await pool.getConnection();
  let lockMaybeHeld = false;

  try {
    lockMaybeHeld = true; // GET_LOCK may succeed server-side even if network response fails
    const [lockRows] = await conn.query('SELECT GET_LOCK(?, 30) AS got', [LOCK]);
    const lk = lockRows && lockRows[0];
    if (!lk || Number(lk.got) !== 1) {
      lockMaybeHeld = false;
      throw new Error('Migration lock not acquired');
    }

    await conn.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      version INT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

    const [rows] = await conn.query('SELECT version FROM schema_migrations');
    const applied = new Set(rows.map(r => Number(r.version)));

    for (const m of migrationsToRun) {
      if (applied.has(m.version)) continue;
      await m.up(conn); // DDL causes implicit commits in MySQL; do NOT wrap in transaction
      await conn.query('INSERT INTO schema_migrations (version, name) VALUES (?, ?)', [m.version, m.name]);
    }
  } finally {
    let destroy = false;
    if (lockMaybeHeld) {
      try {
        const [relRows] = await conn.query('SELECT RELEASE_LOCK(?) AS rel', [LOCK]);
        const rel = relRows && relRows[0];
        if (!rel || Number(rel.rel) !== 1) {
          destroy = true;
        }
      } catch {
        destroy = true;
      }
    }
    if (destroy) {
      conn.destroy();
    } else {
      conn.release();
    }
  }
}

module.exports = {
  LOCK,
  runMigrations,
  loadDefaultMigrationFiles
};

