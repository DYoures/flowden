-- FLOWDEN Target Schema Snapshot (schema-target.sql)
-- Documentation & Schema Comparison Snapshot ONLY (NEVER executed directly for installs)
-- Canonical End-State after migrations 001 -> 002 -> 003 -> 004

CREATE TABLE users (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  display_name VARCHAR(100) NOT NULL,
  avatar_url VARCHAR(500) NULL,
  role ENUM('admin', 'user') NOT NULL DEFAULT 'user',
  theme_preference ENUM('dark', 'light') NOT NULL DEFAULT 'dark',
  settings_json JSON NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE projects (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  title VARCHAR(200) NOT NULL,
  description TEXT NULL,
  color VARCHAR(7) DEFAULT '#7c5cbf',
  icon VARCHAR(50) DEFAULT 'folder',
  status ENUM('active', 'archived') NOT NULL DEFAULT 'active',
  sort_order INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_user_status (user_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE boards (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  project_id INT UNSIGNED NOT NULL,
  parent_board_id INT UNSIGNED NULL,
  user_id INT UNSIGNED NOT NULL,
  title VARCHAR(200) NOT NULL,
  description TEXT NULL,
  zoom_level FLOAT DEFAULT 1.0,
  viewport_x FLOAT DEFAULT 0,
  viewport_y FLOAT DEFAULT 0,
  grid_size INT DEFAULT 20,
  deleted_at TIMESTAMP NULL DEFAULT NULL,
  cascade_deleted_by INT UNSIGNED NULL DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_project (project_id),
  INDEX idx_user (user_id),
  INDEX idx_parent_board (parent_board_id),
  INDEX idx_boards_deleted_at (deleted_at),
  INDEX idx_boards_cdb (cascade_deleted_by)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE board_groups (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  board_id INT UNSIGNED NOT NULL,
  title VARCHAR(200) NOT NULL,
  color VARCHAR(7) NULL,
  position_x FLOAT DEFAULT 0,
  position_y FLOAT DEFAULT 0,
  width FLOAT DEFAULT 400,
  height FLOAT DEFAULT 300,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE board_items (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  board_id INT UNSIGNED NOT NULL,
  user_id INT UNSIGNED NOT NULL,
  item_type ENUM('note', 'idea', 'image', 'link', 'research_ref', 'task', 'document') NOT NULL,
  reference_type ENUM('project', 'note', 'task', 'research', 'excerpt', 'board', 'decision') NULL,
  title VARCHAR(300) NULL,
  content TEXT NULL,
  position_x FLOAT NOT NULL DEFAULT 0,
  position_y FLOAT NOT NULL DEFAULT 0,
  width FLOAT DEFAULT 220,
  height FLOAT DEFAULT 160,
  color VARCHAR(7) NULL,
  z_index INT DEFAULT 0,
  metadata_json JSON NULL,
  deleted_at TIMESTAMP NULL DEFAULT NULL,
  cascade_deleted_by INT UNSIGNED NULL DEFAULT NULL,
  group_id INT UNSIGNED NULL,
  reference_id INT UNSIGNED NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_board (board_id),
  INDEX idx_board_items_deleted_at (deleted_at),
  INDEX idx_board_items_cdb (cascade_deleted_by)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE board_item_connections (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  board_id INT UNSIGNED NOT NULL,
  source_item_id INT UNSIGNED NOT NULL,
  target_item_id INT UNSIGNED NOT NULL,
  connection_type VARCHAR(50) DEFAULT 'default',
  label VARCHAR(200) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE note_folders (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  parent_folder_id INT UNSIGNED NULL,
  name VARCHAR(200) NOT NULL,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_user_folder (user_id, parent_folder_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE notes (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  project_id INT UNSIGNED NULL,
  folder_id INT UNSIGNED NULL,
  title VARCHAR(300) NOT NULL,
  content LONGTEXT NULL,
  is_pinned BOOLEAN DEFAULT FALSE,
  word_count INT DEFAULT 0,
  deleted_at TIMESTAMP NULL DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_user (user_id),
  INDEX idx_project (project_id),
  INDEX idx_folder (folder_id),
  INDEX idx_notes_deleted_at (deleted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE note_tags (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  name VARCHAR(100) NOT NULL,
  color VARCHAR(7) DEFAULT '#7c5cbf',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_user_tag (user_id, name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE note_tag_map (
  note_id INT UNSIGNED NOT NULL,
  tag_id INT UNSIGNED NOT NULL,
  PRIMARY KEY (note_id, tag_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE note_links (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  source_note_id INT UNSIGNED NOT NULL,
  target_note_id INT UNSIGNED NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_note_link (source_note_id, target_note_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE note_versions (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  note_id INT UNSIGNED NOT NULL,
  title VARCHAR(300) NOT NULL,
  content LONGTEXT NULL,
  version_number INT NOT NULL,
  created_by INT UNSIGNED NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_note_version (note_id, version_number)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE research_documents (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  project_id INT UNSIGNED NULL,
  title VARCHAR(300) NOT NULL,
  original_filename VARCHAR(300) NOT NULL,
  file_path VARCHAR(500) NOT NULL,
  file_type ENUM('md', 'pdf', 'docx', 'txt') NOT NULL,
  file_size INT UNSIGNED NOT NULL,
  content_text LONGTEXT NULL,
  summary TEXT NULL,
  source_url VARCHAR(1000) NULL,
  import_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP NULL DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_user (user_id),
  INDEX idx_project (project_id),
  INDEX idx_research_documents_deleted_at (deleted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE research_excerpts (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  research_id INT UNSIGNED NOT NULL,
  user_id INT UNSIGNED NOT NULL,
  project_id INT UNSIGNED NULL,
  quoted_text TEXT NOT NULL,
  annotation TEXT NULL,
  location_anchor VARCHAR(100) NOT NULL,
  color VARCHAR(30) NOT NULL DEFAULT 'yellow',
  deleted_at TIMESTAMP NULL DEFAULT NULL,
  cascade_deleted_by INT UNSIGNED NULL DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_research (research_id),
  INDEX idx_user_project (user_id, project_id),
  INDEX idx_deleted_at (deleted_at),
  INDEX idx_research_excerpts_cdb (cascade_deleted_by)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE tasks (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  project_id INT UNSIGNED NULL,
  title VARCHAR(300) NOT NULL,
  description TEXT NULL,
  status ENUM('planned', 'in_progress', 'done') DEFAULT 'planned',
  priority ENUM('low', 'medium', 'high', 'urgent') DEFAULT 'medium',
  due_date DATE NULL,
  sort_order INT DEFAULT 0,
  completed_at TIMESTAMP NULL,
  deleted_at TIMESTAMP NULL DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_user_status (user_id, status),
  INDEX idx_project (project_id),
  INDEX idx_tasks_deleted_at (deleted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE decision_logs (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  project_id INT UNSIGNED NOT NULL,
  title VARCHAR(300) NOT NULL,
  context TEXT NULL,
  decision TEXT NOT NULL,
  outcome TEXT NULL,
  decided_at DATE NULL,
  deleted_at TIMESTAMP NULL DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_project (project_id),
  INDEX idx_decision_logs_deleted_at (deleted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE templates (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NULL,
  name VARCHAR(200) NOT NULL,
  description TEXT NULL,
  type ENUM('project', 'board', 'note') NOT NULL,
  template_data JSON NOT NULL,
  is_system BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE quick_captures (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  content TEXT NOT NULL,
  capture_type ENUM('text', 'link', 'image') DEFAULT 'text',
  is_processed BOOLEAN DEFAULT FALSE,
  project_id INT UNSIGNED NULL,
  deleted_at TIMESTAMP NULL DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user_processed (user_id, is_processed),
  INDEX idx_quick_captures_deleted_at (deleted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE smart_connections (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  source_type ENUM('note', 'research', 'task', 'project') NOT NULL,
  source_id INT UNSIGNED NOT NULL,
  target_type ENUM('note', 'research', 'task', 'project') NOT NULL,
  target_id INT UNSIGNED NOT NULL,
  relationship ENUM('related_to', 'supports', 'contradicts', 'inspired_by', 'depends_on') NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user (user_id),
  INDEX idx_source (source_type, source_id),
  INDEX idx_target (target_type, target_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE entities (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  uuid VARCHAR(36) NOT NULL,
  entity_type ENUM('project', 'note', 'task', 'research', 'excerpt', 'board', 'decision', 'capture') NOT NULL,
  entity_id INT UNSIGNED NOT NULL,
  owner_user_id INT UNSIGNED NOT NULL,
  primary_project_id INT UNSIGNED NULL,
  title VARCHAR(255) NOT NULL,
  search_text LONGTEXT NULL,
  is_archived BOOLEAN NOT NULL DEFAULT FALSE,
  deleted_at TIMESTAMP NULL DEFAULT NULL,
  cascade_deleted_by INT UNSIGNED NULL DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_entity_type_id (entity_type, entity_id),
  UNIQUE KEY uq_entity_uuid (uuid),
  INDEX idx_owner_project (owner_user_id, primary_project_id),
  INDEX idx_title (title),
  INDEX idx_deleted_at (deleted_at),
  INDEX idx_entities_cdb (cascade_deleted_by),
  FULLTEXT KEY ft_entity_search (title, search_text)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE entity_links (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  source_type ENUM('project', 'note', 'task', 'research', 'excerpt', 'board', 'decision', 'capture') NOT NULL,
  source_id INT UNSIGNED NOT NULL,
  target_type ENUM('project', 'note', 'task', 'research', 'excerpt', 'board', 'decision', 'capture') NOT NULL,
  target_id INT UNSIGNED NOT NULL,
  link_type ENUM('references', 'embeds', 'cites', 'derived_from', 'supports', 'contradicts', 'inspired_by', 'depends_on', 'blocks', 'relates_to') NOT NULL DEFAULT 'references',
  origin ENUM('inline_link', 'embed', 'board_promoted', 'citation', 'task_sync', 'capture_convert', 'manual', 'ai_suggested') NOT NULL DEFAULT 'inline_link',
  context_snippet VARCHAR(500) NULL,
  is_confirmed BOOLEAN NOT NULL DEFAULT TRUE,
  deleted_at TIMESTAMP NULL DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_relationship (source_type, source_id, target_type, target_id, link_type),
  INDEX idx_user_source (user_id, source_type, source_id),
  INDEX idx_user_target (user_id, target_type, target_id),
  INDEX idx_link_type (link_type),
  INDEX idx_deleted_confirmed (deleted_at, is_confirmed)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE project_entities (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  project_id INT UNSIGNED NOT NULL,
  entity_type ENUM('note', 'task', 'research', 'excerpt', 'board', 'decision') NOT NULL,
  entity_id INT UNSIGNED NOT NULL,
  access_role ENUM('viewer', 'contributor', 'admin') NOT NULL DEFAULT 'contributor',
  added_by INT UNSIGNED NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_project_entity (project_id, entity_type, entity_id),
  INDEX idx_entity (entity_type, entity_id),
  INDEX idx_project (project_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE project_members (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  project_id INT UNSIGNED NOT NULL,
  user_id INT UNSIGNED NOT NULL,
  role ENUM('owner', 'editor', 'viewer') NOT NULL DEFAULT 'editor',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  revoked_at TIMESTAMP NULL DEFAULT NULL,
  UNIQUE KEY uq_project_user (project_id, user_id),
  INDEX idx_project_user (project_id, user_id),
  INDEX idx_user_revoked (user_id, revoked_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE schema_migrations (
  version INT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

