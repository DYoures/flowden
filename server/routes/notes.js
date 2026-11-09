const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const db = require('../config/database');
const Note = require('../models/Note');
const Project = require('../models/Project');
const authenticateToken = require('../middleware/auth');
const EntitySyncService = require('../services/entitySyncService');
const SecurityService = require('../services/securityService');

const router = express.Router();
router.use(authenticateToken);

// Setup storage directory for Knowledge Vault media and attachments
const vaultUploadsDir = path.join(__dirname, '..', '..', 'uploads', 'vault');
if (!fs.existsSync(vaultUploadsDir)) {
  fs.mkdirSync(vaultUploadsDir, { recursive: true });
}

// Allowed extensions and categorization for Vault media and attachments
const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.avif', '.heic', '.tiff', '.ico']);
const VIDEO_EXTS = new Set(['.mp4', '.webm', '.mov', '.mkv', '.avi', '.m4v']);
const AUDIO_EXTS = new Set(['.mp3', '.wav', '.ogg', '.m4a', '.flac', '.aac']);
const DOC_EXTS = new Set(['.pdf', '.docx', '.xlsx', '.pptx', '.doc', '.xls', '.ppt', '.txt', '.csv', '.md', '.rtf', '.odt', '.ods', '.odp']);
const ARCHIVE_EXTS = new Set(['.zip', '.7z', '.rar', '.tar', '.gz', '.tgz', '.bz2', '.xz']);
const CODE_EXTS = new Set(['.js', '.ts', '.tsx', '.jsx', '.css', '.json', '.xml', '.yaml', '.yml', '.py', '.java', '.c', '.cpp', '.h', '.sql']);

const MAX_UPLOAD_BYTES = parseInt(process.env.FLOWDEN_UPLOAD_MAX_SIZE, 10) || (100 * 1024 * 1024); // 100MB limit

const vaultStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, vaultUploadsDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase().replace(/[^a-z0-9.]/g, '');
    const base = path.basename(file.originalname, path.extname(file.originalname))
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .slice(0, 40) || 'file';
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e6);
    cb(null, `${base}-${uniqueSuffix}${ext}`);
  }
});

const vaultMulter = multer({
  storage: vaultStorage,
  limits: { fileSize: MAX_UPLOAD_BYTES },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    if (SecurityService.BLOCKED_EXTENSIONS.has(ext) || ext === '.html' || ext === '.htm' || ext === '.svg') {
      const err = new Error(`Blocked file type (${ext || 'unknown'}): Active scripts, HTML/SVG documents, and executables cannot be uploaded.`);
      err.statusCode = 400;
      return cb(err);
    }
    cb(null, true);
  }
});

const uploadSingleVaultAttachment = (req, res, next) => {
  const rate = SecurityService.checkRateLimit(`vault_upload:${req.user.id}`, 30, 60 * 1000);
  if (!rate.allowed) {
    return res.status(429).json({ error: 'Upload rate limit exceeded. Please wait before uploading more files.' });
  }

  vaultMulter.single('file')(req, res, (err) => {
    if (err) {
      SecurityService.logSecurityEvent({
        userId: req.user ? req.user.id : null,
        eventType: 'UPLOAD_BLOCKED_FILTER',
        severity: 'warn',
        ipAddress: req.ip,
        targetType: 'note_upload',
        details: { error: err.message }
      });
      if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
        const mb = Math.round(MAX_UPLOAD_BYTES / (1024 * 1024));
        return res.status(400).json({ error: `File size exceeds maximum allowed limit of ${mb}MB` });
      }
      return res.status(400).json({ error: err.message || 'File upload failed' });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'No file provided for upload' });
    }
    next();
  });
};

const handleVaultUpload = async (req, res, next) => {
  try {
    const noteId = req.params.id ? parseInt(req.params.id, 10) : (req.body.note_id ? parseInt(req.body.note_id, 10) : null);
    let noteProjectId = req.body.project_id !== undefined && req.body.project_id !== null && req.body.project_id !== ''
      ? req.body.project_id
      : null;

    if (noteId) {
      const note = await Note.findById(noteId, req.user.id);
      if (!note) {
        try { fs.unlinkSync(req.file.path); } catch (_) {}
        return res.status(404).json({ error: 'Note not found or unauthorized' });
      }
      noteProjectId = note.project_id || noteProjectId;
    }

    if (noteProjectId !== null && noteProjectId !== undefined && noteProjectId !== '') {
      const projectAuth = await Project.validateWriteAccess(noteProjectId, req.user.id);
      if (!projectAuth.valid) {
        try { fs.unlinkSync(req.file.path); } catch (_) {}
        return res.status(projectAuth.status).json({ error: projectAuth.error });
      }
      noteProjectId = projectAuth.projectId;
    }

    // Perform magic-byte and active-content signature verification
    const validation = SecurityService.validateUploadedFile(
      req.file.path,
      req.file.originalname,
      req.file.mimetype,
      { allowArchives: true }
    );

    if (!validation.valid) {
      try { fs.unlinkSync(req.file.path); } catch (_) {}
      await SecurityService.logSecurityEvent({
        userId: req.user.id,
        eventType: 'UPLOAD_BLOCKED_SIGNATURE',
        severity: 'warn',
        ipAddress: req.ip,
        targetType: 'note_upload',
        targetId: noteId || null,
        details: {
          originalName: req.file.originalname,
          declaredMime: req.file.mimetype,
          reason: validation.reason
        }
      });
      return res.status(400).json({ error: validation.reason, code: validation.code });
    }

    const ext = path.extname(req.file.filename).toLowerCase();
    const relativeUrl = `/uploads/vault/${req.file.filename}`;

    await SecurityService.registerUploadedFile({
      userId: req.user.id,
      projectId: noteProjectId,
      entityType: 'note',
      entityId: noteId,
      filename: req.file.filename,
      originalName: req.file.originalname,
      filePath: relativeUrl,
      mimeType: validation.detectedMime || req.file.mimetype,
      fileSize: req.file.size
    });

    let category = 'generic';
    let isPreviewable = false;
    let isPlayable = false;

    if (IMAGE_EXTS.has(ext)) {
      category = 'image';
      isPreviewable = true;
    } else if (VIDEO_EXTS.has(ext)) {
      category = 'video';
      isPreviewable = true;
      isPlayable = ['.mp4', '.webm', '.mov', '.m4v'].includes(ext);
    } else if (AUDIO_EXTS.has(ext)) {
      category = 'audio';
      isPreviewable = true;
      isPlayable = true;
    } else if (DOC_EXTS.has(ext)) {
      category = 'document';
      isPreviewable = ['.pdf', '.txt', '.md', '.csv'].includes(ext);
    } else if (ARCHIVE_EXTS.has(ext)) {
      category = 'archive';
      isPreviewable = false;
    } else if (CODE_EXTS.has(ext)) {
      category = 'code';
      isPreviewable = true;
    }

    const payload = {
      url: relativeUrl,
      filename: req.file.filename,
      originalname: req.file.originalname,
      size: req.file.size,
      mimetype: validation.detectedMime || req.file.mimetype,
      category,
      isPreviewable,
      isPlayable,
      isImage: category === 'image',
      isVideo: category === 'video',
      isAudio: category === 'audio',
      isPlayableVideo: category === 'video' && isPlayable,
      isPlayableAudio: category === 'audio' && isPlayable,
      isDownloadOnly: category === 'archive' || !isPreviewable
    };

    res.json({
      success: true,
      ...payload,
      file: payload
    });
  } catch (err) {
    next(err);
  }
};

// POST /api/v1/notes/upload (Standalone / Clipboard paste / Note drafting)
router.post('/upload', uploadSingleVaultAttachment, handleVaultUpload);

// POST /api/v1/notes/:id/upload (Attachment for specific note)
router.post('/:id/upload', uploadSingleVaultAttachment, handleVaultUpload);

// Simple in-memory cache for URL metadata (TTL: 10 minutes)
const urlMetadataCache = new Map();
const URL_CACHE_TTL_MS = 10 * 60 * 1000;

async function handleUrlMetadata(req, res) {
  const rate = SecurityService.checkRateLimit(`url_meta:${req.user.id}`, 40, 60 * 1000);
  if (!rate.allowed) {
    return res.status(429).json({ error: 'Too many metadata requests. Please wait a moment.' });
  }

  const targetUrl = (req.query && req.query.url) || (req.body && req.body.url);
  if (!targetUrl || typeof targetUrl !== 'string') {
    return res.status(400).json({ error: 'Missing url parameter' });
  }

  const urlCheck = await SecurityService.validateExternalUrl(targetUrl.trim());
  if (!urlCheck.valid) {
    await SecurityService.logSecurityEvent({
      userId: req.user.id,
      eventType: 'SSRF_URL_BLOCKED',
      severity: 'warn',
      ipAddress: req.ip,
      targetType: 'url_metadata',
      details: { url: targetUrl.slice(0, 200), reason: urlCheck.reason }
    });
    return res.status(400).json({ error: urlCheck.reason || 'Restricted URL' });
  }

  const parsed = urlCheck.parsedUrl;
  const hostname = parsed.hostname.toLowerCase();

  // Check cache
  const cached = urlMetadataCache.get(parsed.href);
  if (cached && (Date.now() - cached.timestamp < URL_CACHE_TTL_MS)) {
    return res.json(cached.data);
  }

  let title = hostname;
  let description = '';
  let favicon = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostname)}&sz=64`;
  let image = '';

  let isEmbeddable = false;
  let embedProvider = null;
  let embedUrl = null;
  let videoId = null;
  let thumbnails = null;
  let isShorts = false;

  if (hostname.includes('youtube.com') || hostname.includes('youtu.be') || hostname.includes('youtube-nocookie.com')) {
    if (hostname.includes('youtu.be')) {
      videoId = parsed.pathname.slice(1).split('/')[0];
    } else if (parsed.searchParams.has('v')) {
      videoId = parsed.searchParams.get('v');
    } else if (parsed.pathname.includes('/embed/')) {
      videoId = parsed.pathname.split('/embed/')[1].split('/')[0];
    } else if (parsed.pathname.includes('/shorts/')) {
      videoId = parsed.pathname.split('/shorts/')[1].split('/')[0];
      isShorts = true;
    } else if (parsed.pathname.includes('/live/')) {
      videoId = parsed.pathname.split('/live/')[1].split('/')[0];
    }

    if (videoId) {
      videoId = String(videoId).split('?')[0].split('&')[0].replace(/[^a-zA-Z0-9_-]/g, '');
    }

    if (videoId && videoId.length >= 6) {
      isEmbeddable = true;
      embedProvider = 'youtube';
      embedUrl = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}`;
      title = isShorts ? 'YouTube Short' : 'YouTube Video';
      description = isShorts ? 'YouTube Shorts Video' : 'YouTube Video Player';
      favicon = `https://www.google.com/s2/favicons?domain=youtube.com&sz=64`;
      thumbnails = [
        `https://i.ytimg.com/vi/${encodeURIComponent(videoId)}/maxresdefault.jpg`,
        `https://i.ytimg.com/vi/${encodeURIComponent(videoId)}/sddefault.jpg`,
        `https://i.ytimg.com/vi/${encodeURIComponent(videoId)}/hqdefault.jpg`,
        `https://i.ytimg.com/vi/${encodeURIComponent(videoId)}/mqdefault.jpg`,
        `https://i.ytimg.com/vi/${encodeURIComponent(videoId)}/default.jpg`
      ];
      image = thumbnails[0];

      try {
        const oembedCtrl = new AbortController();
        const oembedTimer = setTimeout(() => oembedCtrl.abort(), 2500);
        const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}&format=json`;
        const { response: oembedRes } = await SecurityService.safeFetchExternalUrl(oembedUrl, {
          signal: oembedCtrl.signal,
          headers: { 'User-Agent': 'FlowdenLinkBot/1.0 (+https://flowden.io)' }
        });
        clearTimeout(oembedTimer);
        if (oembedRes.ok) {
          const oembedData = await oembedRes.json();
          if (oembedData && oembedData.title) {
            title = String(oembedData.title).trim();
          }
          if (oembedData && oembedData.author_name) {
            description = `YouTube - ${String(oembedData.author_name).trim()}`;
          }
        }
      } catch (e) {
        // Fallback to default YouTube Video title if offline
      }

      const ytPayload = {
        success: true,
        url: parsed.href,
        title,
        description,
        domain: hostname,
        favicon,
        image,
        isEmbeddable,
        embedProvider,
        embedUrl,
        videoId,
        isShorts,
        thumbnails
      };
      urlMetadataCache.set(parsed.href, { timestamp: Date.now(), data: ytPayload });
      return res.json(ytPayload);
    }
  } else if (hostname.includes('vimeo.com')) {
    const parts = parsed.pathname.split('/').filter(Boolean);
    const vimeoId = parts.find(p => /^\d+$/.test(p));
    if (vimeoId) {
      isEmbeddable = true;
      embedProvider = 'vimeo';
      embedUrl = `https://player.vimeo.com/video/${encodeURIComponent(vimeoId)}`;
      title = 'Vimeo Video';
      favicon = `https://www.google.com/s2/favicons?domain=vimeo.com&sz=64`;
      const vimPayload = {
        success: true,
        url: parsed.href,
        title,
        description: 'Vimeo Video Player',
        domain: hostname,
        favicon,
        image,
        isEmbeddable,
        embedProvider,
        embedUrl
      };
      urlMetadataCache.set(parsed.href, { timestamp: Date.now(), data: vimPayload });
      return res.json(vimPayload);
    }
  }

  function extractMetaContent(htmlStr, attrName, attrValue) {
    const escapedVal = attrValue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const r1 = new RegExp(`<meta[^>]*${attrName}=["']${escapedVal}["'][^>]*content=["']([^"']+)["']`, 'i');
    const m1 = htmlStr.match(r1);
    if (m1 && m1[1]) return m1[1].trim();
    const r2 = new RegExp(`<meta[^>]*content=["']([^"']+)["'][^>]*${attrName}=["']${escapedVal}["']`, 'i');
    const m2 = htmlStr.match(r2);
    if (m2 && m2[1]) return m2[1].trim();
    return '';
  }

  // Fetch Page Metadata with manual redirect validation at every hop
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3500);

    const { response } = await SecurityService.safeFetchExternalUrl(parsed.href, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'FlowdenLinkBot/1.0 (+https://flowden.io)',
        'Accept': 'text/html,application/xhtml+xml'
      }
    });
    clearTimeout(timeout);

    if (response.ok) {
      const html = (await response.text()).slice(0, 150000);
      const ogTitle = extractMetaContent(html, 'property', 'og:title') ||
                      extractMetaContent(html, 'name', 'twitter:title');
      const titleTagMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
      if (ogTitle) {
        title = ogTitle;
      } else if (titleTagMatch && titleTagMatch[1]) {
        title = titleTagMatch[1].trim();
      }

      const ogDesc = extractMetaContent(html, 'property', 'og:description') ||
                     extractMetaContent(html, 'name', 'twitter:description') ||
                     extractMetaContent(html, 'name', 'description');
      if (ogDesc) {
        description = ogDesc;
      }

      const rawImg = extractMetaContent(html, 'property', 'og:image') ||
                     extractMetaContent(html, 'property', 'og:image:url') ||
                     extractMetaContent(html, 'name', 'twitter:image');
      if (rawImg) {
        try {
          const resolvedImg = new URL(rawImg, parsed.origin).href;
          if (resolvedImg.startsWith('http://') || resolvedImg.startsWith('https://')) {
            image = resolvedImg;
          }
        } catch (_) {}
      }

      const iconMatch = html.match(/<link[^>]*rel=["'](?:shortcut )?icon["'][^>]*href=["']([^"']+)["']/i) ||
                        html.match(/<link[^>]*href=["']([^"']+)["'][^>]*rel=["'](?:shortcut )?icon["']/i);
      if (iconMatch && iconMatch[1]) {
        try {
          const resolvedFav = new URL(iconMatch[1], parsed.origin).href;
          if (resolvedFav.startsWith('http://') || resolvedFav.startsWith('https://')) {
            favicon = resolvedFav;
          }
        } catch (_) {}
      }
    }
  } catch (e) {
    if (e.code === 'SSRF_BLOCKED' || e.code === 'SSRF_REDIRECT_BLOCKED') {
      await SecurityService.logSecurityEvent({
        userId: req.user.id,
        eventType: 'SSRF_REDIRECT_BLOCKED',
        severity: 'warn',
        ipAddress: req.ip,
        targetType: 'url_metadata',
        details: { url: targetUrl.slice(0, 200), error: e.message }
      });
      return res.status(400).json({ error: e.message });
    }
    // Graceful fallback to hostname for standard network timeouts
  }

  const finalPayload = {
    success: true,
    url: parsed.href,
    domain: hostname,
    title,
    description,
    favicon,
    image,
    isEmbeddable,
    embedProvider,
    embedUrl,
    videoId,
    thumbnails
  };
  urlMetadataCache.set(parsed.href, { timestamp: Date.now(), data: finalPayload });
  res.json(finalPayload);
}

router.get('/url-metadata', handleUrlMetadata);
router.post('/url-metadata', handleUrlMetadata);

// GET /api/v1/notes/folders
router.get('/folders', async (req, res, next) => {
  try {
    const folders = await Note.getFolders(req.user.id);
    res.json({ folders });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/notes/folders
router.post('/folders', async (req, res, next) => {
  try {
    const { name, parent_folder_id } = req.body;
    const folder = await Note.createFolder(req.user.id, name, parent_folder_id);
    res.status(201).json({ folder });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/v1/notes/folders/:id
router.delete('/folders/:id', async (req, res, next) => {
  try {
    await Note.deleteFolder(req.params.id, req.user.id);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/notes/tags
router.get('/tags', async (req, res, next) => {
  try {
    const tags = await Note.getTags(req.user.id);
    res.json({ tags });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/notes/trash
router.get('/trash', async (req, res, next) => {
  try {
    const notes = await Note.findTrashed(req.user.id);
    res.json({ notes });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/notes
router.get('/', async (req, res, next) => {
  try {
    const { folder_id, project_id, search, tag } = req.query;
    const notes = await Note.findAll(req.user.id, {
      folder_id,
      project_id,
      search,
      tag
    });
    res.json({ notes });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/notes
router.post('/', async (req, res, next) => {
  try {
    const { project_id } = req.body || {};
    if (project_id !== null && project_id !== undefined && project_id !== '') {
      const auth = await Project.validateWriteAccess(project_id, req.user.id);
      if (!auth.valid) {
        return res.status(auth.status).json({ error: auth.error });
      }
    }
    const note = await Note.create(req.user.id, req.body);
    await EntitySyncService.syncNoteEntity(db, note.id, req.user.id);
    res.status(201).json({ note });
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ error: err.message });
    }
    next(err);
  }
});

// POST /api/v1/notes/import
router.post('/import', async (req, res, next) => {
  try {
    const { title, content, project_id, folder_id, tags } = req.body;
    if (!content && !title) {
      return res.status(400).json({ error: 'Import requires content or title' });
    }

    if (project_id !== null && project_id !== undefined && project_id !== '') {
      const auth = await Project.validateWriteAccess(project_id, req.user.id);
      if (!auth.valid) {
        return res.status(auth.status).json({ error: auth.error });
      }
    }

    let parsedTitle = title;
    if (!parsedTitle && content) {
      const match = content.match(/^#\s+(.+)$/m);
      if (match) parsedTitle = match[1].trim();
    }

    const note = await Note.create(req.user.id, {
      title: parsedTitle || 'Imported Note',
      content: content || '',
      project_id,
      folder_id,
      tags: tags || []
    });
    await EntitySyncService.syncNoteEntity(db, note.id, req.user.id);

    res.status(201).json({ message: 'Note imported successfully', note });
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ error: err.message });
    }
    next(err);
  }
});

// GET /api/v1/notes/:id/export
router.get('/:id/export', async (req, res, next) => {
  try {
    const note = await Note.findById(req.params.id, req.user.id);
    if (!note) return res.status(404).json({ error: 'Note not found' });

    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(note.title)}.md"`);
    res.send(note.content || '');
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/notes/:id
router.get('/:id', async (req, res, next) => {
  try {
    const note = await Note.findById(req.params.id, req.user.id);
    if (!note) {
      return res.status(404).json({ error: 'Note not found or unauthorized' });
    }
    res.json({ note });
  } catch (err) {
    next(err);
  }
});

// PUT /api/v1/notes/:id
router.put('/:id', async (req, res, next) => {
  try {
    const { project_id } = req.body || {};
    if (project_id !== undefined && project_id !== null && project_id !== '') {
      const auth = await Project.validateWriteAccess(project_id, req.user.id);
      if (!auth.valid) {
        return res.status(auth.status).json({ error: auth.error });
      }
    }
    const note = await Note.update(req.params.id, req.user.id, req.body);
    if (!note) {
      return res.status(404).json({ error: 'Note not found or unauthorized' });
    }
    await EntitySyncService.syncNoteEntity(db, note.id, req.user.id);
    res.json({ note });
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ error: err.message });
    }
    next(err);
  }
});

// POST /api/v1/notes/:id/restore-trash
router.post('/:id/restore-trash', async (req, res, next) => {
  try {
    const restored = await Note.restore(req.params.id, req.user.id);
    if (!restored) {
      return res.status(404).json({ error: 'Trashed note not found' });
    }
    res.json({ message: 'Note restored from trash', note: restored });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/v1/notes/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const permanent = req.query.permanent === 'true';
    const ok = await Note.delete(req.params.id, req.user.id, { permanent });
    if (!ok) {
      return res.status(404).json({ error: 'Note not found or unauthorized' });
    }
    if (permanent) {
      await EntitySyncService.deleteNoteEntity(db, req.params.id);
    }
    res.json({ success: true, permanent });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/notes/:id/tasks - Get all tasks linked to this note
router.get('/:id/tasks', async (req, res, next) => {
  try {
    const note = await Note.findById(req.params.id, req.user.id);
    if (!note) {
      return res.status(404).json({ error: 'Note not found or unauthorized' });
    }
    const tasks = await EntitySyncService.getLinkedTasksForNote(db, req.user.id, req.params.id);
    res.json({ tasks });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/notes/:id/tasks - Connect existing task or create new task from note
router.post('/:id/tasks', async (req, res, next) => {
  try {
    const note = await Note.findById(req.params.id, req.user.id);
    if (!note) {
      return res.status(404).json({ error: 'Note not found or unauthorized' });
    }

    const { taskId, title, description, status = 'planned', priority = 'medium', linkType = 'relates_to' } = req.body;
    let targetTaskId = taskId;

    if (!targetTaskId && title && title.trim()) {
      const result = await db.query(
        'INSERT INTO tasks (user_id, project_id, title, description, status, priority) VALUES (?, ?, ?, ?, ?, ?)',
        [req.user.id, note.project_id || null, title.trim(), description || '', status, priority]
      );
      targetTaskId = result.insertId;
      await EntitySyncService.syncTaskEntity(db, targetTaskId, req.user.id);
    }

    if (!targetTaskId) {
      return res.status(400).json({ error: 'Either taskId or task title must be provided' });
    }

    const taskRows = await db.query('SELECT * FROM tasks WHERE id = ? AND user_id = ? LIMIT 1', [targetTaskId, req.user.id]);
    if (!taskRows || taskRows.length === 0) {
      return res.status(404).json({ error: 'Task not found or unauthorized' });
    }

    const link = await EntitySyncService.linkNoteAndTask(db, req.user.id, req.params.id, targetTaskId, linkType);
    res.status(201).json({ task: taskRows[0], link });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/v1/notes/:id/tasks/:taskId - Remove relationship between note and task
router.delete('/:id/tasks/:taskId', async (req, res, next) => {
  try {
    const note = await Note.findById(req.params.id, req.user.id);
    if (!note) {
      return res.status(404).json({ error: 'Note not found or unauthorized' });
    }
    await EntitySyncService.unlinkNoteAndTask(db, req.user.id, req.params.id, req.params.taskId);
    res.json({ success: true, message: 'Relationship removed' });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/notes/:id/connections - Get all notes connected to this note
router.get('/:id/connections', async (req, res, next) => {
  try {
    const note = await Note.findById(req.params.id, req.user.id);
    if (!note) {
      return res.status(404).json({ error: 'Note not found or unauthorized' });
    }
    const connections = await EntitySyncService.getConnectedNotesForNote(db, req.user.id, req.params.id);
    res.json({ connections });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/notes/:id/connections - Connect this note to another note
router.post('/:id/connections', async (req, res, next) => {
  try {
    const sourceNote = await Note.findById(req.params.id, req.user.id);
    if (!sourceNote) {
      return res.status(404).json({ error: 'Source note not found or unauthorized' });
    }

    const { targetNoteId, relationship = 'relates_to' } = req.body;
    if (!targetNoteId) {
      return res.status(400).json({ error: 'Target note ID is required' });
    }

    const targetNote = await Note.findById(targetNoteId, req.user.id);
    if (!targetNote) {
      return res.status(404).json({ error: 'Target note not found or unauthorized' });
    }

    const link = await EntitySyncService.linkNotes(db, req.user.id, req.params.id, targetNoteId, relationship);
    res.status(201).json({ success: true, link });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/v1/notes/:id/connections/:targetNoteId - Unlink two notes
router.delete('/:id/connections/:targetNoteId', async (req, res, next) => {
  try {
    await EntitySyncService.unlinkNotes(db, req.user.id, req.params.id, req.params.targetNoteId);
    res.json({ success: true, message: 'Notes unlinked successfully' });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/notes/:id/versions - List version history
router.get('/:id/versions', async (req, res, next) => {
  try {
    const note = await Note.findById(req.params.id, req.user.id);
    if (!note) {
      return res.status(404).json({ error: 'Note not found or unauthorized' });
    }
    const versions = await db.query(
      'SELECT id, note_id, version_number, title, created_at, LENGTH(content_markdown) as char_count FROM note_versions WHERE note_id = ? AND user_id = ? ORDER BY version_number DESC',
      [req.params.id, req.user.id]
    );
    res.json({ versions });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/notes/:id/versions/:versionId - Get specific version content
router.get('/:id/versions/:versionId', async (req, res, next) => {
  try {
    const rows = await db.query(
      'SELECT * FROM note_versions WHERE id = ? AND note_id = ? AND user_id = ? LIMIT 1',
      [req.params.versionId, req.params.id, req.user.id]
    );
    if (!rows || rows.length === 0) {
      return res.status(404).json({ error: 'Version not found' });
    }
    res.json({ version: rows[0] });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/notes/:id/versions/:versionId/restore - Restore version
router.post('/:id/versions/:versionId/restore', async (req, res, next) => {
  try {
    const vRows = await db.query(
      'SELECT * FROM note_versions WHERE id = ? AND note_id = ? AND user_id = ? LIMIT 1',
      [req.params.versionId, req.params.id, req.user.id]
    );
    if (!vRows || vRows.length === 0) {
      return res.status(404).json({ error: 'Target version not found' });
    }
    const targetVersion = vRows[0];

    const currentNoteRows = await db.query('SELECT * FROM notes WHERE id = ? AND user_id = ? LIMIT 1', [req.params.id, req.user.id]);
    if (currentNoteRows && currentNoteRows.length > 0) {
      const cur = currentNoteRows[0];
      const maxVerRows = await db.query('SELECT MAX(version_number) as max_v FROM note_versions WHERE note_id = ? AND user_id = ?', [req.params.id, req.user.id]);
      const nextNum = (maxVerRows && maxVerRows[0] && maxVerRows[0].max_v ? maxVerRows[0].max_v : 1) + 1;
      await db.query(
        'INSERT INTO note_versions (note_id, user_id, version_number, title, content_markdown) VALUES (?, ?, ?, ?, ?)',
        [req.params.id, req.user.id, nextNum, cur.title, cur.content || '']
      );
    }

    const updatedNote = await Note.update(req.params.id, req.user.id, {
      title: targetVersion.title,
      content: targetVersion.content_markdown
    });

    res.json({ message: `Restored to version ${targetVersion.version_number}`, note: updatedNote });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
