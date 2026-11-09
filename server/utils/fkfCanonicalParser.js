// server/utils/fkfCanonicalParser.js
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/**
 * Strips YAML frontmatter from a Markdown string.
 * Returns { frontmatter: Object, body: string }.
 */
function stripYamlFrontmatter(markdownText) {
  const text = String(markdownText || '');
  if (!text.startsWith('---\n') && !text.startsWith('---\r\n')) {
    return { frontmatter: {}, body: text };
  }

  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) {
    return { frontmatter: {}, body: text };
  }

  const rawYaml = match[1];
  const body = match[2];
  const frontmatter = {};

  const lines = rawYaml.split(/\r?\n/);
  let currentArrayKey = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const listMatch = line.match(/^\s*-\s+(.*)$/);
    if (listMatch && currentArrayKey) {
      let val = listMatch[1].trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      frontmatter[currentArrayKey].push(val);
      continue;
    }

    const kv = line.match(/^([a-zA-Z0-9_-]+)\s*:\s*(.*)$/);
    if (kv) {
      const key = kv[1];
      let val = kv[2].trim();

      if (!val) {
        // Could be start of a YAML array
        currentArrayKey = key;
        frontmatter[key] = [];
        continue;
      }

      currentArrayKey = null;

      if (val.startsWith('[') && val.endsWith(']')) {
        const items = val.slice(1, -1).split(',').map(s => {
          let item = s.trim();
          if ((item.startsWith('"') && item.endsWith('"')) || (item.startsWith("'") && item.endsWith("'"))) {
            item = item.slice(1, -1);
          }
          return item;
        }).filter(Boolean);
        frontmatter[key] = items;
      } else if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        frontmatter[key] = val.slice(1, -1);
      } else if (val === 'null' || val === '~') {
        frontmatter[key] = null;
      } else if (val === 'true') {
        frontmatter[key] = true;
      } else if (val === 'false') {
        frontmatter[key] = false;
      } else {
        frontmatter[key] = val;
      }
    }
  }

  return { frontmatter, body };
}

/**
 * Deterministically sorts all object keys recursively.
 */
function canonicalizeObject(obj) {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(canonicalizeObject);
  }
  const sorted = {};
  const keys = Object.keys(obj).sort();
  for (const k of keys) {
    sorted[k] = canonicalizeObject(obj[k]);
  }
  return sorted;
}

/**
 * Computes deterministic SHA-256 hash across canonical package JSON.
 */
function computeDeterministicSha256(canonicalPackage) {
  const normalized = canonicalizeObject(canonicalPackage);
  const jsonStr = JSON.stringify(normalized);
  return crypto.createHash('sha256').update(jsonStr, 'utf8').digest('hex');
}

/**
 * Parses and validates an FKF 2.0 JSON document (or object).
 * Normalizes to InternalCanonicalPackage.
 *
 * @param {string|Buffer|Object} rawInput
 * @returns {{ valid: boolean, errors: Array<{code: string, message: string}>, warnings: Array<{code: string, message: string}>, canonical: Object|null }}
 */
function parseFkfDocument(rawInput) {
  const errors = [];
  const warnings = [];

  let doc;
  if (typeof rawInput === 'string' || Buffer.isBuffer(rawInput)) {
    const str = rawInput.toString('utf8').trim();
    try {
      doc = JSON.parse(str);
    } catch (parseErr) {
      return {
        valid: false,
        errors: [{ code: 'INVALID_JSON', message: `Malformed JSON: ${parseErr.message}` }],
        warnings,
        canonical: null
      };
    }
  } else if (typeof rawInput === 'object' && rawInput !== null) {
    doc = rawInput;
  } else {
    return {
      valid: false,
      errors: [{ code: 'INVALID_INPUT', message: 'Input must be a JSON string, Buffer, or Object.' }],
      warnings,
      canonical: null
    };
  }

  // 1. Format check (allow both flowden-knowledge-format and flowden-knowledge-package)
  const allowedFormats = ['flowden-knowledge-format', 'flowden-knowledge-package'];
  if (!doc.format || !allowedFormats.includes(doc.format)) {
    errors.push({
      code: 'UNSUPPORTED_FORMAT',
      message: `Invalid format: "${doc.format}". Expected "flowden-knowledge-format" or "flowden-knowledge-package".`
    });
  }

  // 2. Version check
  const version = doc.fkf_version || '2.0.0';
  if (typeof version !== 'string' || !/^\d+\.\d+\.\d+/.test(version)) {
    errors.push({
      code: 'INVALID_VERSION',
      message: `Invalid fkf_version: "${version}". Expected semantic version (e.g., "2.0.0").`
    });
  }

  // 3. Package ID
  const packageId = doc.package_id || `pkg-${Date.now()}`;
  if (typeof packageId !== 'string' || !/^[a-z][a-z0-9_-]{2,63}$/i.test(packageId)) {
    errors.push({
      code: 'INVALID_PACKAGE_ID',
      message: `Invalid package_id: "${packageId}". Must be 3-64 chars (alphanumeric, underscore, hyphen).`
    });
  }

  // 4. Project
  if (!doc.project || typeof doc.project !== 'object') {
    errors.push({
      code: 'MISSING_PROJECT',
      message: 'Package must define a "project" object with at least a title.'
    });
  } else if (!doc.project.title || typeof doc.project.title !== 'string' || !doc.project.title.trim()) {
    errors.push({
      code: 'MISSING_PROJECT_TITLE',
      message: 'project.title is required and cannot be empty.'
    });
  }

  const projId = (doc.project && doc.project.id) || 'proj-default';
  const projTitle = doc.project ? doc.project.title.trim() : 'Imported Project';
  const projSummary = doc.project ? (doc.project.summary || doc.project.description || '') : '';
  const projOverview = (doc.project && (doc.project.overview_markdown || doc.project.overview)) || `# ${projTitle}\n\n${projSummary}`;

  // 5. Folders
  const rawFolders = Array.isArray(doc.folders) ? doc.folders : [];
  const folders = [];
  const folderIdSet = new Set();

  for (let i = 0; i < rawFolders.length; i++) {
    const rf = rawFolders[i];
    const fid = rf.id || `fld-${i + 1}`;
    if (folderIdSet.has(fid)) {
      errors.push({ code: 'DUPLICATE_FOLDER_ID', message: `Duplicate folder id: "${fid}".` });
    }
    folderIdSet.add(fid);

    folders.push({
      id: fid,
      name: rf.name ? String(rf.name).trim() : `Folder ${i + 1}`,
      parent_id: rf.parent_id || null,
      sort_order: typeof rf.sort_order === 'number' ? rf.sort_order : i
    });
  }

  // 6. Notes (Must strip YAML frontmatter)
  const rawNotes = Array.isArray(doc.notes) ? doc.notes : [];
  const notes = [];
  const noteIdSet = new Set();

  for (let i = 0; i < rawNotes.length; i++) {
    const rn = rawNotes[i];
    const nid = rn.id || `note-${i + 1}`;
    if (noteIdSet.has(nid)) {
      errors.push({ code: 'DUPLICATE_NOTE_ID', message: `Duplicate note id: "${nid}".` });
    }
    noteIdSet.add(nid);

    // Accept content or content_markdown
    const rawContent = rn.content !== undefined ? rn.content : (rn.content_markdown !== undefined ? rn.content_markdown : '');
    const { frontmatter, body } = stripYamlFrontmatter(rawContent);

    const title = (rn.title || frontmatter.title || `Note ${i + 1}`).trim();
    const folderId = rn.folder_id !== undefined ? rn.folder_id : (frontmatter.folder_id || null);

    let tags = [];
    if (Array.isArray(rn.tags)) {
      tags = rn.tags;
    } else if (Array.isArray(frontmatter.tags)) {
      tags = frontmatter.tags;
    }

    notes.push({
      id: nid,
      title,
      folder_id: folderId || null,
      content_markdown: body,
      is_pinned: Boolean(rn.is_pinned || frontmatter.is_pinned),
      tags: tags.map(t => String(t).trim()).filter(Boolean)
    });
  }

  // 7. Sources
  const rawSources = Array.isArray(doc.sources) ? doc.sources : [];
  const sources = [];
  const sourceIdSet = new Set();

  for (let i = 0; i < rawSources.length; i++) {
    const rs = rawSources[i];
    const sid = rs.id || `src-${i + 1}`;
    if (sourceIdSet.has(sid)) {
      errors.push({ code: 'DUPLICATE_SOURCE_ID', message: `Duplicate source id: "${sid}".` });
    }
    sourceIdSet.add(sid);

    const excerpts = [];
    if (Array.isArray(rs.excerpts)) {
      for (let j = 0; j < rs.excerpts.length; j++) {
        const re = rs.excerpts[j];
        excerpts.push({
          id: re.id || `exc-${sid}-${j + 1}`,
          quoted_text: String(re.quoted_text || re.text || '').trim(),
          annotation: re.annotation || null,
          location_anchor: re.location_anchor || `page-${j + 1}`,
          color: re.color || '#fef08a'
        });
      }
    }

    sources.push({
      id: sid,
      title: (rs.title || `Source ${i + 1}`).trim(),
      source_type: rs.source_type || 'unspecified',
      verification_status: rs.verification_status || 'unverified',
      authors: Array.isArray(rs.authors) ? rs.authors : [],
      publication_date: rs.publication_date || null,
      source_url: rs.source_url || rs.url || null,
      summary: rs.summary || '',
      content_text: rs.content_text || rs.content || '',
      excerpts
    });
  }

  // 8. Relationships
  const rawLinks = Array.isArray(doc.relationships) ? doc.relationships : (Array.isArray(doc.links) ? doc.links : []);
  const relationships = [];

  for (const rl of rawLinks) {
    if (!rl.source_id || !rl.target_id) continue;
    relationships.push({
      source_id: rl.source_id,
      target_id: rl.target_id,
      link_type: rl.link_type || 'relates_to',
      origin: rl.origin || 'ai_suggested',
      is_confirmed: rl.is_confirmed !== undefined ? Boolean(rl.is_confirmed) : false,
      context_snippet: rl.context_snippet ? String(rl.context_snippet).slice(0, 500) : null
    });
  }

  // 9. Optional modules (tasks, spatial_board)
  const optionalModules = {
    tasks: { tasks: [] },
    spatial_board: null
  };

  const tasksContainer = (doc.optional_modules && doc.optional_modules.tasks) || (Array.isArray(doc.tasks) ? { tasks: doc.tasks } : null);
  if (tasksContainer && Array.isArray(tasksContainer.tasks)) {
    optionalModules.tasks.tasks = tasksContainer.tasks.map((t, idx) => ({
      id: t.id || `task-${idx + 1}`,
      title: (t.title || `Task ${idx + 1}`).trim(),
      description: t.description || null,
      status: t.status || 'planned',
      priority: t.priority || 'medium',
      due_date: t.due_date || null,
      sort_order: typeof t.sort_order === 'number' ? t.sort_order : idx,
      related_entity_ids: Array.isArray(t.related_entity_ids) ? t.related_entity_ids : []
    }));
  }

  const boardContainer = (doc.optional_modules && doc.optional_modules.spatial_board) || doc.spatial_board || (doc.board ? { board: doc.board } : null);
  if (boardContainer && boardContainer.board) {
    const b = boardContainer.board;
    optionalModules.spatial_board = {
      board: {
        id: b.id || 'board-1',
        title: (b.title || 'Spatial Board').trim(),
        description: b.description || 'Spatial workspace board',
        groups: Array.isArray(b.groups) ? b.groups : [],
        items: Array.isArray(b.items) ? b.items : [],
        connections: Array.isArray(b.connections) ? b.connections : []
      }
    };
  }

  if (errors.length > 0) {
    return {
      valid: false,
      errors,
      warnings,
      canonical: null
    };
  }

  const canonical = {
    format: 'flowden-knowledge-format',
    fkf_version: version,
    package_id: packageId,
    project: {
      id: projId,
      title: projTitle,
      summary: projSummary,
      overview_markdown: projOverview,
      color: (doc.project && doc.project.color) || '#3b82f6',
      icon: (doc.project && doc.project.icon) || 'folder'
    },
    folders,
    notes,
    sources,
    relationships,
    optional_modules: optionalModules
  };

  canonical.sha256 = computeDeterministicSha256(canonical);

  return {
    valid: true,
    errors: [],
    warnings,
    canonical
  };
}

/**
 * Stages an InternalCanonicalPackage into a standardized filesystem directory.
 * This ensures identical downstream processing for both .fkf and .flowden.zip.
 *
 * @param {Object} canonical
 * @param {string} stageDir
 */
function stageCanonicalPackage(canonical, stageDir) {
  if (!fs.existsSync(stageDir)) {
    fs.mkdirSync(stageDir, { recursive: true });
  }

  // 1. manifest.json
  const manifest = {
    format: 'flowden-knowledge-package',
    fkf_version: canonical.fkf_version,
    package_id: canonical.package_id,
    project: {
      id: canonical.project.id,
      title: canonical.project.title,
      summary: canonical.project.summary,
      color: canonical.project.color,
      icon: canonical.project.icon
    },
    entities: {
      notes: canonical.notes.map(n => ({
        id: n.id,
        title: n.title,
        folder_id: n.folder_id,
        tags: n.tags,
        is_pinned: n.is_pinned,
        filename: `${n.id}.md`
      }))
    }
  };
  fs.writeFileSync(path.join(stageDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');

  // 2. project/overview.md
  const projDir = path.join(stageDir, 'project');
  if (!fs.existsSync(projDir)) {
    fs.mkdirSync(projDir, { recursive: true });
  }
  fs.writeFileSync(path.join(projDir, 'overview.md'), canonical.project.overview_markdown, 'utf8');

  // 3. folders.json
  fs.writeFileSync(path.join(stageDir, 'folders.json'), JSON.stringify({ folders: canonical.folders }, null, 2), 'utf8');

  // 4. sources/index.json
  const sourcesDir = path.join(stageDir, 'sources');
  if (!fs.existsSync(sourcesDir)) {
    fs.mkdirSync(sourcesDir, { recursive: true });
  }
  fs.writeFileSync(path.join(sourcesDir, 'index.json'), JSON.stringify({ sources: canonical.sources }, null, 2), 'utf8');

  // Write sources individual markdown files if content_text exists
  for (const s of canonical.sources) {
    if (s.content_text) {
      fs.writeFileSync(path.join(sourcesDir, `${s.id}.md`), s.content_text, 'utf8');
    }
  }

  // 5. relationships/links.json
  const relDir = path.join(stageDir, 'relationships');
  if (!fs.existsSync(relDir)) {
    fs.mkdirSync(relDir, { recursive: true });
  }
  fs.writeFileSync(path.join(relDir, 'links.json'), JSON.stringify({ links: canonical.relationships }, null, 2), 'utf8');

  // 6. notes/*.md
  const notesDir = path.join(stageDir, 'notes');
  if (!fs.existsSync(notesDir)) {
    fs.mkdirSync(notesDir, { recursive: true });
  }
  for (const n of canonical.notes) {
    fs.writeFileSync(path.join(notesDir, `${n.id}.md`), n.content_markdown, 'utf8');
  }

  // 7. optional modules
  const optDir = path.join(stageDir, 'optional');
  if (canonical.optional_modules.tasks && canonical.optional_modules.tasks.tasks.length > 0) {
    if (!fs.existsSync(optDir)) fs.mkdirSync(optDir, { recursive: true });
    fs.writeFileSync(path.join(optDir, 'tasks.json'), JSON.stringify(canonical.optional_modules.tasks, null, 2), 'utf8');
  }

  if (canonical.optional_modules.spatial_board && canonical.optional_modules.spatial_board.board) {
    if (!fs.existsSync(optDir)) fs.mkdirSync(optDir, { recursive: true });
    fs.writeFileSync(path.join(optDir, 'spatial-board.json'), JSON.stringify(canonical.optional_modules.spatial_board, null, 2), 'utf8');
  }

  // 8. raw canonical.fkf for provenance
  fs.writeFileSync(path.join(stageDir, 'canonical.fkf'), JSON.stringify(canonical, null, 2), 'utf8');
}

module.exports = {
  stripYamlFrontmatter,
  canonicalizeObject,
  computeDeterministicSha256,
  parseFkfDocument,
  stageCanonicalPackage
};
