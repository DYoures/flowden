// public/js/components/smartLinkHandler.js
// Flowden Shared Smart Link Engine & Notion-Style Paste Menu
// Provides: Paste as Mention / Bookmark / Embed / URL, Link Conversion, and @ Entity Mentions

(function () {
  'use strict';

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function getDomain(url) {
    try {
      return new URL(url).hostname;
    } catch (e) {
      return url;
    }
  }

  const NEUTRAL_GLOBE_FAVICON = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Ccircle cx='12' cy='12' r='10'/%3E%3Cline x1='2' y1='12' x2='22' y2='12'/%3E%3Cpath d='M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z'/%3E%3C/svg%3E";

  const SmartLinkHandler = {
    /**
     * Generates the ordered YouTube thumbnail candidate list for a videoId
     */
    getYouTubeThumbnails(videoId) {
      if (!videoId) return [];
      const cleanId = encodeURIComponent(String(videoId).trim());
      return [
        `https://i.ytimg.com/vi/${cleanId}/maxresdefault.jpg`,
        `https://i.ytimg.com/vi/${cleanId}/sddefault.jpg`,
        `https://i.ytimg.com/vi/${cleanId}/hqdefault.jpg`,
        `https://i.ytimg.com/vi/${cleanId}/mqdefault.jpg`,
        `https://i.ytimg.com/vi/${cleanId}/default.jpg`
      ];
    },

    /**
     * Inspects a URL and detects embed provider + video metadata
     */
    detectProvider(url) {
      if (!url || typeof url !== 'string') return null;
      let parsed;
      try {
        parsed = new URL(url.trim());
      } catch (e) {
        return null;
      }

      const host = parsed.hostname.toLowerCase();

      // YouTube (watch, youtu.be, shorts, live, embed, youtube-nocookie)
      if (host.includes('youtube.com') || host.includes('youtu.be') || host.includes('youtube-nocookie.com')) {
        let videoId = '';
        let isShorts = false;
        if (host.includes('youtu.be')) {
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
          const thumbnails = this.getYouTubeThumbnails(videoId);
          return {
            provider: 'youtube',
            name: 'YouTube',
            videoId,
            isShorts,
            thumbnails,
            image: thumbnails[0],
            favicon: 'https://www.google.com/s2/favicons?domain=youtube.com&sz=64',
            embedUrl: `https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}`,
            isEmbeddable: true
          };
        }
        return {
          provider: 'youtube',
          name: 'YouTube',
          videoId: null,
          embedUrl: null,
          isEmbeddable: false,
          reason: 'Specific video URL required to embed (e.g. watch?v=...)'
        };
      }

      // Vimeo
      if (host.includes('vimeo.com')) {
        const parts = parsed.pathname.split('/').filter(Boolean);
        const vimeoId = parts.find(p => /^\d+$/.test(p));
        if (vimeoId) {
          return {
            provider: 'vimeo',
            name: 'Vimeo',
            videoId: vimeoId,
            embedUrl: `https://player.vimeo.com/video/${encodeURIComponent(vimeoId)}`,
            isEmbeddable: true
          };
        }
        return {
          provider: 'vimeo',
          name: 'Vimeo',
          embedUrl: null,
          isEmbeddable: false,
          reason: 'Specific video URL required to embed (e.g. vimeo.com/123456)'
        };
      }

      // Google Maps
      if (host.includes('google.com') && parsed.pathname.includes('/maps')) {
        return {
          provider: 'google-maps',
          name: 'Google Maps',
          embedUrl: url,
          isEmbeddable: true
        };
      }

      return null;
    },

    /**
     * Fetches metadata for a URL via backend service with safe client fallback
     */
    async fetchMetadata(url) {
      const domain = getDomain(url);
      const detected = this.detectProvider(url);
      const fallback = {
        title: detected && detected.isEmbeddable ? (detected.isShorts ? 'YouTube Short' : `${detected.name} Video`) : domain,
        description: detected && detected.isEmbeddable ? `${detected.name} Video Player` : '',
        domain: domain,
        favicon: (detected && detected.favicon) ? detected.favicon : `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=32`,
        image: (detected && detected.image) ? detected.image : '',
        isEmbeddable: !!(detected && detected.isEmbeddable),
        embedProvider: detected ? detected.provider : null,
        embedUrl: detected ? detected.embedUrl : null,
        videoId: detected ? detected.videoId : null,
        isShorts: !!(detected && detected.isShorts),
        thumbnails: (detected && detected.thumbnails) ? detected.thumbnails : null
      };

      try {
        const token = localStorage.getItem('flowden_token');
        const res = await fetch(`/api/v1/notes/url-metadata?url=${encodeURIComponent(url)}`, {
          headers: token ? { 'Authorization': `Bearer ${token}` } : {}
        });
        if (res.ok) {
          const data = await res.json();
          if (data && data.success) {
            return {
              title: data.title || fallback.title,
              description: data.description || fallback.description,
              domain: data.domain || fallback.domain,
              favicon: data.favicon || fallback.favicon,
              image: data.image || fallback.image,
              isEmbeddable: data.isEmbeddable !== undefined ? !!data.isEmbeddable : fallback.isEmbeddable,
              embedProvider: data.embedProvider || fallback.embedProvider,
              embedUrl: data.embedUrl || fallback.embedUrl,
              videoId: data.videoId || fallback.videoId,
              isShorts: data.isShorts !== undefined ? !!data.isShorts : fallback.isShorts,
              thumbnails: (Array.isArray(data.thumbnails) && data.thumbnails.length > 0) ? data.thumbnails : fallback.thumbnails
            };
          }
        }
      } catch (err) {
        // Fallback gracefully on network error or offline
      }

      return fallback;
    },

    /**
     * Normalizes an image URL against the target URL origin
     */
    normalizeImageUrl(imageUrl, pageUrl) {
      if (!imageUrl || typeof imageUrl !== 'string') return '';
      const trimmed = imageUrl.trim();
      if (!trimmed) return '';
      if (trimmed.startsWith('data:image/')) return trimmed;
      try {
        const base = pageUrl ? new URL(pageUrl.trim()).origin : window.location.origin;
        const resolved = new URL(trimmed, base);
        if (resolved.protocol === 'http:' || resolved.protocol === 'https:') {
          return resolved.href;
        }
      } catch (e) {
        // Invalid URL
      }
      return '';
    },

    /**
     * Shows a clean branded unavailable state when all YouTube thumbnail resolutions fail
     */
    showYtUnavailableState(imgEl) {
      if (!imgEl) return;
      imgEl.onerror = null;
      imgEl.onload = null;
      imgEl.style.display = 'none';
      imgEl.setAttribute('data-thumb-failed', 'true');

      const thumbContainer = imgEl.closest('.vault-yt-thumb-wrapper, .vault-bookmark-thumb');
      if (thumbContainer) {
        thumbContainer.classList.add('is-unavailable');
        const fallbackEl = thumbContainer.querySelector('.vault-yt-unavailable-fallback');
        if (fallbackEl) {
          fallbackEl.style.display = 'flex';
        }
      }
    },

    /**
     * Onload handler for YouTube thumbnails:
     * Detects 120x90 gray placeholder images returned for missing resolutions or unavailable videos
     */
    handleYtThumbLoad(imgEl) {
      if (!imgEl) return;
      const w = imgEl.naturalWidth || 0;
      const h = imgEl.naturalHeight || 0;
      const curSrc = imgEl.getAttribute('src') || '';

      // YouTube returns a 120x90 gray placeholder when a resolution does not exist or video is unavailable
      if (w === 0 || (w <= 120 && h <= 90)) {
        // If this is a higher-res candidate (maxresdefault, sddefault, hqdefault, mqdefault) returning 120x90, cascade!
        if (!curSrc.endsWith('/default.jpg')) {
          imgEl.setAttribute('data-placeholder-cascade', 'true');
          this.handleYtThumbFallback(imgEl);
          return;
        }
        // If we already cascaded through hqdefault & mqdefault down to default.jpg and still got 120x90, the video is unavailable
        if (imgEl.getAttribute('data-placeholder-cascade') === 'true' || imgEl.getAttribute('data-error-cascade') === 'true') {
          this.showYtUnavailableState(imgEl);
          return;
        }
      }

      imgEl.setAttribute('data-thumb-loaded', 'true');
      imgEl.setAttribute('data-loaded-resolution', `${w}x${h}`);
    },

    /**
     * Fallback handler for YouTube thumbnail cascading on HTTP error
     */
    handleYtThumbFallback(imgEl) {
      if (!imgEl) return;
      try {
        const raw = imgEl.getAttribute('data-thumbnails');
        if (!raw) {
          this.showYtUnavailableState(imgEl);
          return;
        }
        const list = JSON.parse(raw);
        if (!Array.isArray(list) || list.length === 0) {
          this.showYtUnavailableState(imgEl);
          return;
        }
        const curSrc = imgEl.getAttribute('src') || '';
        const curIdx = list.indexOf(curSrc);
        if (curIdx >= 0 && curIdx < list.length - 1) {
          imgEl.setAttribute('data-error-cascade', 'true');
          imgEl.setAttribute('src', list[curIdx + 1]);
        } else {
          this.showYtUnavailableState(imgEl);
        }
      } catch (err) {
        this.showYtUnavailableState(imgEl);
      }
    },

    /**
     * Handles generic website bookmark image load failure cleanly without broken-image icon
     */
    handleBookmarkThumbError(imgEl) {
      if (!imgEl) return;
      imgEl.onerror = null;
      const thumbWrap = imgEl.closest('.vault-bookmark-thumb');
      const card = imgEl.closest('.vault-bookmark-card');
      if (thumbWrap) {
        thumbWrap.style.display = 'none';
        thumbWrap.setAttribute('data-thumb-hidden', 'true');
      }
      if (card) {
        card.classList.add('vault-bookmark-card--no-thumb');
      }
    },

    /**
     * Renders an inline link Mention chip with clickable target="_blank" anchor and separate convert trigger
     */
    renderMentionHtml(url, meta = {}) {
      const title = meta.title || getDomain(url);
      const domain = getDomain(url);
      const favicon = meta.favicon || `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=32`;

      return `
        <span class="vault-link-mention" data-link-type="mention" data-url="${escapeHtml(url)}" data-title="${escapeHtml(title)}" contenteditable="false">
          <a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" class="vault-mention-link" title="${escapeHtml(url)}">
            <img src="${escapeHtml(favicon)}" class="vault-mention-favicon" alt="" onerror="this.onerror=null;this.src='${NEUTRAL_GLOBE_FAVICON}';" />
            <span class="vault-mention-text">${escapeHtml(title)}</span>
          </a>
          <button class="vault-link-convert-trigger" title="Convert link format" type="button">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
          </button>
        </span>&nbsp;
      `.trim();
    },

    /**
     * Renders a rich visual Bookmark block card with clickable direct link and shared video/OG thumbnail support
     */
    renderBookmarkHtml(url, meta = {}, blockId = '') {
      const id = blockId || 'blk_' + Date.now().toString(36);
      const detected = this.detectProvider(url);
      const isYouTube = !!(detected && detected.provider === 'youtube' && detected.videoId);
      const videoId = meta.videoId || (isYouTube ? detected.videoId : '');
      const isShorts = !!(meta.isShorts || (isYouTube && detected.isShorts));

      const domain = meta.domain || getDomain(url);
      let title = meta.title || (isYouTube ? (isShorts ? 'YouTube Short' : 'YouTube Video') : domain);
      if (isYouTube && (title === domain || title === url)) {
        title = isShorts ? 'YouTube Short' : 'YouTube Video';
      }
      const desc = meta.description || (isYouTube ? (isShorts ? 'YouTube Shorts Video' : 'YouTube Video Player') : 'Web resource link');
      const favicon = meta.favicon || (isYouTube ? detected.favicon : `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=32`);

      let thumbHtml = '';
      let primaryImage = '';

      if (isYouTube && videoId) {
        const thumbList = (Array.isArray(meta.thumbnails) && meta.thumbnails.length > 0)
          ? meta.thumbnails
          : this.getYouTubeThumbnails(videoId);
        primaryImage = thumbList[0] || '';
        const escapedThumbsJson = escapeHtml(JSON.stringify(thumbList));
        const shortsClass = isShorts ? 'vault-bookmark-thumb--shorts' : 'vault-bookmark-thumb--yt';

        thumbHtml = `
          <a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" class="vault-bookmark-thumb ${shortsClass}" data-video-id="${escapeHtml(videoId)}" title="Watch on YouTube">
            <img src="${escapeHtml(primaryImage)}" class="vault-yt-thumb vault-bookmark-yt-img" alt="${escapeHtml(title)}" data-thumbnails='${escapedThumbsJson}' onload="window.SmartLinkHandler && window.SmartLinkHandler.handleYtThumbLoad(this)" onerror="window.SmartLinkHandler && window.SmartLinkHandler.handleYtThumbFallback(this)" />
            <span class="vault-bookmark-yt-play-badge" aria-hidden="true">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 3 20 12 6 21 6 3"/></svg>
            </span>
            <div class="vault-yt-unavailable-fallback" style="display:none;">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="2" y="4" width="20" height="16" rx="3"/><polygon points="10 9 15 12 10 15 10 9"/></svg>
              <span>Video preview unavailable</span>
            </div>
          </a>
        `.trim();
      } else {
        primaryImage = this.normalizeImageUrl(meta.image || '', url);
        if (primaryImage) {
          thumbHtml = `
            <a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" class="vault-bookmark-thumb" title="${escapeHtml(title)}">
              <img src="${escapeHtml(primaryImage)}" class="vault-bookmark-img" alt="${escapeHtml(title)}" onload="if(this.naturalWidth===0){window.SmartLinkHandler&&window.SmartLinkHandler.handleBookmarkThumbError(this);}" onerror="window.SmartLinkHandler && window.SmartLinkHandler.handleBookmarkThumbError(this)" />
            </a>
          `.trim();
        }
      }

      const cardModifier = thumbHtml ? (isYouTube ? 'vault-bookmark-card--yt' : 'vault-bookmark-card--has-thumb') : 'vault-bookmark-card--no-thumb';

      return `
        <div class="vault-block vault-bookmark-block" data-block-id="${id}" data-block-type="bookmark" data-url="${escapeHtml(url)}" data-title="${escapeHtml(title)}" data-desc="${escapeHtml(desc)}" data-image="${escapeHtml(primaryImage)}" ${videoId ? `data-video-id="${escapeHtml(videoId)}"` : ''}>
          <div class="vault-bookmark-card ${cardModifier}" contenteditable="false">
            <div class="vault-bookmark-info">
              <a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" class="vault-bookmark-title">${escapeHtml(title)}</a>
              <div class="vault-bookmark-desc">${escapeHtml(desc)}</div>
              <div class="vault-bookmark-meta">
                <img src="${escapeHtml(favicon)}" class="vault-bookmark-favicon" alt="" onerror="this.onerror=null;this.src='${NEUTRAL_GLOBE_FAVICON}';" />
                <span class="vault-bookmark-domain">${escapeHtml(domain)}</span>
                <span class="vault-bookmark-sep"></span>
                <a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" class="vault-bookmark-outlink" title="Open in new tab">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                </a>
                <button class="vault-link-convert-trigger" title="Convert bookmark format" type="button" style="margin-left:auto;">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
                </button>
              </div>
            </div>
            ${thumbHtml}
          </div>
        </div>
      `.trim();
    },

    /**
     * Renders an interactive Embed block (Thumbnail-first for YouTube; standard iframe for others)
     */
    renderEmbedHtml(url, meta = {}, blockId = '', width = 100) {
      const id = blockId || 'blk_' + Date.now().toString(36);
      const detected = this.detectProvider(url);
      const provider = meta.embedProvider || (detected ? detected.provider : 'web');
      const embedUrl = meta.embedUrl || (detected ? detected.embedUrl : url) || url;
      const isShorts = !!(meta.isShorts || (detected && detected.isShorts));
      let title = meta.title || (detected ? (isShorts ? 'YouTube Short' : `${detected.name} Video`) : 'Interactive Embed');
      if (title === 'embed' || title === 'youtube' || title === getDomain(url)) {
        title = detected ? (isShorts ? 'YouTube Short' : `${detected.name} Video`) : 'Interactive Embed';
      }

      if (provider === 'youtube' || (detected && detected.provider === 'youtube')) {
        const videoId = meta.videoId || (detected && detected.videoId) || '';
        const thumbList = (meta.thumbnails && Array.isArray(meta.thumbnails) && meta.thumbnails.length > 0)
          ? meta.thumbnails
          : this.getYouTubeThumbnails(videoId);
        const primaryThumb = thumbList[0] || '';
        const escapedThumbsJson = escapeHtml(JSON.stringify(thumbList));
        const resolvedEmbedUrl = videoId ? `https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}` : embedUrl;

        return `
          <div class="vault-block vault-embed-block" data-block-id="${id}" data-block-type="embed" data-url="${escapeHtml(url)}" data-provider="youtube" data-video-id="${escapeHtml(videoId)}" data-embed-url="${escapeHtml(resolvedEmbedUrl)}" data-title="${escapeHtml(title)}" data-width="${width}" ${isShorts ? 'data-shorts="true"' : ''}>
            <div class="vault-embed-container" style="max-width: ${width}%;">
              <div class="vault-embed-wrapper vault-embed-yt-wrapper ${isShorts ? 'vault-embed-yt-shorts' : ''}">
                <div class="vault-yt-thumb-wrapper" contenteditable="false" data-video-id="${escapeHtml(videoId)}" data-embed-url="${escapeHtml(resolvedEmbedUrl)}" title="Click to Play">
                  <img src="${escapeHtml(primaryThumb)}" class="vault-yt-thumb" alt="${escapeHtml(title)}" data-thumbnails='${escapedThumbsJson}' onload="window.SmartLinkHandler && window.SmartLinkHandler.handleYtThumbLoad(this)" onerror="window.SmartLinkHandler && window.SmartLinkHandler.handleYtThumbFallback(this)" />
                  <div class="vault-yt-play-btn" role="button" aria-label="Play Video" title="Play Video">
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 3 20 12 6 21 6 3"/></svg>
                  </div>
                  <div class="vault-yt-unavailable-fallback" style="display:none;">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="2" y="4" width="20" height="16" rx="3"/><polygon points="10 9 15 12 10 15 10 9"/></svg>
                    <div class="vault-yt-unavailable-title">Video preview unavailable</div>
                    <a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" class="vault-yt-unavailable-link">Open on YouTube</a>
                  </div>
                  <div class="vault-yt-badge">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="#ff0000"><path d="M22.54 6.42a2.78 2.78 0 0 0-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 0 0-1.94 2A29 29 0 0 0 1 11.75a29 29 0 0 0 .46 5.33A2.78 2.78 0 0 0 3.4 19c1.72.46 8.6.46 8.6.46s6.88 0 8.6-.46a2.78 2.78 0 0 0 1.94-2 29 29 0 0 0 .46-5.25 29 29 0 0 0-.46-5.33z"/><polygon points="9.75 15.02 15.5 11.75 9.75 8.48 9.75 15.02" fill="#ffffff"/></svg>
                    <span>${isShorts ? 'YouTube Shorts' : 'YouTube'}</span>
                  </div>
                  <div class="vault-yt-title-overlay">${escapeHtml(title)}</div>
                </div>
                <div class="vault-embed-toolbar" contenteditable="false">
                  <button class="vault-embed-btn ${width === 50 ? 'is-active' : ''}" data-width="50" type="button">50%</button>
                  <button class="vault-embed-btn ${width === 75 ? 'is-active' : ''}" data-width="75" type="button">75%</button>
                  <button class="vault-embed-btn ${width === 100 ? 'is-active' : ''}" data-width="100" type="button">100%</button>
                  <span class="vault-embed-sep"></span>
                  <button class="vault-link-convert-trigger vault-embed-btn" title="Convert embed format" type="button">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
                  </button>
                  <a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" class="vault-embed-btn vault-yt-outlink" title="Open on YouTube">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                    <span style="font-size:11px;margin-left:4px;">Open on YouTube</span>
                  </a>
                  <button class="vault-embed-btn vault-embed-delete" type="button" title="Delete embed">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                  </button>
                </div>
              </div>
            </div>
          </div>
        `.trim();
      }

      return `
        <div class="vault-block vault-embed-block" data-block-id="${id}" data-block-type="embed" data-url="${escapeHtml(url)}" data-provider="${escapeHtml(provider)}" data-width="${width}">
          <div class="vault-embed-container" style="max-width: ${width}%;">
            <div class="vault-embed-wrapper">
              <iframe src="${escapeHtml(embedUrl)}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen loading="lazy"></iframe>
              <div class="vault-embed-toolbar" contenteditable="false">
                <button class="vault-embed-btn ${width === 50 ? 'is-active' : ''}" data-width="50" type="button">50%</button>
                <button class="vault-embed-btn ${width === 75 ? 'is-active' : ''}" data-width="75" type="button">75%</button>
                <button class="vault-embed-btn ${width === 100 ? 'is-active' : ''}" data-width="100" type="button">100%</button>
                <span class="vault-embed-sep"></span>
                <button class="vault-link-convert-trigger vault-embed-btn" title="Convert embed format" type="button">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
                </button>
                <a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" class="vault-embed-btn" title="Open source">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                </a>
                <button class="vault-embed-btn vault-embed-delete" type="button" title="Delete embed">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                </button>
              </div>
            </div>
          </div>
        </div>
      `.trim();
    },

    /**
     * Renders standard inline URL link with real anchor and separate convert trigger
     */
    renderUrlHtml(url, text = '') {
      const displayText = text || url;
      return `
        <span class="vault-link-wrapper" data-link-type="url" data-url="${escapeHtml(url)}" data-title="${escapeHtml(displayText)}" contenteditable="false">
          <a href="${escapeHtml(url)}" class="editor-link" target="_blank" rel="noopener noreferrer" tabindex="0" title="${escapeHtml(url)}">${escapeHtml(displayText)}</a>
          <button class="vault-link-convert-trigger" title="Convert link format" type="button" tabindex="-1">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
          </button>
        </span>&nbsp;
      `.trim();
    },

    /**
     * Renders Internal Entity Mention Pill (@note, @task, @project, @research)
     */
    renderEntityMentionHtml(entityType, entityId, title) {
      let iconSvg = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/></svg>';
      if (entityType === 'note') {
        iconSvg = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z"/><path d="M6 6h10"/><path d="M6 10h10"/></svg>';
      } else if (entityType === 'task') {
        iconSvg = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="18" height="18" x="3" y="3" rx="2"/><polyline points="9 11 12 14 22 4"/></svg>';
      } else if (entityType === 'project') {
        iconSvg = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>';
      } else if (entityType === 'research') {
        iconSvg = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>';
      }

      return `
        <span class="entity-mention-pill" data-entity-type="${escapeHtml(entityType)}" data-entity-id="${escapeHtml(String(entityId))}" data-title="${escapeHtml(title)}" contenteditable="false">
          <span class="entity-mention-icon">${iconSvg}</span>
          <span class="entity-mention-title">${escapeHtml(title)}</span>
        </span>&nbsp;
      `.trim();
    },

    /**
     * Measures range even if collapsed using a temporary zero-width probe
     */
    measureRangeRect(range) {
      if (!range) return null;
      try {
        const r = range.getBoundingClientRect();
        if (r && (r.width > 0 || r.height > 0 || r.top > 0 || r.left > 0)) {
          return r;
        }
        // Collapsed caret probe
        const probe = document.createElement('span');
        probe.style.display = 'inline-block';
        probe.style.width = '1px';
        probe.style.height = '1em';
        probe.style.position = 'relative';
        probe.style.verticalAlign = 'baseline';
        probe.textContent = '\uFEFF';
        const clone = range.cloneRange();
        clone.insertNode(probe);
        const probeRect = probe.getBoundingClientRect();
        if (probe.parentNode) probe.parentNode.removeChild(probe);
        if (probeRect && (probeRect.top > 0 || probeRect.left > 0 || probeRect.height > 0)) {
          return probeRect;
        }
      } catch (err) {
        // Fallback gracefully
      }
      return null;
    },

    /**
     * Computes the bounding client rect of an anchor from options
     */
    computeAnchorRect(options = {}) {
      if (options.anchorRect && (options.anchorRect.top > 0 || options.anchorRect.bottom > 0 || options.anchorRect.left > 0)) {
        return options.anchorRect;
      }
      if (options.range) {
        const r = this.measureRangeRect(options.range);
        if (r) return r;
      }
      if (options.anchorEl && typeof options.anchorEl.getBoundingClientRect === 'function') {
        return options.anchorEl.getBoundingClientRect();
      }
      if (options.x !== undefined && options.y !== undefined && (options.x > 0 || options.y > 0)) {
        return {
          top: options.y - 16,
          bottom: options.y,
          left: options.x,
          right: options.x + 20,
          width: 20,
          height: 16
        };
      }
      // Fallback: active editor canvas or viewport center
      const canvas = document.querySelector('.vault-canvas-body') || document.querySelector('.vault-panel-editor');
      if (canvas) {
        const cRect = canvas.getBoundingClientRect();
        return {
          top: cRect.top + 60,
          bottom: cRect.top + 84,
          left: cRect.left + 40,
          right: cRect.left + 160,
          width: 120,
          height: 24
        };
      }
      return {
        top: window.innerHeight / 2 - 20,
        bottom: window.innerHeight / 2,
        left: window.innerWidth / 2 - 140,
        right: window.innerWidth / 2 + 140,
        width: 280,
        height: 20
      };
    },

    /**
     * Positions a fixed popover relative to anchorRect
     * - Default below anchor (+8px gap)
     * - Flips above if insufficient room below
     * - Clamps within viewport with >= 12px margin
     * - Returns 'offscreen' if anchor is completely scrolled out of viewport
     */
    positionPopover(menu, anchorRect) {
      if (!menu || !anchorRect) return 'error';

      const menuWidth = menu.offsetWidth || 280;
      const menuHeight = menu.offsetHeight || 220;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const margin = 12;
      const gap = 8;

      // Check if anchor is scrolled completely outside viewport
      if (anchorRect.bottom < 0 || anchorRect.top > vh) {
        return 'offscreen';
      }

      const spaceBelow = vh - anchorRect.bottom - margin;
      const spaceAbove = anchorRect.top - margin;

      let top;
      let placement = 'bottom';

      if (spaceBelow >= menuHeight + gap) {
        // Preferred: below
        top = anchorRect.bottom + gap;
        placement = 'bottom';
      } else if (spaceAbove >= menuHeight + gap) {
        // Flip: above
        top = anchorRect.top - menuHeight - gap;
        placement = 'top';
      } else {
        // Constrained vertical space: pick side with more space
        if (spaceAbove > spaceBelow) {
          top = Math.max(margin, anchorRect.top - menuHeight - gap);
          placement = 'top';
        } else {
          top = Math.min(vh - menuHeight - margin, anchorRect.bottom + gap);
          placement = 'bottom';
        }
      }

      // Horizontal alignment: align with anchorRect.left
      let left = anchorRect.left;
      // If right edge exceeds viewport margin, shift left
      if (left + menuWidth + margin > vw) {
        left = vw - menuWidth - margin;
      }
      // If left edge is less than margin, clamp to margin
      if (left < margin) {
        left = margin;
      }

      menu.style.position = 'fixed';
      menu.style.top = `${Math.round(top)}px`;
      menu.style.left = `${Math.round(left)}px`;
      menu.setAttribute('data-placement', placement);

      return placement;
    },

    /**
     * Shows Notion-style "Paste as" Menu (Mention, Bookmark, Embed, URL)
     */
    showPasteAsMenu(options = {}) {
      const { url, onSelect, onCancel } = options;
      this.closePasteMenu();

      const detected = this.detectProvider(url);
      const isEmbedAllowed = !!(detected && detected.isEmbeddable);
      const embedReason = (detected && detected.reason) ? detected.reason : 'Embedding not supported for this domain';

      let embedDesc = 'Interactive embed (Not supported)';
      if (isEmbedAllowed) {
        embedDesc = `Interactive ${detected.name} player`;
      } else if (detected && detected.provider === 'youtube') {
        embedDesc = 'Interactive embed (Specific video URL required)';
      } else if (detected && detected.provider === 'vimeo') {
        embedDesc = 'Interactive embed (Specific video ID required)';
      }

      const menu = document.createElement('div');
      menu.id = 'vault-paste-as-menu';
      menu.className = 'vault-paste-as-menu';
      menu.setAttribute('role', 'menu');

      menu.innerHTML = `
        <div class="paste-as-header">Paste as</div>
        <button class="paste-as-item vault-paste-choice is-selected" data-choice="mention" type="button">
          <div class="paste-as-item-left">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4"/><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8"/></svg>
            <div>
              <div class="paste-as-name vault-paste-choice-title">Mention</div>
              <div class="paste-as-desc">Compact inline reference chip</div>
            </div>
          </div>
          <kbd>1</kbd>
        </button>
        <button class="paste-as-item vault-paste-choice" data-choice="bookmark" type="button">
          <div class="paste-as-item-left">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
            <div>
              <div class="paste-as-name vault-paste-choice-title">Bookmark</div>
              <div class="paste-as-desc">Visual card with title and preview</div>
            </div>
          </div>
          <kbd>2</kbd>
        </button>
        <button class="paste-as-item vault-paste-choice ${!isEmbedAllowed ? 'is-disabled' : ''}" data-choice="embed" type="button" ${!isEmbedAllowed ? `title="${escapeHtml(embedReason)}" aria-disabled="true"` : ''}>
          <div class="paste-as-item-left">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
            <div>
              <div class="paste-as-name vault-paste-choice-title">Embed</div>
              <div class="paste-as-desc">${escapeHtml(embedDesc)}</div>
            </div>
          </div>
          <kbd>3</kbd>
        </button>
        <button class="paste-as-item vault-paste-choice" data-choice="url" type="button">
          <div class="paste-as-item-left">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
            <div>
              <div class="paste-as-name vault-paste-choice-title">URL</div>
              <div class="paste-as-desc">Standard text hyperlink</div>
            </div>
          </div>
          <kbd>4</kbd>
        </button>
      `;

      document.body.appendChild(menu);

      // Compute and apply initial position
      const initialRect = this.computeAnchorRect(options);
      this.positionPopover(menu, initialRect);

      const items = Array.from(menu.querySelectorAll('.paste-as-item:not(.is-disabled)'));

      const self = this;
      function getLiveRect() {
        if (options.range) {
          const r = self.measureRangeRect(options.range);
          if (r) return r;
        }
        if (options.anchorEl && typeof options.anchorEl.getBoundingClientRect === 'function') {
          return options.anchorEl.getBoundingClientRect();
        }
        return initialRect;
      }

      function updatePosition() {
        if (!document.body.contains(menu)) return;
        const liveRect = getLiveRect();
        const res = self.positionPopover(menu, liveRect);
        if (res === 'offscreen') {
          cleanupListeners();
          menu.remove();
          if (onCancel) onCancel();
        }
      }

      function cleanupListeners() {
        document.removeEventListener('keydown', handleKeyNav);
        document.removeEventListener('click', handleOutsideClick);
        document.removeEventListener('scroll', updatePosition, true);
        window.removeEventListener('resize', updatePosition);
        self._activePasteCleanup = null;
      }
      self._activePasteCleanup = cleanupListeners;

      function selectChoice(choice) {
        if (choice === 'embed' && !isEmbedAllowed) return;
        cleanupListeners();
        menu.remove();
        if (onSelect) onSelect(choice);
      }

      items.forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          const choice = btn.getAttribute('data-choice');
          selectChoice(choice);
        });
      });

      function handleKeyNav(e) {
        if (e.key === 'Escape') {
          e.preventDefault();
          cleanupListeners();
          menu.remove();
          if (onCancel) onCancel();
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
          if (selIdx >= 0 && items[selIdx]) {
            const choice = items[selIdx].getAttribute('data-choice');
            selectChoice(choice);
          }
        } else if (['1', '2', '3', '4'].includes(e.key)) {
          const map = { '1': 'mention', '2': 'bookmark', '3': 'embed', '4': 'url' };
          const chosen = map[e.key];
          if (chosen === 'embed' && !isEmbedAllowed) return;
          e.preventDefault();
          selectChoice(chosen);
        }
      }

      function handleOutsideClick(e) {
        if (!menu.contains(e.target)) {
          cleanupListeners();
          menu.remove();
          if (onCancel) onCancel();
        }
      }

      document.addEventListener('scroll', updatePosition, { capture: true, passive: true });
      window.addEventListener('resize', updatePosition);
      setTimeout(() => {
        document.addEventListener('keydown', handleKeyNav);
        document.addEventListener('click', handleOutsideClick);
      }, 10);
    },

    closePasteMenu() {
      if (this._activePasteCleanup) {
        this._activePasteCleanup();
      }
      const existing = document.getElementById('vault-paste-as-menu');
      if (existing) existing.remove();
    },

    /**
     * Shows Link Conversion Contextual Menu (Change between Mention, Bookmark, Embed, URL)
     */
    showLinkConvertMenu(options = {}) {
      const { anchorEl, currentType, url, onConvert } = options;
      this.closeConvertMenu();

      const menu = document.createElement('div');
      menu.id = 'vault-link-convert-menu';
      menu.className = 'vault-link-convert-menu';

      const detected = this.detectProvider(url);
      const isEmbedAllowed = !!(detected && detected.isEmbeddable);

      menu.innerHTML = `
        <div class="paste-as-header">Convert link to</div>
        ${currentType !== 'mention' ? `
          <button class="paste-as-item vault-convert-choice" data-to="mention" data-type="mention" type="button">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4"/><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8"/></svg>
            <span>Mention</span>
          </button>
        ` : ''}
        ${currentType !== 'bookmark' ? `
          <button class="paste-as-item vault-convert-choice" data-to="bookmark" data-type="bookmark" type="button">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
            <span>Bookmark</span>
          </button>
        ` : ''}
        ${currentType !== 'embed' && isEmbedAllowed ? `
          <button class="paste-as-item vault-convert-choice" data-to="embed" data-type="embed" type="button">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
            <span>Embed</span>
          </button>
        ` : ''}
        ${currentType !== 'url' ? `
          <button class="paste-as-item vault-convert-choice" data-to="url" data-type="url" type="button">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
            <span>URL</span>
          </button>
        ` : ''}
        <div style="height:1px;background:var(--border-primary);margin:3px 0;"></div>
        <a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" class="paste-as-item" style="text-decoration:none;">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
          <span>Open Link</span>
        </a>
      `;

      document.body.appendChild(menu);

      const self = this;
      function updateConvertPos() {
        if (!document.body.contains(menu) || !anchorEl) return;
        const rect = anchorEl.getBoundingClientRect();
        const res = self.positionPopover(menu, rect);
        if (res === 'offscreen') {
          cleanupConvert();
          menu.remove();
        }
      }

      function cleanupConvert() {
        document.removeEventListener('scroll', updateConvertPos, true);
        window.removeEventListener('resize', updateConvertPos);
        document.removeEventListener('click', handleOut);
        self._activeConvertCleanup = null;
      }
      self._activeConvertCleanup = cleanupConvert;

      this.positionPopover(menu, anchorEl.getBoundingClientRect());
      document.addEventListener('scroll', updateConvertPos, { capture: true, passive: true });
      window.addEventListener('resize', updateConvertPos);

      menu.querySelectorAll('.paste-as-item[data-to]').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          const targetFormat = btn.getAttribute('data-to');
          cleanupConvert();
          menu.remove();
          if (onConvert) onConvert(targetFormat);
        });
      });

      function handleOut(e) {
        if (!menu.contains(e.target) && !anchorEl.contains(e.target)) {
          cleanupConvert();
          menu.remove();
        }
      }
      setTimeout(() => document.addEventListener('click', handleOut), 20);
    },

    closeConvertMenu() {
      if (this._activeConvertCleanup) {
        this._activeConvertCleanup();
      }
      const existing = document.getElementById('vault-link-convert-menu');
      if (existing) existing.remove();
    },

    /**
     * Shows @ Entity Mention Autocomplete Popover
     */
    async showEntityMentionMenu(options = {}) {
      const { query, onSelect, onCancel } = options;
      this.closeEntityMenu();

      const menu = document.createElement('div');
      menu.id = 'vault-entity-mention-menu';
      menu.className = 'vault-entity-mention-menu';

      menu.innerHTML = `
        <div class="entity-mention-header">Mention Entity</div>
        <div class="entity-mention-list" id="vault-entity-mention-items">
          <div style="padding: 10px; text-align: center; color: var(--text-tertiary); font-size: 11px;">Searching workspace...</div>
        </div>
      `;

      document.body.appendChild(menu);

      const initialRect = this.computeAnchorRect(options);
      this.positionPopover(menu, initialRect);

      const self = this;
      function getLiveMentionRect() {
        if (options.range) {
          const r = self.measureRangeRect(options.range);
          if (r) return r;
        }
        if (options.anchorEl && typeof options.anchorEl.getBoundingClientRect === 'function') {
          return options.anchorEl.getBoundingClientRect();
        }
        return initialRect;
      }

      function updateMentionPos() {
        if (!document.body.contains(menu)) return;
        const liveRect = getLiveMentionRect();
        const res = self.positionPopover(menu, liveRect);
        if (res === 'offscreen') {
          cleanupMention();
          menu.remove();
          if (onCancel) onCancel();
        }
      }

      function cleanupMention() {
        document.removeEventListener('keydown', handleKey);
        document.removeEventListener('click', handleOutClick);
        document.removeEventListener('scroll', updateMentionPos, true);
        window.removeEventListener('resize', updateMentionPos);
        self._activeEntityCleanup = null;
      }
      self._activeEntityCleanup = cleanupMention;

      document.addEventListener('scroll', updateMentionPos, { capture: true, passive: true });
      window.addEventListener('resize', updateMentionPos);

      const listContainer = menu.querySelector('#vault-entity-mention-items');
      const cleanQ = (query || '').toLowerCase().trim();

      // Fetch accessible entities
      const token = localStorage.getItem('flowden_token');
      const headers = token ? { 'Authorization': `Bearer ${token}` } : {};

      let entities = [];
      try {
        const [notesRes, tasksRes, projRes] = await Promise.all([
          fetch('/api/v1/notes', { headers }).then(r => r.ok ? r.json() : {}),
          fetch('/api/v1/tasks', { headers }).then(r => r.ok ? r.json() : {}),
          fetch('/api/v1/projects', { headers }).then(r => r.ok ? r.json() : {})
        ]);

        const notes = (notesRes.notes || []).map(n => ({ type: 'note', id: n.id, title: n.title || 'Untitled Note', subtitle: 'Knowledge Note' }));
        const tasks = (tasksRes.tasks || []).map(t => ({ type: 'task', id: t.id, title: t.title || 'Workflow Task', subtitle: `Task (${t.status || 'planned'})` }));
        const projs = (projRes.projects || []).map(p => ({ type: 'project', id: p.id, title: p.title || 'Project', subtitle: 'Project Workspace' }));

        entities = [...notes, ...tasks, ...projs];
      } catch (e) {
        entities = [];
      }

      const filtered = entities.filter(ent => !cleanQ || ent.title.toLowerCase().includes(cleanQ)).slice(0, 8);

      if (filtered.length === 0) {
        listContainer.innerHTML = '<div style="padding: 10px; text-align: center; color: var(--text-tertiary); font-size: 11px;">No matching entities</div>';
        return;
      }

      listContainer.innerHTML = filtered.map((ent, idx) => {
        let iconSvg = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/></svg>';
        if (ent.type === 'note') {
          iconSvg = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z"/><path d="M6 6h10"/><path d="M6 10h10"/></svg>';
        } else if (ent.type === 'task') {
          iconSvg = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="18" height="18" x="3" y="3" rx="2"/><polyline points="9 11 12 14 22 4"/></svg>';
        } else if (ent.type === 'project') {
          iconSvg = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>';
        }

        return `
          <button class="entity-mention-item vault-entity-item ${idx === 0 ? 'is-selected' : ''}" data-idx="${idx}" data-type="${ent.type}" data-id="${ent.id}" type="button">
            <span class="entity-mention-item-icon">${iconSvg}</span>
            <div class="entity-mention-item-text">
              <span class="entity-mention-item-name vault-entity-title">${escapeHtml(ent.title)}</span>
              <span class="entity-mention-item-type">${escapeHtml(ent.subtitle)}</span>
            </div>
          </button>
        `;
      }).join('');

      const items = Array.from(listContainer.querySelectorAll('.entity-mention-item'));

      function selectEntity(idx) {
        const ent = filtered[idx];
        menu.remove();
        cleanup();
        if (ent && onSelect) onSelect(ent);
      }

      items.forEach((btn, idx) => {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          selectEntity(idx);
        });
      });

      function handleKey(e) {
        if (e.key === 'Escape') {
          e.preventDefault();
          menu.remove();
          cleanup();
          if (onCancel) onCancel();
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
          if (selIdx >= 0) selectEntity(selIdx);
        }
      }

      function handleOutClick(e) {
        if (!menu.contains(e.target)) {
          menu.remove();
          cleanup();
          if (onCancel) onCancel();
        }
      }

      function cleanup() {
        document.removeEventListener('keydown', handleKey);
        document.removeEventListener('click', handleOutClick);
        cleanupMention();
      }

      setTimeout(() => {
        document.addEventListener('keydown', handleKey);
        document.addEventListener('click', handleOutClick);
      }, 10);
    },

    closeEntityMenu() {
      if (this._activeEntityCleanup) {
        this._activeEntityCleanup();
      }
      const existing = document.getElementById('vault-entity-mention-menu');
      if (existing) existing.remove();
    },

    /**
     * Attaches Notion-style smart paste and @ mention listeners to standard HTML textareas
     */
    attachToTextarea(textareaEl, options = {}) {
      if (!textareaEl || textareaEl.dataset.smartLinkAttached) return;
      textareaEl.dataset.smartLinkAttached = 'true';

      function insertTextAtCursor(ta, text) {
        const start = ta.selectionStart || 0;
        const end = ta.selectionEnd || 0;
        const val = ta.value;
        ta.value = val.substring(0, start) + text + val.substring(end);
        ta.selectionStart = ta.selectionEnd = start + text.length;
        ta.dispatchEvent(new Event('input', { bubbles: true }));
        ta.focus();
      }

      function getTextareaAnchorRect(ta) {
        const rect = ta.getBoundingClientRect();
        return {
          left: rect.left + 16,
          right: rect.left + 200,
          bottom: Math.min(window.innerHeight - 60, rect.top + 40),
          top: rect.top + 16,
          width: 184,
          height: 24
        };
      }

      textareaEl.addEventListener('paste', (e) => {
        const pasted = (e.clipboardData || window.clipboardData)?.getData('text') || '';
        const trimmed = pasted.trim();
        if (/^https?:\/\/[^\s]+$/i.test(trimmed)) {
          e.preventDefault();
          const rect = getTextareaAnchorRect(textareaEl);
          SmartLinkHandler.showPasteAsMenu({
            url: trimmed,
            anchorRect: rect,
            anchorEl: textareaEl,
            onSelect: (choice) => {
              if (choice === 'url') {
                insertTextAtCursor(textareaEl, trimmed);
              } else if (choice === 'mention') {
                insertTextAtCursor(textareaEl, `[mention: ${trimmed}](${trimmed})`);
              } else if (choice === 'bookmark') {
                insertTextAtCursor(textareaEl, `\n[bookmark: ${trimmed}](${trimmed})\n`);
              } else if (choice === 'embed') {
                insertTextAtCursor(textareaEl, `\n[embed: embed](${trimmed})\n`);
              }
            },
            onCancel: () => {
              insertTextAtCursor(textareaEl, trimmed);
            }
          });
        }
      });

      textareaEl.addEventListener('keydown', (e) => {
        if (e.key === '@') {
          setTimeout(() => {
            const rect = getTextareaAnchorRect(textareaEl);
            SmartLinkHandler.showEntityMentionMenu({
              query: '',
              anchorRect: rect,
              anchorEl: textareaEl,
              onSelect: (entity) => {
                insertTextAtCursor(textareaEl, `[@${entity.type}:${entity.id}:${entity.title}]`);
              }
            });
          }, 10);
        }
      });
    },

    /**
     * Transforms smart link & entity markdown markers into HTML chips and mentions
     */
    renderMarkdownLinks(text) {
      if (!text || typeof text !== 'string') return text || '';
      let out = text.replace(/\[@(note|task|project|research):(\d+):([^\]]+)\]/g, (m, type, id, title) => {
        return this.renderEntityMentionHtml(type, id, title);
      });
      out = out.replace(/\[mention:\s*(.*?)\]\((https?:\/\/[^\s\)]+)\)/gi, (m, title, url) => {
        return this.renderMentionHtml(url, { title: title || url });
      });
      out = out.replace(/\[bookmark:\s*(.*?)\]\((https?:\/\/[^\s\)]+)(?:\s+"(.*?)")?\)/gi, (m, title, url, desc) => {
        return `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" class="vault-link-mention" title="${escapeHtml(title || url)}">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
          <span>${escapeHtml(title || url)}</span>
        </a>`;
      });
      out = out.replace(/\[embed:\s*(.*?)\]\((https?:\/\/[^\s\)]+)\)/gi, (m, provider, url) => {
        return `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" class="vault-link-mention">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>
          <span>${escapeHtml(provider || 'Embed')}: ${escapeHtml(url)}</span>
        </a>`;
      });
      return out;
    }
  };

  // Delegated click handler for Entity Mentions across the whole application
  document.addEventListener('click', (e) => {
    const mention = e.target.closest('.entity-mention-pill');
    if (mention) {
      e.preventDefault();
      const type = mention.getAttribute('data-entity-type');
      const id = mention.getAttribute('data-entity-id');

      if (type === 'note') {
        window.location.hash = `#/vault/${id}`;
      } else if (type === 'task') {
        window.location.hash = '#/workflow';
      } else if (type === 'project') {
        window.location.hash = `#/projects/${id}`;
      } else if (type === 'research') {
        window.location.hash = '#/research';
      }
    }
  });

  window.SmartLinkHandler = SmartLinkHandler;
})();
