// server/utils/markdownKnowledgeParser.js
/**
 * FLOWDEN KNOWLEDGE EXCHANGE — MARKDOWN KNOWLEDGE PARSER
 *
 * Parses structured Markdown documents containing multiple Notes into
 * Flowden's internal canonical package format for transactional import.
 */

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { computeDeterministicSha256, stripYamlFrontmatter } = require('./fkfCanonicalParser');

/**
 * Creates a URL-safe lowercase slug from a string.
 */
function slugify(text) {
  return String(text || '')
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

/**
 * Parses a structured Markdown document into an InternalCanonicalPackage.
 *
 * Supports:
 * - Top-level YAML frontmatter for project metadata:
 *     ---
 *     project: Project Title (or title: Project Title)
 *     summary: Project Summary
 *     ---
 * - Multiple notes separated by:
 *     1) --- with Note frontmatter or #/## Note: Title
 *     2) # Note: Title or ## Note: Title
 *     3) Sections under # Notes or ## Notes
 *     4) Generic ## Headings when multiple exist
 * - Note-level metadata (folder, tags, id, is_pinned) via frontmatter or leading key-values:
 *     folder: Foundations
 *     tags: urban, heat
 * - Optional # Sources / ## Sources section
 * - Optional # Relationships / ## Relationships section
 * - Automatic resolution of standard [[Note Title]] WikiLinks to [[fkf:note-...|Note Title]]
 *
 * @param {string|Buffer} rawInput
 * @param {string} [filename='document.md']
 * @returns {{ valid: boolean, errors: Array<{code: string, message: string}>, warnings: Array<{code: string, message: string}>, canonical: Object|null }}
 */
function parseMarkdownDocument(rawInput, filename = 'document.md') {
  const errors = [];
  const warnings = [];

  const rawString = typeof rawInput === 'string'
    ? rawInput
    : Buffer.isBuffer(rawInput)
      ? rawInput.toString('utf8')
      : '';

  if (rawString.includes('\0')) {
    return {
      valid: false,
      errors: [{
        code: 'BINARY_CONTENT_NOT_ALLOWED',
        file: filename,
        message: 'The uploaded .md file contains binary null bytes and is not valid UTF-8 Markdown.'
      }],
      warnings,
      canonical: null
    };
  }

  // Normalize Windows CRLF / CR line endings to LF before parsing
  const rawText = rawString.replace(/\r\n?/g, '\n').trim();

  if (!rawText) {
    return {
      valid: false,
      errors: [{
        code: 'EMPTY_DOCUMENT',
        file: filename,
        message: 'The uploaded Markdown document is empty. Provide a structured .md file containing at least one Note.'
      }],
      warnings,
      canonical: null
    };
  }

  if (rawText.startsWith('{') && rawText.endsWith('}')) {
    return {
      valid: false,
      errors: [{
        code: 'INVALID_MARKDOWN_FORMAT',
        file: filename,
        message: 'The uploaded .md file contains JSON rather than structured Markdown. Upload a .md research document or a .flowden.zip package.'
      }],
      warnings,
      canonical: null
    };
  }

  // 1. Extract Top-Level Frontmatter (if any)
  const { frontmatter: docFrontmatter, body: bodyAfterFrontmatter } = stripYamlFrontmatter(rawText);

  let projectTitle = docFrontmatter.project || docFrontmatter.title || docFrontmatter.name || null;
  let projectSummary = docFrontmatter.summary || docFrontmatter.description || '';
  let projectColor = docFrontmatter.color || null;
  let projectIcon = docFrontmatter.icon || null;

  // 2. Separate Special Sections (Sources, Relationships) from Main Note Content
  let workingText = bodyAfterFrontmatter;

  // Extract Sources Section if present (consume optional preceding horizontal rule '---' and do not stop at ### subheadings)
  let rawSourcesText = '';
  const sourcesSectionMatch = workingText.match(/(?:^|\n)(?:---\s*\n+)?#{1,2}\s+(?:Sources|References|Bibliography)\s*\n([\s\S]*?)(?=(?:\n(?:---\s*\n+)?#{1,2}\s+(?!#)|$))/i);
  if (sourcesSectionMatch) {
    rawSourcesText = sourcesSectionMatch[1].trim();
    workingText = workingText.slice(0, sourcesSectionMatch.index) + workingText.slice(sourcesSectionMatch.index + sourcesSectionMatch[0].length);
  }

  // Extract Relationships Section if present (consume optional preceding horizontal rule '---')
  let rawRelationshipsText = '';
  const relSectionMatch = workingText.match(/(?:^|\n)(?:---\s*\n+)?#{1,2}\s+(?:Relationships|Connections|Semantic Links)\s*\n([\s\S]*?)(?=(?:\n(?:---\s*\n+)?#{1,2}\s+(?!#)|$))/i);
  if (relSectionMatch) {
    rawRelationshipsText = relSectionMatch[1].trim();
    workingText = workingText.slice(0, relSectionMatch.index) + workingText.slice(relSectionMatch.index + relSectionMatch[0].length);
  }

  // 3. Extract Top-Level Project Heading if not in frontmatter
  const leadingH1Match = workingText.match(/^\s*#\s+([^\n#]+)/);
  if (leadingH1Match) {
    const headingCandidate = leadingH1Match[1].trim();
    if (!/^note\s*:/i.test(headingCandidate) && !/^notes$/i.test(headingCandidate)) {
      if (!projectTitle) {
        projectTitle = headingCandidate;
      }
      workingText = workingText.slice(leadingH1Match[0].length).trim();
    }
  }

  if (!projectTitle) {
    // Derive from filename
    const baseName = filename.replace(/\.(?:md|markdown)$/i, '');
    projectTitle = baseName
      .replace(/[-_]+/g, ' ')
      .replace(/\b\w/g, c => c.toUpperCase())
      .trim() || 'Imported Research Project';
  }

  // 4. Extract Project Overview (any prose between project heading and first note divider)
  let projectOverviewMarkdown = '';
  const firstDividerIdx = workingText.search(/(?:^|\n)(?:---\s*\n+|#{1,3}\s+(?:Note\s*:|\[Note\]|Notes\b))/i);
  if (firstDividerIdx > 0) {
    projectOverviewMarkdown = workingText.slice(0, firstDividerIdx).trim();
    workingText = workingText.slice(firstDividerIdx).trim();
  }

  // 5. Partition Working Text into Separate Note Candidates
  const rawNoteSections = splitIntoNoteSections(workingText);

  if (rawNoteSections.length === 0) {
    // Fallback: If no explicit dividers were found, treat the remaining text as one note
    const trimmed = workingText.trim();
    if (trimmed) {
      rawNoteSections.push({
        rawHeading: projectTitle,
        rawContent: trimmed
      });
    } else {
      return {
        valid: false,
        errors: [{ code: 'NO_NOTES_FOUND', message: 'No valid notes could be parsed from Markdown document.' }],
        warnings,
        canonical: null
      };
    }
  }

  // 6. Parse and Normalize Individual Notes & Folders
  const folderRegistry = new Map(); // name -> id
  const noteList = [];
  const noteTitleMap = new Map(); // title lowercase -> noteId

  let noteCounter = 0;
  for (const section of rawNoteSections) {
    noteCounter++;
    const { frontmatter: noteFm, body: noteBody } = stripYamlFrontmatter(section.rawContent);

    // Extract title
    let noteTitle = noteFm.title || section.rawHeading || `Note ${noteCounter}`;
    noteTitle = noteTitle.replace(/^note\s*:\s*/i, '').replace(/^\[note\]\s*/i, '').trim();

    // Parse leading key-value pairs in note body (e.g. "folder: Interventions")
    const { metadata: inlineMeta, cleanBody } = extractLeadingMetadata(noteBody);

    const folderName = (noteFm.folder || inlineMeta.folder || inlineMeta.category || '').trim();
    let folderId = null;
    if (folderName) {
      if (!folderRegistry.has(folderName.toLowerCase())) {
        const nextFldId = `fld-${folderRegistry.size + 1}`;
        folderRegistry.set(folderName.toLowerCase(), {
          id: nextFldId,
          name: folderName,
          parent_id: null,
          sort_order: folderRegistry.size
        });
      }
      folderId = folderRegistry.get(folderName.toLowerCase()).id;
    }

    // Tags
    let tags = [];
    if (Array.isArray(noteFm.tags)) {
      tags = noteFm.tags.map(t => String(t).trim()).filter(Boolean);
    } else if (typeof noteFm.tags === 'string') {
      tags = noteFm.tags.split(',').map(t => t.trim()).filter(Boolean);
    } else if (inlineMeta.tags) {
      tags = inlineMeta.tags.split(',').map(t => t.trim().replace(/^\[|\]$/g, '')).filter(Boolean);
    }

    // ID
    let noteId = noteFm.id || inlineMeta.id || null;
    if (!noteId || !/^note-/i.test(noteId)) {
      const slug = slugify(noteTitle);
      noteId = slug ? `note-${slug}` : `note-${noteCounter}`;
    }

    // Ensure noteId uniqueness
    let uniqueNoteId = noteId.toLowerCase();
    let collisionCounter = 2;
    while (noteList.some(n => n.id === uniqueNoteId)) {
      uniqueNoteId = `${noteId.toLowerCase()}-${collisionCounter++}`;
    }

    noteTitleMap.set(noteTitle.toLowerCase(), uniqueNoteId);

    const cleanedMarkdown = cleanBody.replace(/(?:\n+---\s*)+$/, '').trim();
    if (!cleanedMarkdown) {
      warnings.push({
        code: 'EMPTY_NOTE_BODY',
        file: filename,
        message: `Note "${noteTitle}" has no Markdown body content.`
      });
    }

    noteList.push({
      id: uniqueNoteId,
      title: noteTitle,
      folder_id: folderId,
      tags,
      is_pinned: Boolean(noteFm.is_pinned || inlineMeta.is_pinned === 'true'),
      content_markdown: cleanedMarkdown
    });
  }

  if (noteList.every(n => !n.content_markdown)) {
    return {
      valid: false,
      errors: [{
        code: 'EMPTY_NOTE_CONTENT',
        file: filename,
        message: 'None of the parsed Note sections contain Markdown body content. Ensure each "## Note: <Title>" section includes body text.'
      }],
      warnings,
      canonical: null
    };
  }

  // 7. Post-process WikiLinks: resolve [[Target Note Title]] -> [[fkf:note-id|Target Note Title]]
  for (const n of noteList) {
    n.content_markdown = resolveStandardWikiLinks(n.content_markdown, noteTitleMap);
  }
  if (projectOverviewMarkdown) {
    projectOverviewMarkdown = resolveStandardWikiLinks(projectOverviewMarkdown, noteTitleMap);
  }

  // 8. Parse Optional Sources
  const sourcesList = parseSourcesSection(rawSourcesText);

  // 9. Parse Optional Relationships
  const relationshipsList = parseRelationshipsSection(rawRelationshipsText, noteTitleMap, sourcesList, warnings);

  // 10. Assemble Canonical Folders Array
  const foldersList = Array.from(folderRegistry.values());

  // 11. Build Canonical Object
  const packageSlug = slugify(projectTitle) || 'markdown-package';
  const canonical = {
    format: 'flowden-markdown-knowledge',
    fkf_version: '2.0.0',
    package_id: `pkg-${packageSlug}`,
    generator: {
      system_name: 'Flowden Markdown Importer',
      name: 'Flowden Markdown Importer',
      version: '2.0.0',
      generated_at: new Date().toISOString()
    },
    project: {
      id: 'proj-1',
      title: projectTitle,
      summary: projectSummary || (projectOverviewMarkdown ? projectOverviewMarkdown.slice(0, 200).replace(/\n+/g, ' ').trim() : ''),
      overview_markdown: projectOverviewMarkdown || `# ${projectTitle}\n\n${projectSummary || 'Imported structured research project.'}`,
      color: projectColor,
      icon: projectIcon
    },
    folders: foldersList,
    notes: noteList,
    sources: sourcesList,
    relationships: relationshipsList,
    optional_modules: {
      tasks: { tasks: [] },
      spatial_board: null
    }
  };

  canonical.sha256 = computeDeterministicSha256(canonical);

  return {
    valid: true,
    errors,
    warnings,
    canonical
  };
}

/**
 * Splits document text into individual note sections based on dividers or headings.
 */
function splitIntoNoteSections(text) {
  const sections = [];
  const lines = text.split(/\r?\n/);

  let currentHeading = null;
  let currentLines = [];

  function flush() {
    while (currentLines.length > 0 && (!currentLines[currentLines.length - 1].trim() || currentLines[currentLines.length - 1].trim() === '---')) {
      currentLines.pop();
    }
    if (currentHeading !== null || currentLines.length > 0) {
      const content = currentLines.join('\n').trim();
      if (content || currentHeading) {
        sections.push({
          rawHeading: currentHeading || 'Untitled Note',
          rawContent: content
        });
      }
    }
    currentHeading = null;
    currentLines = [];
  }

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // Pattern 1: Horizontal rule divider '---'
    if (trimmed === '---') {
      // Look ahead past blank lines for a heading or note frontmatter
      let nextIdx = i + 1;
      while (nextIdx < lines.length && !lines[nextIdx].trim()) {
        nextIdx++;
      }
      const nextLine = (lines[nextIdx] || '').trim();
      const nextHeadingMatch = nextLine.match(/^#{1,3}\s+(?:Note\s*:\s*|\[Note\]\s*)?(.+)$/i);
      if (nextHeadingMatch) {
        flush();
        currentHeading = nextHeadingMatch[1].trim();
        i = nextIdx + 1; // skip divider, blank lines, and heading
        continue;
      }

      // Check if following line is frontmatter for a note (e.g. "title: ...")
      if (/^[a-zA-Z0-9_-]+\s*:\s*.+$/.test(nextLine)) {
        flush();
        currentLines.push('---');
        i = nextIdx;
        continue;
      }
    }

    // Pattern 2: Explicit note heading '# Note: ...' or '## Note: ...' or '### Note: ...'
    const noteHeadingMatch = line.match(/^#{1,3}\s+(?:Note\s*:\s*|\[Note\]\s*)(.+)$/i);
    if (noteHeadingMatch) {
      flush();
      currentHeading = noteHeadingMatch[1].trim();
      i++;
      continue;
    }

    // Pattern 3: Level 2 heading '## <Title>' (treated as note boundary if not a container keyword)
    const h2Match = line.match(/^##\s+([^#\n]+)$/);
    if (h2Match) {
      const candidateTitle = h2Match[1].trim();
      const isReserved = /^(?:notes|vault notes|sources|references|bibliography|relationships|connections|semantic links|overview)$/i.test(candidateTitle);
      if (!isReserved) {
        flush();
        currentHeading = candidateTitle;
        i++;
        continue;
      }
    }

    currentLines.push(line);
    i++;
  }

  flush();
  return sections;
}

/**
 * Extracts leading key-value pairs (e.g., folder: Foundations, tags: a, b) from top of body.
 */
function extractLeadingMetadata(bodyText) {
  const metadata = {};
  const lines = bodyText.split(/\r?\n/);
  let bodyStartIdx = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) {
      if (Object.keys(metadata).length > 0) {
        bodyStartIdx = i + 1;
        break;
      }
      continue;
    }

    const kvMatch = line.match(/^([a-zA-Z0-9_-]+)\s*:\s*(.+)$/);
    if (kvMatch) {
      const key = kvMatch[1].toLowerCase();
      const val = kvMatch[2].trim();
      if (['folder', 'category', 'tags', 'id', 'is_pinned'].includes(key)) {
        metadata[key] = val;
        bodyStartIdx = i + 1;
        continue;
      }
    }

    // Non-metadata line encountered
    bodyStartIdx = i;
    break;
  }

  const cleanBody = lines.slice(bodyStartIdx).join('\n');
  return { metadata, cleanBody };
}

/**
 * Resolves standard WikiLinks [[Target Note Title]] into Flowden WikiLinks [[fkf:note-id|Target Note Title]].
 */
function resolveStandardWikiLinks(text, noteTitleMap) {
  if (!text) return '';
  return text.replace(/\[\[([^\]]+)\]\]/g, (match, inner) => {
    // If already in [[fkf:note-...]] format, leave intact
    if (inner.startsWith('fkf:')) {
      return match;
    }

    const pipeIdx = inner.indexOf('|');
    const targetTitle = (pipeIdx === -1 ? inner : inner.slice(0, pipeIdx)).trim();
    const displayLabel = pipeIdx === -1 ? targetTitle : inner.slice(pipeIdx + 1).trim();

    const matchedNoteId = noteTitleMap.get(targetTitle.toLowerCase());
    if (matchedNoteId) {
      return `[[fkf:${matchedNoteId}|${displayLabel}]]`;
    }

    // If not found in note titles, leave as-is
    return match;
  });
}

/**
 * Parses optional Sources section into canonical sources array.
 */
function parseSourcesSection(text) {
  if (!text) return [];
  const sources = [];
  const lines = text.split(/\r?\n/);

  let curSource = null;
  let srcCounter = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Heading format: '### Source: <Title>' or '### <Title>' or '#### Source: <Title>'
    const headingMatch = trimmed.match(/^#{3,4}\s+(?:Source:\s*)?(.+)$/i);
    if (headingMatch) {
      srcCounter++;
      const title = headingMatch[1].trim();
      const explicitIdMatch = title.match(/^\[([a-zA-Z0-9_-]+)\]\s*(.+)$/);
      const explicitId = explicitIdMatch ? explicitIdMatch[1] : null;
      const cleanTitle = explicitIdMatch ? explicitIdMatch[2] : title;

      curSource = {
        id: explicitId && /^src-/i.test(explicitId) ? explicitId.toLowerCase() : `src-${srcCounter}`,
        title: cleanTitle || `Source ${srcCounter}`,
        source_type: 'external',
        source_url: null,
        excerpts: []
      };
      sources.push(curSource);
      continue;
    }

    // Bullet format starting with '- [id]' or '- [src-...]' or just '-' / '*'
    const itemMatch = trimmed.match(/^[-*]\s+(?:\[([a-zA-Z0-9_-]+)\]\s+)?(.+)$/);
    if (itemMatch) {
      srcCounter++;
      const explicitId = itemMatch[1];
      const rest = itemMatch[2];

      const urlMatch = rest.match(/https?:\/\/[^\s)]+/);
      const url = urlMatch ? urlMatch[0] : null;
      const cleanRest = rest
        .replace(/\(\s*https?:\/\/[^\s)]+\s*\)/g, '')
        .replace(/\[\s*https?:\/\/[^\s\]]+\s*\]/g, '')
        .replace(/https?:\/\/[^\s)]+/g, '')
        .replace(/\s+/g, ' ')
        .trim();

      curSource = {
        id: explicitId && /^src-/i.test(explicitId) ? explicitId.toLowerCase() : `src-${srcCounter}`,
        title: cleanRest || `Source ${srcCounter}`,
        source_type: 'external',
        source_url: url,
        excerpts: []
      };
      sources.push(curSource);
      continue;
    }

    // Key-value metadata under source: url, type, description, etc.
    if (curSource) {
      const kv = trimmed.match(/^([a-zA-Z0-9_-]+)\s*:\s*(.+)$/);
      if (kv) {
        const key = kv[1].toLowerCase();
        const val = kv[2].trim();
        if (key === 'url' || key === 'source_url') {
          curSource.source_url = val;
          continue;
        }
        if (key === 'type' || key === 'source_type') {
          curSource.source_type = val;
          continue;
        }
        if (key === 'title') {
          curSource.title = val;
          continue;
        }
      }
    }

    // Excerpt under source: '> "quoted text" (p. 42)'
    if (curSource && trimmed.startsWith('>')) {
      const quoteMatch = trimmed.replace(/^>\s*/, '').trim();
      if (quoteMatch) {
        curSource.excerpts.push({
          id: `exc-${curSource.id}-${curSource.excerpts.length + 1}`,
          quoted_text: quoteMatch.replace(/^"|"$/g, '').trim(),
          location_anchor: null
        });
      }
    }
  }

  return sources;
}

/**
 * Parses optional Relationships section into canonical relationships array.
 */
function parseRelationshipsSection(text, noteTitleMap, sourcesList, warnings = []) {
  if (!text) return [];
  const rels = [];
  const lines = text.split(/\r?\n/);

  const VALID_TYPES = [
    'references', 'embeds', 'cites', 'derived_from', 'supports',
    'contradicts', 'inspired_by', 'depends_on', 'blocks', 'relates_to'
  ];

  let relCounter = 0;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || (!trimmed.startsWith('-') && !trimmed.startsWith('*'))) continue;

    const content = trimmed.replace(/^[-*]\s+/, '').trim();

    // Check for syntax: source -> target (link_type) or [[source]] link_type [[target]]
    let sourceId = null;
    let targetId = null;
    let linkType = 'relates_to';

    // Pattern A: [[Note A]] -> [[Note B]] (: type or (type))
    const arrowWithWikilinks = content.match(/^\[\[([^\]]+)\]\]\s*(?:->|--|—>)\s*\[\[([^\]]+)\]\](?:\s*[:(]\s*([a-zA-Z_-]+)\s*\)?)?/);
    if (arrowWithWikilinks) {
      const srcName = arrowWithWikilinks[1].split('|')[0].trim();
      const tgtName = arrowWithWikilinks[2].split('|')[0].trim();
      const typeCandidate = (arrowWithWikilinks[3] || 'relates_to').trim().toLowerCase();

      sourceId = noteTitleMap.get(srcName.toLowerCase()) || srcName;
      targetId = noteTitleMap.get(tgtName.toLowerCase()) || tgtName;
      if (VALID_TYPES.includes(typeCandidate)) {
        linkType = typeCandidate;
      }
    } else {
      // Pattern B: [[Note A]] supports [[Note B]]
      const wikiRelMatch = content.match(/^\[\[([^\]]+)\]\]\s+([a-zA-Z_]+)\s+\[\[([^\]]+)\]\]/);
      if (wikiRelMatch) {
        const srcName = wikiRelMatch[1].split('|')[0].trim();
        const typeCandidate = wikiRelMatch[2].trim().toLowerCase();
        const tgtName = wikiRelMatch[3].split('|')[0].trim();

        sourceId = noteTitleMap.get(srcName.toLowerCase()) || srcName;
        targetId = noteTitleMap.get(tgtName.toLowerCase()) || tgtName;
        if (VALID_TYPES.includes(typeCandidate)) {
          linkType = typeCandidate;
        }
      } else {
        // Pattern C: id1 -> id2 : type or id1 -> id2 (type)
        const arrowIds = content.match(/^([a-zA-Z0-9_-]+)\s*(?:->|--|—>)\s*([a-zA-Z0-9_-]+)(?:\s*[:(]\s*([a-zA-Z_-]+)\s*\)?)?/);
        if (arrowIds) {
          sourceId = arrowIds[1].trim();
          targetId = arrowIds[2].trim();
          const typeCandidate = (arrowIds[3] || 'relates_to').trim().toLowerCase();
          if (VALID_TYPES.includes(typeCandidate)) {
            linkType = typeCandidate;
          }
        } else {
          // Pattern D: plain tokens
          const tokens = content.split(/\s+/);
          if (tokens.length >= 3) {
            sourceId = tokens[0].trim();
            const candidateType = tokens[1].replace(/->|:/g, '').trim().toLowerCase();
            targetId = tokens[2].trim();
            if (VALID_TYPES.includes(candidateType)) {
              linkType = candidateType;
            }
          }
        }
      }
    }

    if (sourceId && targetId) {
      if (sourceId.startsWith('fkf:')) sourceId = sourceId.slice(4);
      if (targetId.startsWith('fkf:')) targetId = targetId.slice(4);

      if (sourcesList) {
        const sFound = sourcesList.find(s => s.title.toLowerCase() === sourceId.toLowerCase() || s.id.toLowerCase() === sourceId.toLowerCase());
        if (sFound) sourceId = sFound.id;
        const tFound = sourcesList.find(s => s.title.toLowerCase() === targetId.toLowerCase() || s.id.toLowerCase() === targetId.toLowerCase());
        if (tFound) targetId = tFound.id;
      }

      relCounter++;
      rels.push({
        id: `rel-${relCounter}`,
        source_id: sourceId,
        target_id: targetId,
        link_type: linkType,
        confidence: 0.85
      });
    } else if (warnings) {
      warnings.push({
        code: 'MALFORMED_RELATIONSHIP_LINE',
        message: `Skipped unrecognized relationship line: "${content}"`
      });
    }
  }

  return rels;
}

function isMarkdownFile(filePath, filename) {
  const ext = path.extname(filename || filePath || '').toLowerCase();
  return ext === '.md' || ext === '.markdown';
}

module.exports = {
  parseMarkdownDocument,
  slugify,
  isMarkdownFile
};
