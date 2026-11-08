const express = require('express');
const db = require('../config/database');
const Project = require('../models/Project');
const Board = require('../models/Board');
const Note = require('../models/Note');
const authenticateToken = require('../middleware/auth');

const router = express.Router();
router.use(authenticateToken);

const SYSTEM_TEMPLATES = [
  {
    id: 'sys_research_synthesis',
    name: 'Deep Research & Literature Synthesis',
    description: 'Structured workspace for literature reviews, research papers, and concept extraction.',
    type: 'project',
    is_system: true,
    color: '#dba54a',
    template_data: {
      folders: ['01 Literature Sources', '02 Conceptual Distillations', '03 Synthesis & Findings'],
      notes: [
        { title: 'Research Methodology & Hypotheses', content: '# Research Methodology\n\n- **Primary Research Question:**\n- **Scope & Boundaries:**\n- **Literature Inclusion Criteria:**\n\n## Hypotheses\n1. Initial hypothesis on knowledge integration.\n2. Emergent connections between disparate domains.' }
      ],
      board_groups: [
        { title: 'Primary Literature', color: '#dba54a', position_x: 60, position_y: 60, width: 340, height: 260 },
        { title: 'Conceptual Links', color: '#7c5cbf', position_x: 460, position_y: 60, width: 340, height: 260 }
      ],
      board_items: [
        { item_type: 'idea', title: 'Core Hypothesis', content: 'Connecting research to execution creates resilient knowledge architectures.', position_x: 80, position_y: 110, color: '#dba54a' },
        { item_type: 'note', title: 'Synthesis Anchor', content: 'Examine bi-directional links between papers.', position_x: 480, position_y: 110, color: '#7c5cbf' }
      ]
    }
  },
  {
    id: 'sys_spatial_systems',
    name: 'Spatial Systems Architecture',
    description: 'Technical architecture design workspace with ADR decision logs, domain components, and interface boards.',
    type: 'project',
    is_system: true,
    color: '#7c5cbf',
    template_data: {
      folders: ['Architecture Decision Records', 'Domain Models', 'API Contracts'],
      notes: [
        { title: 'ADR 001 - Core Relational Schema', content: '# ADR 001: Core Relational Schema\n\n## Context\nWe need high integrity data persistence with zero mock integrations.\n\n## Decision\nUse MySQL 8.0 with InnoDB and strict relational constraints.\n\n## Status\nAccepted' }
      ],
      board_groups: [
        { title: 'Client Surface', color: '#5b8fd9', position_x: 60, position_y: 60, width: 340, height: 260 },
        { title: 'Core Services', color: '#7c5cbf', position_x: 460, position_y: 60, width: 340, height: 260 }
      ],
      board_items: [
        { item_type: 'document', title: 'Spatial Workspace UI', content: 'Interactive SVG canvas + 2D pan/zoom engine.', position_x: 80, position_y: 110, color: '#5b8fd9' },
        { item_type: 'note', title: 'Knowledge Graph Engine', content: 'Force-directed graph clustering algorithms.', position_x: 480, position_y: 110, color: '#7c5cbf' }
      ]
    }
  }
];

// GET /api/v1/templates
router.get('/', async (req, res, next) => {
  try {
    const userTemplates = await db.query(
      'SELECT * FROM templates WHERE user_id = ? OR is_system = 1 ORDER BY is_system DESC, id ASC',
      [req.user.id]
    );

    // Merge in-memory system templates if not yet in database
    const combined = [...SYSTEM_TEMPLATES];
    if (userTemplates && userTemplates.length > 0) {
      userTemplates.forEach(ut => {
        if (!combined.some(c => c.id === ut.id || c.name === ut.name)) {
          combined.push(ut);
        }
      });
    }

    res.json({ templates: combined });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/templates/:id/apply
router.post('/:id/apply', async (req, res, next) => {
  try {
    const templateId = req.params.id;
    const { title } = req.body;

    const tpl = SYSTEM_TEMPLATES.find(t => t.id === templateId);
    if (!tpl) {
      return res.status(404).json({ error: 'Template not found' });
    }

    // 1. Create Project
    const project = await Project.create(req.user.id, {
      title: title || tpl.name,
      description: tpl.description,
      color: tpl.color
    });

    // 2. Get the default board created for this project
    const boards = await Board.findByProject(project.id, req.user.id);
    const board = boards[0];

    // 3. Create Template Folders & Notes
    if (tpl.template_data.folders) {
      for (const fName of tpl.template_data.folders) {
        await Note.createFolder(req.user.id, fName);
      }
    }

    if (tpl.template_data.notes) {
      for (const n of tpl.template_data.notes) {
        await Note.create(req.user.id, {
          title: n.title,
          content: n.content,
          project_id: project.id
        });
      }
    }

    // 4. Create Template Board Groups & Items
    if (board && tpl.template_data.board_groups) {
      for (const g of tpl.template_data.board_groups) {
        await Board.createGroup(board.id, req.user.id, g);
      }
    }

    if (board && tpl.template_data.board_items) {
      for (const item of tpl.template_data.board_items) {
        await Board.createItem(board.id, req.user.id, item);
      }
    }

    res.status(201).json({
      message: 'Template successfully instantiated',
      project
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;

