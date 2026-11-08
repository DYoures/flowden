const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
const { runMigrations } = require('../migrations/runner');

let pool = null;
let isConnectedToMySQL = false;
let dbStatusMessage = 'Initializing...';

// Local resilient fallback storage engine
const localStorePath = path.join(__dirname, '..', 'data', 'flowden_store.json');

const initialStore = {
  users: [],
  projects: [],
  boards: [],
  board_groups: [],
  board_items: [],
  board_item_connections: [],
  note_folders: [],
  notes: [],
  note_tags: [],
  note_tag_map: [],
  note_links: [],
  note_versions: [],
  research_documents: [],
  tasks: [],
  decision_logs: [],
  templates: [],
  quick_captures: [],
  smart_connections: [],
  _autoInc: {
    users: 1,
    projects: 1,
    boards: 1,
    board_groups: 1,
    board_items: 1,
    board_item_connections: 1,
    note_folders: 1,
    notes: 1,
    note_tags: 1,
    note_versions: 1,
    research_documents: 1,
    tasks: 1,
    decision_logs: 1,
    templates: 1,
    quick_captures: 1,
    smart_connections: 1
  }
};

function readLocalStore() {
  try {
    if (!fs.existsSync(localStorePath)) {
      fs.mkdirSync(path.dirname(localStorePath), { recursive: true });
      fs.writeFileSync(localStorePath, JSON.stringify(initialStore, null, 2), 'utf8');
      return JSON.parse(JSON.stringify(initialStore));
    }
    const raw = fs.readFileSync(localStorePath, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    console.error('[DB-Fallback] Error reading local store:', err);
    return JSON.parse(JSON.stringify(initialStore));
  }
}

function writeLocalStore(data) {
  try {
    fs.writeFileSync(localStorePath, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error('[DB-Fallback] Error writing local store:', err);
  }
}

async function initDB() {
  const host = process.env.DB_HOST || 'localhost';
  const port = parseInt(process.env.DB_PORT || '3306', 10);
  const user = process.env.DB_USER || 'root';
  const password = process.env.DB_PASSWORD || '';
  const database = process.env.DB_NAME || 'flowden';

  console.log(`[DB] Attempting MySQL connection to ${host}:${port}/${database}...`);

  try {
    const testConn = await mysql.createConnection({
      host,
      port,
      user,
      password,
      connectTimeout: 3000
    });

    await testConn.query(`CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`);
    await testConn.end();

    pool = mysql.createPool({
      host,
      port,
      user,
      password,
      database,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      timezone: 'Z'
    });

    const conn = await pool.getConnection();
    conn.release();

    isConnectedToMySQL = true;
    dbStatusMessage = `Connected to MySQL (${host}:${port}/${database})`;
    console.log(`[DB] ✅ ${dbStatusMessage}`);

    await runMySQLMigrations();
  } catch (err) {
    isConnectedToMySQL = false;
    dbStatusMessage = `MySQL unavailable (${err.message}). Using resilient embedded storage.`;
    console.warn(`[DB] ⚠️ ${dbStatusMessage}`);
    readLocalStore();
  }
}

async function runMySQLMigrations() {
  if (!pool) return;
  try {
    await runMigrations(pool);
    console.log('[DB] ✅ MySQL migrations executed successfully via authoritative runner.');
  } catch (migErr) {
    console.error('[DB] Error executing MySQL migrations via runner:', migErr);
    throw migErr;
  }
}

async function getConnection() {
  if (pool) {
    const rawConn = await pool.getConnection();
    return {
      rawConn,
      query: async (sql, params = []) => {
        const [result] = await rawConn.query(sql, params);
        return result;
      },
      beginTransaction: () => rawConn.beginTransaction(),
      commit: () => rawConn.commit(),
      rollback: () => rawConn.rollback(),
      release: () => rawConn.release()
    };
  }
  // Mock fallback connection
  return {
    query: (sql, params) => query(sql, params),
    beginTransaction: async () => {},
    commit: async () => {},
    rollback: async () => {},
    release: () => {}
  };
}

// Universal query interface
async function query(sql, params = []) {
  if (isConnectedToMySQL && pool) {
    try {
      const [rows] = await pool.query(sql, params);
      return rows;
    } catch (err) {
      console.error('[DB-MySQL] Query error:', err.message, 'SQL:', sql);
      throw err;
    }
  }

  return executeLocalQuery(sql, params);
}

// Comprehensive Local SQL emulator
function executeLocalQuery(sql, params = []) {
  const store = readLocalStore();
  const trimmed = sql.trim();
  const lower = trimmed.toLowerCase();

  // Helper: generic filter rows using WHERE conditions and parameters
  function filterRows(rows, whereClause, whereParams) {
    if (!whereClause || !whereClause.trim()) return rows;

    const conditions = whereClause.split(/\s+and\s+/i);
    let pIdx = 0;

    return rows.filter(row => {
      let matchesAll = true;
      let localPIdx = pIdx;

      for (const cond of conditions) {
        const cTrim = cond.trim();

        // Check for 'column = ?'
        const eqMatch = cTrim.match(/^(?:[a-zA-Z0-9_]+\.)?([a-zA-Z0-9_]+)\s*=\s*\?$/i);
        if (eqMatch) {
          const col = eqMatch[1].toLowerCase();
          const targetVal = whereParams[localPIdx++];
          const rowVal = row[col];

          if (targetVal === null || targetVal === undefined) {
            if (rowVal !== null && rowVal !== undefined) matchesAll = false;
          } else if (typeof targetVal === 'number' || (!isNaN(Number(targetVal)) && typeof rowVal === 'number')) {
            if (Number(rowVal) !== Number(targetVal)) matchesAll = false;
          } else if (typeof targetVal === 'string' && typeof rowVal === 'string') {
            if (rowVal.toLowerCase() !== targetVal.toLowerCase()) matchesAll = false;
          } else {
            if (rowVal != targetVal) matchesAll = false;
          }
          continue;
        }

        // Check for 'column != ?' or '<>'
        const neqMatch = cTrim.match(/^(?:[a-zA-Z0-9_]+\.)?([a-zA-Z0-9_]+)\s*(?:!=|<>)\s*\?$/i);
        if (neqMatch) {
          const col = neqMatch[1].toLowerCase();
          const targetVal = whereParams[localPIdx++];
          const rowVal = row[col];
          if (rowVal == targetVal) matchesAll = false;
          continue;
        }

        // Check for 'column IS NULL'
        const isNullMatch = cTrim.match(/^(?:[a-zA-Z0-9_]+\.)?([a-zA-Z0-9_]+)\s+is\s+null$/i);
        if (isNullMatch) {
          const col = isNullMatch[1].toLowerCase();
          if (row[col] !== null && row[col] !== undefined) matchesAll = false;
          continue;
        }

        // Check for 'column IS NOT NULL'
        const isNotNullMatch = cTrim.match(/^(?:[a-zA-Z0-9_]+\.)?([a-zA-Z0-9_]+)\s+is\s+not\s+null$/i);
        if (isNotNullMatch) {
          const col = isNotNullMatch[1].toLowerCase();
          if (row[col] === null || row[col] === undefined) matchesAll = false;
          continue;
        }

        // Fallback check
        if (cTrim.includes('?')) {
          localPIdx++;
        }
      }

      return matchesAll;
    });
  }

  // Handle SELECT COUNT(*)
  if (lower.startsWith('select count(*)')) {
    const fromMatch = trimmed.match(/from\s+([a-zA-Z0-9_]+)/i);
    const table = fromMatch ? fromMatch[1].toLowerCase() : null;
    if (table && store[table]) {
      let items = [...store[table]];
      if (lower.includes('where')) {
        const whereClause = trimmed.substring(trimmed.search(/where/i) + 5);
        items = filterRows(items, whereClause, params);
      }
      return [{ count: items.length }];
    }
    return [{ count: 0 }];
  }

  // Handle SELECT ... FROM table ...
  if (lower.startsWith('select')) {
    const fromMatch = trimmed.match(/from\s+([a-zA-Z0-9_]+)/i);
    const table = fromMatch ? fromMatch[1].toLowerCase() : null;
    if (!table || !store[table]) return [];

    let results = [...store[table]];

    if (lower.includes('where')) {
      const wherePart = trimmed.substring(trimmed.search(/where/i) + 5).split(/order by|limit/i)[0];
      results = filterRows(results, wherePart, params);
    }

    // ORDER BY
    if (lower.includes('order by')) {
      const orderPart = trimmed.substring(trimmed.search(/order by/i) + 8).split(/limit/i)[0].trim().toLowerCase();
      const isDesc = orderPart.includes('desc');
      const sortColMatch = orderPart.match(/(?:[a-zA-Z0-9_]+\.)?([a-zA-Z0-9_]+)/);
      const sortCol = sortColMatch ? sortColMatch[1] : 'id';

      results.sort((a, b) => {
        const valA = a[sortCol];
        const valB = b[sortCol];
        if (valA === valB) return 0;
        if (isDesc) {
          return valB > valA ? 1 : -1;
        }
        return valA > valB ? 1 : -1;
      });
    }

    // LIMIT
    const limitMatch = trimmed.match(/limit\s+(\d+)/i);
    if (limitMatch) {
      const limit = parseInt(limitMatch[1], 10);
      results = results.slice(0, limit);
    }

    return results;
  }

  // Handle INSERT INTO table
  if (lower.startsWith('insert into')) {
    const tableMatch = trimmed.match(/insert\s+into\s+([a-zA-Z0-9_]+)/i);
    const table = tableMatch ? tableMatch[1].toLowerCase() : null;
    if (!table || !store[table]) {
      return { insertId: 1, affectedRows: 0 };
    }

    const colMatch = trimmed.match(/\(([^)]+)\)\s+values/i);
    const cols = colMatch ? colMatch[1].split(',').map(c => c.trim().replace(/`/g, '')) : [];

    const newId = store._autoInc[table] || (store[table].length + 1);
    store._autoInc[table] = newId + 1;

    const newRecord = {
      id: newId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    cols.forEach((col, idx) => {
      newRecord[col] = params[idx] !== undefined ? params[idx] : null;
    });

    store[table].push(newRecord);
    writeLocalStore(store);

    return { insertId: newId, affectedRows: 1 };
  }

  // Handle UPDATE table
  if (lower.startsWith('update')) {
    const tableMatch = trimmed.match(/update\s+([a-zA-Z0-9_]+)/i);
    const table = tableMatch ? tableMatch[1].toLowerCase() : null;
    if (!table || !store[table]) return { affectedRows: 0 };

    const setPart = trimmed.substring(trimmed.search(/set/i) + 3, trimmed.search(/where/i));
    const setCols = setPart.split(',').map(s => s.trim().split('=')[0].trim().replace(/`/g, ''));

    // The parameters for SET are the first setCols.length params
    const setParams = params.slice(0, setCols.length);
    const whereParams = params.slice(setCols.length);
    const whereClause = trimmed.substring(trimmed.search(/where/i) + 5);

    let matchingRecords = filterRows(store[table], whereClause, whereParams);
    let affected = 0;

    matchingRecords.forEach(record => {
      setCols.forEach((col, idx) => {
        if (setParams[idx] !== undefined) {
          record[col] = setParams[idx];
        }
      });
      record.updated_at = new Date().toISOString();
      affected++;
    });

    if (affected > 0) {
      writeLocalStore(store);
    }

    return { affectedRows: affected };
  }

  // Handle DELETE FROM table
  if (lower.startsWith('delete from')) {
    const tableMatch = trimmed.match(/delete\s+from\s+([a-zA-Z0-9_]+)/i);
    const table = tableMatch ? tableMatch[1].toLowerCase() : null;
    if (!table || !store[table]) return { affectedRows: 0 };

    let toDelete = [];
    if (lower.includes('where')) {
      const whereClause = trimmed.substring(trimmed.search(/where/i) + 5);
      toDelete = filterRows(store[table], whereClause, params);
    } else {
      toDelete = [...store[table]];
    }

    const deleteIds = new Set(toDelete.map(r => r.id));
    const initLen = store[table].length;
    store[table] = store[table].filter(r => !deleteIds.has(r.id));
    const deletedCount = initLen - store[table].length;

    if (deletedCount > 0) {
      writeLocalStore(store);
    }
    return { affectedRows: deletedCount };
  }

  return [];
}

module.exports = {
  initDB,
  query,
  getConnection,
  getPool: () => pool,
  get isConnectedToMySQL() {
    return isConnectedToMySQL;
  },
  isMySQL: () => isConnectedToMySQL,
  getStatus: () => ({
    isMySQL: isConnectedToMySQL,
    message: dbStatusMessage,
    type: isConnectedToMySQL ? 'MySQL 8.0+' : 'Embedded SQLite/JSON Store'
  })
};
