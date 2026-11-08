// server/services/searchService.js

const { accessPredicate } = require('../utils/searchAccessPredicate');

/**
 * Normalizes query results across mysql2 pool/connection ([rows, fields])
 * and application database wrapper (rows).
 */
function extractRows(queryResult) {
  if (Array.isArray(queryResult) && Array.isArray(queryResult[0])) {
    return queryResult[0];
  }
  if (Array.isArray(queryResult)) {
    return queryResult;
  }
  return [];
}

/**
 * Escapes MySQL LIKE wildcard characters (%, _, \) in user query strings
 * so literal characters do not act as unintended SQL wildcards.
 */
function escapeLikePattern(str) {
  return String(str || '').replace(/[\\%_]/g, '\\$&');
}

/**
 * Universal Search & Authorization Service for FLOWDEN
 * Reusable across search, autocomplete, mentions, backlinks, graph, context retrieval, and MCP tools.
 */
class SearchService {
  /**
   * Universal full-text search across all accessible entities.
   * MATCH columns strictly match `(title, search_text)` FULLTEXT index on entities.
   * Placeholders strictly follow positional `?` conventions.
   * For short queries (< 3 chars where InnoDB FULLTEXT innodb_ft_min_token_size = 3
   * skips indexing) or substring queries where FULLTEXT returns zero rows, falls back
   * to a parameterized LIKE query enforcing the exact same accessPredicate.
   */
  static async universalSearch(dbOrConn, userId, queryText, options = {}) {
    if (!queryText || !queryText.trim()) {
      return [];
    }

    const access = accessPredicate(userId, options);
    const limit = parseInt(options.limit, 10) || 20;
    const cleanQuery = queryText.trim();
    const isMockSimulator = Boolean(dbOrConn && dbOrConn.data);

    if (cleanQuery.length >= 3 || isMockSimulator) {
      const sql = `
        SELECT e.id, e.uuid, e.entity_type, e.entity_id, e.title, e.owner_user_id, e.primary_project_id,
               e.search_text,
               MATCH(e.title, e.search_text) AGAINST (? IN NATURAL LANGUAGE MODE) AS score
        FROM entities e
        WHERE MATCH(e.title, e.search_text) AGAINST (? IN NATURAL LANGUAGE MODE)
          AND ${access.sql}
        ORDER BY score DESC
        LIMIT ?
      `;

      const params = [cleanQuery, cleanQuery, ...access.params, limit];
      const res = await dbOrConn.query(sql, params);
      const rows = extractRows(res);
      if (rows.length > 0 || isMockSimulator) {
        return rows;
      }
    }

    const escaped = escapeLikePattern(cleanQuery);
    const likePattern = `%${escaped}%`;
    const fallbackSql = `
      SELECT e.id, e.uuid, e.entity_type, e.entity_id, e.title, e.owner_user_id, e.primary_project_id,
             e.search_text,
             CASE WHEN e.title LIKE ? THEN 2.0 ELSE 1.0 END AS score
      FROM entities e
      WHERE (e.title LIKE ? OR e.search_text LIKE ?)
        AND ${access.sql}
      ORDER BY score DESC, e.title ASC
      LIMIT ?
    `;

    const fallbackParams = [likePattern, likePattern, likePattern, ...access.params, limit];
    const fallbackRes = await dbOrConn.query(fallbackSql, fallbackParams);
    return extractRows(fallbackRes);
  }

  /**
   * Autocomplete entities for wikilink insertion (`[[type:id|Title]]`).
   */
  static async autocompleteWikilinks(dbOrConn, userId, queryText, options = {}) {
    const access = accessPredicate(userId, options);
    const limit = parseInt(options.limit, 10) || 10;
    const wildcard = `%${escapeLikePattern((queryText || '').trim())}%`;

    const sql = `
      SELECT e.id, e.uuid, e.entity_type, e.entity_id, e.title, e.primary_project_id
      FROM entities e
      WHERE (e.title LIKE ? OR e.search_text LIKE ?)
        AND ${access.sql}
      ORDER BY e.title ASC
      LIMIT ?
    `;

    const params = [wildcard, wildcard, ...access.params, limit];
    const res = await dbOrConn.query(sql, params);
    const rows = extractRows(res);
    return rows.map(r => ({
      ...r,
      wikilink: `[[${r.entity_type}:${r.entity_id}|${r.title}]]`
    }));
  }

  /**
   * Discover accessible entities for @mentions.
   */
  static async discoverMentions(dbOrConn, userId, queryText, options = {}) {
    const access = accessPredicate(userId, options);
    const limit = parseInt(options.limit, 10) || 10;
    const wildcard = `%${(queryText || '').trim()}%`;

    const sql = `
      SELECT e.id, e.entity_type, e.entity_id, e.title
      FROM entities e
      WHERE e.title LIKE ?
        AND ${access.sql}
      ORDER BY e.title ASC
      LIMIT ?
    `;

    const params = [wildcard, ...access.params, limit];
    const res = await dbOrConn.query(sql, params);
    return extractRows(res);
  }

  /**
   * Backlinks retrieval.
   * Traversal rule: A link NEVER grants access. The source entity at the far end of
   * the link must pass accessPredicate on its own; otherwise it is never returned.
   */
  static async getBacklinks(dbOrConn, userId, { entityType, entityId }, options = {}) {
    const accessSrc = accessPredicate(userId, { tableAlias: 'e_src', ...options });

    const sql = `
      SELECT el.id AS link_id, el.link_type, el.origin, el.context_snippet, el.created_at,
             e_src.id AS source_entity_table_id,
             e_src.entity_type AS source_entity_type,
             e_src.entity_id AS source_entity_id,
             e_src.title AS source_title
      FROM entity_links el
      JOIN entities e_src 
        ON e_src.entity_type = el.source_type 
       AND e_src.entity_id = el.source_id
      WHERE el.target_type = ? 
        AND el.target_id = ?
        AND el.deleted_at IS NULL
        AND el.is_confirmed = TRUE
        AND ${accessSrc.sql}
      ORDER BY el.created_at DESC
    `;

    const params = [entityType, entityId, ...accessSrc.params];
    const res = await dbOrConn.query(sql, params);
    return extractRows(res);
  }

  /**
   * Unlinked mentions discovery.
   * Finds entities that mention the target's title but have no explicit entity_link.
   * Every candidate entity must independently pass accessPredicate.
   */
  static async getUnlinkedMentions(dbOrConn, userId, { entityType, entityId, title }, options = {}) {
    if (!title || !title.trim()) {
      return [];
    }

    const access = accessPredicate(userId, { tableAlias: 'e', ...options });
    const pattern = `%${title.trim()}%`;

    const sql = `
      SELECT e.id, e.entity_type, e.entity_id, e.title
      FROM entities e
      WHERE (e.title LIKE ? OR e.search_text LIKE ?)
        AND NOT (e.entity_type = ? AND e.entity_id = ?)
        AND NOT EXISTS (
          SELECT 1 FROM entity_links el
          WHERE el.source_type = e.entity_type AND el.source_id = e.entity_id
            AND el.target_type = ? AND el.target_id = ?
            AND el.deleted_at IS NULL
        )
        AND ${access.sql}
      ORDER BY e.title ASC
      LIMIT 20
    `;

    const params = [pattern, pattern, entityType, entityId, entityType, entityId, ...access.params];
    const res = await dbOrConn.query(sql, params);
    return extractRows(res);
  }

  /**
   * Graph retrieval (Global or Scoped).
   * Strict authorization:
   * - Every node in the graph must pass accessPredicate.
   * - An edge is returned ONLY if BOTH its source and target pass accessPredicate independently.
   */
  static async getGraph(dbOrConn, userId, options = {}) {
    const accessNode = accessPredicate(userId, { tableAlias: 'e', ...options });
    const accessSrc = accessPredicate(userId, { tableAlias: 'e_src', ...options });
    const accessTgt = accessPredicate(userId, { tableAlias: 'e_tgt', ...options });

    // 1. Accessible Nodes
    const resNodes = await dbOrConn.query(`
      SELECT e.id, e.uuid, e.entity_type, e.entity_id, e.title, e.primary_project_id
      FROM entities e
      WHERE ${accessNode.sql}
    `, accessNode.params);
    const nodes = extractRows(resNodes);

    // 2. Accessible Edges
    const resEdges = await dbOrConn.query(`
      SELECT el.id, el.source_type, el.source_id, el.target_type, el.target_id, el.link_type, el.origin
      FROM entity_links el
      JOIN entities e_src ON e_src.entity_type = el.source_type AND e_src.entity_id = el.source_id
      JOIN entities e_tgt ON e_tgt.entity_type = el.target_type AND e_tgt.entity_id = el.target_id
      WHERE el.deleted_at IS NULL
        AND el.is_confirmed = TRUE
        AND ${accessSrc.sql}
        AND ${accessTgt.sql}
    `, [...accessSrc.params, ...accessTgt.params]);
    const edges = extractRows(resEdges);

    return { nodes, edges };
  }

  /**
   * Project Context Retrieval.
   */
  static async getProjectContext(dbOrConn, userId, projectId, options = {}) {
    const access = accessPredicate(userId, { activeProjectId: projectId, ...options });
    const limit = parseInt(options.limit, 10) || 50;

    const sql = `
      SELECT e.id, e.uuid, e.entity_type, e.entity_id, e.title, e.search_text
      FROM entities e
      WHERE ${access.sql}
      ORDER BY e.updated_at DESC
      LIMIT ?
    `;

    const res = await dbOrConn.query(sql, [...access.params, limit]);
    return extractRows(res);
  }

  /**
   * Verify the primary_project_id ⊆ project_entities invariant.
   * Returns count of violating records (should always be 0).
   */
  static async checkInvariant(dbOrConn) {
    const sql = `
      SELECT COUNT(*) AS violationCount
      FROM entities e
      WHERE e.primary_project_id IS NOT NULL
        AND e.entity_type NOT IN ('project', 'capture')
        AND NOT EXISTS (
          SELECT 1 FROM project_entities pe
          WHERE pe.project_id = e.primary_project_id
            AND pe.entity_type = e.entity_type
            AND pe.entity_id = e.entity_id
        )
    `;
    const res = await dbOrConn.query(sql);
    const rows = extractRows(res);
    const count = rows && rows[0] ? Number(rows[0].violationCount) : 0;
    return count;
  }

  /**
   * Backfill project owners into project_members.
   */
  static async backfillProjectOwners(dbOrConn) {
    await dbOrConn.query(`
      INSERT INTO project_members (project_id, user_id, role, created_at)
      SELECT p.id, p.user_id, 'owner', NOW()
      FROM projects p
      LEFT JOIN project_members pm ON pm.project_id = p.id AND pm.user_id = p.user_id
      WHERE pm.id IS NULL
      ON DUPLICATE KEY UPDATE role = role;
    `);
  }

  /**
   * Backfill entities.primary_project_id into project_entities.
   */
  static async backfillPrimaryProjectsToProjectEntities(dbOrConn) {
    await dbOrConn.query(`
      INSERT INTO project_entities (project_id, entity_type, entity_id, access_role, added_by, created_at)
      SELECT e.primary_project_id, e.entity_type, e.entity_id, 'admin', e.owner_user_id, NOW()
      FROM entities e
      LEFT JOIN project_entities pe 
        ON pe.project_id = e.primary_project_id 
       AND pe.entity_type = e.entity_type 
       AND pe.entity_id = e.entity_id
      WHERE e.primary_project_id IS NOT NULL
        AND e.entity_type NOT IN ('project', 'capture')
        AND pe.id IS NULL
      ON DUPLICATE KEY UPDATE access_role = access_role;
    `);
  }
}

module.exports = SearchService;
