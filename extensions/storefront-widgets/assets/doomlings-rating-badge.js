(function () {
  'use strict';

  var FILLED = '\u2605'; // ★
  var EMPTY = '\u2606';  // ☆

  function starsHtml(avg, color) {
    var out = '';
    for (var i = 1; i <= 5; i++) {
      out += '<span style="color:' + color + ';">' + (i <= Math.round(avg) ? FILLED : EMPTY) + '</span>';
    }
    return out;
  }

  function scrollToReviews() {
    // Our reviews block renders into id="doomlings-reviews-<blockId>".
    // Scroll to whichever one is on the page.
    var target = document.querySelector('[data-doomlings-reviews]');
    if (!target) return;
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function renderBadge(el) {
    var productId = el.getAttribute('data-product-id');
    var shop = el.getAttribute('data-shop');
    var appUrl = el.getAttribute('data-app-url');
    var color = el.getAttribute('data-color') || '#f59e0b';
    var showCount = el.getAttribute('data-show-count') !== 'false';
    var align = el.getAttribute('data-align') || 'left';
    // Default: show even when the product has zero reviews. Merchants can
    // flip this off per-block in the theme editor.
    var showZero = el.getAttribute('data-show-zero') !== 'false';

    if (!productId || !shop || !appUrl) {
      el.style.display = 'none';
      return;
    }

    var url = appUrl + '/api/reviews/product/' + encodeURIComponent(productId) +
      '?shop=' + encodeURIComponent(shop) + '&page=1&limit=1';

    fetch(url)
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var total = Number(data.total || 0);
        var avg = Number(data.avgRating || 0);

        if (total === 0 && !showZero) {
          el.style.display = 'none';
          return;
        }

        var justify = align === 'center' ? 'center' : align === 'right' ? 'flex-end' : 'flex-start';

        var countLabel = total === 0
          ? 'No reviews yet'
          : '(' + total + ' review' + (total === 1 ? '' : 's') + ')';
        var countHtml = showCount
          ? '<span style="color:#6b7280;font-size:14px;">' + countLabel + '</span>'
          : '';
        var ratingHtml = total > 0
          ? '<span style="font-weight:600;font-size:14px;">' + avg.toFixed(1) + '</span>'
          : '';
        var ariaLabel = total > 0
          ? 'See all ' + total + ' reviews'
          : 'Be the first to write a review';

        el.innerHTML =
          '<button type="button" style="' +
            'background:none;border:0;padding:0;cursor:pointer;' +
            'display:inline-flex;align-items:center;gap:8px;' +
            'font-size:16px;line-height:1;color:inherit;' +
          '" aria-label="' + ariaLabel + '">' +
            '<span style="font-size:18px;letter-spacing:1px;">' + starsHtml(avg, color) + '</span>' +
            ratingHtml +
            countHtml +
          '</button>';

        el.style.display = 'flex';
        el.style.justifyContent = justify;
        el.style.margin = '8px 0';

        var btn = el.querySelector('button');
        if (btn) btn.addEventListener('click', scrollToReviews);
      })
      .catch(function () {
        el.style.display = 'none';
      });
  }

  function init() {
    var badges = document.querySelectorAll('[data-doomlings-rating-badge]');
    for (var i = 0; i < badges.length; i++) renderBadge(badges[i]);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
