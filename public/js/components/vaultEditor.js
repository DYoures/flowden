// public/js/components/vaultEditor.js
// Flowden Knowledge Vault 2.0 - Notion-Style Block Editor Engine
// Natural Block Gutter, Drag Reordering, Universal Attachments,
// Media Players, Smart Link Paste (Mention/Bookmark/Embed/URL), and Outline Extraction

(function () {
  'use strict';

  let blockIdCounter = 1;

  const ARCHIVE_EXTS = new Set(['.zip', '.7z', '.rar', '.tar', '.gz', '.tgz', '.bz2', '.xz']);
  const DOC_EXTS = new Set(['.pdf', '.docx', '.xlsx', '.pptx', '.doc', '.xls', '.ppt', '.txt', '.csv', '.md']);

  function generateBlockId() {
    return 'blk_' + Date.now().toString(36) + '_' + (blockIdCounter++).toString(36);
  }

  function formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  function getFileIconSvg(ext = '') {
    const cleanExt = ext.replace('.', '').toLowerCase();
    if (['pdf'].includes(cleanExt)) {
      return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M9 13v4"/><path d="M12 11v6"/><path d="M15 13v4"/></svg>';
    }
    if (['zip', '7z', 'rar', 'tar', 'gz', 'tgz', 'bz2', 'xz'].includes(cleanExt)) {
      return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>';
    }
    if (['mp4', 'webm', 'mov', 'mkv', 'avi', 'm4v'].includes(cleanExt)) {
      return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" stroke-width="2"><rect width="18" height="18" x="3" y="3" rx="2"/><polyline points="10 8 16 12 10 16 10 8"/></svg>';
    }
    if (['mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac'].includes(cleanExt)) {
      return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ec4899" stroke-width="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>';
    }
    if (['doc', 'docx', 'txt', 'md', 'rtf'].includes(cleanExt)) {
      return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>';
    }
    if (['xls', 'xlsx', 'csv'].includes(cleanExt)) {
      return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M8 13h8"/><path d="M8 17h8"/><path d="M12 11v8"/></svg>';
    }
    if (['ppt', 'pptx'].includes(cleanExt)) {
      return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f97316" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><rect width="8" height="6" x="8" y="12" rx="1"/></svg>';
    }
    return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>';
  }

  const VaultEditor = {
    /**
     * Converts canonical Markdown string into styled semantic WYSIWYG HTML blocks
     */
    markdownToHtml(md) {
      if (!md || !md.trim()) {
        const id = generateBlockId();
        return `<p class="vault-block" data-block-id="${id}" data-block-type="paragraph"><br></p>`;
      }

      const lines = md.split('\n');
      const htmlBlocks = [];
      let inCodeBlock = false;
      let codeLang = '';
      let codeBuffer = [];
      let inList = false;
      let listType = 'ul';
      let listBuffer = [];
      let inTable = false;
      let tableRows = [];

      function closeListIfOpen() {
        if (inList) {
          const id = generateBlockId();
          const itemsHtml = listBuffer.map(item => `<li>${item}</li>`).join('');
          htmlBlocks.push(`<${listType} class="vault-block" data-block-id="${id}" data-block-type="${listType === 'ul' ? 'bullet-list' : 'numbered-list'}">${itemsHtml}</${listType}>`);
          inList = false;
          listBuffer = [];
        }
      }

      function closeTableIfOpen() {
        if (inTable) {
          if (tableRows.length > 0) {
            const id = generateBlockId();
            let tHtml = `<div class="vault-block vault-table-block" data-block-id="${id}" data-block-type="table"><table class="vault-table">`;
            const headerRow = tableRows[0];
            tHtml += '<thead><tr>' + headerRow.map(c => `<th>${c}</th>`).join('') + '</tr></thead>';
            tHtml += '<tbody>';
            for (let i = 1; i < tableRows.length; i++) {
              tHtml += '<tr>' + tableRows[i].map(c => `<td>${c}</td>`).join('') + '</tr>';
            }
            tHtml += '</tbody></table></div>';
            htmlBlocks.push(tHtml);
          }
          inTable = false;
          tableRows = [];
        }
      }

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // Code block handling (```)
        if (line.trim().startsWith('```')) {
          closeListIfOpen();
          closeTableIfOpen();
          if (inCodeBlock) {
            const id = generateBlockId();
            const codeText = escapeHtml(codeBuffer.join('\n'));
            htmlBlocks.push(`<pre class="vault-block vault-code-block" data-block-id="${id}" data-block-type="code" data-lang="${codeLang}"><code class="language-${codeLang}">${codeText}</code></pre>`);
            inCodeBlock = false;
            codeBuffer = [];
          } else {
            inCodeBlock = true;
            codeLang = line.trim().slice(3).trim();
          }
          continue;
        }

        if (inCodeBlock) {
          codeBuffer.push(line);
          continue;
        }

        // Video block: ![video: caption](url) or [video: caption](url)
        const videoMatch = line.trim().match(/^!?\[video:\s*(.*?)\]\((.*?)\)$/i);
        if (videoMatch) {
          closeListIfOpen();
          closeTableIfOpen();
          const caption = videoMatch[1] || '';
          const url = sanitizeHref(videoMatch[2] || '');
          const id = generateBlockId();
          htmlBlocks.push(`
            <div class="vault-block vault-video-block" data-block-id="${id}" data-block-type="video" data-url="${url}" data-width="100">
              <div class="vault-video-container" style="max-width: 100%;">
                <div class="vault-video-wrapper">
                  <video src="${url}" controls preload="metadata"></video>
                  <div class="vault-video-toolbar" contenteditable="false">
                    <button class="vault-video-btn" data-width="50" type="button">50%</button>
                    <button class="vault-video-btn" data-width="75" type="button">75%</button>
                    <button class="vault-video-btn is-active" data-width="100" type="button">100%</button>
                    <span class="vault-video-sep"></span>
                    <button class="vault-video-btn vault-video-delete" type="button" title="Delete video">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                    </button>
                  </div>
                </div>
                <div class="vault-video-caption" contenteditable="true" data-placeholder="Add video caption...">${escapeHtml(caption)}</div>
              </div>
            </div>
          `);
          continue;
        }

        // Audio block: ![audio: caption](url) or [audio: caption](url)
        const audioMatch = line.trim().match(/^!?\[audio:\s*(.*?)\]\((.*?)\)$/i);
        if (audioMatch) {
          closeListIfOpen();
          closeTableIfOpen();
          const title = audioMatch[1] || 'Audio Track';
          const url = audioMatch[2] || '';
          const id = generateBlockId();
          htmlBlocks.push(`
            <div class="vault-block vault-audio-block" data-block-id="${id}" data-block-type="audio" data-url="${escapeHtml(url)}" data-title="${escapeHtml(title)}">
              <div class="vault-audio-card" contenteditable="false">
                <div class="vault-audio-icon">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
                </div>
                <div style="flex:1;min-width:0;">
                  <div style="font-size:12px;font-weight:600;margin-bottom:4px;" class="text-truncate">${escapeHtml(title)}</div>
                  <audio src="${escapeHtml(url)}" controls preload="metadata"></audio>
                </div>
                <button class="vault-file-btn vault-audio-delete" type="button" title="Delete audio">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                </button>
              </div>
            </div>
          `);
          continue;
        }

        // Embed block: [embed: provider](url) or [embed: provider](url "title")
        const embedMatch = line.trim().match(/^\[embed:\s*(.*?)\]\(([^\s\)]+)(?:\s+"([^"]*)")?\)$/i);
        if (embedMatch) {
          closeListIfOpen();
          closeTableIfOpen();
          const provider = embedMatch[1] || 'web';
          const url = embedMatch[2] || '';
          const embedTitle = embedMatch[3] || '';
          const id = generateBlockId();
          const detected = window.SmartLinkHandler ? window.SmartLinkHandler.detectProvider(url) : null;
          const embedUrl = detected ? detected.embedUrl : url;
          htmlBlocks.push(window.SmartLinkHandler ? window.SmartLinkHandler.renderEmbedHtml(url, { embedProvider: provider, embedUrl, title: embedTitle }, id) : `<div>${url}</div>`);
          continue;
        }

        // Bookmark block: [bookmark: title](url "desc" "image") or [bookmark: title](url "desc") or [bookmark: title](url)
        const bookmarkMatch = line.trim().match(/^!?\[bookmark:\s*(.*?)\]\(([^\s\)]+)(?:\s+"([^"]*)")?(?:\s+"([^"]*)")?\)$/i);
        if (bookmarkMatch) {
          closeListIfOpen();
          closeTableIfOpen();
          const title = bookmarkMatch[1] || '';
          const url = bookmarkMatch[2] || '';
          const desc = bookmarkMatch[3] || '';
          const image = bookmarkMatch[4] || '';
          const id = generateBlockId();
          htmlBlocks.push(window.SmartLinkHandler ? window.SmartLinkHandler.renderBookmarkHtml(url, { title, description: desc, image }, id) : `<div>${url}</div>`);
          continue;
        }

        // Image block: ![caption](url)
        const imageMatch = line.trim().match(/^!\[(.*?)\]\((.*?)\)$/);
        if (imageMatch) {
          closeListIfOpen();
          closeTableIfOpen();
          const caption = imageMatch[1] || '';
          const url = sanitizeHref(imageMatch[2] || '');
          const id = generateBlockId();
          htmlBlocks.push(`
            <div class="vault-block vault-image-block" data-block-id="${id}" data-block-type="image" data-width="100">
              <div class="vault-image-container" style="max-width: 100%;">
                <div class="vault-image-wrapper">
                  <div class="vault-resize-handle vault-block-resizer vault-resize-handle-left" data-direction="left"></div>
                  <img src="${url}" alt="${escapeHtml(caption)}" loading="lazy" />
                  <div class="vault-resize-handle vault-block-resizer vault-resize-handle-right" data-direction="right"></div>
                  <div class="vault-image-toolbar" contenteditable="false">
                    <button class="vault-img-btn" data-width="25" type="button" title="Width: 25%">25%</button>
                    <button class="vault-img-btn" data-width="50" type="button" title="Width: 50%">50%</button>
                    <button class="vault-img-btn" data-width="75" type="button" title="Width: 75%">75%</button>
                    <button class="vault-img-btn is-active" data-width="100" type="button" title="Full Width: 100%">100%</button>
                    <span class="vault-img-sep"></span>
                    <button class="vault-img-btn vault-img-delete" type="button" title="Delete image">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                    </button>
                  </div>
                </div>
                <figcaption class="vault-image-caption" contenteditable="true" data-placeholder="Add a caption...">${escapeHtml(caption)}</figcaption>
              </div>
            </div>
          `);
          continue;
        }

        // File Attachment block: [attachment: filename (size)](url) or [attachment: filename](url)
        const fileMatch = line.trim().match(/^\[(?:attachment:\s*)?(.*?)(?:\s*\((.*?)\))?\]\((.*?)\)$/);
        if (fileMatch && (line.trim().startsWith('[attachment:') || fileMatch[3].includes('/uploads/vault/') || fileMatch[3].includes('/uploads/'))) {
          closeListIfOpen();
          closeTableIfOpen();
          const fileName = fileMatch[1] || 'attachment';
          const fileSize = fileMatch[2] || '';
          const fileUrl = fileMatch[3] || '';
          const ext = fileName.includes('.') ? fileName.split('.').pop() : '';
          const lowerExt = '.' + ext.toLowerCase();
          const category = ARCHIVE_EXTS.has(lowerExt) ? 'archive' : (DOC_EXTS.has(lowerExt) ? 'document' : 'generic');
          const id = generateBlockId();
          htmlBlocks.push(`
            <div class="vault-block vault-file-block vault-file-card" data-block-id="${id}" data-block-type="file" data-category="${category}" data-url="${escapeHtml(fileUrl)}" data-name="${escapeHtml(fileName)}" data-size="${escapeHtml(fileSize)}">
              <div class="vault-file-card" data-category="${category}" contenteditable="false">
                <div class="vault-file-icon">${getFileIconSvg(ext)}</div>
                <div class="vault-file-info">
                  <a href="${escapeHtml(fileUrl)}" download="${escapeHtml(fileName)}" class="vault-file-name" target="_blank">${escapeHtml(fileName)}</a>
                  <span class="vault-file-size">${escapeHtml(fileSize || 'Attachment')}</span>
                </div>
                <div class="vault-file-actions">
                  <a href="${escapeHtml(fileUrl)}" download="${escapeHtml(fileName)}" class="vault-file-btn" title="Download">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                  </a>
                  <button class="vault-file-btn vault-file-remove" type="button" title="Remove attachment">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                  </button>
                </div>
              </div>
            </div>
          `);
          continue;
        }

        // Table row handling (| a | b |)
        if (line.trim().startsWith('|') && line.trim().endsWith('|')) {
          closeListIfOpen();
          const cells = line.split('|').slice(1, -1).map(c => c.trim());
          if (cells.every(c => /^:?-+:?$/.test(c))) {
            inTable = true;
            continue;
          }
          inTable = true;
          tableRows.push(cells.map(c => formatInline(c)));
          continue;
        } else {
          closeTableIfOpen();
        }

        // Horizontal rule
        if (/^(---|___|\*\*\*)$/.test(line.trim())) {
          closeListIfOpen();
          const id = generateBlockId();
          htmlBlocks.push(`<div class="vault-block vault-divider-block" data-block-id="${id}" data-block-type="divider"><hr class="vault-divider" /></div>`);
          continue;
        }

        // Callout card (> [!NOTE] or > [!TIP])
        if (/^>\s*\[!(NOTE|TIP|IMPORTANT|WARNING)\]/i.test(line.trim())) {
          closeListIfOpen();
          const type = line.trim().match(/\[!(.*?)\]/i)[1].toUpperCase();
          const bodyLines = [];
          while (i + 1 < lines.length && lines[i + 1].trim().startsWith('>')) {
            i++;
            bodyLines.push(lines[i].replace(/^>\s?/, ''));
          }
          const calloutBody = formatInline(bodyLines.join(' '));
          let iconSvg = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>';
          if (type === 'TIP') {
            iconSvg = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/></svg>';
          } else if (type === 'WARNING' || type === 'IMPORTANT') {
            iconSvg = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';
          }
          const id = generateBlockId();
          htmlBlocks.push(`
            <div class="vault-block vault-callout" data-block-id="${id}" data-block-type="callout" data-callout="${type}">
              <span class="vault-callout-icon" contenteditable="false">${iconSvg}</span>
              <div class="vault-callout-body">
                <strong>${type}:</strong> ${calloutBody}
              </div>
            </div>
          `);
          continue;
        }

        // Blockquote (> text)
        if (line.startsWith('> ')) {
          closeListIfOpen();
          const quoteLines = [line.slice(2)];
          while (i + 1 < lines.length && lines[i + 1].startsWith('> ') && !lines[i + 1].includes('[!')) {
            i++;
            quoteLines.push(lines[i].slice(2));
          }
          const text = formatInline(quoteLines.join(' '));
          const id = generateBlockId();
          htmlBlocks.push(`<blockquote class="vault-block" data-block-id="${id}" data-block-type="quote"><p>${text}</p></blockquote>`);
          continue;
        }

        // Checklist items (- [ ] or - [x])
        if (/^[-*]\s*\[([ xX])\]\s+(.*)$/.test(line)) {
          closeListIfOpen();
          const match = line.match(/^[-*]\s*\[([ xX])\]\s+(.*)$/);
          const isDone = match[1].toLowerCase() === 'x';
          const text = formatInline(match[2]);
          const id = generateBlockId();
          htmlBlocks.push(`
            <div class="vault-block vault-checklist-item ${isDone ? 'is-done' : ''}" data-block-id="${id}" data-block-type="checklist" data-task="true">
              <input type="checkbox" ${isDone ? 'checked' : ''} />
              <span class="vault-checklist-text">${text}</span>
            </div>
          `);
          continue;
        }

        // Bullet list (- item or * item)
        if (/^[-*]\s+(.*)$/.test(line)) {
          if (!inList || listType !== 'ul') {
            closeListIfOpen();
            inList = true;
            listType = 'ul';
          }
          const text = formatInline(line.replace(/^[-*]\s+/, ''));
          listBuffer.push(text);
          continue;
        }

        // Numbered list (1. item)
        if (/^\d+\.\s+(.*)$/.test(line)) {
          if (!inList || listType !== 'ol') {
            closeListIfOpen();
            inList = true;
            listType = 'ol';
          }
          const text = formatInline(line.replace(/^\d+\.\s+/, ''));
          listBuffer.push(text);
          continue;
        }

        closeListIfOpen();

        // Headings
        if (line.startsWith('### ')) {
          const id = generateBlockId();
          htmlBlocks.push(`<h3 class="vault-block" data-block-id="${id}" data-block-type="h3">${formatInline(line.slice(4))}</h3>`);
          continue;
        }
        if (line.startsWith('## ')) {
          const id = generateBlockId();
          htmlBlocks.push(`<h2 class="vault-block" data-block-id="${id}" data-block-type="h2">${formatInline(line.slice(3))}</h2>`);
          continue;
        }
        if (line.startsWith('# ')) {
          const id = generateBlockId();
          htmlBlocks.push(`<h1 class="vault-block" data-block-id="${id}" data-block-type="h1">${formatInline(line.slice(2))}</h1>`);
          continue;
        }

        // Empty lines
        if (line.trim() === '') {
          continue;
        }

        // Standard paragraph
        const id = generateBlockId();
        htmlBlocks.push(`<p class="vault-block" data-block-id="${id}" data-block-type="paragraph">${formatInline(line)}</p>`);
      }

      closeListIfOpen();
      closeTableIfOpen();

      if (htmlBlocks.length === 0) {
        const id = generateBlockId();
        return `<p class="vault-block" data-block-id="${id}" data-block-type="paragraph"><br></p>`;
      }

      return htmlBlocks.join('\n');
    },

    /**
     * Lossless HTML -> Markdown Serializer with Full Block Fidelity
     */
    htmlToMarkdown(htmlOrElement) {
      if (!htmlOrElement) return '';

      let temp;
      if (typeof htmlOrElement === 'string') {
        if (!htmlOrElement.trim()) return '';
        temp = document.createElement('div');
        temp.innerHTML = htmlOrElement;
      } else if (htmlOrElement instanceof Element || (htmlOrElement && htmlOrElement.childNodes)) {
        temp = htmlOrElement;
      } else {
        return '';
      }

      return serializeNode(temp).trim();

      function serializeNode(node) {
        let md = '';

        node.childNodes.forEach(child => {
          if (child.nodeType === Node.TEXT_NODE) {
            md += child.textContent;
            return;
          }

          if (child.nodeType !== Node.ELEMENT_NODE) return;

          // Ignore floating UI elements
          if (child.classList.contains('vault-block-gutter') ||
              child.classList.contains('vault-drop-indicator') ||
              child.classList.contains('vault-block-context-menu') ||
              child.classList.contains('vault-quick-insert-menu') ||
              child.classList.contains('vault-uploading-block')) {
            return;
          }

          // Video block
          if (child.classList.contains('vault-video-block')) {
            const video = child.querySelector('video');
            const captionEl = child.querySelector('.vault-video-caption');
            const caption = captionEl ? captionEl.textContent.trim() : '';
            const src = video ? video.getAttribute('src') : child.getAttribute('data-url');
            if (src) {
              md += `![video: ${caption}](${src})\n\n`;
            }
            return;
          }

          // Audio block
          if (child.classList.contains('vault-audio-block')) {
            const title = child.getAttribute('data-title') || 'Audio Track';
            const url = child.getAttribute('data-url') || '';
            if (url) {
              md += `![audio: ${title}](${url})\n\n`;
            }
            return;
          }

          // Embed block
          if (child.classList.contains('vault-embed-block')) {
            const provider = child.getAttribute('data-provider') || 'web';
            const url = child.getAttribute('data-url') || '';
            const title = child.getAttribute('data-title') || '';
            if (url) {
              if (title && title !== 'YouTube Video' && title !== 'Interactive Embed') {
                md += `[embed: ${provider}](${url} "${title.replace(/"/g, "'")}")\n\n`;
              } else {
                md += `[embed: ${provider}](${url})\n\n`;
              }
            }
            return;
          }

          // Bookmark block
          if (child.classList.contains('vault-bookmark-block')) {
            const title = child.getAttribute('data-title') || child.querySelector('.vault-bookmark-title')?.textContent || 'Bookmark';
            const url = child.getAttribute('data-url') || '';
            const desc = child.getAttribute('data-desc') || child.querySelector('.vault-bookmark-desc')?.textContent || '';
            const img = child.getAttribute('data-image') || '';
            if (url) {
              const safeDesc = (desc || '').replace(/"/g, "'");
              const safeImg = (img || '').replace(/"/g, "'");
              if (safeImg && !child.hasAttribute('data-video-id')) {
                md += `[bookmark: ${title}](${url} "${safeDesc}" "${safeImg}")\n\n`;
              } else if (safeDesc) {
                md += `[bookmark: ${title}](${url} "${safeDesc}")\n\n`;
              } else {
                md += `[bookmark: ${title}](${url})\n\n`;
              }
            }
            return;
          }

          // Image block
          if (child.classList.contains('vault-image-block')) {
            const img = child.querySelector('img');
            const captionEl = child.querySelector('.vault-image-caption');
            const caption = (captionEl ? captionEl.textContent.trim() : '') || (img ? img.alt : '');
            const src = img ? img.getAttribute('src') : '';
            if (src) {
              md += `![${caption}](${src})\n\n`;
            }
            return;
          }

          // File attachment block
          if (child.classList.contains('vault-file-block')) {
            const name = child.getAttribute('data-name') || 'attachment';
            const size = child.getAttribute('data-size') || '';
            const url = child.getAttribute('data-url') || '';
            if (url) {
              md += size ? `[attachment: ${name} (${size})](${url})\n\n` : `[attachment: ${name}](${url})\n\n`;
            }
            return;
          }

          // Inline Link Wrapper (Raw URL with convert button)
          if (child.classList.contains('vault-link-wrapper')) {
            const url = child.getAttribute('data-url') || child.querySelector('a')?.getAttribute('href') || '';
            const title = child.getAttribute('data-title') || child.querySelector('a')?.textContent || url;
            if (url) {
              if (title && title !== url) {
                md += `[${title}](${url})`;
              } else {
                md += url;
              }
            }
            return;
          }

          // Inline Link Mention
          if (child.classList.contains('vault-link-mention')) {
            const url = child.getAttribute('data-url') || '';
            const title = child.getAttribute('data-title') || child.querySelector('.vault-mention-text')?.textContent || url;
            md += `[mention: ${title}](${url})`;
            return;
          }

          // Internal Entity Mention Pill (@note, @task, @project, @research)
          if (child.classList.contains('entity-mention-pill')) {
            const type = child.getAttribute('data-entity-type') || 'note';
            const id = child.getAttribute('data-entity-id') || '';
            const title = child.getAttribute('data-title') || child.querySelector('.entity-mention-title')?.textContent || '';
            md += `[@${type}:${id}:${title}]`;
            return;
          }

          // WikiLink Pill
          if (child.classList.contains('wiki-link-pill')) {
            const title = child.getAttribute('data-title') || child.textContent.replace(/^\[\[|\]\]$/g, '');
            md += `[[${title.trim()}]]`;
            return;
          }

          // Checklist item
          if (child.classList.contains('vault-checklist-item')) {
            const cb = child.querySelector('input[type="checkbox"]');
            const isChecked = cb && cb.checked;
            const textSpan = child.querySelector('.vault-checklist-text') || child.querySelector('span');
            const text = textSpan ? serializeNode(textSpan).trim() : '';
            md += `- [${isChecked ? 'x' : ' '}] ${text}\n\n`;
            return;
          }

          // Callout card
          if (child.classList.contains('vault-callout')) {
            const type = child.getAttribute('data-callout') || 'NOTE';
            const body = child.querySelector('.vault-callout-body');
            let bodyText = body ? serializeNode(body) : '';
            bodyText = bodyText.replace(/^NOTE:\s*|^TIP:\s*|^WARNING:\s*|^IMPORTANT:\s*/i, '').trim();
            const bodyLines = bodyText.split('\n').filter(l => l.trim() !== '');
            if (bodyLines.length === 0) bodyLines.push('Important notice');
            md += `> [!${type}]\n` + bodyLines.map(l => `> ${l}`).join('\n') + '\n\n';
            return;
          }

          // Fenced Code block
          if (child.classList.contains('vault-code-block') || child.tagName.toLowerCase() === 'pre') {
            const lang = child.getAttribute('data-lang') || '';
            const codeEl = child.querySelector('code');
            const code = codeEl ? codeEl.textContent : child.textContent;
            md += `\`\`\`${lang}\n${code.replace(/\n$/, '')}\n\`\`\`\n\n`;
            return;
          }

          // Table block
          if (child.classList.contains('vault-table-block') || child.tagName.toLowerCase() === 'table' || child.classList.contains('vault-table')) {
            const rows = child.querySelectorAll('tr');
            if (rows.length > 0) {
              const tableMd = [];
              rows.forEach((r, idx) => {
                const cols = Array.from(r.querySelectorAll('th, td')).map(td => td.textContent.trim().replace(/\|/g, '\\|'));
                tableMd.push('| ' + cols.join(' | ') + ' |');
                if (idx === 0) {
                  tableMd.push('| ' + cols.map(() => '---').join(' | ') + ' |');
                }
              });
              md += tableMd.join('\n') + '\n\n';
            }
            return;
          }

          // Standard HTML Tags
          const tag = child.tagName.toLowerCase();
          switch (tag) {
            case 'h1':
              md += `# ${serializeNode(child).trim()}\n\n`;
              break;
            case 'h2':
              md += `## ${serializeNode(child).trim()}\n\n`;
              break;
            case 'h3':
              md += `### ${serializeNode(child).trim()}\n\n`;
              break;
            case 'p': {
              const pText = serializeNode(child).trim();
              if (pText) {
                md += `${pText}\n\n`;
              }
              break;
            }
            case 'blockquote': {
              const qText = serializeNode(child).trim();
              const qLines = qText.split('\n').filter(l => l.trim() !== '');
              if (qLines.length > 0) {
                md += qLines.map(l => `> ${l}`).join('\n') + '\n\n';
              }
              break;
            }
            case 'ul':
              child.querySelectorAll(':scope > li').forEach(li => {
                md += `- ${serializeNode(li).trim()}\n`;
              });
              md += '\n';
              break;
            case 'ol': {
              let num = 1;
              child.querySelectorAll(':scope > li').forEach(li => {
                md += `${num++}. ${serializeNode(li).trim()}\n`;
              });
              md += '\n';
              break;
            }
            case 'hr':
              md += '---\n\n';
              break;
            case 'div':
              if (child.classList.contains('vault-divider-block')) {
                md += '---\n\n';
              } else {
                md += serializeNode(child);
              }
              break;
            case 'strong':
            case 'b':
              md += `**${serializeNode(child)}**`;
              break;
            case 'em':
            case 'i':
              md += `*${serializeNode(child)}*`;
              break;
            case 'del':
            case 's':
              md += `~~${serializeNode(child)}~~`;
              break;
            case 'mark':
              md += `==${serializeNode(child)}==`;
              break;
            case 'code':
              md += `\`${child.textContent}\``;
              break;
            case 'a': {
              const href = child.getAttribute('href') || '#';
              md += `[${serializeNode(child)}](${href})`;
              break;
            }
            case 'br':
              md += '\n';
              break;
            default:
              md += serializeNode(child);
              break;
          }
        });

        return md;
      }
    },

    /**
     * Extracts outline headings (h1, h2, h3) only at the document block level,
     * strictly excluding quotes, callouts, tables, and code snippets.
     */
    extractHeadings(canvasEl) {
      if (!canvasEl) return [];
      const headings = [];

      const candidateEls = canvasEl.querySelectorAll('h1, h2, h3');
      let headingIndex = 0;

      candidateEls.forEach((el) => {
        if (el.closest('blockquote, .vault-callout, .vault-table, table, .vault-code-block')) {
          return;
        }

        const level = parseInt(el.tagName[1], 10);
        const text = el.textContent.trim();
        if (!text) return;

        if (!el.id) {
          el.id = 'heading-' + headingIndex + '-' + text.toLowerCase().replace(/[^a-z0-9]+/g, '-');
        }
        headingIndex++;

        headings.push({
          id: el.id,
          level,
          text,
          element: el
        });
      });

      return headings;
    },

    /**
     * Mounts the Notion-style WYSIWYG block editor on canvasEl
     */
    setupEditor(canvasEl, options = {}) {
      if (!canvasEl) return null;

      const {
        onChange,
        onSlashCommand,
        onWikiLinkClick,
        placeholder = 'Write in modern markdown... Type / for commands, or [[Note]] to link concepts.'
      } = options;

      canvasEl.setAttribute('contenteditable', 'true');
      canvasEl.setAttribute('data-placeholder', placeholder);
      canvasEl.classList.add('vault-wysiwyg-editor');

      // --------------------------------------------------------------------------
      // Centralized Multi-Block Selection State, Marquee & Bulk Action Toolbar
      // --------------------------------------------------------------------------
      const selectedBlockIds = new Set();
      let lastSelectedAnchorId = null;
      let internalBlockClipboard = null;
      let multiSelectToolbar = null;
      let currentDragBlocks = [];

      let marqueeEl = document.getElementById('vault-selection-marquee');
      if (!marqueeEl) {
        marqueeEl = document.createElement('div');
        marqueeEl.id = 'vault-selection-marquee';
        marqueeEl.className = 'vault-selection-marquee';
        document.body.appendChild(marqueeEl);
      }

      let pendingRightDrag = false;
      let activeRightDrag = false;
      let rightDragStartX = 0;
      let rightDragStartY = 0;

      function getAllDocumentBlocks() {
        return Array.from(canvasEl.children).filter(el =>
          el.classList.contains('vault-block') &&
          !el.classList.contains('vault-block-gutter') &&
          !el.classList.contains('vault-drop-indicator')
        );
      }

      function getSelectedBlocksInDocumentOrder() {
        const all = getAllDocumentBlocks();
        return all.filter(block => {
          const id = block.getAttribute('data-block-id');
          return (id && selectedBlockIds.has(id)) || block.classList.contains('vault-block--selected');
        });
      }

      function syncBlockSelectionUI() {
        ensureBlockAttributes();
        const all = getAllDocumentBlocks();
        const validIds = new Set();
        all.forEach(block => {
          const id = block.getAttribute('data-block-id');
          if (!id) return;
          if (selectedBlockIds.has(id)) {
            validIds.add(id);
            block.classList.add('vault-block--selected');
          } else {
            block.classList.remove('vault-block--selected');
          }
        });

        selectedBlockIds.clear();
        validIds.forEach(id => selectedBlockIds.add(id));

        const isMulti = selectedBlockIds.size >= 1;
        all.forEach(block => {
          const id = block.getAttribute('data-block-id');
          if (isMulti && id && selectedBlockIds.has(id)) {
            block.setAttribute('draggable', 'true');
          } else {
            block.removeAttribute('draggable');
          }
        });

        updateMultiSelectToolbar();
      }

      function clearBlockSelection() {
        selectedBlockIds.clear();
        getAllDocumentBlocks().forEach(b => {
          b.classList.remove('vault-block--selected');
          b.removeAttribute('draggable');
        });
        updateMultiSelectToolbar();
      }

      function ensureMultiSelectToolbar() {
        let tb = document.getElementById('vault-multiselect-toolbar');
        if (tb) {
          multiSelectToolbar = tb;
          return tb;
        }
        tb = document.createElement('div');
        tb.id = 'vault-multiselect-toolbar';
        tb.className = 'vault-multiselect-toolbar';
        tb.setAttribute('role', 'toolbar');
        tb.setAttribute('aria-label', 'Multi-block selection actions');
        tb.style.display = 'none';
        document.body.appendChild(tb);
        multiSelectToolbar = tb;
        return tb;
      }

      function bindMultiSelectToolbarEvents(tb) {
        tb.innerHTML = `
          <div class="vault-ms-drag-handle" draggable="true" title="Drag to move selected blocks together" aria-label="Drag selected blocks">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="8" cy="6" r="1.5" fill="currentColor"/><circle cx="16" cy="6" r="1.5" fill="currentColor"/><circle cx="8" cy="12" r="1.5" fill="currentColor"/><circle cx="16" cy="12" r="1.5" fill="currentColor"/><circle cx="8" cy="18" r="1.5" fill="currentColor"/><circle cx="16" cy="18" r="1.5" fill="currentColor"/></svg>
            <span class="vault-ms-count" id="vault-ms-count-badge">0 selected</span>
          </div>
          <span class="vault-ms-sep"></span>
          <button type="button" class="vault-ms-btn" data-bulk-action="move-up" title="Move selected blocks up (Alt+Up)" aria-label="Move selected blocks up">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polyline points="18 15 12 9 6 15"/></svg>
          </button>
          <button type="button" class="vault-ms-btn" data-bulk-action="move-down" title="Move selected blocks down (Alt+Down)" aria-label="Move selected blocks down">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polyline points="6 9 12 15 18 9"/></svg>
          </button>
          <span class="vault-ms-sep"></span>
          <button type="button" class="vault-ms-btn" data-bulk-action="duplicate" title="Duplicate selected blocks (Ctrl+D)" aria-label="Duplicate selected blocks">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
            <span class="vault-ms-btn-label">Duplicate</span>
          </button>
          <button type="button" class="vault-ms-btn" data-bulk-action="copy" title="Copy selected blocks (Ctrl+C)" aria-label="Copy selected blocks">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
            <span class="vault-ms-btn-label">Copy</span>
          </button>
          <button type="button" class="vault-ms-btn" data-bulk-action="cut" title="Cut selected blocks (Ctrl+X)" aria-label="Cut selected blocks">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/><line x1="8.12" y1="8.12" x2="12" y2="12"/></svg>
            <span class="vault-ms-btn-label">Cut</span>
          </button>
          <span class="vault-ms-sep"></span>
          <button type="button" class="vault-ms-btn vault-ms-btn--danger" data-bulk-action="delete" title="Delete selected blocks (Delete)" aria-label="Delete selected blocks">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            <span class="vault-ms-btn-label">Delete</span>
          </button>
          <button type="button" class="vault-ms-btn" data-bulk-action="deselect" title="Clear selection (Esc)" aria-label="Deselect all blocks">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        `;

        tb.querySelectorAll('[data-bulk-action]').forEach(btn => {
          btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const act = btn.getAttribute('data-bulk-action');
            if (act === 'move-up') moveSelectedBlocksUp();
            else if (act === 'move-down') moveSelectedBlocksDown();
            else if (act === 'duplicate') duplicateSelectedBlocks();
            else if (act === 'copy') {
              copySelectedBlocks();
              const label = btn.querySelector('.vault-ms-btn-label');
              if (label) {
                const orig = label.textContent;
                label.textContent = 'Copied';
                setTimeout(() => { label.textContent = orig; }, 1200);
              }
            }
            else if (act === 'cut') cutSelectedBlocks();
            else if (act === 'delete') deleteSelectedBlocks();
            else if (act === 'deselect') clearBlockSelection();
          });
        });

        const msDragHandle = tb.querySelector('.vault-ms-drag-handle');
        if (msDragHandle) {
          msDragHandle.addEventListener('dragstart', (e) => {
            const selected = getSelectedBlocksInDocumentOrder();
            if (selected.length === 0) return;
            isDraggingBlock = true;
            currentDragBlocks = selected;
            currentDragBlock = selected[0];
            currentDragBlocks.forEach(b => b.classList.add('is-block-dragging'));
            e.dataTransfer.setData('text/plain', selected.map(b => b.getAttribute('data-block-id')).join(','));
            e.dataTransfer.effectAllowed = 'move';
            closeQuickInsertMenu();
            closeBlockContextMenu();
          });

          msDragHandle.addEventListener('dragend', () => {
            isDraggingBlock = false;
            currentDragBlocks.forEach(b => b.classList.remove('is-block-dragging'));
            currentDragBlocks = [];
            currentDragBlock = null;
            hideDropIndicator();
          });
        }
      }

      function updateMultiSelectToolbar() {
        const tb = ensureMultiSelectToolbar();
        if (!tb.dataset.boundCanvas || tb.dataset.boundCanvas !== 'true') {
          bindMultiSelectToolbarEvents(tb);
          tb.dataset.boundCanvas = 'true';
        }

        const selected = getSelectedBlocksInDocumentOrder();
        if (selected.length < 2) {
          tb.style.display = 'none';
          return;
        }

        const badge = tb.querySelector('#vault-ms-count-badge');
        if (badge) {
          badge.textContent = `${selected.length} selected`;
        }

        tb.style.display = 'flex';
        const firstRect = selected[0].getBoundingClientRect();
        const lastRect = selected[selected.length - 1].getBoundingClientRect();
        const canvasRect = canvasEl.getBoundingClientRect();
        const tbWidth = tb.offsetWidth || 380;
        const tbHeight = tb.offsetHeight || 38;
        const margin = 12;

        // Default position: above first selected block
        let top = firstRect.top - tbHeight - 10;
        if (top < Math.max(margin, canvasRect.top - 42)) {
          // If not enough room above first block, place below last selected block or near top-right of canvas
          if (lastRect.bottom + tbHeight + 10 <= window.innerHeight - margin) {
            top = lastRect.bottom + 10;
          } else {
            top = Math.max(margin, canvasRect.top + 8);
          }
        }
        top = Math.max(margin, Math.min(window.innerHeight - tbHeight - margin, top));

        let left = firstRect.left;
        if (left + tbWidth + margin > window.innerWidth) {
          left = window.innerWidth - tbWidth - margin;
        }
        left = Math.max(margin, left);

        tb.style.top = `${Math.round(top)}px`;
        tb.style.left = `${Math.round(left)}px`;
      }

      // --------------------------------------------------------------------------
      // Bulk Block Operations (Move, Duplicate, Copy, Cut, Paste, Delete)
      // --------------------------------------------------------------------------
      function moveSelectedBlocksTo(targetBlock, isBefore = false) {
        const blocksToMove = (currentDragBlocks && currentDragBlocks.length > 0)
          ? currentDragBlocks
          : getSelectedBlocksInDocumentOrder();
        if (!targetBlock || targetBlock.parentNode !== canvasEl || blocksToMove.length === 0) return false;
        if (blocksToMove.includes(targetBlock)) return false;

        pushHistorySnapshot();
        const frag = document.createDocumentFragment();
        const movedIds = [];
        blocksToMove.forEach(b => {
          const id = b.getAttribute('data-block-id');
          if (id) movedIds.push(id);
          b.classList.remove('is-block-dragging');
          frag.appendChild(b);
        });

        if (isBefore) {
          canvasEl.insertBefore(frag, targetBlock);
        } else {
          canvasEl.insertBefore(frag, targetBlock.nextSibling);
        }

        selectedBlockIds.clear();
        movedIds.forEach(id => selectedBlockIds.add(id));
        ensureBlockAttributes();
        pushHistorySnapshot();
        syncBlockSelectionUI();
        if (onChange) onChange();
        return true;
      }

      function moveSelectedBlocksUp() {
        const selected = getSelectedBlocksInDocumentOrder();
        if (selected.length === 0) return false;

        const all = getAllDocumentBlocks();
        const firstIdx = all.indexOf(selected[0]);
        if (firstIdx <= 0) {
          // Check if blocks are non-contiguous; if so, compact them at the top
          const isContiguous = selected.every((b, idx) => all.indexOf(b) === firstIdx + idx);
          if (isContiguous) return false;
          pushHistorySnapshot();
          const frag = document.createDocumentFragment();
          selected.forEach(b => frag.appendChild(b));
          canvasEl.insertBefore(frag, all[0]);
          ensureBlockAttributes();
          pushHistorySnapshot();
          syncBlockSelectionUI();
          if (onChange) onChange();
          return true;
        }

        const prevBlock = all[firstIdx - 1];
        pushHistorySnapshot();
        const frag = document.createDocumentFragment();
        selected.forEach(b => frag.appendChild(b));
        canvasEl.insertBefore(frag, prevBlock);
        ensureBlockAttributes();
        pushHistorySnapshot();
        syncBlockSelectionUI();
        if (onChange) onChange();
        return true;
      }

      function moveSelectedBlocksDown() {
        const selected = getSelectedBlocksInDocumentOrder();
        if (selected.length === 0) return false;

        const all = getAllDocumentBlocks();
        const lastSel = selected[selected.length - 1];
        const lastIdx = all.indexOf(lastSel);
        if (lastIdx === -1 || lastIdx >= all.length - 1) {
          const firstIdx = all.indexOf(selected[0]);
          const isContiguous = selected.every((b, idx) => all.indexOf(b) === firstIdx + idx);
          if (isContiguous) return false;
          pushHistorySnapshot();
          const frag = document.createDocumentFragment();
          selected.forEach(b => frag.appendChild(b));
          canvasEl.appendChild(frag);
          ensureBlockAttributes();
          pushHistorySnapshot();
          syncBlockSelectionUI();
          if (onChange) onChange();
          return true;
        }

        const nextBlock = all[lastIdx + 1];
        pushHistorySnapshot();
        const frag = document.createDocumentFragment();
        selected.forEach(b => frag.appendChild(b));
        canvasEl.insertBefore(frag, nextBlock.nextSibling);
        ensureBlockAttributes();
        pushHistorySnapshot();
        syncBlockSelectionUI();
        if (onChange) onChange();
        return true;
      }

      function duplicateSelectedBlocks() {
        const selected = getSelectedBlocksInDocumentOrder();
        if (selected.length === 0) return [];

        pushHistorySnapshot();
        const lastSel = selected[selected.length - 1];
        const frag = document.createDocumentFragment();
        const newIds = [];
        const newBlocks = [];

        selected.forEach(block => {
          const clone = block.cloneNode(true);
          const newId = generateBlockId();
          clone.setAttribute('data-block-id', newId);
          clone.classList.remove('is-block-dragging');
          const srcCb = block.querySelector('input[type="checkbox"]');
          const dstCb = clone.querySelector('input[type="checkbox"]');
          if (srcCb && dstCb) {
            dstCb.checked = srcCb.checked;
          }
          newIds.push(newId);
          newBlocks.push(clone);
          frag.appendChild(clone);
        });

        canvasEl.insertBefore(frag, lastSel.nextSibling);
        selectedBlockIds.clear();
        newIds.forEach(id => selectedBlockIds.add(id));
        ensureBlockAttributes();
        pushHistorySnapshot();
        syncBlockSelectionUI();
        if (onChange) onChange();
        return newBlocks;
      }

      function deleteSelectedBlocks() {
        const selected = getSelectedBlocksInDocumentOrder();
        if (selected.length === 0) return 0;

        pushHistorySnapshot();
        const deletedCount = selected.length;
        selected.forEach(block => block.remove());
        selectedBlockIds.clear();

        if (getAllDocumentBlocks().length === 0) {
          const p = document.createElement('p');
          p.className = 'vault-block';
          p.setAttribute('data-block-id', generateBlockId());
          p.setAttribute('data-block-type', 'paragraph');
          p.innerHTML = '<br>';
          canvasEl.appendChild(p);
          focusBlock(p);
        }

        ensureBlockAttributes();
        pushHistorySnapshot();
        syncBlockSelectionUI();
        scheduleGutterHide();
        if (onChange) onChange();
        return deletedCount;
      }

      function copySelectedBlocks(clipboardEvent = null) {
        const selected = getSelectedBlocksInDocumentOrder();
        if (selected.length === 0) return null;

        const tempDiv = document.createElement('div');
        selected.forEach(block => {
          const clone = block.cloneNode(true);
          clone.classList.remove('vault-block--selected', 'is-block-dragging');
          clone.removeAttribute('draggable');
          const srcCb = block.querySelector('input[type="checkbox"]');
          const dstCb = clone.querySelector('input[type="checkbox"]');
          if (srcCb && dstCb) {
            dstCb.checked = srcCb.checked;
          }
          tempDiv.appendChild(clone);
        });

        const html = tempDiv.innerHTML;
        const markdown = VaultEditor.htmlToMarkdown(html);
        internalBlockClipboard = {
          html,
          markdown,
          count: selected.length,
          timestamp: Date.now()
        };

        if (clipboardEvent && clipboardEvent.clipboardData) {
          clipboardEvent.preventDefault();
          clipboardEvent.clipboardData.setData('text/plain', markdown);
          clipboardEvent.clipboardData.setData('text/html', `<div data-vault-blocks="true">${html}</div>`);
        } else if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
          navigator.clipboard.writeText(markdown).catch(() => {});
        }

        return internalBlockClipboard;
      }

      function cutSelectedBlocks(clipboardEvent = null) {
        const copied = copySelectedBlocks(clipboardEvent);
        if (!copied) return null;
        deleteSelectedBlocks();
        return copied;
      }

      function pasteCopiedBlocks(refBlock = null) {
        if (!internalBlockClipboard || !internalBlockClipboard.html) return [];

        pushHistorySnapshot();
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = internalBlockClipboard.html;
        const nodes = Array.from(tempDiv.children);
        if (nodes.length === 0) return [];

        const frag = document.createDocumentFragment();
        const newIds = [];
        const insertedBlocks = [];

        nodes.forEach(node => {
          const newId = generateBlockId();
          node.classList.add('vault-block');
          node.classList.remove('vault-block--selected', 'is-block-dragging');
          node.setAttribute('data-block-id', newId);
          newIds.push(newId);
          insertedBlocks.push(node);
          frag.appendChild(node);
        });

        const curSelected = getSelectedBlocksInDocumentOrder();
        const anchor = refBlock || (curSelected.length > 0 ? curSelected[curSelected.length - 1] : findCurrentBlock());

        if (anchor && anchor.parentNode === canvasEl) {
          const isTargetEmptyParagraph = anchor.tagName.toLowerCase() === 'p' &&
            (!anchor.textContent.trim() || anchor.innerHTML === '<br>') &&
            anchor.querySelectorAll('img, video, audio, table, hr').length === 0 &&
            curSelected.length === 0;
          if (isTargetEmptyParagraph) {
            canvasEl.replaceChild(frag, anchor);
          } else {
            canvasEl.insertBefore(frag, anchor.nextSibling);
          }
        } else {
          canvasEl.appendChild(frag);
        }

        selectedBlockIds.clear();
        newIds.forEach(id => selectedBlockIds.add(id));
        ensureBlockAttributes();
        pushHistorySnapshot();
        syncBlockSelectionUI();
        if (onChange) onChange();
        return insertedBlocks;
      }

      // Suppress native browser context menu locally on editor canvas
      const onCanvasContextMenu = (e) => {
        if (e.target.closest('input, textarea')) return;
        e.preventDefault();
        e.stopPropagation();
      };
      canvasEl.addEventListener('contextmenu', onCanvasContextMenu);

      // Start right-drag or handle Shift/Ctrl/Left click selection on pointerdown
      const onCanvasPointerDown = (e) => {
        // Right mouse button (button 2): initiate selection box
        if (e.button === 2) {
          if (e.target.closest('input, textarea, button.vault-gutter-btn, button.vault-link-convert-trigger')) {
            return;
          }
          pendingRightDrag = true;
          activeRightDrag = false;
          rightDragStartX = e.clientX;
          rightDragStartY = e.clientY;
          return;
        }

        // Left mouse button (button 0)
        if (e.button === 0) {
          if (e.target.closest('#vault-multiselect-toolbar, #vault-block-context-menu, .vault-block-gutter')) {
            return;
          }

          const clickedBlock = e.target.closest('.vault-wysiwyg-canvas > .vault-block, .vault-block');
          if (clickedBlock && clickedBlock.parentNode === canvasEl) {
            ensureBlockAttributes();
            const clickedId = clickedBlock.getAttribute('data-block-id');

            // Ctrl/Cmd + Click: toggle single block in multi-selection
            if (e.ctrlKey || e.metaKey) {
              e.preventDefault();
              if (selectedBlockIds.has(clickedId)) {
                selectedBlockIds.delete(clickedId);
              } else {
                selectedBlockIds.add(clickedId);
                lastSelectedAnchorId = clickedId;
              }
              syncBlockSelectionUI();
              return;
            }

            // Shift + Click: range-select blocks between anchor and clickedBlock
            if (e.shiftKey && (lastSelectedAnchorId || selectedBlockIds.size > 0)) {
              e.preventDefault();
              const all = getAllDocumentBlocks();
              const anchorBlock = all.find(b => b.getAttribute('data-block-id') === lastSelectedAnchorId) ||
                                  getSelectedBlocksInDocumentOrder()[0] ||
                                  findCurrentBlock();
              if (anchorBlock) {
                const idxA = all.indexOf(anchorBlock);
                const idxB = all.indexOf(clickedBlock);
                if (idxA !== -1 && idxB !== -1) {
                  const start = Math.min(idxA, idxB);
                  const end = Math.max(idxA, idxB);
                  for (let i = start; i <= end; i++) {
                    const bid = all[i].getAttribute('data-block-id');
                    if (bid) selectedBlockIds.add(bid);
                  }
                  const sel = window.getSelection();
                  if (sel) sel.removeAllRanges();
                  syncBlockSelectionUI();
                  return;
                }
              }
            }

            // Remember anchor for future Shift+Click, and clear multi-selection if clicking unselected block
            lastSelectedAnchorId = clickedId;
            if (!selectedBlockIds.has(clickedId)) {
              clearBlockSelection();
            }
          } else if (!e.shiftKey) {
            clearBlockSelection();
          }
        }
      };
      canvasEl.addEventListener('pointerdown', onCanvasPointerDown);

      // Document-level left-click to clear block selection when clicking outside canvas and toolbars
      const onDocPointerDown = (e) => {
        if (e.button === 0 && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
          if (e.target.closest('#vault-multiselect-toolbar, #vault-block-context-menu, .vault-block-gutter, #vault-undo-btn, #vault-redo-btn')) {
            return;
          }
          if (!e.target.closest('.vault-block--selected')) {
            clearBlockSelection();
          }
        }
      };
      document.addEventListener('pointerdown', onDocPointerDown);

      const onGlobalPointerMove = (e) => {
        if (pendingRightDrag && (e.buttons & 2)) {
          const dist = Math.hypot(e.clientX - rightDragStartX, e.clientY - rightDragStartY);
          if (dist >= 5) {
            activeRightDrag = true;
            pendingRightDrag = false;

            const sel = window.getSelection();
            if (sel) sel.removeAllRanges();

            document.body.classList.add('vault-marquee-active');
            marqueeEl.style.display = 'block';
            marqueeEl.style.left = `${rightDragStartX}px`;
            marqueeEl.style.top = `${rightDragStartY}px`;
            marqueeEl.style.width = '0px';
            marqueeEl.style.height = '0px';

            if (!e.shiftKey) {
              clearBlockSelection();
            }
          }
        }

        if (activeRightDrag) {
          const curX = e.clientX;
          const curY = e.clientY;
          const left = Math.min(curX, rightDragStartX);
          const top = Math.min(curY, rightDragStartY);
          const width = Math.abs(curX - rightDragStartX);
          const height = Math.abs(curY - rightDragStartY);

          marqueeEl.style.left = `${left}px`;
          marqueeEl.style.top = `${top}px`;
          marqueeEl.style.width = `${width}px`;
          marqueeEl.style.height = `${height}px`;

          const marqueeRect = {
            left,
            top,
            right: left + width,
            bottom: top + height
          };

          ensureBlockAttributes();
          const blocks = getAllDocumentBlocks();
          blocks.forEach(block => {
            const bRect = block.getBoundingClientRect();
            const id = block.getAttribute('data-block-id');
            const intersects = !(
              bRect.right < marqueeRect.left ||
              bRect.left > marqueeRect.right ||
              bRect.bottom < marqueeRect.top ||
              bRect.top > marqueeRect.bottom
            );
            if (intersects) {
              if (id) selectedBlockIds.add(id);
              block.classList.add('vault-block--selected');
              lastSelectedAnchorId = id;
            } else if (!e.shiftKey) {
              if (id) selectedBlockIds.delete(id);
              block.classList.remove('vault-block--selected');
            }
          });
          updateMultiSelectToolbar();
        }
      };

      const onGlobalPointerUp = (e) => {
        if (e.button === 2) {
          if (activeRightDrag) {
            activeRightDrag = false;
            pendingRightDrag = false;
            marqueeEl.style.display = 'none';
            document.body.classList.remove('vault-marquee-active');
            syncBlockSelectionUI();
          } else if (pendingRightDrag) {
            pendingRightDrag = false;
          }
        }
      };

      const onGlobalKeyDown = (e) => {
        if (!document.body.contains(canvasEl)) return;
        const activeTag = document.activeElement ? document.activeElement.tagName.toLowerCase() : '';
        if (activeTag === 'input' || activeTag === 'textarea') return;

        if (e.key === 'Escape') {
          clearBlockSelection();
          if (activeRightDrag) {
            activeRightDrag = false;
            pendingRightDrag = false;
            marqueeEl.style.display = 'none';
            document.body.classList.remove('vault-marquee-active');
          }
          return;
        }

        // Multi-block keyboard shortcuts when blocks are selected
        if (selectedBlockIds.size >= 1) {
          if (e.key === 'Delete' || e.key === 'Backspace') {
            e.preventDefault();
            deleteSelectedBlocks();
            return;
          }
          if (e.altKey && e.key === 'ArrowUp') {
            e.preventDefault();
            moveSelectedBlocksUp();
            return;
          }
          if (e.altKey && e.key === 'ArrowDown') {
            e.preventDefault();
            moveSelectedBlocksDown();
            return;
          }
          if ((e.ctrlKey || e.metaKey) && !e.altKey) {
            const k = e.key.toLowerCase();
            if (k === 'd') {
              e.preventDefault();
              duplicateSelectedBlocks();
              return;
            }
            if (k === 'c') {
              e.preventDefault();
              copySelectedBlocks();
              return;
            }
            if (k === 'x') {
              e.preventDefault();
              cutSelectedBlocks();
              return;
            }
          }
        }

        // Global Ctrl+V when internalBlockClipboard exists and blocks are selected or canvas is active
        if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'v') {
          if (internalBlockClipboard && internalBlockClipboard.html && selectedBlockIds.size >= 1) {
            e.preventDefault();
            pasteCopiedBlocks();
            return;
          }
        }

        // Global Undo/Redo when on the Vault editor page (even if focus left canvas after marquee/toolbar click)
        if ((e.ctrlKey || e.metaKey) && !e.altKey) {
          const k = e.key.toLowerCase();
          if (k === 'z') {
            e.preventDefault();
            if (e.shiftKey) redo();
            else undo();
            return;
          }
          if (k === 'y') {
            e.preventDefault();
            redo();
            return;
          }
        }
      };

      window.addEventListener('pointermove', onGlobalPointerMove);
      window.addEventListener('pointerup', onGlobalPointerUp);
      window.addEventListener('keydown', onGlobalKeyDown);
      window.addEventListener('resize', updateMultiSelectToolbar);
      document.addEventListener('scroll', updateMultiSelectToolbar, { capture: true, passive: true });

      // Slash command palette instance
      let slashPalette = null;
      let isSlashOpen = false;
      let slashQuery = '';
      let slashRange = null;

      // Selection preservation
      let lastSavedRange = null;

      // True Notion-Style Gutter Widgets
      let blockGutter = null;
      let quickInsertMenu = null;
      let contextMenu = null;
      let dropIndicator = null;
      let activeHoveredBlock = null;
      let currentDragBlock = null;
      let isDraggingBlock = false;
      let gutterHideTimer = null;

      // Undo / Redo History Stack (Isolated per note, caret-preserving)
      const undoStack = [];
      const redoStack = [];
      const MAX_HISTORY = 50;
      let typingDebounceTimer = null;
      let isPerformingHistoryAction = false;

      function saveCursorPosition() {
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0 || !canvasEl.contains(sel.getRangeAt(0).startContainer)) {
          return null;
        }
        try {
          const range = sel.getRangeAt(0);
          const preRange = range.cloneRange();
          preRange.selectNodeContents(canvasEl);
          preRange.setEnd(range.startContainer, range.startOffset);
          const start = preRange.toString().length;
          return {
            start,
            end: start + range.toString().length
          };
        } catch (e) {
          return null;
        }
      }

      function restoreCursorPosition(saved) {
        if (!saved) return;
        try {
          const charIndex = saved.start;
          let current = 0;
          let foundNode = null;
          let foundOffset = 0;

          function traverse(node) {
            if (foundNode) return;
            if (node.nodeType === Node.TEXT_NODE) {
              const len = node.nodeValue.length;
              if (current + len >= charIndex) {
                foundNode = node;
                foundOffset = charIndex - current;
                return;
              }
              current += len;
            } else {
              for (let i = 0; i < node.childNodes.length; i++) {
                traverse(node.childNodes[i]);
                if (foundNode) return;
              }
            }
          }

          traverse(canvasEl);
          if (foundNode) {
            const range = document.createRange();
            range.setStart(foundNode, Math.min(foundOffset, foundNode.length));
            range.collapse(true);
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
          }
        } catch (e) {
          // Graceful fallback
        }
      }

      function getCleanCanvasSnapshotHtml() {
        const clone = canvasEl.cloneNode(true);
        clone.querySelectorAll('.vault-block--selected, .is-block-dragging').forEach(el => {
          el.classList.remove('vault-block--selected', 'is-block-dragging');
          el.removeAttribute('draggable');
        });
        return clone.innerHTML;
      }

      function pushHistorySnapshot(cursor = null) {
        if (isPerformingHistoryAction) return;
        const html = getCleanCanvasSnapshotHtml();
        const cur = cursor !== null ? cursor : saveCursorPosition();
        if (undoStack.length > 0 && undoStack[undoStack.length - 1].html === html) {
          return;
        }
        undoStack.push({ html, cursor: cur });
        if (undoStack.length > MAX_HISTORY) {
          undoStack.shift();
        }
        redoStack.length = 0;
        notifyHistoryChanged();
      }

      function undo() {
        if (undoStack.length <= 1) return;
        isPerformingHistoryAction = true;
        try {
          const current = undoStack.pop();
          redoStack.push(current);
          const prev = undoStack[undoStack.length - 1];
          canvasEl.innerHTML = prev.html;
          ensureBlockAttributes();
          clearBlockSelection();
          restoreCursorPosition(prev.cursor);
          notifyHistoryChanged();
          if (onChange) onChange();
        } finally {
          isPerformingHistoryAction = false;
        }
      }

      function redo() {
        if (redoStack.length === 0) return;
        isPerformingHistoryAction = true;
        try {
          const next = redoStack.pop();
          undoStack.push(next);
          canvasEl.innerHTML = next.html;
          ensureBlockAttributes();
          clearBlockSelection();
          restoreCursorPosition(next.cursor);
          notifyHistoryChanged();
          if (onChange) onChange();
        } finally {
          isPerformingHistoryAction = false;
        }
      }

      function canUndo() {
        return undoStack.length > 1;
      }

      function canRedo() {
        return redoStack.length > 0;
      }

      function notifyHistoryChanged() {
        const canU = canUndo();
        const canR = canRedo();
        if (options.onHistoryChange) {
          options.onHistoryChange({ canUndo: canU, canRedo: canR });
        }
        const undoBtn = document.getElementById('vault-undo-btn');
        const redoBtn = document.getElementById('vault-redo-btn');
        if (undoBtn) undoBtn.disabled = !canU;
        if (redoBtn) redoBtn.disabled = !canR;
      }

      function clearHistory() {
        undoStack.length = 0;
        redoStack.length = 0;
        pushHistorySnapshot();
      }

      // Container positioning
      const container = canvasEl.parentElement;
      if (container) {
        container.style.position = 'relative';
      }

      // Initialize Gutter UI
      initBlockGutterUI();

      // Ensure initial block exists
      ensureBlockAttributes();
      if (!canvasEl.innerHTML.trim() || canvasEl.innerHTML === '<br>') {
        const id = generateBlockId();
        canvasEl.innerHTML = `<p class="vault-block" data-block-id="${id}" data-block-type="paragraph"><br></p>`;
      }
      clearHistory();

      function ensureBlockAttributes() {
        Array.from(canvasEl.children).forEach(child => {
          if (!child.classList.contains('vault-block') &&
              !child.classList.contains('vault-block-gutter') &&
              !child.classList.contains('vault-drop-indicator')) {
            child.classList.add('vault-block');
          }
          if (!child.getAttribute('data-block-id') && child.classList.contains('vault-block')) {
            child.setAttribute('data-block-id', generateBlockId());
          }
          if (!child.getAttribute('data-block-type') && child.classList.contains('vault-block')) {
            const tag = child.tagName.toLowerCase();
            let bType = 'paragraph';
            if (tag === 'h1' || tag === 'h2' || tag === 'h3') bType = tag;
            else if (tag === 'ul') bType = 'bullet-list';
            else if (tag === 'ol') bType = 'numbered-list';
            else if (tag === 'blockquote') bType = 'quote';
            else if (tag === 'pre') bType = 'code';
            child.setAttribute('data-block-type', bType);
          }
        });
      }

      function saveActiveSelection() {
        const sel = window.getSelection();
        if (sel && sel.rangeCount > 0) {
          const range = sel.getRangeAt(0);
          if (canvasEl.contains(range.startContainer)) {
            lastSavedRange = range.cloneRange();
          }
        }
      }

      document.addEventListener('selectionchange', saveActiveSelection);
      canvasEl.addEventListener('keyup', saveActiveSelection);
      canvasEl.addEventListener('mouseup', saveActiveSelection);

      // --------------------------------------------------------------------------
      // Natural Notion-Style Block Gutter Setup
      // --------------------------------------------------------------------------
      function initBlockGutterUI() {
        if (!container) return;

        // Gutter container holding separate [+] and [:::] buttons
        blockGutter = document.createElement('div');
        blockGutter.className = 'vault-block-gutter';
        blockGutter.setAttribute('contenteditable', 'false');
        blockGutter.innerHTML = `
          <button class="vault-gutter-btn vault-gutter-plus vault-gutter-plus-btn" type="button" title="Click to add a block below">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
          </button>
          <div class="vault-gutter-btn vault-gutter-drag vault-gutter-drag-btn" draggable="true" title="Drag to move, click for block options">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="8" cy="6" r="1.5" fill="currentColor"/><circle cx="16" cy="6" r="1.5" fill="currentColor"/><circle cx="8" cy="12" r="1.5" fill="currentColor"/><circle cx="16" cy="12" r="1.5" fill="currentColor"/><circle cx="8" cy="18" r="1.5" fill="currentColor"/><circle cx="16" cy="18" r="1.5" fill="currentColor"/></svg>
          </div>
        `;
        container.appendChild(blockGutter);

        // Understated Drop Target Indicator Line
        dropIndicator = document.createElement('div');
        dropIndicator.id = 'vault-block-drop-line';
        dropIndicator.className = 'vault-drop-indicator vault-block-drop-line';
        dropIndicator.setAttribute('contenteditable', 'false');
        dropIndicator.innerHTML = '<span class="vault-drop-bead"></span>';
        container.appendChild(dropIndicator);

        const plusBtn = blockGutter.querySelector('.vault-gutter-plus');
        const dragHandle = blockGutter.querySelector('.vault-gutter-drag');

        // Prevent dragging the gutter from starting text selection
        blockGutter.addEventListener('mousedown', (e) => {
          if (!e.target.closest('.vault-gutter-drag')) {
            e.preventDefault();
          }
        });

        // Plus button: opens quick insert popover menu
        plusBtn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          const target = activeHoveredBlock || canvasEl.querySelector('.vault-block');
          if (target) {
            openQuickInsertMenu(target, plusBtn);
          }
        });

        // Six-dot button: click opens context menu (or Shift/Ctrl-click toggles block selection)
        dragHandle.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          const target = activeHoveredBlock || canvasEl.querySelector('.vault-block');
          if (!target) return;
          const tid = target.getAttribute('data-block-id');
          if (e.ctrlKey || e.metaKey) {
            if (selectedBlockIds.has(tid)) selectedBlockIds.delete(tid);
            else {
              selectedBlockIds.add(tid);
              lastSelectedAnchorId = tid;
            }
            syncBlockSelectionUI();
            return;
          }
          if (e.shiftKey && lastSelectedAnchorId) {
            const all = getAllDocumentBlocks();
            const anchor = all.find(b => b.getAttribute('data-block-id') === lastSelectedAnchorId);
            if (anchor) {
              const idxA = all.indexOf(anchor);
              const idxB = all.indexOf(target);
              if (idxA !== -1 && idxB !== -1) {
                for (let i = Math.min(idxA, idxB); i <= Math.max(idxA, idxB); i++) {
                  selectedBlockIds.add(all[i].getAttribute('data-block-id'));
                }
                syncBlockSelectionUI();
                return;
              }
            }
          }
          openBlockContextMenu(target, dragHandle);
        });

        // Six-dot dragstart: initiates single-block or multi-block group reordering
        dragHandle.addEventListener('dragstart', (e) => {
          if (!activeHoveredBlock) return;
          isDraggingBlock = true;
          const activeId = activeHoveredBlock.getAttribute('data-block-id');
          if (activeId && selectedBlockIds.has(activeId) && selectedBlockIds.size >= 2) {
            currentDragBlocks = getSelectedBlocksInDocumentOrder();
          } else {
            currentDragBlocks = [activeHoveredBlock];
          }
          currentDragBlock = currentDragBlocks[0];
          currentDragBlocks.forEach(b => b.classList.add('is-block-dragging'));
          e.dataTransfer.setData('text/plain', currentDragBlocks.map(b => b.getAttribute('data-block-id')).join(','));
          e.dataTransfer.effectAllowed = 'move';
          closeQuickInsertMenu();
          closeBlockContextMenu();
        });

        dragHandle.addEventListener('dragend', () => {
          isDraggingBlock = false;
          currentDragBlocks.forEach(b => b.classList.remove('is-block-dragging'));
          currentDragBlocks = [];
          currentDragBlock = null;
          hideDropIndicator();
        });

        // Keep gutter visible while pointer is over it
        blockGutter.addEventListener('mouseenter', () => {
          if (gutterHideTimer) clearTimeout(gutterHideTimer);
        });

        blockGutter.addEventListener('mouseleave', () => {
          scheduleGutterHide();
        });
      }

      function updateBlockGutterPosition(targetBlock) {
        if (!blockGutter || !targetBlock || !container) return;
        if (gutterHideTimer) clearTimeout(gutterHideTimer);

        // Do not jump if already pinned to this active block
        if (activeHoveredBlock === targetBlock && blockGutter.style.display === 'flex') {
          return;
        }

        activeHoveredBlock = targetBlock;

        const cRect = container.getBoundingClientRect();
        const bRect = targetBlock.getBoundingClientRect();

        // Calculate vertical position aligned with first line of content
        const computed = window.getComputedStyle(targetBlock);
        const paddingTop = parseFloat(computed.paddingTop) || 0;
        const lineHeight = parseFloat(computed.lineHeight) || (parseFloat(computed.fontSize) * 1.5) || 24;

        // Position in the left gutter outside block content
        const top = (bRect.top - cRect.top + container.scrollTop + paddingTop + (lineHeight / 2)) - 11;
        const left = (bRect.left - cRect.left + container.scrollLeft) - 52;

        blockGutter.style.top = `${Math.max(2, top)}px`;
        blockGutter.style.left = `${Math.max(4, left)}px`;
        blockGutter.style.display = 'flex';
      }

      function scheduleGutterHide() {
        if (gutterHideTimer) clearTimeout(gutterHideTimer);
        gutterHideTimer = setTimeout(() => {
          if (blockGutter && !contextMenu && !quickInsertMenu) {
            blockGutter.style.display = 'none';
          }
        }, 250);
      }

      function showDropIndicator(targetBlock, isBefore) {
        if (!dropIndicator || !targetBlock || !container) return;
        const cRect = container.getBoundingClientRect();
        const bRect = targetBlock.getBoundingClientRect();

        const y = isBefore ? (bRect.top - cRect.top + container.scrollTop) : (bRect.bottom - cRect.top + container.scrollTop);
        const left = bRect.left - cRect.left + container.scrollLeft;
        const width = bRect.width;

        dropIndicator.style.top = `${y - 1}px`;
        dropIndicator.style.left = `${left}px`;
        dropIndicator.style.width = `${width}px`;
        dropIndicator.style.display = 'block';
      }

      function hideDropIndicator() {
        if (dropIndicator) {
          dropIndicator.style.display = 'none';
        }
      }

      // Track pointer over canvas blocks
      canvasEl.addEventListener('mousemove', (e) => {
        if (isDraggingBlock) return;
        const target = e.target.closest('.vault-wysiwyg-canvas > .vault-block, .vault-wysiwyg-canvas > *');
        if (target && target !== blockGutter && !blockGutter.contains(target) && target.parentNode === canvasEl) {
          updateBlockGutterPosition(target);
        }
      });

      canvasEl.addEventListener('mouseleave', () => {
        scheduleGutterHide();
      });

      canvasEl.addEventListener('focusin', (e) => {
        const target = e.target.closest('.vault-wysiwyg-canvas > .vault-block, .vault-wysiwyg-canvas > *');
        if (target && target.parentNode === canvasEl) {
          updateBlockGutterPosition(target);
        }
      });

      // --------------------------------------------------------------------------
      // Plus Button: Quick Insert Popover Menu
      // --------------------------------------------------------------------------
      function openQuickInsertMenu(targetBlock, anchorEl) {
        closeQuickInsertMenu();
        closeBlockContextMenu();
        if (!targetBlock || !container) return;

        quickInsertMenu = document.createElement('div');
        quickInsertMenu.id = 'vault-quick-insert-menu';
        quickInsertMenu.className = 'vault-quick-insert-menu';

        quickInsertMenu.innerHTML = `
          <div class="vault-insert-section-title">Basic Blocks</div>
          <button class="vault-insert-item is-selected" data-cmd="paragraph">
            <span class="vault-insert-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 12h16"/><path d="M4 6h16"/><path d="M4 18h12"/></svg></span>
            <span>Text Paragraph</span>
          </button>
          <button class="vault-insert-item" data-cmd="h1">
            <span class="vault-insert-icon" style="font-weight:700;font-size:11px;">H1</span>
            <span>Heading 1</span>
          </button>
          <button class="vault-insert-item" data-cmd="h2">
            <span class="vault-insert-icon" style="font-weight:700;font-size:11px;">H2</span>
            <span>Heading 2</span>
          </button>
          <button class="vault-insert-item" data-cmd="h3">
            <span class="vault-insert-icon" style="font-weight:700;font-size:11px;">H3</span>
            <span>Heading 3</span>
          </button>
          <button class="vault-insert-item" data-cmd="todo">
            <span class="vault-insert-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="18" height="18" x="3" y="3" rx="2"/><polyline points="9 11 12 14 22 4"/></svg></span>
            <span>To-do List</span>
          </button>
          <button class="vault-insert-item" data-cmd="bullet">
            <span class="vault-insert-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><circle cx="3" cy="6" r="1.5" fill="currentColor"/><circle cx="3" cy="12" r="1.5" fill="currentColor"/><circle cx="3" cy="18" r="1.5" fill="currentColor"/></svg></span>
            <span>Bulleted List</span>
          </button>
          <button class="vault-insert-item" data-cmd="numbered">
            <span class="vault-insert-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="10" y1="6" x2="21" y2="6"/><line x1="10" y1="12" x2="21" y2="12"/><line x1="10" y1="18" x2="21" y2="18"/><path d="M4 6h1v4"/><path d="M4 10h2"/></svg></span>
            <span>Numbered List</span>
          </button>
          <button class="vault-insert-item" data-cmd="quote">
            <span class="vault-insert-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z"/></svg></span>
            <span>Quote</span>
          </button>
          <button class="vault-insert-item" data-cmd="callout">
            <span class="vault-insert-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg></span>
            <span>Callout Card</span>
          </button>
          <button class="vault-insert-item" data-cmd="table">
            <span class="vault-insert-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/><path d="M3 15h18"/><path d="M9 3v18"/><path d="M15 3v18"/></svg></span>
            <span>Table</span>
          </button>
          <button class="vault-insert-item" data-cmd="code">
            <span class="vault-insert-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg></span>
            <span>Code Block</span>
          </button>
          <button class="vault-insert-item" data-cmd="divider">
            <span class="vault-insert-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="12" x2="21" y2="12"/></svg></span>
            <span>Divider</span>
          </button>

          <div class="vault-insert-section-title">Media & Links</div>
          <button class="vault-insert-item" data-cmd="image">
            <span class="vault-insert-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="18" height="18" x="3" y="3" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg></span>
            <span>Image</span>
          </button>
          <button class="vault-insert-item" data-cmd="video">
            <span class="vault-insert-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" stroke-width="2"><rect width="18" height="18" x="3" y="3" rx="2"/><polyline points="10 8 16 12 10 16 10 8"/></svg></span>
            <span>Video (MP4 / WebM)</span>
          </button>
          <button class="vault-insert-item" data-cmd="audio">
            <span class="vault-insert-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ec4899" stroke-width="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg></span>
            <span>Audio Track</span>
          </button>
          <button class="vault-insert-item" data-cmd="file">
            <span class="vault-insert-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg></span>
            <span>File Attachment (ZIP, PDF...)</span>
          </button>
          <button class="vault-insert-item" data-cmd="bookmark">
            <span class="vault-insert-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg></span>
            <span>Web Bookmark</span>
          </button>
          <button class="vault-insert-item" data-cmd="embed">
            <span class="vault-insert-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg></span>
            <span>Interactive Embed (YouTube / Maps)</span>
          </button>
        `;

        const aRect = anchorEl.getBoundingClientRect();
        const cRect = container.getBoundingClientRect();
        quickInsertMenu.style.top = `${aRect.bottom - cRect.top + container.scrollTop + 4}px`;
        quickInsertMenu.style.left = `${Math.min(aRect.left - cRect.left + container.scrollLeft, container.clientWidth - 280)}px`;
        container.appendChild(quickInsertMenu);

        const items = Array.from(quickInsertMenu.querySelectorAll('.vault-insert-item'));

        function handleSelectCmd(cmd) {
          closeQuickInsertMenu();
          executeInsertCommand(cmd, targetBlock);
        }

        items.forEach(btn => {
          btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            handleSelectCmd(btn.getAttribute('data-cmd'));
          });
        });

        function handleKey(e) {
          if (e.key === 'Escape') {
            e.preventDefault();
            closeQuickInsertMenu();
            return;
          }

          let selIdx = items.findIndex(el => el.classList.contains('is-selected'));

          if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (selIdx < items.length - 1) {
              items[selIdx].classList.remove('is-selected');
              selIdx++;
              items[selIdx].classList.add('is-selected');
              items[selIdx].scrollIntoView({ block: 'nearest' });
            }
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (selIdx > 0) {
              items[selIdx].classList.remove('is-selected');
              selIdx--;
              items[selIdx].classList.add('is-selected');
              items[selIdx].scrollIntoView({ block: 'nearest' });
            }
          } else if (e.key === 'Enter') {
            e.preventDefault();
            if (selIdx >= 0) {
              handleSelectCmd(items[selIdx].getAttribute('data-cmd'));
            }
          }
        }

        document.addEventListener('keydown', handleKey);
        quickInsertMenu._cleanup = () => document.removeEventListener('keydown', handleKey);
      }

      function closeQuickInsertMenu() {
        if (quickInsertMenu) {
          if (quickInsertMenu._cleanup) quickInsertMenu._cleanup();
          quickInsertMenu.remove();
          quickInsertMenu = null;
        }
      }

      function executeInsertCommand(cmd, refBlock) {
        if (cmd === 'image') {
          const imgInp = document.getElementById('vault-hidden-image-input');
          if (imgInp) imgInp.click();
          return;
        }
        if (cmd === 'file' || cmd === 'video' || cmd === 'audio') {
          const fileInp = document.getElementById('vault-hidden-file-input');
          if (fileInp) fileInp.click();
          return;
        }
        if (cmd === 'bookmark') {
          const url = prompt('Enter website URL for visual bookmark:');
          if (url && url.trim()) {
            insertBookmarkUrl(url.trim(), refBlock);
          }
          return;
        }
        if (cmd === 'embed') {
          const url = prompt('Enter YouTube, Vimeo, or Google Maps URL:');
          if (url && url.trim()) {
            insertEmbedUrl(url.trim(), refBlock);
          }
          return;
        }

        let newHtml = '<p><br></p>';
        switch (cmd) {
          case 'paragraph': newHtml = '<p><br></p>'; break;
          case 'h1': newHtml = '<h1>Heading 1</h1>'; break;
          case 'h2': newHtml = '<h2>Heading 2</h2>'; break;
          case 'h3': newHtml = '<h3>Heading 3</h3>'; break;
          case 'todo': newHtml = '<div class="vault-checklist-item" data-task="true"><input type="checkbox" /><span class="vault-checklist-text">To-do item</span></div>'; break;
          case 'bullet': newHtml = '<ul><li>List point</li></ul>'; break;
          case 'numbered': newHtml = '<ol><li>First step</li></ol>'; break;
          case 'quote': newHtml = '<blockquote><p>Quote...</p></blockquote>'; break;
          case 'callout': newHtml = '<div class="vault-callout" data-callout="NOTE"><span class="vault-callout-icon" contenteditable="false"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg></span><div class="vault-callout-body"><strong>NOTE:</strong> Key takeaway.</div></div>'; break;
          case 'table': newHtml = '<div class="vault-table-block"><table class="vault-table"><thead><tr><th>Header 1</th><th>Header 2</th></tr></thead><tbody><tr><td>Cell 1</td><td>Cell 2</td></tr></tbody></table></div>'; break;
          case 'code': newHtml = '<pre class="vault-code-block" data-lang="javascript"><code class="language-javascript">// Code snippet</code></pre>'; break;
          case 'divider': newHtml = '<div class="vault-divider-block"><hr class="vault-divider" /></div>'; break;
        }

        insertBlock(newHtml, refBlock);
      }

      // --------------------------------------------------------------------------
      // Six-Dot Drag Handle: Context Menu
      // --------------------------------------------------------------------------
      function openBlockContextMenu(targetBlock, anchorEl) {
        closeBlockContextMenu();
        closeQuickInsertMenu();
        if (!targetBlock || !container) return;

        contextMenu = document.createElement('div');
        contextMenu.id = 'vault-block-context-menu';
        contextMenu.className = 'vault-block-context-menu';

        const bType = targetBlock.getAttribute('data-block-type') || 'paragraph';

        contextMenu.innerHTML = `
          <div class="vault-menu-section-header">Turn into</div>
          <button class="vault-menu-item ${bType === 'paragraph' ? 'is-active' : ''}" data-action="turn-paragraph">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 12h16"/><path d="M4 6h16"/><path d="M4 18h12"/></svg>
            <span>Paragraph</span>
          </button>
          <button class="vault-menu-item ${bType === 'h1' ? 'is-active' : ''}" data-action="turn-h1">
            <span style="font-weight:700;font-size:11px;">H1</span>
            <span>Heading 1</span>
          </button>
          <button class="vault-menu-item ${bType === 'h2' ? 'is-active' : ''}" data-action="turn-h2">
            <span style="font-weight:700;font-size:11px;">H2</span>
            <span>Heading 2</span>
          </button>
          <button class="vault-menu-item ${bType === 'h3' ? 'is-active' : ''}" data-action="turn-h3">
            <span style="font-weight:700;font-size:11px;">H3</span>
            <span>Heading 3</span>
          </button>
          <button class="vault-menu-item ${bType === 'bullet-list' ? 'is-active' : ''}" data-action="turn-bullet">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><circle cx="3" cy="6" r="1.5" fill="currentColor"/><circle cx="3" cy="12" r="1.5" fill="currentColor"/><circle cx="3" cy="18" r="1.5" fill="currentColor"/></svg>
            <span>Bullet List</span>
          </button>
          <button class="vault-menu-item ${bType === 'numbered-list' ? 'is-active' : ''}" data-action="turn-numbered">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="10" y1="6" x2="21" y2="6"/><line x1="10" y1="12" x2="21" y2="12"/><line x1="10" y1="18" x2="21" y2="18"/><path d="M4 6h1v4"/><path d="M4 10h2"/></svg>
            <span>Numbered List</span>
          </button>
          <button class="vault-menu-item ${bType === 'checklist' ? 'is-active' : ''}" data-action="turn-todo">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="18" height="18" x="3" y="3" rx="2"/><polyline points="9 11 12 14 22 4"/></svg>
            <span>Checklist</span>
          </button>
          <button class="vault-menu-item ${bType === 'quote' ? 'is-active' : ''}" data-action="turn-quote">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z"/></svg>
            <span>Quote</span>
          </button>
          <button class="vault-menu-item ${bType === 'callout' ? 'is-active' : ''}" data-action="turn-callout">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
            <span>Callout Card</span>
          </button>
          <button class="vault-menu-item ${bType === 'code' ? 'is-active' : ''}" data-action="turn-code">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
            <span>Code Block</span>
          </button>
          <div class="vault-menu-divider"></div>
          <button class="vault-menu-item vault-context-item" data-action="duplicate">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
            <span>Duplicate</span>
          </button>
          <button class="vault-menu-item vault-context-item" data-action="move-up">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="18 15 12 9 6 15"/></svg>
            <span>Move Up</span>
          </button>
          <button class="vault-menu-item vault-context-item" data-action="move-down">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
            <span>Move Down</span>
          </button>
          <div class="vault-menu-divider"></div>
          <button class="vault-menu-item vault-context-item vault-menu-item-danger" data-action="delete">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            <span>Delete Block</span>
          </button>
        `;

        const aRect = anchorEl.getBoundingClientRect();
        const cRect = container.getBoundingClientRect();
        contextMenu.style.top = `${aRect.bottom - cRect.top + container.scrollTop + 4}px`;
        contextMenu.style.left = `${Math.min(aRect.left - cRect.left + container.scrollLeft, container.clientWidth - 220)}px`;
        container.appendChild(contextMenu);

        contextMenu.querySelectorAll('.vault-menu-item').forEach(item => {
          item.addEventListener('click', (e) => {
            e.stopPropagation();
            const action = item.getAttribute('data-action');
            handleBlockAction(action, targetBlock);
            closeBlockContextMenu();
          });
        });
      }

      function closeBlockContextMenu() {
        if (contextMenu) {
          contextMenu.remove();
          contextMenu = null;
        }
      }

      function handleBlockAction(action, targetBlock) {
        if (!targetBlock) return;
        const targetId = targetBlock.getAttribute('data-block-id');
        const isTargetInSelection = targetId && selectedBlockIds.has(targetId) && selectedBlockIds.size >= 2;

        if (isTargetInSelection) {
          if (action === 'duplicate') {
            duplicateSelectedBlocks();
            return;
          }
          if (action === 'move-up') {
            moveSelectedBlocksUp();
            return;
          }
          if (action === 'move-down') {
            moveSelectedBlocksDown();
            return;
          }
          if (action === 'delete') {
            deleteSelectedBlocks();
            return;
          }
        }

        const text = targetBlock.textContent.trim() || 'Block text';

        if (action.startsWith('turn-')) {
          pushHistorySnapshot();
          const type = action.replace('turn-', '');
          let newEl = null;
          const id = generateBlockId();

          switch (type) {
            case 'paragraph':
              newEl = document.createElement('p');
              newEl.className = 'vault-block';
              newEl.setAttribute('data-block-id', id);
              newEl.setAttribute('data-block-type', 'paragraph');
              newEl.innerHTML = text ? escapeHtml(text) : '<br>';
              break;
            case 'h1':
            case 'h2':
            case 'h3':
              newEl = document.createElement(type);
              newEl.className = 'vault-block';
              newEl.setAttribute('data-block-id', id);
              newEl.setAttribute('data-block-type', type);
              newEl.textContent = text;
              break;
            case 'bullet':
              newEl = document.createElement('ul');
              newEl.className = 'vault-block';
              newEl.setAttribute('data-block-id', id);
              newEl.setAttribute('data-block-type', 'bullet-list');
              newEl.innerHTML = `<li>${escapeHtml(text)}</li>`;
              break;
            case 'numbered':
              newEl = document.createElement('ol');
              newEl.className = 'vault-block';
              newEl.setAttribute('data-block-id', id);
              newEl.setAttribute('data-block-type', 'numbered-list');
              newEl.innerHTML = `<li>${escapeHtml(text)}</li>`;
              break;
            case 'todo':
              newEl = document.createElement('div');
              newEl.className = 'vault-block vault-checklist-item';
              newEl.setAttribute('data-block-id', id);
              newEl.setAttribute('data-block-type', 'checklist');
              newEl.setAttribute('data-task', 'true');
              newEl.innerHTML = `<input type="checkbox" /><span class="vault-checklist-text">${escapeHtml(text)}</span>`;
              break;
            case 'quote':
              newEl = document.createElement('blockquote');
              newEl.className = 'vault-block';
              newEl.setAttribute('data-block-id', id);
              newEl.setAttribute('data-block-type', 'quote');
              newEl.innerHTML = `<p>${escapeHtml(text)}</p>`;
              break;
            case 'callout':
              newEl = document.createElement('div');
              newEl.className = 'vault-block vault-callout';
              newEl.setAttribute('data-block-id', id);
              newEl.setAttribute('data-block-type', 'callout');
              newEl.setAttribute('data-callout', 'NOTE');
              newEl.innerHTML = `<span class="vault-callout-icon" contenteditable="false"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg></span><div class="vault-callout-body"><strong>NOTE:</strong> ${escapeHtml(text)}</div>`;
              break;
            case 'code':
              newEl = document.createElement('pre');
              newEl.className = 'vault-block vault-code-block';
              newEl.setAttribute('data-block-id', id);
              newEl.setAttribute('data-block-type', 'code');
              newEl.setAttribute('data-lang', 'javascript');
              newEl.innerHTML = `<code class="language-javascript">${escapeHtml(text)}</code>`;
              break;
          }

          if (newEl) {
            canvasEl.replaceChild(newEl, targetBlock);
            ensureBlockAttributes();
            pushHistorySnapshot();
            focusBlock(newEl);
            if (onChange) onChange();
          }
          return;
        }

        if (action === 'duplicate') {
          pushHistorySnapshot();
          const clone = targetBlock.cloneNode(true);
          clone.setAttribute('data-block-id', generateBlockId());
          canvasEl.insertBefore(clone, targetBlock.nextSibling);
          ensureBlockAttributes();
          pushHistorySnapshot();
          focusBlock(clone);
          if (onChange) onChange();
          return;
        }

        if (action === 'move-up') {
          const prev = targetBlock.previousElementSibling;
          if (prev && prev !== blockGutter && prev !== dropIndicator) {
            pushHistorySnapshot();
            canvasEl.insertBefore(targetBlock, prev);
            ensureBlockAttributes();
            pushHistorySnapshot();
            updateBlockGutterPosition(targetBlock);
            if (onChange) onChange();
          }
          return;
        }

        if (action === 'move-down') {
          const next = targetBlock.nextElementSibling;
          if (next && next !== blockGutter && next !== dropIndicator) {
            pushHistorySnapshot();
            canvasEl.insertBefore(targetBlock, next.nextSibling);
            ensureBlockAttributes();
            pushHistorySnapshot();
            updateBlockGutterPosition(targetBlock);
            if (onChange) onChange();
          }
          return;
        }

        if (action === 'delete') {
          pushHistorySnapshot();
          targetBlock.remove();
          if (getAllDocumentBlocks().length === 0) {
            const p = document.createElement('p');
            p.className = 'vault-block';
            p.setAttribute('data-block-id', generateBlockId());
            p.setAttribute('data-block-type', 'paragraph');
            p.innerHTML = '<br>';
            canvasEl.appendChild(p);
            focusBlock(p);
          }
          ensureBlockAttributes();
          pushHistorySnapshot();
          scheduleGutterHide();
          if (onChange) onChange();
          return;
        }
      }

      // Close popover menus on outside clicks
      document.addEventListener('click', (e) => {
        if (contextMenu && !contextMenu.contains(e.target) && !blockGutter.contains(e.target)) {
          closeBlockContextMenu();
        }
        if (quickInsertMenu && !quickInsertMenu.contains(e.target) && !blockGutter.contains(e.target)) {
          closeQuickInsertMenu();
        }
      });

      // --------------------------------------------------------------------------
      // Drag and Drop: Canvas Listeners (Single & Group Block Reorder + File Drops)
      // --------------------------------------------------------------------------
      canvasEl.addEventListener('dragstart', (e) => {
        const selectedBlock = e.target.closest('.vault-block--selected');
        if (selectedBlock && selectedBlock.parentNode === canvasEl && selectedBlockIds.size >= 1) {
          isDraggingBlock = true;
          currentDragBlocks = getSelectedBlocksInDocumentOrder();
          currentDragBlock = currentDragBlocks[0] || selectedBlock;
          currentDragBlocks.forEach(b => b.classList.add('is-block-dragging'));
          if (e.dataTransfer) {
            e.dataTransfer.setData('text/plain', currentDragBlocks.map(b => b.getAttribute('data-block-id')).join(','));
            e.dataTransfer.effectAllowed = 'move';
          }
          closeQuickInsertMenu();
          closeBlockContextMenu();
        }
      });

      canvasEl.addEventListener('dragend', () => {
        isDraggingBlock = false;
        currentDragBlocks.forEach(b => b.classList.remove('is-block-dragging'));
        currentDragBlocks = [];
        if (currentDragBlock) {
          currentDragBlock.classList.remove('is-block-dragging');
          currentDragBlock = null;
        }
        hideDropIndicator();
      });

      canvasEl.addEventListener('dragover', (e) => {
        e.preventDefault();
        const hasFiles = e.dataTransfer && e.dataTransfer.types && Array.from(e.dataTransfer.types).includes('Files');

        if (isDraggingBlock || hasFiles) {
          const target = document.elementFromPoint(e.clientX, e.clientY)?.closest('.vault-wysiwyg-canvas > .vault-block, .vault-wysiwyg-canvas > *');
          const dragSet = currentDragBlocks.length > 0 ? currentDragBlocks : (currentDragBlock ? [currentDragBlock] : []);
          if (target && target.parentNode === canvasEl && !dragSet.includes(target) && target.classList.contains('vault-block')) {
            const rect = target.getBoundingClientRect();
            const isBefore = e.clientY < (rect.top + rect.height / 2);
            showDropIndicator(target, isBefore);
          } else {
            hideDropIndicator();
          }
        }
      });

      canvasEl.addEventListener('dragleave', (e) => {
        if (!canvasEl.contains(e.relatedTarget)) {
          hideDropIndicator();
        }
      });

      canvasEl.addEventListener('drop', async (e) => {
        e.preventDefault();
        hideDropIndicator();

        const files = e.dataTransfer ? e.dataTransfer.files : null;

        // 1. Files dropped from OS
        if (files && files.length > 0) {
          const target = document.elementFromPoint(e.clientX, e.clientY)?.closest('.vault-wysiwyg-canvas > .vault-block, .vault-wysiwyg-canvas > *');
          for (let i = 0; i < files.length; i++) {
            await uploadAndInsertFile(files[i], target);
          }
          return;
        }

        // 2. Document Block(s) reordered (Single or Multi-Block Group)
        const blocksToMove = currentDragBlocks.length > 0 ? currentDragBlocks : (currentDragBlock ? [currentDragBlock] : []);
        if (isDraggingBlock && blocksToMove.length > 0) {
          const target = document.elementFromPoint(e.clientX, e.clientY)?.closest('.vault-wysiwyg-canvas > .vault-block, .vault-wysiwyg-canvas > *');
          if (target && target.parentNode === canvasEl && !blocksToMove.includes(target) && target.classList.contains('vault-block')) {
            const rect = target.getBoundingClientRect();
            const isBefore = e.clientY < (rect.top + rect.height / 2);

            if (blocksToMove.length > 1 || selectedBlockIds.size >= 2) {
              moveSelectedBlocksTo(target, isBefore);
            } else {
              pushHistorySnapshot();
              const singleBlock = blocksToMove[0];
              if (isBefore) {
                canvasEl.insertBefore(singleBlock, target);
              } else {
                canvasEl.insertBefore(singleBlock, target.nextSibling);
              }
              ensureBlockAttributes();
              pushHistorySnapshot();
              updateBlockGutterPosition(singleBlock);
              if (onChange) onChange();
            }
          }
          isDraggingBlock = false;
          blocksToMove.forEach(b => b.classList.remove('is-block-dragging'));
          currentDragBlocks = [];
          currentDragBlock = null;
        }
      });

      // --------------------------------------------------------------------------
      // Clipboard Copy / Cut / Paste Handlers (Multi-Block + Media + Smart Links)
      // --------------------------------------------------------------------------
      canvasEl.addEventListener('copy', (e) => {
        if (selectedBlockIds.size >= 1) {
          copySelectedBlocks(e);
        }
      });

      canvasEl.addEventListener('cut', (e) => {
        if (selectedBlockIds.size >= 1) {
          cutSelectedBlocks(e);
        }
      });

      canvasEl.addEventListener('paste', async (e) => {
        const items = e.clipboardData ? e.clipboardData.items : null;
        const text = e.clipboardData ? e.clipboardData.getData('text/plain') : '';
        const htmlData = e.clipboardData ? e.clipboardData.getData('text/html') : '';

        // 0. Check for structured multi-block paste from internal clipboard or HTML data-vault-blocks
        if (htmlData && htmlData.includes('data-vault-blocks="true"')) {
          e.preventDefault();
          const parser = new DOMParser();
          const doc = parser.parseFromString(htmlData, 'text/html');
          const wrapper = doc.querySelector('[data-vault-blocks="true"]');
          if (wrapper) {
            internalBlockClipboard = {
              html: wrapper.innerHTML,
              markdown: text || VaultEditor.htmlToMarkdown(wrapper.innerHTML),
              count: wrapper.children.length,
              timestamp: Date.now()
            };
            pasteCopiedBlocks();
            return;
          }
        }

        if (internalBlockClipboard && internalBlockClipboard.html &&
            ((selectedBlockIds.size >= 1 && !text) || (text && text.trim() === internalBlockClipboard.markdown.trim()))) {
          e.preventDefault();
          pasteCopiedBlocks();
          return;
        }

        // 1. Check for image / file in clipboard
        if (items) {
          for (let i = 0; i < items.length; i++) {
            if (items[i].type && items[i].type.startsWith('image/')) {
              e.preventDefault();
              const file = items[i].getAsFile();
              if (file) await uploadAndInsertFile(file);
              return;
            }
          }
        }

        // 2. Check for URL string to trigger Notion-style "Paste as" menu
        const trimmed = (text || '').trim();
        const urlMatch = trimmed.match(/^https?:\/\/[^\s]+$/i);
        if (urlMatch && window.SmartLinkHandler) {
          e.preventDefault();

          const sel = window.getSelection();
          const hasSelection = sel && sel.rangeCount > 0 && canvasEl.contains(sel.getRangeAt(0).startContainer);

          // 1. Ensure focus is within canvas if not already
          if (!hasSelection && document.activeElement !== canvasEl && !canvasEl.contains(document.activeElement)) {
            canvasEl.focus();
          }

          // 2. Insert the URL text into the document at the current cursor
          let inserted = false;
          try {
            inserted = document.execCommand('insertText', false, trimmed);
          } catch (err) {
            inserted = false;
          }

          let targetTextNode = null;

          // If execCommand failed or didn't add text to canvas, insert manually at cursor
          if (!inserted || !canvasEl.textContent.includes(trimmed)) {
            if (sel && sel.rangeCount > 0 && canvasEl.contains(sel.getRangeAt(0).startContainer)) {
              const r = sel.getRangeAt(0);
              r.deleteContents();
              targetTextNode = document.createTextNode(trimmed);
              r.insertNode(targetTextNode);
              const afterRange = document.createRange();
              afterRange.setStartAfter(targetTextNode);
              afterRange.setEndAfter(targetTextNode);
              sel.removeAllRanges();
              sel.addRange(afterRange);
            } else {
              const curBlock = findCurrentBlock() || canvasEl.lastElementChild;
              if (curBlock) {
                targetTextNode = document.createTextNode(trimmed);
                curBlock.appendChild(targetTextNode);
              }
            }
          }

          // 3. Capture the inserted URL range and anchor rect
          let insertedRange = null;
          let anchorRect = null;

          if (targetTextNode) {
            insertedRange = document.createRange();
            insertedRange.selectNodeContents(targetTextNode);
            anchorRect = insertedRange.getBoundingClientRect();
          } else if (sel && sel.rangeCount > 0) {
            const focusNode = sel.focusNode;
            const focusOffset = sel.focusOffset;
            if (focusNode && focusNode.nodeType === Node.TEXT_NODE) {
              const startOffset = Math.max(0, focusOffset - trimmed.length);
              insertedRange = document.createRange();
              insertedRange.setStart(focusNode, startOffset);
              insertedRange.setEnd(focusNode, focusOffset);
              const r = insertedRange.getBoundingClientRect();
              if (r && (r.width > 0 || r.height > 0 || r.top > 0 || r.left > 0)) {
                anchorRect = r;
              }
            } else {
              const r = sel.getRangeAt(0);
              insertedRange = r.cloneRange();
              const br = r.getBoundingClientRect();
              if (br && (br.width > 0 || br.height > 0 || br.top > 0 || br.left > 0)) {
                anchorRect = br;
              }
            }
          }

          // Fallback if measurement was empty (probe or block anchor)
          if (!anchorRect) {
            const currentBlock = findCurrentBlock();
            if (currentBlock) {
              const bRect = currentBlock.getBoundingClientRect();
              anchorRect = {
                top: bRect.top + 4,
                bottom: bRect.bottom,
                left: bRect.left + 24,
                right: bRect.left + 220,
                width: 196,
                height: 20
              };
            }
          }

          window.SmartLinkHandler.showPasteAsMenu({
            anchorRect,
            range: insertedRange,
            url: trimmed,
            onSelect: async (choice) => {
              await handleSmartLinkChoice(choice, trimmed, insertedRange);
            },
            onCancel: () => {
              // The URL is already placed in the document as plain text.
              // Zero duplicate text, nothing lost.
              if (onChange) onChange();
            }
          });
          return;
        }
      });

      async function handleSmartLinkChoice(choice, url, insertedRange) {
        if (!window.SmartLinkHandler) return;

        pushHistorySnapshot();

        // Restore selection to the inserted URL text range if still valid
        if (insertedRange && insertedRange.startContainer && insertedRange.startContainer.parentNode) {
          try {
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(insertedRange);
          } catch (e) {
            // Ignore if range was detached
          }
        }

        const meta = await window.SmartLinkHandler.fetchMetadata(url);

        if (choice === 'mention') {
          if (insertedRange && insertedRange.startContainer && insertedRange.startContainer.parentNode) {
            try {
              insertedRange.deleteContents();
            } catch (e) {}
          }
          const mentionHtml = window.SmartLinkHandler.renderMentionHtml(url, meta);
          document.execCommand('insertHTML', false, mentionHtml);
        } else if (choice === 'bookmark') {
          const currentBlock = findCurrentBlock();
          if (currentBlock && currentBlock.textContent.trim() === url) {
            const bookmarkHtml = window.SmartLinkHandler.renderBookmarkHtml(url, meta);
            currentBlock.outerHTML = bookmarkHtml;
            ensureBlockAttributes();
          } else {
            if (insertedRange && insertedRange.startContainer && insertedRange.startContainer.parentNode) {
              try {
                insertedRange.deleteContents();
              } catch (e) {}
            } else {
              document.execCommand('delete', false, null);
            }
            const bookmarkHtml = window.SmartLinkHandler.renderBookmarkHtml(url, meta);
            insertBlock(bookmarkHtml);
          }
        } else if (choice === 'embed') {
          const currentBlock = findCurrentBlock();
          if (currentBlock && currentBlock.textContent.trim() === url) {
            const embedHtml = window.SmartLinkHandler.renderEmbedHtml(url, meta);
            currentBlock.outerHTML = embedHtml;
            ensureBlockAttributes();
          } else {
            if (insertedRange && insertedRange.startContainer && insertedRange.startContainer.parentNode) {
              try {
                insertedRange.deleteContents();
              } catch (e) {}
            } else {
              document.execCommand('delete', false, null);
            }
            const embedHtml = window.SmartLinkHandler.renderEmbedHtml(url, meta);
            insertBlock(embedHtml);
          }
        } else if (choice === 'url') {
          if (insertedRange && insertedRange.startContainer && insertedRange.startContainer.parentNode) {
            try {
              insertedRange.deleteContents();
            } catch (e) {}
          }
          const linkHtml = window.SmartLinkHandler.renderUrlHtml(url, url);
          document.execCommand('insertHTML', false, linkHtml);
        }

        pushHistorySnapshot();
        if (onChange) onChange();
      }

      async function insertBookmarkUrl(url, refBlock = null) {
        if (!window.SmartLinkHandler) return;
        const meta = await window.SmartLinkHandler.fetchMetadata(url);
        const html = window.SmartLinkHandler.renderBookmarkHtml(url, meta);
        insertBlock(html, refBlock);
      }

      async function insertEmbedUrl(url, refBlock = null) {
        if (!window.SmartLinkHandler) return;
        const meta = await window.SmartLinkHandler.fetchMetadata(url);
        const html = window.SmartLinkHandler.renderEmbedHtml(url, meta);
        insertBlock(html, refBlock);
      }

      // --------------------------------------------------------------------------
      // Universal Upload Utilities: Images, Videos, Audios, Documents, Archives
      // --------------------------------------------------------------------------
      async function uploadAndInsertFile(file, refBlock = null) {
        const placeholderBlock = document.createElement('div');
        placeholderBlock.className = 'vault-block vault-uploading-block';
        placeholderBlock.setAttribute('data-block-id', generateBlockId());
        placeholderBlock.setAttribute('data-block-type', 'uploading');
        placeholderBlock.innerHTML = `
          <div class="vault-uploading-inner">
            <svg class="vault-spinner" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
            <span>Uploading ${escapeHtml(file.name || 'file')} (${formatBytes(file.size)})...</span>
          </div>
        `;

        insertBlockNode(placeholderBlock, refBlock);

        try {
          const fd = new FormData();
          const cleanName = file.name || `upload-${Date.now()}`;
          fd.append('file', file, cleanName);

          const res = await fetch('/api/v1/notes/upload', {
            method: 'POST',
            body: fd
          });

          const data = await res.json();
          if (!res.ok || !data.success) {
            throw new Error(data.error || 'Upload failed');
          }

          const id = generateBlockId();
          const category = data.category || 'generic';
          let newBlock = null;

          // 1. Playable Video
          if (category === 'video' && data.isPlayable) {
            newBlock = document.createElement('div');
            newBlock.className = 'vault-block vault-video-block';
            newBlock.setAttribute('data-block-id', id);
            newBlock.setAttribute('data-block-type', 'video');
            newBlock.setAttribute('data-url', data.url);
            newBlock.setAttribute('data-width', '100');
            newBlock.innerHTML = `
              <div class="vault-video-container" style="max-width: 100%;">
                <div class="vault-video-wrapper">
                  <div class="vault-resize-handle vault-resize-handle-left" data-direction="left"></div>
                  <video src="${escapeHtml(data.url)}" controls preload="metadata"></video>
                  <div class="vault-resize-handle vault-resize-handle-right" data-direction="right"></div>
                  <div class="vault-video-toolbar" contenteditable="false">
                    <button class="vault-video-btn" data-width="50" type="button">50%</button>
                    <button class="vault-video-btn" data-width="75" type="button">75%</button>
                    <button class="vault-video-btn is-active" data-width="100" type="button">100%</button>
                    <span class="vault-video-sep"></span>
                    <button class="vault-video-btn vault-video-delete" type="button" title="Delete video">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                    </button>
                  </div>
                </div>
                <div class="vault-video-caption" contenteditable="true" data-placeholder="Add video caption...">${escapeHtml(data.originalname)}</div>
              </div>
            `;
          }
          // 2. Playable Audio
          else if (category === 'audio' && data.isPlayable) {
            newBlock = document.createElement('div');
            newBlock.className = 'vault-block vault-audio-block';
            newBlock.setAttribute('data-block-id', id);
            newBlock.setAttribute('data-block-type', 'audio');
            newBlock.setAttribute('data-url', data.url);
            newBlock.setAttribute('data-title', data.originalname);
            newBlock.innerHTML = `
              <div class="vault-audio-card" contenteditable="false">
                <div class="vault-audio-icon">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
                </div>
                <div style="flex:1;min-width:0;">
                  <div style="font-size:12px;font-weight:600;margin-bottom:4px;" class="text-truncate">${escapeHtml(data.originalname)}</div>
                  <audio src="${escapeHtml(data.url)}" controls preload="metadata"></audio>
                </div>
                <button class="vault-file-btn vault-audio-delete" type="button" title="Delete audio">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                </button>
              </div>
            `;
          }
          // 3. Image
          else if (category === 'image') {
            newBlock = document.createElement('div');
            newBlock.className = 'vault-block vault-image-block';
            newBlock.setAttribute('data-block-id', id);
            newBlock.setAttribute('data-block-type', 'image');
            newBlock.setAttribute('data-width', '100');
            newBlock.innerHTML = `
              <div class="vault-image-container" style="max-width: 100%;">
                <div class="vault-image-wrapper">
                  <div class="vault-resize-handle vault-resize-handle-left" data-direction="left"></div>
                  <img src="${escapeHtml(data.url)}" alt="${escapeHtml(data.originalname || cleanName)}" loading="lazy" />
                  <div class="vault-resize-handle vault-resize-handle-right" data-direction="right"></div>
                  <div class="vault-image-toolbar" contenteditable="false">
                    <button class="vault-img-btn" data-width="25" type="button" title="Width: 25%">25%</button>
                    <button class="vault-img-btn" data-width="50" type="button" title="Width: 50%">50%</button>
                    <button class="vault-img-btn" data-width="75" type="button" title="Width: 75%">75%</button>
                    <button class="vault-img-btn is-active" data-width="100" type="button" title="Full Width: 100%">100%</button>
                    <span class="vault-img-sep"></span>
                    <button class="vault-img-btn vault-img-delete" type="button" title="Delete image">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                    </button>
                  </div>
                </div>
                <figcaption class="vault-image-caption" contenteditable="true" data-placeholder="Add a caption...">${escapeHtml(data.originalname || '')}</figcaption>
              </div>
            `;
          }
          // 4. Documents, Archives, or Generic Binaries
          else {
            const sizeFormatted = formatBytes(data.size);
            const ext = data.originalname.includes('.') ? data.originalname.split('.').pop() : '';

            newBlock = document.createElement('div');
            newBlock.className = 'vault-block vault-file-block';
            newBlock.setAttribute('data-block-id', id);
            newBlock.setAttribute('data-block-type', 'file');
            newBlock.setAttribute('data-url', data.url);
            newBlock.setAttribute('data-name', data.originalname);
            newBlock.setAttribute('data-size', sizeFormatted);
            newBlock.innerHTML = `
              <div class="vault-file-card" contenteditable="false">
                <div class="vault-file-icon">${getFileIconSvg(ext)}</div>
                <div class="vault-file-info">
                  <a href="${escapeHtml(data.url)}" download="${escapeHtml(data.originalname)}" class="vault-file-name" target="_blank">${escapeHtml(data.originalname)}</a>
                  <span class="vault-file-size">${escapeHtml(sizeFormatted)} &bull; ${escapeHtml(category.toUpperCase())}</span>
                </div>
                <div class="vault-file-actions">
                  <a href="${escapeHtml(data.url)}" download="${escapeHtml(data.originalname)}" class="vault-file-btn" title="Download">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                  </a>
                  <button class="vault-file-btn vault-file-remove" type="button" title="Remove attachment">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                  </button>
                </div>
              </div>
            `;
          }

          placeholderBlock.replaceWith(newBlock);
          if (onChange) onChange();
        } catch (err) {
          console.error('[VaultEditor] Upload error:', err);
          placeholderBlock.innerHTML = `
            <div class="vault-uploading-inner" style="color: #ef4444;">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
              <span>Upload failed: ${escapeHtml(err.message)}</span>
            </div>
          `;
          setTimeout(() => placeholderBlock.remove(), 4000);
        }
      }

      // --------------------------------------------------------------------------
      // Delegated Events: Resizing, Deletions, Conversions, Checkboxes, WikiLinks, Smart Links
      // --------------------------------------------------------------------------
      canvasEl.addEventListener('click', (e) => {
        // -1. Separate Convert Trigger: opens format conversion popover FIRST without navigating
        const convertBtn = e.target.closest('.vault-link-convert-trigger');
        if (convertBtn && window.SmartLinkHandler) {
          e.preventDefault();
          e.stopPropagation();
          let targetItem = convertBtn.closest('.vault-block, .vault-link-mention, .vault-link-wrapper');
          if (!targetItem) return;
          const currentType = targetItem.getAttribute('data-block-type') || targetItem.getAttribute('data-link-type') || 'url';
          const url = targetItem.getAttribute('data-url') || (targetItem.querySelector('a')?.getAttribute('href'));
          if (!url) return;

          window.SmartLinkHandler.showLinkConvertMenu({
            anchorEl: convertBtn,
            currentType,
            url,
            onConvert: async (newFormat) => {
              pushHistorySnapshot();
              const meta = await window.SmartLinkHandler.fetchMetadata(url);
              let replacement = null;

              if (newFormat === 'mention') {
                const temp = document.createElement('div');
                temp.innerHTML = window.SmartLinkHandler.renderMentionHtml(url, meta);
                replacement = temp.firstElementChild;
              } else if (newFormat === 'bookmark') {
                const temp = document.createElement('div');
                temp.innerHTML = window.SmartLinkHandler.renderBookmarkHtml(url, meta);
                replacement = temp.firstElementChild;
              } else if (newFormat === 'embed') {
                const temp = document.createElement('div');
                temp.innerHTML = window.SmartLinkHandler.renderEmbedHtml(url, meta);
                replacement = temp.firstElementChild;
              } else if (newFormat === 'url') {
                const temp = document.createElement('div');
                temp.innerHTML = window.SmartLinkHandler.renderUrlHtml(url, meta.title || url);
                replacement = temp.firstElementChild;
              }

              if (replacement) {
                // If converting from an inline item to a block card (bookmark / embed)
                if (newFormat === 'bookmark' || newFormat === 'embed') {
                  const parentBlock = targetItem.closest('.vault-block');
                  if (parentBlock && (parentBlock === targetItem || parentBlock.textContent.trim() === targetItem.textContent.trim())) {
                    parentBlock.replaceWith(replacement);
                  } else if (parentBlock && parentBlock.parentNode === canvasEl) {
                    targetItem.remove();
                    parentBlock.insertAdjacentElement('afterend', replacement);
                  } else {
                    targetItem.replaceWith(replacement);
                  }
                } else {
                  // Converting to inline (mention / url)
                  if (targetItem.classList.contains('vault-block') && targetItem.parentElement === canvasEl) {
                    const p = document.createElement('p');
                    p.className = 'vault-block';
                    p.setAttribute('data-block-id', generateBlockId());
                    p.setAttribute('data-block-type', 'paragraph');
                    p.appendChild(replacement);
                    targetItem.replaceWith(p);
                  } else {
                    targetItem.replaceWith(replacement);
                  }
                }
                ensureBlockAttributes();
                pushHistorySnapshot();
                if (onChange) onChange();
              }
            }
          });
          return;
        }

        // 0. YouTube Thumbnail-First Video Player: Play button or thumbnail click activates iframe
        const ytThumbWrapper = e.target.closest('.vault-yt-thumb-wrapper');
        if (ytThumbWrapper) {
          e.preventDefault();
          e.stopPropagation();
          pushHistorySnapshot();
          const block = ytThumbWrapper.closest('.vault-block');
          const embedUrl = ytThumbWrapper.getAttribute('data-embed-url') || (block ? block.getAttribute('data-embed-url') : '');
          const videoId = ytThumbWrapper.getAttribute('data-video-id') || (block ? block.getAttribute('data-video-id') : '');
          const baseEmbed = embedUrl || `https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}`;
          const finalSrc = baseEmbed.includes('?') ? `${baseEmbed}&autoplay=1` : `${baseEmbed}?autoplay=1`;

          const iframe = document.createElement('iframe');
          iframe.setAttribute('src', finalSrc);
          iframe.setAttribute('frameborder', '0');
          iframe.setAttribute('allow', 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture');
          iframe.setAttribute('allowfullscreen', 'true');
          iframe.setAttribute('loading', 'lazy');
          iframe.className = 'vault-yt-active-iframe';

          ytThumbWrapper.replaceWith(iframe);
          pushHistorySnapshot();
          if (onChange) onChange();
          return;
        }

        // 1. Outlinks on Embed Toolbar (e.g. "Open on YouTube", "Open source")
        const embedOutlink = e.target.closest('.vault-yt-outlink, .vault-embed-btn[href], a.vault-embed-btn');
        if (embedOutlink) {
          e.preventDefault();
          e.stopPropagation();
          const href = embedOutlink.getAttribute('href') || embedOutlink.closest('.vault-block')?.getAttribute('data-url');
          if (href) {
            window.open(href, '_blank', 'noopener,noreferrer');
          }
          return;
        }

        // 2. Bookmark Card Direct Navigation: clicking anywhere on the card opens destination
        const bookmarkCard = e.target.closest('.vault-bookmark-card');
        if (bookmarkCard) {
          e.preventDefault();
          e.stopPropagation();
          const block = bookmarkCard.closest('.vault-block');
          const url = bookmarkCard.getAttribute('data-url') || (block ? block.getAttribute('data-url') : null) || bookmarkCard.querySelector('a[href]')?.getAttribute('href');
          if (url) {
            window.open(url, '_blank', 'noopener,noreferrer');
          }
          return;
        }

        // 3. Mention Chip Navigation: primary click opens destination directly
        const mentionChip = e.target.closest('.vault-link-mention, .vault-mention-link');
        if (mentionChip) {
          e.preventDefault();
          e.stopPropagation();
          const url = mentionChip.getAttribute('data-url') || mentionChip.getAttribute('href') || mentionChip.closest('.vault-link-mention')?.getAttribute('data-url') || mentionChip.querySelector('a[href]')?.getAttribute('href');
          if (url) {
            window.open(url, '_blank', 'noopener,noreferrer');
          }
          return;
        }

        // 4. Direct Internal Entity Mention Click (@note, @task, @project, @research)
        const entityPill = e.target.closest('.entity-mention-pill');
        if (entityPill) {
          e.preventDefault();
          e.stopPropagation();
          const entityType = entityPill.getAttribute('data-entity-type');
          const entityId = entityPill.getAttribute('data-entity-id');
          if (entityType === 'note' && entityId) {
            window.location.hash = `#vault/${entityId}`;
          } else if (entityType === 'task') {
            window.location.hash = '#workflow';
          } else if (entityType === 'project') {
            window.location.hash = '#projects';
          } else if (entityType === 'research') {
            window.location.hash = '#research';
          }
          return;
        }

        // 5. Raw Link / Link Wrapper / Any Anchor in Editor
        const linkWrapper = e.target.closest('.vault-link-wrapper');
        const anchor = e.target.closest('a[href]');
        if (linkWrapper || anchor) {
          if (anchor && anchor.classList.contains('vault-file-btn') && anchor.hasAttribute('download')) {
            return;
          }
          const url = (linkWrapper ? linkWrapper.getAttribute('data-url') : null) || (anchor ? anchor.getAttribute('href') : null);
          if (url && (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('//'))) {
            e.preventDefault();
            e.stopPropagation();
            window.open(url, '_blank', 'noopener,noreferrer');
            return;
          }
        }

        // Preset Width Controls (Image, Video, Embed)
        const widthBtn = e.target.closest('[data-width]');
        if (widthBtn && widthBtn.closest('.vault-image-toolbar, .vault-video-toolbar, .vault-embed-toolbar')) {
          e.preventDefault();
          e.stopPropagation();
          pushHistorySnapshot();
          const block = widthBtn.closest('.vault-block');
          const containerEl = block ? block.querySelector('.vault-image-container, .vault-video-container, .vault-embed-container') : null;
          const width = widthBtn.getAttribute('data-width');
          if (block && containerEl) {
            block.setAttribute('data-width', width);
            containerEl.style.maxWidth = `${width}%`;
            block.querySelectorAll('[data-width]').forEach(b => b.classList.remove('is-active'));
            widthBtn.classList.add('is-active');
            pushHistorySnapshot();
            if (onChange) onChange();
          }
          return;
        }

        // Delete buttons for Image, Video, Audio, Embed, File
        const delBtn = e.target.closest('.vault-img-delete, .vault-video-delete, .vault-audio-delete, .vault-embed-delete, .vault-file-remove');
        if (delBtn) {
          e.preventDefault();
          e.stopPropagation();
          pushHistorySnapshot();
          const block = delBtn.closest('.vault-block');
          if (block) {
            block.remove();
            pushHistorySnapshot();
            if (onChange) onChange();
          }
          return;
        }

        // Checklist Checkbox
        if (e.target && e.target.type === 'checkbox' && e.target.closest('.vault-checklist-item')) {
          pushHistorySnapshot();
          const item = e.target.closest('.vault-checklist-item');
          if (e.target.checked) {
            item.classList.add('is-done');
          } else {
            item.classList.remove('is-done');
          }
          pushHistorySnapshot();
          if (onChange) onChange();
          return;
        }

        // Wiki link click
        if (e.target && e.target.classList.contains('wiki-link-pill')) {
          const title = e.target.getAttribute('data-title');
          const noteId = e.target.getAttribute('data-note-id');
          if (onWikiLinkClick) onWikiLinkClick(noteId ? `note:${noteId}` : title);
          return;
        }
      });

      // Draggable edge resizing for Image and Embed blocks
      canvasEl.addEventListener('mousedown', (e) => {
        const resizeHandle = e.target.closest('.vault-resize-handle');
        if (!resizeHandle) return;

        e.preventDefault();
        e.stopPropagation();
        resizeHandle.classList.add('is-active');

        const block = resizeHandle.closest('.vault-block');
        const containerEl = block ? block.querySelector('.vault-image-container, .vault-video-container, .vault-embed-container') : null;
        if (!containerEl) return;

        const startX = e.clientX;
        const initialWidth = containerEl.offsetWidth;
        const parentWidth = canvasEl.offsetWidth - 70; // minus gutter

        function onMouseMove(moveEvent) {
          const deltaX = moveEvent.clientX - startX;
          const direction = resizeHandle.getAttribute('data-direction');
          const factor = direction === 'left' ? -2 : 2;
          const newWidthPx = Math.max(200, Math.min(parentWidth, initialWidth + (deltaX * factor)));
          const pct = Math.round((newWidthPx / parentWidth) * 100);
          containerEl.style.maxWidth = `${pct}%`;
          block.setAttribute('data-width', String(pct));
        }

        function onMouseUp() {
          resizeHandle.classList.remove('is-active');
          document.removeEventListener('mousemove', onMouseMove);
          document.removeEventListener('mouseup', onMouseUp);
          if (onChange) onChange();
        }

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
      });

      // --------------------------------------------------------------------------
      // Insertion Architecture (Non-corrupting, Position-preserving)
      // --------------------------------------------------------------------------
      function findCurrentBlock() {
        const sel = window.getSelection();
        let node = null;
        if (sel && sel.rangeCount > 0) {
          const r = sel.getRangeAt(0);
          if (canvasEl.contains(r.startContainer)) {
            node = r.startContainer;
          }
        }
        if (!node && lastSavedRange && canvasEl.contains(lastSavedRange.startContainer)) {
          node = lastSavedRange.startContainer;
        }
        while (node && node.parentNode !== canvasEl) {
          node = node.parentNode;
        }
        return (node && node.parentNode === canvasEl) ? node : null;
      }

      function insertBlockNode(newNode, refBlock = null) {
        ensureBlockAttributes();
        const targetRef = refBlock || findCurrentBlock();

        const isEmpty = !canvasEl.textContent.trim() && canvasEl.querySelectorAll('img, video, audio, table, hr, .vault-file-block, .vault-embed-block, .vault-bookmark-block').length === 0;

        if (isEmpty) {
          canvasEl.innerHTML = '';
          canvasEl.appendChild(newNode);
          const p = document.createElement('p');
          p.className = 'vault-block';
          p.setAttribute('data-block-id', generateBlockId());
          p.setAttribute('data-block-type', 'paragraph');
          p.innerHTML = '<br>';
          canvasEl.appendChild(p);
          focusBlock(p);
        } else if (targetRef) {
          const isTargetEmptyParagraph = targetRef.tagName.toLowerCase() === 'p' &&
            (!targetRef.textContent.trim() || targetRef.innerHTML === '<br>') &&
            targetRef.querySelectorAll('img, video, audio, table, hr').length === 0;

          if (isTargetEmptyParagraph) {
            canvasEl.replaceChild(newNode, targetRef);
          } else {
            canvasEl.insertBefore(newNode, targetRef.nextSibling);
          }
        } else {
          canvasEl.appendChild(newNode);
        }

        ensureBlockAttributes();
        if (onChange) onChange();
      }

      function insertBlock(blockHtml, refBlock = null) {
        const template = document.createElement('template');
        template.innerHTML = blockHtml.trim();
        const node = template.content.firstElementChild;
        if (!node) return;

        if (!node.classList.contains('vault-block')) {
          node.classList.add('vault-block');
        }
        if (!node.getAttribute('data-block-id')) {
          node.setAttribute('data-block-id', generateBlockId());
        }

        insertBlockNode(node, refBlock);
        focusBlock(node);
      }

      function focusBlock(blockNode) {
        if (!blockNode) return;
        const sel = window.getSelection();
        const range = document.createRange();

        const editableChild = blockNode.querySelector('p, h1, h2, h3, li, .vault-callout-body, code, span') || blockNode;
        range.selectNodeContents(editableChild);
        range.collapse(false);
        sel.removeAllRanges();
        sel.addRange(range);
        blockNode.focus();
        saveActiveSelection();
      }

      // --------------------------------------------------------------------------
      // Slash Command Engine & @ Entity Mentions
      // --------------------------------------------------------------------------
      canvasEl.addEventListener('keydown', (e) => {
        if (isSlashOpen && e.key === 'Escape') {
          closeSlashMenu();
          e.preventDefault();
          return;
        }

        if (isSlashOpen && (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter')) {
          handleSlashKeyNav(e);
          e.preventDefault();
          return;
        }

        // Enter key navigation on focused link
        if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey && !isSlashOpen) {
          const focusedAnchor = document.activeElement && document.activeElement.tagName === 'A' ? document.activeElement : null;
          if (focusedAnchor && focusedAnchor.href) {
            e.preventDefault();
            window.open(focusedAnchor.href, '_blank', 'noopener,noreferrer');
            return;
          }
        }

        // History Shortcuts: Ctrl+Z (Undo), Ctrl+Y / Ctrl+Shift+Z (Redo)
        if ((e.ctrlKey || e.metaKey) && !e.altKey) {
          const key = e.key.toLowerCase();
          if (key === 'z') {
            e.preventDefault();
            if (e.shiftKey) {
              redo();
            } else {
              undo();
            }
            return;
          }
          if (key === 'y') {
            e.preventDefault();
            redo();
            return;
          }
        }

        // Formatting Shortcuts
        if (e.ctrlKey || e.metaKey) {
          if (e.key.toLowerCase() === 'b') {
            e.preventDefault();
            pushHistorySnapshot();
            document.execCommand('bold', false, null);
            pushHistorySnapshot();
            if (onChange) onChange();
            return;
          }
          if (e.key.toLowerCase() === 'i') {
            e.preventDefault();
            pushHistorySnapshot();
            document.execCommand('italic', false, null);
            pushHistorySnapshot();
            if (onChange) onChange();
            return;
          }
          if (e.key.toLowerCase() === 'u') {
            e.preventDefault();
            pushHistorySnapshot();
            document.execCommand('underline', false, null);
            pushHistorySnapshot();
            if (onChange) onChange();
            return;
          }
        }
      });

      canvasEl.addEventListener('input', () => {
        ensureBlockAttributes();
        checkSlashTrigger();
        checkEntityMentionTrigger();
        clearTimeout(typingDebounceTimer);
        typingDebounceTimer = setTimeout(() => {
          pushHistorySnapshot();
        }, 300);
        if (onChange) onChange();
      });

      function checkEntityMentionTrigger() {
        const sel = window.getSelection();
        if (!sel || !sel.rangeCount || !window.SmartLinkHandler) return;
        const range = sel.getRangeAt(0);
        const node = range.startContainer;

        if (node.nodeType === Node.TEXT_NODE) {
          const textBeforeCursor = node.textContent.slice(0, range.startOffset);
          const atIdx = textBeforeCursor.lastIndexOf('@');

          if (atIdx !== -1) {
            const charBeforeAt = atIdx > 0 ? textBeforeCursor[atIdx - 1] : ' ';
            if (/\s/.test(charBeforeAt) || atIdx === 0) {
              const query = textBeforeCursor.slice(atIdx + 1);
              if (!query.includes(' ') || query.length < 15) {
                const atRange = range.cloneRange();
                atRange.setStart(node, atIdx);
                atRange.setEnd(node, range.startOffset);

                window.SmartLinkHandler.showEntityMentionMenu({
                  range: atRange,
                  query,
                  onSelect: (entity) => {
                    atRange.deleteContents();
                    const pillHtml = window.SmartLinkHandler.renderEntityMentionHtml(entity.type, entity.id, entity.title);
                    document.execCommand('insertHTML', false, pillHtml);
                    if (onChange) onChange();
                  }
                });
                return;
              }
            }
          }
        }
      }

      function checkSlashTrigger() {
        const sel = window.getSelection();
        if (!sel || !sel.rangeCount) return;
        const range = sel.getRangeAt(0);
        const node = range.startContainer;

        if (node.nodeType === Node.TEXT_NODE) {
          const textBeforeCursor = node.textContent.slice(0, range.startOffset);
          const slashIdx = textBeforeCursor.lastIndexOf('/');

          if (slashIdx !== -1) {
            const charBeforeSlash = slashIdx > 0 ? textBeforeCursor[slashIdx - 1] : ' ';
            if (/\s/.test(charBeforeSlash) || slashIdx === 0) {
              slashQuery = textBeforeCursor.slice(slashIdx + 1);
              slashRange = range.cloneRange();
              slashRange.setStart(node, slashIdx);
              slashRange.setEnd(node, range.startOffset);

              openSlashMenu(range, slashQuery);
              return;
            }
          }
        }

        if (isSlashOpen) {
          closeSlashMenu();
        }
      }

      function openSlashMenu(cursorRange, query) {
        if (!slashPalette) {
          slashPalette = document.createElement('div');
          slashPalette.className = 'vault-slash-palette';
          document.body.appendChild(slashPalette);
        }

        const rect = cursorRange.getBoundingClientRect();
        slashPalette.style.top = `${rect.bottom + window.scrollY + 6}px`;
        slashPalette.style.left = `${Math.min(rect.left + window.scrollX, window.innerWidth - 300)}px`;

        const commands = [
          { cmd: 'h1', name: 'Heading 1', desc: 'Large section header', icon: '<span style="font-weight:700;font-size:11px;">H1</span>', fn: () => insertBlock('<h1>Heading 1</h1>') },
          { cmd: 'h2', name: 'Heading 2', desc: 'Medium section header', icon: '<span style="font-weight:700;font-size:11px;">H2</span>', fn: () => insertBlock('<h2>Heading 2</h2>') },
          { cmd: 'h3', name: 'Heading 3', desc: 'Small subsection header', icon: '<span style="font-weight:700;font-size:11px;">H3</span>', fn: () => insertBlock('<h3>Heading 3</h3>') },
          { cmd: 'bullet', name: 'Bullet List', desc: 'Create bulleted points', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><circle cx="3" cy="6" r="1.5" fill="currentColor"/><circle cx="3" cy="12" r="1.5" fill="currentColor"/><circle cx="3" cy="18" r="1.5" fill="currentColor"/></svg>', fn: () => insertBlock('<ul><li>List item</li></ul>') },
          { cmd: 'numbered', name: 'Numbered List', desc: 'Create ordered steps', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="10" y1="6" x2="21" y2="6"/><line x1="10" y1="12" x2="21" y2="12"/><line x1="10" y1="18" x2="21" y2="18"/><path d="M4 6h1v4"/><path d="M4 10h2"/></svg>', fn: () => insertBlock('<ol><li>First step</li></ol>') },
          { cmd: 'todo', name: 'Checklist', desc: 'Interactive task checkbox', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="18" height="18" x="3" y="3" rx="2"/><polyline points="9 11 12 14 22 4"/></svg>', fn: () => insertBlock('<div class="vault-checklist-item" data-task="true"><input type="checkbox"><span class="vault-checklist-text">Action item</span></div>') },
          { cmd: 'quote', name: 'Quote', desc: 'Capture thoughts or citations', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z"/></svg>', fn: () => insertBlock('<blockquote><p>Quote text...</p></blockquote>') },
          { cmd: 'callout', name: 'Callout', desc: 'Highlighted notice block', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>', fn: () => insertBlock('<div class="vault-callout" data-callout="NOTE"><span class="vault-callout-icon" contenteditable="false"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg></span><div class="vault-callout-body"><strong>NOTE:</strong> Important knowledge item.</div></div>') },
          { cmd: 'divider', name: 'Divider', desc: 'Horizontal rule line', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="12" x2="21" y2="12"/></svg>', fn: () => insertBlock('<div class="vault-divider-block"><hr class="vault-divider" /></div>') },
          { cmd: 'code', name: 'Code Block', desc: 'Fenced code with syntax styling', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>', fn: () => insertBlock('<pre class="vault-code-block" data-lang="javascript"><code class="language-javascript">// Code snippet</code></pre>') },
          { cmd: 'table', name: 'Table', desc: 'Structured 3x2 data grid', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/><path d="M3 15h18"/><path d="M9 3v18"/><path d="M15 3v18"/></svg>', fn: () => insertBlock('<div class="vault-table-block"><table class="vault-table"><thead><tr><th>Header 1</th><th>Header 2</th></tr></thead><tbody><tr><td>Cell 1</td><td>Cell 2</td></tr></tbody></table></div>') },
          { cmd: 'image', name: 'Insert Image', desc: 'Upload picture or graphic', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="18" height="18" x="3" y="3" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>', fn: () => { if (onSlashCommand) onSlashCommand('image'); } },
          { cmd: 'video', name: 'Upload Video', desc: 'Attach video file (MP4, WebM)', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" stroke-width="2"><rect width="18" height="18" x="3" y="3" rx="2"/><polyline points="10 8 16 12 10 16 10 8"/></svg>', fn: () => { if (onSlashCommand) onSlashCommand('video'); } },
          { cmd: 'audio', name: 'Upload Audio', desc: 'Attach audio recording or song', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ec4899" stroke-width="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>', fn: () => { if (onSlashCommand) onSlashCommand('audio'); } },
          { cmd: 'file', name: 'Attach File', desc: 'Upload document or archive (ZIP, PDF...)', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>', fn: () => { if (onSlashCommand) onSlashCommand('file'); } },
          { cmd: 'bookmark', name: 'Web Bookmark', desc: 'Visual card from web link', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>', fn: () => { const u = prompt('Enter link URL:'); if (u) insertBookmarkUrl(u.trim()); } },
          { cmd: 'embed', name: 'Interactive Embed', desc: 'Embed YouTube or Maps', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>', fn: () => { const u = prompt('Enter embed URL:'); if (u) insertEmbedUrl(u.trim()); } },
          { cmd: 'note', name: 'Connect Note', desc: 'Link to another vault note', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z"/><path d="M6 6h10"/><path d="M6 10h10"/></svg>', fn: () => { if (onSlashCommand) onSlashCommand('connect-note'); } }
        ];

        const filtered = commands.filter(c => c.cmd.includes(query.toLowerCase()) || c.name.toLowerCase().includes(query.toLowerCase()));

        if (filtered.length === 0) {
          closeSlashMenu();
          return;
        }

        slashPalette.innerHTML = `
          <div class="vault-slash-header">Basic Blocks (${filtered.length})</div>
          <div class="vault-slash-list">
            ${filtered.map((c, i) => `
              <div class="vault-slash-item ${i === 0 ? 'is-selected' : ''}" data-idx="${i}">
                <div class="vault-slash-item-left">
                  <span class="vault-slash-item-icon">${c.icon}</span>
                  <div class="vault-slash-item-text">
                    <span class="vault-slash-item-name">${c.name}</span>
                    <span class="vault-slash-item-desc">${c.desc}</span>
                  </div>
                </div>
                <code>/${c.cmd}</code>
              </div>
            `).join('')}
          </div>
        `;

        slashPalette.querySelectorAll('.vault-slash-item').forEach((item, idx) => {
          item.addEventListener('click', () => {
            selectSlashItem(filtered[idx]);
          });
        });

        isSlashOpen = true;
      }

      function handleSlashKeyNav(e) {
        if (!slashPalette) return;
        const items = Array.from(slashPalette.querySelectorAll('.vault-slash-item'));
        let selectedIdx = items.findIndex(el => el.classList.contains('is-selected'));

        if (e.key === 'ArrowDown') {
          if (selectedIdx < items.length - 1) {
            items[selectedIdx].classList.remove('is-selected');
            selectedIdx++;
            items[selectedIdx].classList.add('is-selected');
            items[selectedIdx].scrollIntoView({ block: 'nearest' });
          }
        } else if (e.key === 'ArrowUp') {
          if (selectedIdx > 0) {
            items[selectedIdx].classList.remove('is-selected');
            selectedIdx--;
            items[selectedIdx].classList.add('is-selected');
            items[selectedIdx].scrollIntoView({ block: 'nearest' });
          }
        } else if (e.key === 'Enter') {
          if (selectedIdx >= 0) {
            items[selectedIdx].click();
          }
        }
      }

      function selectSlashItem(command) {
        if (!command) return;

        if (slashRange) {
          slashRange.deleteContents();
        }

        command.fn();
        closeSlashMenu();
        if (onChange) onChange();
      }

      function closeSlashMenu() {
        if (slashPalette) {
          slashPalette.remove();
          slashPalette = null;
        }
        isSlashOpen = false;
        slashQuery = '';
        slashRange = null;
      }

      // Close menus on document click
      document.addEventListener('click', (e) => {
        if (isSlashOpen && slashPalette && !slashPalette.contains(e.target) && e.target !== canvasEl) {
          closeSlashMenu();
        }
      });

      return {
        getContentMarkdown() {
          return VaultEditor.htmlToMarkdown(canvasEl.innerHTML);
        },
        setContentMarkdown(md) {
          canvasEl.innerHTML = VaultEditor.markdownToHtml(md);
          ensureBlockAttributes();
          clearBlockSelection();
          clearHistory();
        },
        insertBlock(blockHtml, refBlock = null) {
          pushHistorySnapshot();
          insertBlock(blockHtml, refBlock);
          pushHistorySnapshot();
        },
        uploadAndInsertFile,
        insertBookmarkUrl,
        insertEmbedUrl,
        undo,
        redo,
        canUndo,
        canRedo,
        pushHistorySnapshot,
        clearHistory,
        extractHeadings() {
          return VaultEditor.extractHeadings(canvasEl);
        },
        getSelectedBlocks() {
          return getSelectedBlocksInDocumentOrder();
        },
        getSelectedBlockIds() {
          return getSelectedBlocksInDocumentOrder().map(b => b.getAttribute('data-block-id'));
        },
        selectBlocksByElements(elements, append = false) {
          if (!append) selectedBlockIds.clear();
          ensureBlockAttributes();
          (elements || []).forEach(el => {
            if (el && el.parentNode === canvasEl) {
              const id = el.getAttribute('data-block-id');
              if (id) selectedBlockIds.add(id);
            }
          });
          syncBlockSelectionUI();
        },
        moveSelectedBlocksTo,
        moveSelectedBlocksUp,
        moveSelectedBlocksDown,
        duplicateSelectedBlocks,
        deleteSelectedBlocks,
        copySelectedBlocks,
        cutSelectedBlocks,
        pasteCopiedBlocks,
        clearBlockSelection() {
          clearBlockSelection();
        },
        destroy() {
          closeSlashMenu();
          closeBlockContextMenu();
          closeQuickInsertMenu();
          clearBlockSelection();
          if (blockGutter) blockGutter.remove();
          if (dropIndicator) dropIndicator.remove();
          if (multiSelectToolbar && multiSelectToolbar.parentNode) {
            multiSelectToolbar.remove();
          }
          canvasEl.removeEventListener('contextmenu', onCanvasContextMenu);
          canvasEl.removeEventListener('pointerdown', onCanvasPointerDown);
          document.removeEventListener('pointerdown', onDocPointerDown);
          window.removeEventListener('pointermove', onGlobalPointerMove);
          window.removeEventListener('pointerup', onGlobalPointerUp);
          window.removeEventListener('keydown', onGlobalKeyDown);
          window.removeEventListener('resize', updateMultiSelectToolbar);
          document.removeEventListener('scroll', updateMultiSelectToolbar, true);
          document.body.classList.remove('vault-marquee-active');
          if (marqueeEl && marqueeEl.parentNode) marqueeEl.remove();
        }
      };
    }
  };

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function sanitizeHref(rawUrl) {
    const clean = String(rawUrl || '').trim();
    if (!clean) return '#';
    const lower = clean.replace(/[\s\x00-\x1f]+/g, '').toLowerCase();
    if (
      lower.startsWith('javascript:') ||
      lower.startsWith('vbscript:') ||
      lower.startsWith('data:text/html') ||
      lower.startsWith('data:application/')
    ) {
      return '#unsafe-url-blocked';
    }
    return escapeHtml(clean);
  }

  function formatInline(str) {
    if (!str) return '';
    // Escape raw HTML first so <script>, <img onerror=...>, <iframe> in Markdown never execute
    let res = escapeHtml(str)
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/~~(.*?)~~/g, '<del>$1</del>')
      .replace(/==(.*?)==/g, '<mark class="editor-mark">$1</mark>')
      .replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>')
      .replace(/\[mention:\s*(.*?)\]\((.*?)\)/gi, (match, title, url) => {
        const safeUrl = sanitizeHref(url);
        return window.SmartLinkHandler ? window.SmartLinkHandler.renderMentionHtml(safeUrl, { title }) : `<a href="${safeUrl}" target="_blank" rel="noopener noreferrer">${title}</a>`;
      })
      .replace(/\[@(note|task|project|research):([^:]+):(.*?)\]/gi, (match, type, id, title) => {
        return window.SmartLinkHandler ? window.SmartLinkHandler.renderEntityMentionHtml(type, id, title) : `<span class="entity-mention-pill">${title}</span>`;
      })
      .replace(/\[\[(.*?)\]\]/g, (match, raw) => {
        const trimmed = (raw || '').trim();
        const durable = trimmed.match(/^note:(\d+)(?:\|(.*))?$/i);
        if (durable) {
          const noteId = durable[1];
          const displayLabel = durable[2] ? durable[2].trim() : `Note #${noteId}`;
          return `<span class="wiki-link-pill" data-title="${trimmed}" data-note-id="${noteId}" contenteditable="false">[[${displayLabel}]]</span>`;
        }
        const pipeMatch = trimmed.match(/^([^|]+)\|(.*)$/);
        if (pipeMatch) {
          return `<span class="wiki-link-pill" data-title="${trimmed}" contenteditable="false">[[${pipeMatch[2].trim()}]]</span>`;
        }
        return `<span class="wiki-link-pill" data-title="${trimmed}" contenteditable="false">[[${trimmed}]]</span>`;
      })
      .replace(/\[(.*?)\]\((.*?)\)/g, (match, label, url) => {
        const safeUrl = sanitizeHref(url);
        return `<a href="${safeUrl}" class="editor-link" target="_blank" rel="noopener noreferrer">${label}</a>`;
      });

    // Autolink bare URLs in plain text chunks outside existing HTML tags
    const tokens = res.split(/(<[^>]+>)/g);
    for (let i = 0; i < tokens.length; i += 2) {
      if (tokens[i]) {
        tokens[i] = tokens[i].replace(/(https?:\/\/[^\s<]+)/g, (match) => {
          const cleanUrl = match.replace(/[.,;:!?]+$/, '');
          const trailing = match.slice(cleanUrl.length);
          if (window.SmartLinkHandler) {
            return window.SmartLinkHandler.renderUrlHtml(cleanUrl, cleanUrl) + trailing;
          }
          return `<a href="${sanitizeHref(cleanUrl)}" class="editor-link" target="_blank" rel="noopener noreferrer">${cleanUrl}</a>${trailing}`;
        });
      }
    }
    return tokens.join('');
  }

  window.VaultEditor = VaultEditor;
})();
