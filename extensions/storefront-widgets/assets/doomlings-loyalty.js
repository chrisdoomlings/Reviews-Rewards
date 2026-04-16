/**
 * Doomlings Loyalty Account Widget
 * Storefront theme app block — no framework dependencies.
 *
 * Mounts on: <div data-doomlings-loyalty ...>
 * APIs used:
 *   GET {appUrl}/api/loyalty/customer/{customerId}?shop=
 *   GET {appUrl}/api/loyalty/rewards?shop=
 */

(function () {
  'use strict';

  // ─── CSS ───────────────────────────────────────────────────────────────────

  var CSS = [
    '.dl-loyalty{font-family:inherit;--dl-accent:#c41b1b;color:inherit;padding-inline:var(--page-padding,1.6rem)}',
    '.dl-loyalty *{box-sizing:border-box}',

    /* Balance hero */
    '.dl-loyalty__hero{display:flex;align-items:center;gap:20px;padding:20px 0;flex-wrap:wrap}',
    '.dl-loyalty__balance-wrap{flex:1;min-width:140px}',
    '.dl-loyalty__balance-label{font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:#6b7280;margin-bottom:4px}',
    '.dl-loyalty__balance{font-size:52px;font-weight:800;line-height:1;color:var(--dl-accent)}',
    '.dl-loyalty__balance-unit{font-size:16px;font-weight:600;color:#6b7280;margin-left:4px}',

    /* Tier badge */
    '.dl-loyalty__tier-wrap{display:flex;flex-direction:column;align-items:center;gap:6px}',
    '.dl-loyalty__tier-badge{display:inline-flex;align-items:center;gap:6px;padding:8px 16px;border-radius:99px;font-size:14px;font-weight:700;background:var(--dl-accent);color:#fff}',
    '.dl-loyalty__tier-label{font-size:12px;color:#6b7280;text-align:center}',

    /* Tier progress */
    '.dl-loyalty__progress-wrap{padding:16px 0;border-bottom:1px solid #e5e7eb}',
    '.dl-loyalty__progress-header{display:flex;justify-content:space-between;font-size:13px;color:#6b7280;margin-bottom:8px}',
    '.dl-loyalty__progress-track{height:8px;background:#e5e7eb;border-radius:99px;overflow:hidden}',
    '.dl-loyalty__progress-fill{height:100%;background:var(--dl-accent);border-radius:99px;transition:width .4s}',
    '.dl-loyalty__progress-sub{font-size:12px;color:#9ca3af;margin-top:6px}',

    /* Expiry warning */
    '.dl-loyalty__expiry{background:#fef3c7;border:1px solid #fde68a;border-radius:8px;padding:10px 14px;font-size:13px;color:#92400e;margin:12px 0;display:flex;align-items:flex-start;gap:8px}',

    /* Sections */
    '.dl-loyalty__section{padding:16px 0;border-bottom:1px solid #e5e7eb}',
    '.dl-loyalty__section:last-child{border-bottom:none}',
    '.dl-loyalty__section-heading{font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#6b7280;margin-bottom:12px}',

    /* Transactions */
    '.dl-loyalty__tx-list{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:8px}',
    '.dl-loyalty__tx{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;font-size:13px}',
    '.dl-loyalty__tx-desc{color:#374151}',
    '.dl-loyalty__tx-date{font-size:12px;color:#9ca3af;margin-top:2px}',
    '.dl-loyalty__tx-pts{font-weight:700;white-space:nowrap}',
    '.dl-loyalty__tx-pts--earn{color:#16a34a}',
    '.dl-loyalty__tx-pts--redeem,.dl-loyalty__tx-pts--expire{color:#dc2626}',

    /* Rewards */
    '.dl-loyalty__rewards-list{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px}',
    '.dl-loyalty__reward{border:1px solid #e5e7eb;border-radius:10px;padding:14px;background:#fff;display:flex;flex-direction:column}',
    '.dl-loyalty__reward-name{font-size:14px;font-weight:700;margin-bottom:4px}',
    '.dl-loyalty__reward-desc{font-size:12px;color:#6b7280;margin-bottom:10px;flex:1}',
    '.dl-loyalty__reward-cost{font-size:13px;font-weight:700;color:var(--dl-accent);margin-bottom:10px}',
    '.dl-loyalty__redeem-btn{width:100%;padding:8px 12px;background:var(--dl-accent);color:#fff;border:none;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer}',
    '.dl-loyalty__redeem-btn:hover{opacity:.9}',
    '.dl-loyalty__redeem-btn:disabled{opacity:.5;cursor:not-allowed}',
    '.dl-loyalty__cant-redeem{font-size:12px;color:#9ca3af;text-align:center;padding:6px 0}',

    /* Code reveal */
    '.dl-loyalty__code-wrap{margin-top:10px;padding:10px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px}',
    '.dl-loyalty__code-label{font-size:11px;font-weight:700;color:#166534;text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px}',
    '.dl-loyalty__code-row{display:flex;align-items:center;gap:6px}',
    '.dl-loyalty__code{font-family:monospace;font-size:15px;font-weight:800;color:#166534;letter-spacing:.08em;flex:1}',
    '.dl-loyalty__copy-btn{padding:4px 10px;border:1px solid #16a34a;border-radius:4px;background:#fff;color:#16a34a;font-size:11px;font-weight:600;cursor:pointer;white-space:nowrap}',
    '.dl-loyalty__copy-btn:hover{background:#dcfce7}',
    '.dl-loyalty__code-hint{font-size:11px;color:#6b7280;margin-top:6px}',

    /* States */
    '.dl-loyalty__loading{padding:20px 0;color:#9ca3af;font-size:14px}',
    '.dl-loyalty__login-prompt{padding:24px;background:#f9fafb;border-radius:10px;text-align:center;font-size:14px;color:#6b7280}',
    '.dl-loyalty__login-prompt a{color:var(--dl-accent);font-weight:600}',
    '.dl-loyalty__empty{color:#9ca3af;font-size:13px}',
  ].join('');

  // ─── Helpers ───────────────────────────────────────────────────────────────

  function injectCss(id, css) {
    if (document.getElementById(id)) return;
    var s = document.createElement('style');
    s.id = id;
    s.textContent = css;
    document.head.appendChild(s);
  }

  function esc(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function formatDate(iso) {
    try {
      return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    } catch (e) {
      return iso;
    }
  }

  function capitalize(str) {
    return str ? str.charAt(0).toUpperCase() + str.slice(1) : str;
  }

  // ─── Main widget class ─────────────────────────────────────────────────────

  function LoyaltyWidget(el) {
    this.el = el;
    this.cfg = {
      customerId: el.dataset.customerId || null,
      shop:       el.dataset.shop,
      appUrl:     (el.dataset.appUrl || 'https://reviews-rewards.vercel.app').replace(/\/$/, ''),
      accent:     el.dataset.accentColor || '#c41b1b',
    };
    this._init();
  }

  LoyaltyWidget.prototype._init = function () {
    injectCss('doomlings-loyalty-css', CSS);
    this.el.classList.add('dl-loyalty');
    this.el.style.setProperty('--dl-accent', this.cfg.accent);

    if (!this.cfg.customerId) {
      this._renderLoggedOut();
      return;
    }
    this._renderLoading();
    this._fetchAll();
  };

  LoyaltyWidget.prototype._renderLoading = function () {
    this.el.innerHTML = '<p class="dl-loyalty__loading">Loading your rewards\u2026</p>';
  };

  LoyaltyWidget.prototype._renderLoggedOut = function () {
    this.el.innerHTML = '<div class="dl-loyalty__login-prompt">'
      + 'Please <a href="/account/login">log in</a> to view your loyalty rewards.'
      + '</div>';
  };

  LoyaltyWidget.prototype._fetchAll = function () {
    var self = this;
    var loyaltyUrl = self.cfg.appUrl + '/api/loyalty/customer/' + encodeURIComponent(self.cfg.customerId)
      + '?shop=' + encodeURIComponent(self.cfg.shop);
    var rewardsUrl = self.cfg.appUrl + '/api/loyalty/rewards?shop=' + encodeURIComponent(self.cfg.shop);

    Promise.all([
      fetch(loyaltyUrl).then(function (r) { return r.json(); }),
      fetch(rewardsUrl).then(function (r) { return r.json(); }),
    ]).then(function (results) {
      self._render(results[0], results[1].rewards || []);
    }).catch(function () {
      self.el.innerHTML = '<p class="dl-loyalty__loading">Could not load loyalty data.</p>';
    });
  };

  LoyaltyWidget.prototype._render = function (loyalty, rewards) {
    var self = this;
    self.el.innerHTML = '';

    // ── Balance + Tier hero ──────────────────────────────────────────────────
    var hero = document.createElement('div');
    hero.className = 'dl-loyalty__hero';

    var balanceWrap = document.createElement('div');
    balanceWrap.className = 'dl-loyalty__balance-wrap';
    var balLabel = document.createElement('div');
    balLabel.className = 'dl-loyalty__balance-label';
    balLabel.textContent = 'Points Balance';
    var balValue = document.createElement('div');
    balValue.className = 'dl-loyalty__balance';
    balValue.innerHTML = esc(loyalty.pointsBalance.toLocaleString())
      + '<span class="dl-loyalty__balance-unit">pts</span>';
    balanceWrap.appendChild(balLabel);
    balanceWrap.appendChild(balValue);
    hero.appendChild(balanceWrap);

    var tierWrap = document.createElement('div');
    tierWrap.className = 'dl-loyalty__tier-wrap';
    var tierBadge = document.createElement('div');
    tierBadge.className = 'dl-loyalty__tier-badge';
    tierBadge.textContent = capitalize(loyalty.tier);
    var tierLabel = document.createElement('div');
    tierLabel.className = 'dl-loyalty__tier-label';
    tierLabel.textContent = 'Current Tier';
    tierWrap.appendChild(tierBadge);
    tierWrap.appendChild(tierLabel);
    hero.appendChild(tierWrap);

    self.el.appendChild(hero);

    // ── Tier progress ────────────────────────────────────────────────────────
    if (loyalty.nextTier && loyalty.pointsToNextTier != null && loyalty.nextTierMinPoints != null) {
      var tierMin  = loyalty.tierMinPoints    || 0;
      var tierMax  = loyalty.nextTierMinPoints;
      var tierSpan = Math.max(tierMax - tierMin, 1);
      var earned   = Math.min(loyalty.pointsBalance - tierMin, tierSpan);
      var pct      = Math.min(100, Math.round((earned / tierSpan) * 100));

      var progWrap = document.createElement('div');
      progWrap.className = 'dl-loyalty__progress-wrap';

      var progHeader = document.createElement('div');
      progHeader.className = 'dl-loyalty__progress-header';
      progHeader.innerHTML = '<span>' + esc(loyalty.tierDisplayName || capitalize(loyalty.tier)) + '</span>'
        + '<span>' + esc(loyalty.nextTierDisplayName || capitalize(loyalty.nextTier)) + '</span>';

      var progTrack = document.createElement('div');
      progTrack.className = 'dl-loyalty__progress-track';
      var progFill = document.createElement('div');
      progFill.className = 'dl-loyalty__progress-fill';
      progFill.style.width = pct + '%';
      progTrack.appendChild(progFill);

      var progSub = document.createElement('div');
      progSub.className = 'dl-loyalty__progress-sub';
      progSub.textContent = loyalty.pointsToNextTier.toLocaleString()
        + ' points to ' + (loyalty.nextTierDisplayName || capitalize(loyalty.nextTier));

      progWrap.appendChild(progHeader);
      progWrap.appendChild(progTrack);
      progWrap.appendChild(progSub);
      self.el.appendChild(progWrap);
    }

    // ── Expiry warning ───────────────────────────────────────────────────────
    if (loyalty.pointsExpiresAt && loyalty.pointsBalance > 0) {
      var expiry = new Date(loyalty.pointsExpiresAt);
      var daysLeft = Math.ceil((expiry - Date.now()) / (1000 * 60 * 60 * 24));
      if (daysLeft <= 60) {
        var expiryDiv = document.createElement('div');
        expiryDiv.className = 'dl-loyalty__expiry';
        expiryDiv.innerHTML = '<span>&#9888;</span><span>Your '
          + esc(loyalty.pointsBalance.toLocaleString())
          + ' points expire on ' + esc(formatDate(loyalty.pointsExpiresAt)) + '. '
          + (daysLeft <= 7 ? '<strong>Act fast!</strong>' : 'Use them before they expire.')
          + '</span>';
        self.el.appendChild(expiryDiv);
      }
    }

    // ── Recent activity ──────────────────────────────────────────────────────
    if (loyalty.recentTransactions && loyalty.recentTransactions.length > 0) {
      var txSection = document.createElement('div');
      txSection.className = 'dl-loyalty__section';
      var txHeading = document.createElement('div');
      txHeading.className = 'dl-loyalty__section-heading';
      txHeading.textContent = 'Recent Activity';
      txSection.appendChild(txHeading);

      var txList = document.createElement('ul');
      txList.className = 'dl-loyalty__tx-list';

      loyalty.recentTransactions.forEach(function (tx) {
        var li = document.createElement('li');
        li.className = 'dl-loyalty__tx';

        var info = document.createElement('div');
        var desc = document.createElement('div');
        desc.className = 'dl-loyalty__tx-desc';
        desc.textContent = tx.description || capitalize(tx.type);
        var date = document.createElement('div');
        date.className = 'dl-loyalty__tx-date';
        date.textContent = formatDate(tx.createdAt);
        info.appendChild(desc);
        info.appendChild(date);

        var pts = document.createElement('div');
        var typeClass = tx.type === 'earn'
          ? 'dl-loyalty__tx-pts--earn'
          : 'dl-loyalty__tx-pts--redeem';
        pts.className = 'dl-loyalty__tx-pts ' + typeClass;
        pts.textContent = (tx.points > 0 ? '+' : '') + tx.points.toLocaleString() + ' pts';

        li.appendChild(info);
        li.appendChild(pts);
        txList.appendChild(li);
      });

      txSection.appendChild(txList);
      self.el.appendChild(txSection);
    }

    // ── Available rewards ────────────────────────────────────────────────────
    var rwSection = document.createElement('div');
    rwSection.className = 'dl-loyalty__section';
    var rwHeading = document.createElement('div');
    rwHeading.className = 'dl-loyalty__section-heading';
    rwHeading.textContent = 'Available Rewards';
    rwSection.appendChild(rwHeading);

    if (!rewards || rewards.length === 0) {
      var rwEmpty = document.createElement('p');
      rwEmpty.className = 'dl-loyalty__empty';
      rwEmpty.textContent = 'No rewards available yet.';
      rwSection.appendChild(rwEmpty);
    } else {
      var rwList = document.createElement('div');
      rwList.className = 'dl-loyalty__rewards-list';

      rewards.forEach(function (rw) {
        var card = document.createElement('div');
        card.className = 'dl-loyalty__reward';

        var canRedeem = loyalty.pointsBalance >= rw.pointsCost;

        // Static info
        var nameEl = document.createElement('div');
        nameEl.className = 'dl-loyalty__reward-name';
        nameEl.textContent = rw.name;

        var descEl = document.createElement('div');
        descEl.className = 'dl-loyalty__reward-desc';
        descEl.textContent = rw.description || '';

        var costEl = document.createElement('div');
        costEl.className = 'dl-loyalty__reward-cost';
        costEl.textContent = rw.pointsCost.toLocaleString() + ' pts';

        card.appendChild(nameEl);
        card.appendChild(descEl);
        card.appendChild(costEl);

        if (canRedeem) {
          var redeemBtn = document.createElement('button');
          redeemBtn.className = 'dl-loyalty__redeem-btn';
          redeemBtn.textContent = 'Redeem';
          redeemBtn.addEventListener('click', function () {
            self._redeem(rw, card, redeemBtn, loyalty);
          });
          card.appendChild(redeemBtn);
        } else {
          var cantEl = document.createElement('div');
          cantEl.className = 'dl-loyalty__cant-redeem';
          var needed = rw.pointsCost - loyalty.pointsBalance;
          cantEl.textContent = needed.toLocaleString() + ' more pts needed';
          card.appendChild(cantEl);
        }

        rwList.appendChild(card);
      });

      rwSection.appendChild(rwList);
    }

    self.el.appendChild(rwSection);
  };

  // ─── Redeem a reward ───────────────────────────────────────────────────────

  LoyaltyWidget.prototype._redeem = function (rw, card, btn, loyalty) {
    var self = this;
    btn.disabled = true;
    btn.textContent = 'Redeeming\u2026';

    fetch(self.cfg.appUrl + '/api/loyalty/redeem', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        shop: self.cfg.shop,
        shopifyCustomerId: self.cfg.customerId,
        rewardId: rw.id,
      }),
    })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, data: d }; }); })
      .then(function (result) {
        if (!result.ok) {
          btn.disabled = false;
          btn.textContent = 'Redeem';
          var errEl = document.createElement('div');
          errEl.style.cssText = 'font-size:12px;color:#dc2626;margin-top:6px';
          errEl.textContent = result.data.error || 'Something went wrong.';
          card.appendChild(errEl);
          return;
        }

        // Remove the redeem button
        card.removeChild(btn);

        // Show the discount code
        var codeWrap = document.createElement('div');
        codeWrap.className = 'dl-loyalty__code-wrap';

        var codeLabel = document.createElement('div');
        codeLabel.className = 'dl-loyalty__code-label';
        codeLabel.textContent = 'Your discount code';

        var codeRow = document.createElement('div');
        codeRow.className = 'dl-loyalty__code-row';

        var codeEl = document.createElement('div');
        codeEl.className = 'dl-loyalty__code';
        codeEl.textContent = result.data.discountCode;

        var copyBtn = document.createElement('button');
        copyBtn.className = 'dl-loyalty__copy-btn';
        copyBtn.textContent = 'Copy';
        copyBtn.addEventListener('click', function () {
          navigator.clipboard.writeText(result.data.discountCode).then(function () {
            copyBtn.textContent = 'Copied!';
            setTimeout(function () { copyBtn.textContent = 'Copy'; }, 2000);
          }).catch(function () {
            // Fallback for browsers without clipboard API
            var ta = document.createElement('textarea');
            ta.value = result.data.discountCode;
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
            copyBtn.textContent = 'Copied!';
            setTimeout(function () { copyBtn.textContent = 'Copy'; }, 2000);
          });
        });

        var hint = document.createElement('div');
        hint.className = 'dl-loyalty__code-hint';
        hint.textContent = 'Apply at checkout. Single use.';

        codeRow.appendChild(codeEl);
        codeRow.appendChild(copyBtn);
        codeWrap.appendChild(codeLabel);
        codeWrap.appendChild(codeRow);
        codeWrap.appendChild(hint);
        card.appendChild(codeWrap);

        // Update the balance display at the top
        var balanceEl = self.el.querySelector('.dl-loyalty__balance');
        if (balanceEl) {
          balanceEl.innerHTML = result.data.newBalance.toLocaleString()
            + '<span class="dl-loyalty__balance-unit">pts</span>';
        }
      })
      .catch(function () {
        btn.disabled = false;
        btn.textContent = 'Redeem';
      });
  };

  // ─── Bootstrap ─────────────────────────────────────────────────────────────

  function init() {
    document.querySelectorAll('[data-doomlings-loyalty]').forEach(function (el) {
      if (el.dataset.dlInit) return;
      el.dataset.dlInit = '1';
      new LoyaltyWidget(el);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
