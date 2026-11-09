// server/utils/fkfCanonicalParser.js
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { validateFkfV2Document } = require('./fkfSchemaValidator');

const FORBIDDEN_DB_PROPERTIES = ['database_id', 'dbId', 'user_id', 'created_at', 'updated_at'];

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
        currentArrayKey = key;
        frontmatter[key] = [];
        continue;
      }

      currentArrayKey = null;

      if (val.startsWith('[') && val.endsWith(']')) {
        const items = val.slice(1, -1).split(',').map(s => {
          let item = s.trim();
          if ((item.startsWith('"') && item.endsWith('"')) || (item.startsWith("'") && val.endsWith("'"))) {
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
 * Extract all [[fkf:...]] WikiLink occurrences from Markdown text without modifying them.
 */
function extractFkfWikiLinks(markdownText) {
  const text = String(markdownText || '');
  const results = [];
  const regex = /\[\[fkf:([^\]]*)\]\]/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    const rawToken = match[0];
    const inner = match[1];
    const pipeIdx = inner.indexOf('|');
    const targetId = (pipeIdx === -1 ? inner : inner.slice(0, pipeIdx)).trim();
    const label = pipeIdx === -1 ? null : inner.slice(pipeIdx + 1).trim();
    const validSyntax = /^[a-z][a-z0-9_-]{1,63}$/i.test(targetId) && (label === null || label.length > 0);
    results.push({
      rawToken,
      targetId,
      label,
      validSyntax
    });
  }
  return results;
}

/**
 * Scans object recursively for forbidden database-owned properties.
 */
function scanForbiddenDbProperties(obj, pointer = '#', outErrors = []) {
  if (obj === null || typeof obj !== 'object') return outErrors;
  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      scanForbiddenDbProperties(obj[i], `${pointer}[${i}]`, outErrors);
    }
    return outErrors;
  }
  for (const [key, val] of Object.entries(obj)) {
    if (FORBIDDEN_DB_PROPERTIES.includes(key)) {
      outErrors.push({
        code: 'FORBIDDEN_DATABASE_PROPERTY',
        pointer: `${pointer}.${key}`,
        message: `Forbidden database-owned property "${key}" found at ${pointer}.${key}. External packages must not supply database-managed IDs or timestamps.`
      });
    }
    scanForbiddenDbProperties(val, `${pointer}.${key}`, outErrors);
  }
  return outErrors;
}

/**
 * Validates folder hierarchy for missing parents, cycles, and max depth (8).
 */
function validateFolderHierarchy(folders) {
  const errors = [];
  const folderMap = new Map();
  for (const f of folders) {
    folderMap.set(f.id, f);
  }

  for (const f of folders) {
    if (f.parent_id !== null && f.parent_id !== undefined) {
      if (!folderMap.has(f.parent_id)) {
        errors.push({
          code: 'MISSING_FOLDER_PARENT',
          file: 'folders',
          entityId: f.id,
          message: `Folder "${f.id}" references non-existent parent_id "${f.parent_id}".`
        });
      }
    }
  }

  for (const f of folders) {
    const visited = new Set([f.id]);
    let cur = f;
    let depth = 1;
    while (cur && cur.parent_id) {
      if (visited.has(cur.parent_id)) {
        errors.push({
          code: 'FOLDER_HIERARCHY_CYCLE',
          file: 'folders',
          entityId: f.id,
          message: `Circular folder hierarchy detected involving folder "${f.id}" and "${cur.parent_id}".`
        });
        break;
      }
      visited.add(cur.parent_id);
      cur = folderMap.get(cur.parent_id);
      depth += 1;
      if (depth > 8) {
        errors.push({
          code: 'FOLDER_DEPTH_EXCEEDED',
          file: 'folders',
          entityId: f.id,
          message: `Folder "${f.id}" exceeds maximum hierarchy depth of 8.`
        });
        break;
      }
    }
  }

  return errors;
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

  // 1. Check for forbidden database-owned properties anywhere in document
  scanForbiddenDbProperties(doc, '#', errors);

  // 2. Validate against FKF v2 JSON Schema (Draft 2020-12)
  try {
    const schemaErrors = validateFkfV2Document(doc, 'package.fkf');
    for (const se of schemaErrors) {
      // Map schema validation errors to structured errors
      errors.push(se);
    }
  } catch (schemaEx) {
    errors.push({
      code: 'SCHEMA_VALIDATION_ERROR',
      message: `Schema validator failure: ${schemaEx.message}`
    });
  }

  // 3. Format check: FKF 2.0 strictly requires "flowden-knowledge-format"
  if (doc.format !== 'flowden-knowledge-format') {
    errors.push({
      code: 'UNSUPPORTED_FORMAT',
      message: `Invalid format: "${doc.format}". FKF 2.0 requires format: "flowden-knowledge-format".`
    });
  }

  // 4. Version check: FKF 2.0 strictly requires major version 2
  if (!doc.fkf_version || typeof doc.fkf_version !== 'string' || !/^2\.\d+\.\d+/.test(doc.fkf_version)) {
    errors.push({
      code: 'UNSUPPORTED_VERSION',
      message: `Invalid or missing fkf_version: "${doc.fkf_version}". FKF 2.0 requires a major version 2 semver (e.g., "2.0.0").`
    });
  }
  const version = doc.fkf_version;

  // Global ID Registry to enforce package-wide uniqueness and track valid entity IDs
  const packageIdRegistry = new Map();
  function registerPackageEntityId(id, entityType, fileLabel = 'package.fkf') {
    if (!id || typeof id !== 'string') return;
    if (packageIdRegistry.has(id)) {
      const prev = packageIdRegistry.get(id);
      errors.push({
        code: 'DUPLICATE_PACKAGE_ID',
        file: fileLabel,
        entityId: id,
        message: `Duplicate package-local ID "${id}" detected (collides with ${prev.entityType}).`
      });
    } else {
      packageIdRegistry.set(id, { id, entityType });
    }
  }

  // 5. Package ID: strictly required, do not synthesize, must use prefix pkg-
  if (!doc.package_id || typeof doc.package_id !== 'string' || !/^[a-z][a-z0-9_-]{1,63}$/i.test(doc.package_id)) {
    errors.push({
      code: 'MISSING_PACKAGE_ID',
      message: `Missing or invalid package_id: "${doc.package_id}". Required 3-64 chars (alphanumeric, underscore, hyphen).`
    });
  } else if (!/^(?:pkg|package)-/i.test(doc.package_id)) {
    errors.push({
      code: 'INVALID_ID_PREFIX',
      entityId: doc.package_id,
      message: `Package ID "${doc.package_id}" must start with prefix "pkg-".`
    });
  }
  const packageId = doc.package_id;
  if (packageId) {
    registerPackageEntityId(packageId, 'package');
  }

  // 6. Project: strictly required id and title, do not synthesize
  if (!doc.project || typeof doc.project !== 'object') {
    errors.push({
      code: 'MISSING_PROJECT',
      message: 'Package must define a "project" object with required "id" and "title".'
    });
  } else {
    if (!doc.project.id || typeof doc.project.id !== 'string' || !doc.project.id.trim()) {
      errors.push({
        code: 'MISSING_PROJECT_ID',
        message: 'project.id is required and cannot be empty.'
      });
    } else if (!/^(?:proj|project)-/i.test(doc.project.id)) {
      errors.push({
        code: 'INVALID_ID_PREFIX',
        entityId: doc.project.id,
        message: `Project ID "${doc.project.id}" must start with prefix "proj-".`
      });
    } else {
      registerPackageEntityId(doc.project.id, 'project');
    }

    if (!doc.project.title || typeof doc.project.title !== 'string' || !doc.project.title.trim()) {
      errors.push({
        code: 'MISSING_PROJECT_TITLE',
        message: 'project.title is required and cannot be empty.'
      });
    }
  }

  const projId = doc.project ? doc.project.id : null;
  const projTitle = doc.project && doc.project.title ? doc.project.title.trim() : '';
  const projSummary = doc.project ? (doc.project.summary || doc.project.description || '') : '';
  const projOverview = (doc.project && (doc.project.overview_markdown || doc.project.overview)) || `# ${projTitle}\n\n${projSummary}`;

  // 7. Folders
  const rawFolders = Array.isArray(doc.folders) ? doc.folders : [];
  const folders = [];
  const folderIdSet = new Set();

  for (let i = 0; i < rawFolders.length; i++) {
    const rf = rawFolders[i];
    if (!rf.id || typeof rf.id !== 'string' || !rf.id.trim()) {
      errors.push({ code: 'MISSING_FOLDER_ID', message: `Folder at index ${i} is missing required "id".` });
      continue;
    }
    const fid = rf.id.trim();
    if (!/^(?:fld|folder)-/i.test(fid)) {
      errors.push({
        code: 'INVALID_ID_PREFIX',
        entityId: fid,
        message: `Folder ID "${fid}" must start with prefix "fld-".`
      });
    }
    if (folderIdSet.has(fid)) {
      errors.push({ code: 'DUPLICATE_FOLDER_ID', message: `Duplicate folder id: "${fid}".` });
    }
    folderIdSet.add(fid);
    registerPackageEntityId(fid, 'folder');

    folders.push({
      id: fid,
      name: rf.name ? String(rf.name).trim() : fid,
      parent_id: rf.parent_id || null,
      sort_order: typeof rf.sort_order === 'number' ? rf.sort_order : i
    });
  }

  // Validate folder hierarchy (missing parent, cycles, depth)
  if (folders.length > 0) {
    const hierarchyErrors = validateFolderHierarchy(folders);
    errors.push(...hierarchyErrors);
  }

  // 8. Notes: strictly requires at least one valid note, do not synthesize IDs
  if (!doc.notes || !Array.isArray(doc.notes) || doc.notes.length === 0) {
    errors.push({
      code: 'MISSING_NOTES',
      message: 'FKF 2.0 package must contain at least one valid note in "notes".'
    });
  }

  const rawNotes = Array.isArray(doc.notes) ? doc.notes : [];
  const notes = [];
  const noteIdSet = new Set();

  for (let i = 0; i < rawNotes.length; i++) {
    const rn = rawNotes[i];
    if (!rn.id || typeof rn.id !== 'string' || !rn.id.trim()) {
      errors.push({ code: 'MISSING_NOTE_ID', message: `Note at index ${i} is missing required "id".` });
      continue;
    }
    const nid = rn.id.trim();
    if (!/^(?:note|n)-/i.test(nid)) {
      errors.push({
        code: 'INVALID_ID_PREFIX',
        entityId: nid,
        message: `Note ID "${nid}" must start with prefix "note-".`
      });
    }
    if (noteIdSet.has(nid)) {
      errors.push({ code: 'DUPLICATE_NOTE_ID', message: `Duplicate note id: "${nid}".` });
    }
    noteIdSet.add(nid);
    registerPackageEntityId(nid, 'note');

    // Accept content or content_markdown
    const rawContent = rn.content !== undefined ? rn.content : (rn.content_markdown !== undefined ? rn.content_markdown : '');
    const { frontmatter, body } = stripYamlFrontmatter(rawContent);

    const title = (rn.title || frontmatter.title || '').trim();
    if (!title) {
      errors.push({ code: 'MISSING_NOTE_TITLE', message: `Note "${nid}" is missing required "title".` });
    }
    const folderId = rn.folder_id !== undefined ? rn.folder_id : (frontmatter.folder_id || null);

    if (folderId !== null && folderId !== undefined && !folderIdSet.has(folderId)) {
      errors.push({
        code: 'MISSING_NOTE_FOLDER',
        entityId: nid,
        message: `Note "${nid}" references non-existent folder_id "${folderId}".`
      });
    }

    let tags = [];
    if (Array.isArray(rn.tags)) {
      tags = rn.tags;
    } else if (Array.isArray(frontmatter.tags)) {
      tags = frontmatter.tags;
    }

    notes.push({
      id: nid,
      title: title || 'Untitled Note',
      folder_id: folderId || null,
      content_markdown: body,
      is_pinned: Boolean(rn.is_pinned || frontmatter.is_pinned),
      tags: tags.map(t => String(t).trim()).filter(Boolean)
    });
  }

  // 9. Sources
  const rawSources = Array.isArray(doc.sources) ? doc.sources : [];
  const sources = [];
  const sourceIdSet = new Set();

  for (let i = 0; i < rawSources.length; i++) {
    const rs = rawSources[i];
    if (!rs.id || typeof rs.id !== 'string' || !rs.id.trim()) {
      errors.push({ code: 'MISSING_SOURCE_ID', message: `Source at index ${i} is missing required "id".` });
      continue;
    }
    const sid = rs.id.trim();
    if (!/^(?:src|source)-/i.test(sid)) {
      errors.push({
        code: 'INVALID_ID_PREFIX',
        entityId: sid,
        message: `Source ID "${sid}" must start with prefix "src-".`
      });
    }
    if (sourceIdSet.has(sid)) {
      errors.push({ code: 'DUPLICATE_SOURCE_ID', message: `Duplicate source id: "${sid}".` });
    }
    sourceIdSet.add(sid);
    registerPackageEntityId(sid, 'research');

    const excerpts = [];
    if (Array.isArray(rs.excerpts)) {
      for (let j = 0; j < rs.excerpts.length; j++) {
        const re = rs.excerpts[j];
        const eid = (re.id || `exc-${sid}-${j + 1}`).trim();
        if (!/^(?:exc|excerpt)-/i.test(eid)) {
          errors.push({
            code: 'INVALID_ID_PREFIX',
            entityId: eid,
            message: `Excerpt ID "${eid}" must start with prefix "exc-".`
          });
        }
        registerPackageEntityId(eid, 'excerpt');

        excerpts.push({
          id: eid,
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
      tags: Array.isArray(rs.tags) ? rs.tags : [],
      is_synthetic_example: Boolean(rs.is_synthetic_example),
      excerpts
    });
  }

  // 10. Optional modules (tasks, spatial_board)
  const optionalModules = {
    tasks: { tasks: [] },
    spatial_board: null
  };

  const tasksContainer = (doc.optional_modules && doc.optional_modules.tasks) || (Array.isArray(doc.tasks) ? { tasks: doc.tasks } : null);
  if (tasksContainer && Array.isArray(tasksContainer.tasks)) {
    optionalModules.tasks.tasks = tasksContainer.tasks.map((t, idx) => {
      const tid = (t.id || `tsk-${idx + 1}`).trim();
      if (!/^(?:tsk|task)-/i.test(tid)) {
        errors.push({
          code: 'INVALID_ID_PREFIX',
          entityId: tid,
          message: `Task ID "${tid}" must start with prefix "tsk-".`
        });
      }
      registerPackageEntityId(tid, 'task');

      return {
        id: tid,
        title: (t.title || `Task ${idx + 1}`).trim(),
        description: t.description || null,
        status: t.status || 'planned',
        priority: t.priority || 'medium',
        due_date: t.due_date || null,
        sort_order: typeof t.sort_order === 'number' ? t.sort_order : idx,
        related_entity_ids: Array.isArray(t.related_entity_ids) ? t.related_entity_ids : []
      };
    });

    // Check task cross references
    for (const t of optionalModules.tasks.tasks) {
      for (const relId of t.related_entity_ids || []) {
        if (!packageIdRegistry.has(relId)) {
          errors.push({
            code: 'MISSING_RELATIONSHIP_TARGET',
            entityId: t.id,
            message: `Task "${t.id}" references non-existent related_entity_id "${relId}".`
          });
        }
      }
    }
  }

  const boardContainer = (doc.optional_modules && doc.optional_modules.spatial_board) || doc.spatial_board || (doc.board ? { board: doc.board } : null);
  if (boardContainer && boardContainer.board) {
    const b = boardContainer.board;
    const bid = (b.id || 'brd-1').trim();
    if (!/^(?:brd|board)-/i.test(bid)) {
      errors.push({
        code: 'INVALID_ID_PREFIX',
        entityId: bid,
        message: `Board ID "${bid}" must start with prefix "brd-".`
      });
    }
    registerPackageEntityId(bid, 'board');

    const groups = [];
    const groupIds = new Set();
    for (const g of b.groups || []) {
      const gid = (g.id || '').trim();
      if (!/^(?:grp|group)-/i.test(gid)) {
        errors.push({
          code: 'INVALID_ID_PREFIX',
          entityId: gid,
          message: `Board Group ID "${gid}" must start with prefix "grp-".`
        });
      }
      groupIds.add(gid);
      registerPackageEntityId(gid, 'board_group');
      groups.push(g);
    }

    const items = [];
    const itemIds = new Set();
    for (const item of b.items || []) {
      const itmid = (item.id || '').trim();
      if (!/^(?:bitm|itm|item)-/i.test(itmid)) {
        errors.push({
          code: 'INVALID_ID_PREFIX',
          entityId: itmid,
          message: `Board Item ID "${itmid}" must start with prefix "bitm-".`
        });
      }
      itemIds.add(itmid);
      registerPackageEntityId(itmid, 'board_item');

      if (item.group_id && !groupIds.has(item.group_id)) {
        errors.push({
          code: 'MISSING_BOARD_GROUP_TARGET',
          entityId: itmid,
          message: `Board item "${itmid}" references non-existent group_id "${item.group_id}".`
        });
      }
      if (item.reference_package_id && !packageIdRegistry.has(item.reference_package_id)) {
        errors.push({
          code: 'MISSING_RELATIONSHIP_TARGET',
          entityId: itmid,
          message: `Board item "${itmid}" projects non-existent reference_package_id "${item.reference_package_id}".`
        });
      }
      items.push(item);
    }

    const connections = [];
    for (const conn of b.connections || []) {
      const cid = (conn.id || '').trim();
      if (cid && !/^(?:bcon|conn)-/i.test(cid)) {
        errors.push({
          code: 'INVALID_ID_PREFIX',
          entityId: cid,
          message: `Board Connection ID "${cid}" must start with prefix "bcon-".`
        });
      }
      if (cid) registerPackageEntityId(cid, 'board_connection');

      if (!itemIds.has(conn.source_item_id) || !itemIds.has(conn.target_item_id)) {
        errors.push({
          code: 'MISSING_BOARD_CONNECTION_ENDPOINT',
          entityId: cid,
          message: `Board connection "${cid}" references missing board_item (${conn.source_item_id} -> ${conn.target_item_id}).`
        });
      }
      connections.push(conn);
    }

    optionalModules.spatial_board = {
      board: {
        id: bid,
        title: (b.title || 'Spatial Board').trim(),
        description: b.description || 'Spatial workspace board',
        groups,
        items,
        connections
      }
    };
  }

  // 11. Relationships
  const rawLinks = Array.isArray(doc.relationships) ? doc.relationships : (Array.isArray(doc.links) ? doc.links : []);
  const relationships = [];

  for (let i = 0; i < rawLinks.length; i++) {
    const rl = rawLinks[i];
    if (!rl.source_id || !rl.target_id) continue;

    if (rl.id) {
      if (!/^(?:rel|link)-/i.test(rl.id)) {
        errors.push({
          code: 'INVALID_ID_PREFIX',
          entityId: rl.id,
          message: `Relationship ID "${rl.id}" must start with prefix "rel-".`
        });
      }
      registerPackageEntityId(rl.id, 'relationship');
    }

    if (!packageIdRegistry.has(rl.source_id)) {
      errors.push({
        code: 'MISSING_RELATIONSHIP_TARGET',
        message: `Relationship at index ${i} source_id "${rl.source_id}" does not exist in package.`
      });
    }
    if (!packageIdRegistry.has(rl.target_id)) {
      errors.push({
        code: 'MISSING_RELATIONSHIP_TARGET',
        message: `Relationship at index ${i} target_id "${rl.target_id}" does not exist in package.`
      });
    }

    relationships.push({
      id: rl.id || undefined,
      source_id: rl.source_id,
      target_id: rl.target_id,
      link_type: rl.link_type || 'relates_to',
      origin: rl.origin || 'ai_suggested',
      is_confirmed: rl.is_confirmed !== undefined ? Boolean(rl.is_confirmed) : false,
      context_snippet: rl.context_snippet ? String(rl.context_snippet).slice(0, 500) : null
    });
  }

  // 12. Validate WikiLinks in Note contents and Project overview
  for (const n of notes) {
    const noteWikiLinks = extractFkfWikiLinks(n.content_markdown);
    for (const wl of noteWikiLinks) {
      if (!wl.validSyntax || !packageIdRegistry.has(wl.targetId)) {
        errors.push({
          code: 'INVALID_WIKILINK_ID',
          entityId: n.id,
          token: wl.rawToken,
          message: `WikiLink "${wl.rawToken}" in note "${n.id}" references unknown or invalid package ID "${wl.targetId}".`
        });
      }
    }
  }

  const overviewWikiLinks = extractFkfWikiLinks(projOverview);
  for (const wl of overviewWikiLinks) {
    if (!wl.validSyntax || !packageIdRegistry.has(wl.targetId)) {
      errors.push({
        code: 'INVALID_WIKILINK_ID',
        token: wl.rawToken,
        message: `WikiLink "${wl.rawToken}" in project overview references unknown or invalid package ID "${wl.targetId}".`
      });
    }
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
    generator: doc.generator || null,
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
    generator: canonical.generator || {
      name: 'Flowden FKF 2.0 Ingress Transformer',
      version: '2.0.0',
      model: 'flowden-core',
      prompt_topic: canonical.project.title,
      generated_at: new Date().toISOString(),
      contains_synthetic_sources: false
    },
    project: {
      id: canonical.project.id,
      title: canonical.project.title,
      summary: canonical.project.summary,
      overview_file: 'project/overview.md',
      color: canonical.project.color,
      icon: canonical.project.icon
    },
    index_files: {
      folders: 'folders.json',
      sources: 'sources/index.json',
      relationships: 'relationships/links.json'
    },
    entities: {
      notes: canonical.notes.map(n => ({
        id: n.id,
        title: n.title,
        folder_id: n.folder_id,
        tags: n.tags,
        is_pinned: n.is_pinned,
        file: `notes/${n.id}.md`
      })),
      assets: []
    },
    optional_modules: {
      tasks: {
        enabled: Boolean(canonical.optional_modules.tasks && canonical.optional_modules.tasks.tasks.length > 0),
        file: 'optional/tasks.json'
      },
      spatial_board: {
        enabled: Boolean(canonical.optional_modules.spatial_board && canonical.optional_modules.spatial_board.board),
        file: 'optional/spatial-board.json'
      },
      research_report_pdf: {
        enabled: false,
        file: null
      }
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
  extractFkfWikiLinks,
  validateFolderHierarchy,
  parseFkfDocument,
  stageCanonicalPackage
};
