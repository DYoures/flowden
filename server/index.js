require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const path = require('path');
const fs = require('fs');

const db = require('./config/database');
const authenticateToken = require('./middleware/auth');
const errorHandler = require('./middleware/errorHandler');
const SecurityService = require('./services/securityService');

// Route imports
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const projectRoutes = require('./routes/projects');
const boardRoutes = require('./routes/boards');
const noteRoutes = require('./routes/notes');
const connectionRoutes = require('./routes/connections');
const graphRoutes = require('./routes/graph');
const decisionLogsRoutes = require('./routes/decisionLogs');
const templateRoutes = require('./routes/templates');
const quickCaptureRoutes = require('./routes/quickCaptures');
const taskRoutes = require('./routes/tasks');
const researchRoutes = require('./routes/research');
const searchRoutes = require('./routes/search');
const adminRoutes = require('./routes/admin');
const exchangeRoutes = require('./routes/exchange');
const mcpRoutes = require('./routes/mcp');
const { cleanupStaleStagingDirs } = require('./services/packageInspectionService');

// Clean up stale Knowledge Exchange inspection staging directories (> 1 hour old) on module load
cleanupStaleStagingDirs(3600000);

const app = express();
const PORT = process.env.PORT || 3000;

// Security headers with YouTube privacy-enhanced iframe and thumbnail support
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
      imgSrc: ["'self'", "data:", "blob:", "https:"],
      mediaSrc: ["'self'", "blob:", "https:"],
      frameSrc: ["'self'", "https://www.youtube.com", "https://www.youtube-nocookie.com"],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      frameAncestors: ["'self'"]
    }
  },
  crossOriginEmbedderPolicy: false,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' }
}));

// Restrictive CORS policy
const allowedOrigins = new Set([
  `http://localhost:${PORT}`,
  `http://127.0.0.1:${PORT}`,
  process.env.ALLOWED_ORIGIN
].filter(Boolean));

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.has(origin)) {
      return callback(null, true);
    }
    return callback(null, false);
  },
  credentials: true
}));

// Body parsing & cookies
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// Authenticated & ownership-verified attachment serving for /uploads/:category/:filename
// Prevents unauthenticated or cross-user file downloads and blocks path traversal
const uploadsRootDir = path.resolve(__dirname, '..', 'uploads');
const publicUploadsFallbackDir = path.resolve(__dirname, '..', 'public', 'uploads');

app.use('/uploads', authenticateToken, async (req, res) => {
  try {
    const cleanRel = String(req.path || '').replace(/^\/+/, '');
    const segments = cleanRel.split('/').filter(Boolean);
    if (segments.length !== 2) {
      return res.status(400).json({ error: 'Invalid attachment path' });
    }

    const [category, rawFilename] = segments;
    if (!['vault', 'research'].includes(category)) {
      return res.status(400).json({ error: 'Invalid upload category' });
    }

    const safeFilename = path.basename(rawFilename);
    if (!safeFilename || safeFilename !== rawFilename || rawFilename.includes('..') || rawFilename.includes('\0')) {
      await SecurityService.logSecurityEvent({
        userId: req.user.id,
        eventType: 'ATTACHMENT_PATH_TRAVERSAL_BLOCKED',
        severity: 'critical',
        ip: req.ip,
        targetType: 'file_upload',
        targetId: rawFilename
      });
      return res.status(400).json({ error: 'Invalid filename' });
    }

    const categoryDir = path.resolve(uploadsRootDir, category);
    let resolvedFilePath = path.resolve(categoryDir, safeFilename);
    if (!resolvedFilePath.startsWith(categoryDir + path.sep)) {
      return res.status(400).json({ error: 'Path traversal blocked' });
    }

    if (!fs.existsSync(resolvedFilePath)) {
      const altCategoryDir = path.resolve(publicUploadsFallbackDir, category);
      const altPath = path.resolve(altCategoryDir, safeFilename);
      if (altPath.startsWith(altCategoryDir + path.sep) && fs.existsSync(altPath)) {
        resolvedFilePath = altPath;
      } else {
        return res.status(404).json({ error: 'Attachment not found' });
      }
    }

    const urlPath = `/uploads/${category}/${safeFilename}`;
    const authorized = await SecurityService.canUserAccessUploadedFile(req.user.id, urlPath);
    if (!authorized) {
      await SecurityService.logSecurityEvent({
        userId: req.user.id,
        eventType: 'ATTACHMENT_UNAUTHORIZED_ACCESS',
        severity: 'high',
        ip: req.ip,
        targetType: 'file_upload',
        targetId: urlPath
      });
      return res.status(403).json({ error: 'Unauthorized attachment access' });
    }

    const ext = path.extname(safeFilename).toLowerCase();
    const inlineSafeExts = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.ico', '.mp4', '.webm', '.ogg', '.mp3', '.wav', '.m4a', '.pdf']);

    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self' data:; media-src 'self'; style-src 'unsafe-inline'; sandbox");
    if (!inlineSafeExts.has(ext)) {
      res.setHeader('Content-Disposition', `attachment; filename="${safeFilename.replace(/"/g, '')}"`);
    } else {
      res.setHeader('Content-Disposition', `inline; filename="${safeFilename.replace(/"/g, '')}"`);
    }

    return res.sendFile(resolvedFilePath, { dotfiles: 'allow' });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to serve attachment' });
  }
});

// Static assets (excluding /uploads which is gated above)
app.use(express.static(path.join(__dirname, '..', 'public')));

// Public Policy Pages
app.get('/privacy', (req, res) => res.sendFile('privacy.html', { root: path.join(__dirname, '..', 'public') }));
app.get('/terms', (req, res) => res.sendFile('terms.html', { root: path.join(__dirname, '..', 'public') }));

// Health check and status
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    product: 'Flowden',
    version: '1.0.0',
    database: db.getStatus(),
    timestamp: new Date().toISOString()
  });
});

// API Routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/users', userRoutes);
app.use('/api/v1/projects', projectRoutes);
app.use('/api/v1/boards', boardRoutes);
app.use('/api/v1/notes', noteRoutes);
app.use('/api/v1/connections', connectionRoutes);
app.use('/api/v1/graph', graphRoutes);
app.use('/api/v1/decision-logs', decisionLogsRoutes);
app.use('/api/v1/templates', templateRoutes);
app.use('/api/v1/quick-captures', quickCaptureRoutes);
app.use('/api/v1/tasks', taskRoutes);
app.use('/api/v1/research', researchRoutes);
app.use('/api/v1/search', searchRoutes);
app.use('/api/v1/admin', adminRoutes);
app.use('/api/v1/exchange', exchangeRoutes);
app.use('/mcp', mcpRoutes);

// Global Error Handler
app.use(errorHandler);

// Start server after DB initialization
async function start() {
  // 1. Explicit authentication configuration validation before any I/O, DB, or network listener
  const authConfig = require('./config/auth');
  authConfig.validateAuthConfig();

  cleanupStaleStagingDirs(3600000);
  await db.initDB();
  await SecurityService.ensureSecurityTables();
  try {
    const KnowledgeExchangeService = require('./services/knowledgeExchangeService');
    await KnowledgeExchangeService.reconcileUnfinishedJobs();
  } catch (_) {}
  return new Promise((resolve, reject) => {
    const server = app.listen(PORT, (err) => {
      if (err) return reject(err);
      console.log(`\n==================================================`);
      console.log(`  FLOWDEN: Modern Spatial Productivity Workspace`);
      console.log(`  Server listening on http://localhost:${PORT}`);
      console.log(`  Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`==================================================\n`);
      resolve(server);
    });
  });
}

if (require.main === module) {
  start().catch(err => {
    console.error('Failed to initialize server:', err);
    process.exit(1);
  });
}

app.app = app;
app.start = start;

module.exports = app;
