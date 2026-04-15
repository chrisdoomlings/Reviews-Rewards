/**
 * Doomlings Product Reviews Widget
 * Storefront theme app block — no framework dependencies.
 *
 * Mounts on: <div data-doomlings-reviews ...>
 * APIs used:
 *   GET  {appUrl}/api/reviews/product/{productId}?shop=&page=&limit=
 *   POST {appUrl}/api/reviews
 *   POST {appUrl}/api/reviews/presign
 *
 * NOTE: The R2 bucket must have a CORS rule allowing PUT from * (or the shop domain)
 * for browser-direct photo/video uploads to succeed.
 */

(function () {
  'use strict';

  // ─── CSS ───────────────────────────────────────────────────────────────────

  var CSS = [
    '.dl-reviews{font-family:inherit;--dl-accent:#c41b1b;color:inherit;padding-inline:var(--page-padding,1.6rem)}',
    '.dl-reviews *{box-sizing:border-box}',

    /* Summary */
    '.dl-reviews__summary{display:flex;align-items:center;gap:24px;padding:20px 0;border-bottom:1px solid #e5e7eb;flex-wrap:wrap}',
    '.dl-reviews__avg{font-size:52px;font-weight:800;line-height:1;color:var(--dl-accent)}',
    '.dl-reviews__avg-meta{display:flex;flex-direction:column;gap:4px}',
    '.dl-reviews__stars-row{display:flex;align-items:center;gap:6px}',
    '.dl-reviews__stars{color:#f59e0b;font-size:18px;letter-spacing:1px}',
    '.dl-reviews__count{font-size:13px;color:#6b7280}',
    '.dl-reviews__dist{flex:1;min-width:160px;max-width:360px;display:flex;flex-direction:column;gap:4px}',
    '.dl-reviews__dist-row{display:flex;align-items:center;gap:8px;font-size:12px;color:#6b7280}',
    '.dl-reviews__dist-track{flex:1;height:6px;background:#e5e7eb;border-radius:99px;overflow:hidden}',
    '.dl-reviews__dist-fill{height:100%;background:var(--dl-accent);border-radius:99px;transition:width .3s}',

    /* List */
    '.dl-reviews__list{margin:0;padding:0;list-style:none}',
    '.dl-reviews__card{padding:20px 0;border-bottom:1px solid #e5e7eb}',
    '.dl-reviews__card-header{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:8px;flex-wrap:wrap}',
    '.dl-reviews__card-meta{display:flex;flex-wrap:wrap;align-items:center;gap:8px;font-size:13px;color:#6b7280}',
    '.dl-reviews__verified{background:#dcfce7;color:#166534;font-size:11px;font-weight:600;padding:2px 8px;border-radius:99px}',
    '.dl-reviews__card-title{font-size:15px;font-weight:700;margin:0 0 6px}',
    '.dl-reviews__card-body{font-size:14px;line-height:1.6;margin:0 0 12px;white-space:pre-wrap}',
    '.dl-reviews__photos{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px}',
    '.dl-reviews__photo{width:72px;height:72px;object-fit:cover;border-radius:6px;cursor:pointer;border:1px solid #e5e7eb}',
    '.dl-reviews__video{width:100%;max-width:360px;border-radius:8px;margin-bottom:12px;background:#000}',
    '.dl-reviews__admin-reply{background:#f9fafb;border-left:3px solid var(--dl-accent);padding:10px 14px;border-radius:0 6px 6px 0;margin-top:8px}',
    '.dl-reviews__admin-reply-label{font-size:11px;font-weight:700;color:var(--dl-accent);text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px}',
    '.dl-reviews__admin-reply-body{font-size:13px;line-height:1.5;margin:0}',

    /* Write-review toggle */
    '.dl-reviews__write-btn{display:inline-flex;align-items:center;gap:6px;padding:10px 20px;background:var(--dl-accent);color:#fff;border:none;border-radius:6px;font-size:14px;font-weight:600;cursor:pointer;margin:20px 0}',
    '.dl-reviews__write-btn:hover{opacity:.9}',

    /* Form */
    '.dl-reviews__form{background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:24px;margin:16px 0}',
    '.dl-reviews__form h3{margin:0 0 16px;font-size:16px}',
    '.dl-reviews__field{margin-bottom:14px}',
    '.dl-reviews__label{display:block;font-size:13px;font-weight:600;margin-bottom:6px}',
    '.dl-reviews__input,.dl-reviews__textarea{width:100%;padding:9px 12px;border:1px solid #d1d5db;border-radius:6px;font-size:14px;font-family:inherit;background:#fff}',
    '.dl-reviews__input:focus,.dl-reviews__textarea:focus{outline:2px solid var(--dl-accent);outline-offset:1px;border-color:transparent}',
    '.dl-reviews__textarea{min-height:90px;resize:vertical}',

    /* Star picker */
    '.dl-reviews__star-picker{display:flex;gap:6px;font-size:32px;cursor:pointer;user-select:none}',
    '.dl-reviews__star-opt{color:#d1d5db;transition:color .1s}',
    '.dl-reviews__star-opt.active{color:#f59e0b}',

    /* File uploads */
    '.dl-reviews__file-btn{display:inline-flex;align-items:center;gap:6px;padding:8px 14px;border:1px dashed #d1d5db;border-radius:6px;font-size:13px;cursor:pointer;background:#fff}',
    '.dl-reviews__file-btn:hover{border-color:var(--dl-accent);color:var(--dl-accent)}',
    '.dl-reviews__thumbs{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}',
    '.dl-reviews__thumb{position:relative;width:64px;height:64px}',
    '.dl-reviews__thumb img{width:100%;height:100%;object-fit:cover;border-radius:6px;border:1px solid #e5e7eb}',
    '.dl-reviews__thumb-rm{position:absolute;top:-6px;right:-6px;width:18px;height:18px;border-radius:50%;background:#ef4444;color:#fff;border:none;font-size:12px;line-height:18px;text-align:center;cursor:pointer;padding:0}',
    '.dl-reviews__video-name{font-size:12px;color:#6b7280;margin-top:6px}',

    /* Submit */
    '.dl-reviews__submit{padding:10px 24px;background:var(--dl-accent);color:#fff;border:none;border-radius:6px;font-size:14px;font-weight:600;cursor:pointer;margin-top:4px}',
    '.dl-reviews__submit:hover{opacity:.9}',
    '.dl-reviews__submit:disabled{opacity:.5;cursor:not-allowed}',
    '.dl-reviews__cancel{padding:10px 16px;background:transparent;border:1px solid #d1d5db;border-radius:6px;font-size:14px;cursor:pointer;margin-top:4px;margin-left:8px}',
    '.dl-reviews__msg{font-size:13px;margin-top:10px;padding:10px;border-radius:6px}',
    '.dl-reviews__msg--ok{background:#dcfce7;color:#166534}',
    '.dl-reviews__msg--err{background:#fee2e2;color:#991b1b}',

    /* Pagination */
    '.dl-reviews__pagination{display:flex;align-items:center;justify-content:space-between;padding:16px 0;gap:12px;font-size:13px;color:#6b7280}',
    '.dl-reviews__page-btn{padding:7px 16px;border:1px solid #d1d5db;border-radius:6px;background:#fff;font-size:13px;cursor:pointer}',
    '.dl-reviews__page-btn:hover:not(:disabled){border-color:var(--dl-accent);color:var(--dl-accent)}',
    '.dl-reviews__page-btn:disabled{opacity:.4;cursor:not-allowed}',

    '.dl-reviews__already-reviewed{margin:20px 0 4px;font-size:13px;color:#166534;background:#dcfce7;padding:10px 14px;border-radius:6px}',
    '.dl-reviews__empty{padding:28px 0;text-align:center;color:#9ca3af;font-size:14px}',
    '.dl-reviews__loading-msg{padding:20px 0;color:#9ca3af;font-size:14px}',

    /* Lightbox */
    '.dl-lightbox{position:fixed;inset:0;background:rgba(0,0,0,.92);z-index:99999;display:flex;align-items:center;justify-content:center;opacity:0;transition:opacity .2s;pointer-events:none}',
    '.dl-lightbox.dl-lightbox--open{opacity:1;pointer-events:all}',
    '.dl-lightbox__img{max-width:min(90vw,960px);max-height:85vh;object-fit:contain;border-radius:4px;display:block;transition:opacity .15s;user-select:none}',
    '.dl-lightbox__img.dl-lightbox__img--fade{opacity:0}',
    '.dl-lightbox__close{position:absolute;top:16px;right:16px;background:rgba(255,255,255,.15);border:none;color:#fff;width:38px;height:38px;border-radius:50%;font-size:22px;cursor:pointer;display:flex;align-items:center;justify-content:center;line-height:1}',
    '.dl-lightbox__close:hover,.dl-lightbox__arrow:hover{background:rgba(255,255,255,.3)}',
    '.dl-lightbox__arrow{position:absolute;top:50%;transform:translateY(-50%);background:rgba(255,255,255,.15);border:none;color:#fff;width:44px;height:44px;border-radius:50%;font-size:26px;cursor:pointer;display:flex;align-items:center;justify-content:center}',
    '.dl-lightbox__arrow--prev{left:16px}',
    '.dl-lightbox__arrow--next{right:16px}',
    '.dl-lightbox__counter{position:absolute;bottom:20px;left:50%;transform:translateX(-50%);color:rgba(255,255,255,.75);font-size:13px;background:rgba(0,0,0,.4);padding:4px 14px;border-radius:99px;white-space:nowrap}',
  ].join('');

  // ─── Helpers ───────────────────────────────────────────────────────────────

  function injectCss(id, css) {
    if (document.getElementById(id)) return;
    var s = document.createElement('style');
    s.id = id;
    s.textContent = css;
    document.head.appendChild(s);
  }

  /** Escape a string for safe innerHTML insertion. */
  function esc(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /** Render N filled/empty star characters. */
  function starsHtml(rating, total) {
    total = total || 5;
    var html = '';
    for (var i = 1; i <= total; i++) {
      html += i <= Math.round(rating) ? '★' : '☆';
    }
    return html;
  }

  function formatDate(iso) {
    try {
      return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    } catch (e) {
      return iso;
    }
  }

  // ─── Lightbox singleton ────────────────────────────────────────────────────

  var _lightboxInstance = null;

  function getLightbox() {
    if (_lightboxInstance) return _lightboxInstance;

    var overlay  = document.createElement('div');
    var img      = document.createElement('img');
    var closeBtn = document.createElement('button');
    var prevBtn  = document.createElement('button');
    var nextBtn  = document.createElement('button');
    var counter  = document.createElement('div');

    overlay.className  = 'dl-lightbox';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    img.className      = 'dl-lightbox__img';
    img.alt            = 'Review photo';
    closeBtn.className = 'dl-lightbox__close';
    closeBtn.setAttribute('aria-label', 'Close');
    closeBtn.innerHTML = '&times;';
    prevBtn.className  = 'dl-lightbox__arrow dl-lightbox__arrow--prev';
    prevBtn.setAttribute('aria-label', 'Previous photo');
    prevBtn.innerHTML  = '&#8249;';
    nextBtn.className  = 'dl-lightbox__arrow dl-lightbox__arrow--next';
    nextBtn.setAttribute('aria-label', 'Next photo');
    nextBtn.innerHTML  = '&#8250;';
    counter.className  = 'dl-lightbox__counter';

    overlay.appendChild(closeBtn);
    overlay.appendChild(prevBtn);
    overlay.appendChild(img);
    overlay.appendChild(nextBtn);
    overlay.appendChild(counter);
    document.body.appendChild(overlay);

    var photos  = [];
    var current = 0;

    function show(index) {
      current = ((index % photos.length) + photos.length) % photos.length;
      img.classList.add('dl-lightbox__img--fade');
      var src = photos[current].url;
      var tmp = new Image();
      tmp.onload = function () {
        img.src = src;
        img.classList.remove('dl-lightbox__img--fade');
      };
      tmp.src = src;
      var single = photos.length <= 1;
      prevBtn.style.display  = single ? 'none' : '';
      nextBtn.style.display  = single ? 'none' : '';
      counter.style.display  = single ? 'none' : '';
      counter.textContent    = (current + 1) + ' \u2f ' + photos.length;
    }

    function close() {
      overlay.classList.remove('dl-lightbox--open');
      document.body.style.overflow = '';
      document.removeEventListener('keydown', onKey);
    }

    function onKey(e) {
      if (e.key === 'Escape')      { close(); }
      if (e.key === 'ArrowLeft')   { show(current - 1); }
      if (e.key === 'ArrowRight')  { show(current + 1); }
    }

    prevBtn.addEventListener('click',  function () { show(current - 1); });
    nextBtn.addEventListener('click',  function () { show(current + 1); });
    closeBtn.addEventListener('click', close);
    overlay.addEventListener('click',  function (e) { if (e.target === overlay) close(); });

    // Touch swipe
    var touchStartX = 0;
    overlay.addEventListener('touchstart', function (e) {
      touchStartX = e.touches[0].clientX;
    }, { passive: true });
    overlay.addEventListener('touchend', function (e) {
      var dx = e.changedTouches[0].clientX - touchStartX;
      if (Math.abs(dx) > 50) { show(dx < 0 ? current + 1 : current - 1); }
    }, { passive: true });

    _lightboxInstance = {
      open: function (photoList, startIndex) {
        photos = photoList;
        show(startIndex || 0);
        overlay.classList.add('dl-lightbox--open');
        document.body.style.overflow = 'hidden';
        document.addEventListener('keydown', onKey);
      },
    };
    return _lightboxInstance;
  }

  // ─── Main widget class ─────────────────────────────────────────────────────

  function ReviewsWidget(el) {
    this.el = el;
    this.cfg = {
      productId:  el.dataset.productId,
      shop:       el.dataset.shop,
      customerId: el.dataset.customerId || null,
      appUrl:     (el.dataset.appUrl || 'https://reviews-rewards.vercel.app').replace(/\/$/, ''),
      perPage:    parseInt(el.dataset.reviewsPerPage || '10', 10),
      showForm:   el.dataset.showForm !== 'false',
      accent:     el.dataset.accentColor || '#c41b1b',
    };
    this.page = 1;
    this.data = null;
    this.formOpen = false;
    this.photoFiles = [];   // { file, objectUrl }
    this.videoFile = null;  // File | null
    this.selectedRating = 0;
    this._init();
  }

  ReviewsWidget.prototype._init = function () {
    injectCss('doomlings-reviews-css', CSS);
    this.el.classList.add('dl-reviews');
    this.el.style.setProperty('--dl-accent', this.cfg.accent);
    this._renderLoading();
    this._fetch();
  };

  ReviewsWidget.prototype._renderLoading = function () {
    this.el.innerHTML = '<p class="dl-reviews__loading-msg">Loading reviews\u2026</p>';
  };

  ReviewsWidget.prototype._fetch = function () {
    var self = this;
    var url = self.cfg.appUrl
      + '/api/reviews/product/' + encodeURIComponent(self.cfg.productId)
      + '?shop=' + encodeURIComponent(self.cfg.shop)
      + '&page=' + self.page
      + '&limit=' + self.cfg.perPage
      + (self.cfg.customerId ? '&customerId=' + encodeURIComponent(self.cfg.customerId) : '');

    fetch(url)
      .then(function (r) { return r.json(); })
      .then(function (data) {
        self.data = data;
        self._render();
      })
      .catch(function () {
        self.el.innerHTML = '<p class="dl-reviews__loading-msg">Could not load reviews.</p>';
      });
  };

  ReviewsWidget.prototype._render = function () {
    var d = this.data;
    var self = this;
    this.el.innerHTML = '';

    // Summary
    if (d.total > 0) {
      this.el.appendChild(this._buildSummary(d));
    }

    // Review list
    var list = document.createElement('ul');
    list.className = 'dl-reviews__list';

    if (d.reviews.length === 0) {
      var empty = document.createElement('li');
      empty.className = 'dl-reviews__empty';
      empty.textContent = 'No reviews yet. Be the first to review this product.';
      list.appendChild(empty);
    } else {
      d.reviews.forEach(function (r) {
        list.appendChild(self._buildCard(r));
      });
    }
    this.el.appendChild(list);

    // Pagination
    if (d.total > d.limit) {
      this.el.appendChild(this._buildPagination(d));
    }

    // Write-review button / already-reviewed notice
    if (this.cfg.showForm) {
      if (d.customerHasReviewed) {
        var notice = document.createElement('p');
        notice.className = 'dl-reviews__already-reviewed';
        notice.textContent = 'You\u2019ve already reviewed this product. Thank you!';
        this.el.appendChild(notice);
      } else if (this.formOpen) {
        this.el.appendChild(this._buildForm());
      } else {
        var btn = document.createElement('button');
        btn.className = 'dl-reviews__write-btn';
        btn.textContent = 'Write a Review';
        btn.addEventListener('click', function () {
          self.formOpen = true;
          self._render();
          self.el.querySelector('.dl-reviews__form').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        });
        this.el.appendChild(btn);
      }
    }
  };

  ReviewsWidget.prototype._buildSummary = function (d) {
    var dist = d.ratingDistribution || {};
    var total = d.total || 1;

    var html = '<div class="dl-reviews__avg">' + esc(String(d.avgRating)) + '</div>'
      + '<div class="dl-reviews__avg-meta">'
      + '<div class="dl-reviews__stars-row"><span class="dl-reviews__stars">' + starsHtml(d.avgRating) + '</span></div>'
      + '<div class="dl-reviews__count">' + esc(String(d.total)) + ' review' + (d.total !== 1 ? 's' : '') + '</div>'
      + '</div>'
      + '<div class="dl-reviews__dist">';

    [5, 4, 3, 2, 1].forEach(function (star) {
      var count = dist[String(star)] || 0;
      var pct = total > 0 ? Math.round((count / total) * 100) : 0;
      html += '<div class="dl-reviews__dist-row">'
        + '<span style="min-width:8px">' + star + '</span>'
        + '<span style="color:#f59e0b;font-size:11px">★</span>'
        + '<div class="dl-reviews__dist-track"><div class="dl-reviews__dist-fill" style="width:' + pct + '%"></div></div>'
        + '<span style="min-width:28px;text-align:right">' + count + '</span>'
        + '</div>';
    });

    html += '</div>';

    var wrap = document.createElement('div');
    wrap.className = 'dl-reviews__summary';
    wrap.innerHTML = html;
    return wrap;
  };

  ReviewsWidget.prototype._buildCard = function (r) {
    var li = document.createElement('li');
    li.className = 'dl-reviews__card';

    var headerHtml = '<div class="dl-reviews__card-header">'
      + '<span class="dl-reviews__stars" style="font-size:16px">' + starsHtml(r.rating) + '</span>'
      + '<div class="dl-reviews__card-meta">'
      + '<span>' + esc(r.authorName) + '</span>'
      + '<span>\u00b7</span>'
      + '<span>' + esc(formatDate(r.createdAt)) + '</span>'
      + (r.verifiedPurchase ? '<span class="dl-reviews__verified">Verified Purchase</span>' : '')
      + '</div>'
      + '</div>';

    var bodyHtml = '';
    if (r.title) bodyHtml += '<p class="dl-reviews__card-title">' + esc(r.title) + '</p>';
    if (r.body) bodyHtml += '<p class="dl-reviews__card-body">' + esc(r.body) + '</p>';

    li.innerHTML = headerHtml + bodyHtml;

    // Photos — built as DOM so each gets a click handler for the lightbox
    if (r.photos && r.photos.length > 0) {
      var photosDiv = document.createElement('div');
      photosDiv.className = 'dl-reviews__photos';
      r.photos.forEach(function (p, idx) {
        var imgEl = document.createElement('img');
        imgEl.className = 'dl-reviews__photo';
        imgEl.src = p.url;
        imgEl.alt = 'Review photo ' + (idx + 1);
        imgEl.loading = 'lazy';
        imgEl.style.cursor = 'zoom-in';
        imgEl.addEventListener('click', function () {
          getLightbox().open(r.photos, idx);
        });
        photosDiv.appendChild(imgEl);
      });
      li.appendChild(photosDiv);
    }

    // Video (only status=ready, url present)
    if (r.videos && r.videos.length > 0 && r.videos[0].url) {
      var video = document.createElement('video');
      video.className = 'dl-reviews__video';
      video.src = r.videos[0].url;
      video.controls = true;
      video.preload = 'none';
      li.appendChild(video);
    }

    // Admin reply
    if (r.adminReply) {
      var replyDiv = document.createElement('div');
      replyDiv.className = 'dl-reviews__admin-reply';
      replyDiv.innerHTML = '<div class="dl-reviews__admin-reply-label">Response from Doomlings</div>'
        + '<p class="dl-reviews__admin-reply-body">' + esc(r.adminReply) + '</p>';
      li.appendChild(replyDiv);
    }

    return li;
  };

  ReviewsWidget.prototype._buildPagination = function (d) {
    var self = this;
    var totalPages = Math.ceil(d.total / d.limit);
    var wrap = document.createElement('div');
    wrap.className = 'dl-reviews__pagination';

    var prev = document.createElement('button');
    prev.className = 'dl-reviews__page-btn';
    prev.textContent = '\u2190 Previous';
    prev.disabled = self.page <= 1;
    prev.addEventListener('click', function () {
      if (self.page > 1) { self.page--; self._renderLoading(); self._fetch(); }
    });

    var info = document.createElement('span');
    info.textContent = 'Page ' + self.page + ' of ' + totalPages;

    var next = document.createElement('button');
    next.className = 'dl-reviews__page-btn';
    next.textContent = 'Next \u2192';
    next.disabled = self.page >= totalPages;
    next.addEventListener('click', function () {
      if (self.page < totalPages) { self.page++; self._renderLoading(); self._fetch(); }
    });

    wrap.appendChild(prev);
    wrap.appendChild(info);
    wrap.appendChild(next);
    return wrap;
  };

  // ─── Review submission form ─────────────────────────────────────────────────

  ReviewsWidget.prototype._buildForm = function () {
    var self = this;
    var form = document.createElement('div');
    form.className = 'dl-reviews__form';

    var title = document.createElement('h3');
    title.textContent = 'Write a Review';
    form.appendChild(title);

    // Star picker
    var starField = document.createElement('div');
    starField.className = 'dl-reviews__field';
    var starLabel = document.createElement('label');
    starLabel.className = 'dl-reviews__label';
    starLabel.textContent = 'Your Rating *';
    starField.appendChild(starLabel);

    var picker = document.createElement('div');
    picker.className = 'dl-reviews__star-picker';
    picker.setAttribute('role', 'radiogroup');
    picker.setAttribute('aria-label', 'Star rating');

    var selectedRating = self.selectedRating;

    function renderStars() {
      picker.innerHTML = '';
      for (var i = 1; i <= 5; i++) {
        (function (n) {
          var span = document.createElement('span');
          span.className = 'dl-reviews__star-opt' + (n <= selectedRating ? ' active' : '');
          span.textContent = '★';
          span.dataset.value = String(n);
          span.setAttribute('role', 'radio');
          span.setAttribute('aria-checked', String(n <= selectedRating));
          span.setAttribute('tabindex', '0');
          span.addEventListener('click', function () {
            selectedRating = n;
            self.selectedRating = n;
            renderStars();
          });
          span.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' || e.key === ' ') {
              selectedRating = n;
              self.selectedRating = n;
              renderStars();
            }
          });
          picker.appendChild(span);
        })(i);
      }
    }
    renderStars();
    starField.appendChild(picker);
    form.appendChild(starField);

    // Title
    form.appendChild(self._formField('Review title', 'text', 'dl-review-title', false));
    // Body
    var bodyField = document.createElement('div');
    bodyField.className = 'dl-reviews__field';
    var bodyLabel = document.createElement('label');
    bodyLabel.className = 'dl-reviews__label';
    bodyLabel.textContent = 'Your Review';
    bodyLabel.setAttribute('for', 'dl-review-body');
    var bodyInput = document.createElement('textarea');
    bodyInput.className = 'dl-reviews__textarea';
    bodyInput.id = 'dl-review-body';
    bodyInput.placeholder = 'Share your experience with this product\u2026';
    bodyField.appendChild(bodyLabel);
    bodyField.appendChild(bodyInput);
    form.appendChild(bodyField);

    // Photo upload
    var photoField = document.createElement('div');
    photoField.className = 'dl-reviews__field';
    var photoLabel = document.createElement('label');
    photoLabel.className = 'dl-reviews__label';
    photoLabel.textContent = 'Photos (up to 5)';
    photoField.appendChild(photoLabel);

    var photoBtn = document.createElement('button');
    photoBtn.type = 'button';
    photoBtn.className = 'dl-reviews__file-btn';
    photoBtn.textContent = '+ Add Photos';
    photoField.appendChild(photoBtn);

    var photoInput = document.createElement('input');
    photoInput.type = 'file';
    photoInput.accept = 'image/jpeg,image/png,image/webp,image/gif';
    photoInput.multiple = true;
    photoInput.style.display = 'none';
    photoField.appendChild(photoInput);

    var thumbWrap = document.createElement('div');
    thumbWrap.className = 'dl-reviews__thumbs';
    photoField.appendChild(thumbWrap);

    photoBtn.addEventListener('click', function () { photoInput.click(); });
    photoInput.addEventListener('change', function () {
      var files = Array.from(photoInput.files || []);
      files.forEach(function (file) {
        if (self.photoFiles.length >= 5) return;
        var objUrl = URL.createObjectURL(file);
        self.photoFiles.push({ file: file, objectUrl: objUrl });
      });
      photoInput.value = '';
      renderThumbs();
    });

    function renderThumbs() {
      thumbWrap.innerHTML = '';
      self.photoFiles.forEach(function (item, idx) {
        var wrap = document.createElement('div');
        wrap.className = 'dl-reviews__thumb';
        var img = document.createElement('img');
        img.src = item.objectUrl;
        img.alt = '';
        var rm = document.createElement('button');
        rm.type = 'button';
        rm.className = 'dl-reviews__thumb-rm';
        rm.textContent = '\u00d7';
        rm.setAttribute('aria-label', 'Remove photo');
        rm.addEventListener('click', function () {
          URL.revokeObjectURL(item.objectUrl);
          self.photoFiles.splice(idx, 1);
          renderThumbs();
        });
        wrap.appendChild(img);
        wrap.appendChild(rm);
        thumbWrap.appendChild(wrap);
      });
      photoBtn.style.display = self.photoFiles.length >= 5 ? 'none' : '';
    }
    form.appendChild(photoField);

    // Video upload
    var videoField = document.createElement('div');
    videoField.className = 'dl-reviews__field';
    var videoLabel = document.createElement('label');
    videoLabel.className = 'dl-reviews__label';
    videoLabel.textContent = 'Video review (optional, max 100 MB / 60 s)';
    videoField.appendChild(videoLabel);

    var videoBtn = document.createElement('button');
    videoBtn.type = 'button';
    videoBtn.className = 'dl-reviews__file-btn';
    videoBtn.textContent = '+ Add Video';
    videoField.appendChild(videoBtn);

    var videoInput = document.createElement('input');
    videoInput.type = 'file';
    videoInput.accept = 'video/mp4,video/quicktime,video/webm';
    videoInput.style.display = 'none';
    videoField.appendChild(videoInput);

    var videoName = document.createElement('div');
    videoName.className = 'dl-reviews__video-name';
    videoField.appendChild(videoName);

    videoBtn.addEventListener('click', function () { videoInput.click(); });
    videoInput.addEventListener('change', function () {
      var file = videoInput.files && videoInput.files[0];
      if (!file) return;
      if (file.size > 100 * 1024 * 1024) {
        videoName.textContent = 'Video exceeds 100 MB limit.';
        self.videoFile = null;
        return;
      }
      self.videoFile = file;
      videoName.textContent = file.name + ' (' + (file.size / (1024 * 1024)).toFixed(1) + ' MB)';
      videoBtn.textContent = 'Change Video';
    });
    form.appendChild(videoField);

    // Message area
    var msg = document.createElement('div');
    msg.className = 'dl-reviews__msg';
    msg.style.display = 'none';
    form.appendChild(msg);

    // Action buttons
    var submitBtn = document.createElement('button');
    submitBtn.type = 'button';
    submitBtn.className = 'dl-reviews__submit';
    submitBtn.textContent = 'Submit Review';

    var cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'dl-reviews__cancel';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', function () {
      self.formOpen = false;
      self.selectedRating = 0;
      self.photoFiles = [];
      self.videoFile = null;
      self._render();
    });

    submitBtn.addEventListener('click', function () {
      self._submitReview({
        submitBtn: submitBtn,
        msg: msg,
        titleInput: form.querySelector('#dl-review-title'),
        bodyInput: bodyInput,
      });
    });

    form.appendChild(submitBtn);
    form.appendChild(cancelBtn);
    return form;
  };

  ReviewsWidget.prototype._formField = function (labelText, type, id, required) {
    var field = document.createElement('div');
    field.className = 'dl-reviews__field';
    var label = document.createElement('label');
    label.className = 'dl-reviews__label';
    label.textContent = labelText + (required ? ' *' : '');
    label.setAttribute('for', id);
    var input = document.createElement('input');
    input.type = type;
    input.id = id;
    input.className = 'dl-reviews__input';
    field.appendChild(label);
    field.appendChild(input);
    return field;
  };

  ReviewsWidget.prototype._submitReview = function (refs) {
    var self = this;
    var submitBtn = refs.submitBtn;
    var msg = refs.msg;

    if (self.selectedRating < 1) {
      msg.className = 'dl-reviews__msg dl-reviews__msg--err';
      msg.textContent = 'Please select a star rating.';
      msg.style.display = '';
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Uploading\u2026';
    msg.style.display = 'none';

    var titleVal = refs.titleInput ? refs.titleInput.value.trim() : '';
    var bodyVal = refs.bodyInput ? refs.bodyInput.value.trim() : '';

    Promise.all([
      self._uploadFiles(),
    ]).then(function (results) {
      var uploaded = results[0];
      return fetch(self.cfg.appUrl + '/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shop: self.cfg.shop,
          shopifyCustomerId: self.cfg.customerId || undefined,
          shopifyProductId: self.cfg.productId,
          rating: self.selectedRating,
          title: titleVal || undefined,
          body: bodyVal || undefined,
          photoKeys: uploaded.photoKeys.length ? uploaded.photoKeys : undefined,
          videoKey: uploaded.videoKey || undefined,
        }),
      });
    }).then(function (r) {
      if (r.status === 409) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Submit Review';
        msg.className = 'dl-reviews__msg dl-reviews__msg--err';
        msg.textContent = 'You\u2019ve already reviewed this product.';
        msg.style.display = '';
        return;
      }
      if (!r.ok) throw new Error('Submission failed');
      submitBtn.disabled = false;
      submitBtn.textContent = 'Submit Review';
      msg.className = 'dl-reviews__msg dl-reviews__msg--ok';
      msg.textContent = 'Thank you! Your review has been submitted and will appear after moderation.';
      msg.style.display = '';
      self.formOpen = false;
      self.selectedRating = 0;
      self.photoFiles = [];
      self.videoFile = null;
      // Refresh reviews after a short delay so the thank-you message is visible
      setTimeout(function () { self.page = 1; self._fetch(); }, 2500);
    }).catch(function () {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Submit Review';
      msg.className = 'dl-reviews__msg dl-reviews__msg--err';
      msg.textContent = 'Something went wrong. Please try again.';
      msg.style.display = '';
    });
  };

  ReviewsWidget.prototype._uploadFiles = function () {
    var self = this;
    var photoUploads = self.photoFiles.map(function (item) {
      return self._presignAndUpload('photo', item.file);
    });
    var videoUpload = self.videoFile
      ? self._presignAndUpload('video', self.videoFile).then(function (k) { return k; })
      : Promise.resolve(null);

    return Promise.all([Promise.all(photoUploads), videoUpload]).then(function (r) {
      return { photoKeys: r[0], videoKey: r[1] };
    });
  };

  ReviewsWidget.prototype._presignAndUpload = function (type, file) {
    var self = this;
    return fetch(self.cfg.appUrl + '/api/reviews/presign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: type, contentType: file.type }),
    }).then(function (r) {
      if (!r.ok) throw new Error('Presign failed');
      return r.json();
    }).then(function (data) {
      return fetch(data.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type },
        body: file,
      }).then(function (r) {
        if (!r.ok) throw new Error('Upload failed');
        return data.key;
      });
    });
  };

  // ─── Bootstrap ─────────────────────────────────────────────────────────────

  function init() {
    document.querySelectorAll('[data-doomlings-reviews]').forEach(function (el) {
      // Prevent double-init
      if (el.dataset.dlInit) return;
      el.dataset.dlInit = '1';
      new ReviewsWidget(el);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
