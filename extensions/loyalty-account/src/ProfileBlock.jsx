import '@shopify/ui-extensions/preact';
import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';

const APP_URL = 'https://reviews-rewards.vercel.app';

// Hardcoded earn methods (mirrors the Doomlings Yotpo page).
// Keep in sync with merchant decisions; move to DB if this list starts
// changing often.
const EARN_METHODS = [
  { label: 'Points for purchases', points: '1 point per $1 spent', icon: 'currency-dollar' },
  { label: 'Create an account', points: 'Completed', icon: 'profile', completed: true },
  { label: 'Sign up for SMS', points: '25 points', icon: 'mobile' },
  { label: 'Leave a review', points: '20 points', icon: 'star' },
  { label: 'Add photo in review', points: '25 points', icon: 'camera' },
  { label: 'Add video in review', points: '25 points', icon: 'play' },
  { label: 'Local game store purchase', points: 'Upload receipt — 1 point per $1', icon: 'receipt' },
  { label: 'Join our Discord', points: '10 points', icon: 'chat' },
  { label: 'Follow on Instagram', points: '10 points', icon: 'external' },
  { label: 'Follow on TikTok', points: '10 points', icon: 'external' },
  { label: 'Follow on Twitch', points: '10 points', icon: 'external' },
  { label: 'Join our Facebook community', points: '10 points', icon: 'external' },
  { label: 'Share on Facebook', points: '10 points', icon: 'share' },
  { label: 'Birthday reward', points: '50 points', icon: 'gift' },
];

// Hardcoded tier details (mirrors DEFAULT_SHOP_CONFIG on the backend).
const TIERS = [
  {
    name: 'prepper',
    displayName: 'Prepper',
    threshold: 'Join',
    perks: ['1 point per $1 spent'],
  },
  {
    name: 'survivor',
    displayName: 'Survivor',
    threshold: 'Earn 250 points',
    perks: ['1.25 points per $1 spent', '50 points upon entry', '100 birthday points'],
  },
  {
    name: 'ruler',
    displayName: 'Ruler',
    threshold: 'Earn 500 points',
    perks: ['1.5 points per $1 spent', '100 points upon entry', '150 birthday points'],
  },
];

export default async () => {
  render(<LoyaltyBlock />, document.body);
};

function LoyaltyBlock() {
  const [state, setState] = useState(
    /** @type {{status: string, loyalty?: any, error?: string}} */ ({ status: 'loading' }),
  );
  const [rewards, setRewards] = useState([]);
  const [redeeming, setRedeeming] = useState(null);
  const [flash, setFlash] = useState(null);

  const customerGid = shopify.authenticatedAccount?.customer?.value?.id ?? '';
  const customerId = customerGid.split('/').pop() ?? '';

  async function loadAll() {
    if (!customerId) {
      setState({ status: 'error', error: 'Could not identify customer' });
      return;
    }
    try {
      const [loyaltyResp, rewardsResp] = await Promise.all([
        fetch(`${APP_URL}/api/loyalty/customer/${customerId}`),
        fetch(`${APP_URL}/api/loyalty/rewards?customerId=${customerId}`),
      ]);
      const loyalty = await loyaltyResp.json();
      const rewardsData = await rewardsResp.json();
      setState({ status: 'ready', loyalty });
      setRewards(Array.isArray(rewardsData?.rewards) ? rewardsData.rewards : []);
    } catch (err) {
      setState({ status: 'error', error: String(err) });
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

  async function redeem(rewardId) {
    setRedeeming(rewardId);
    setFlash(null);
    try {
      const resp = await fetch(`${APP_URL}/api/loyalty/redeem`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shopifyCustomerId: customerId, rewardId }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        setFlash({ tone: 'critical', text: data.error ?? 'Redemption failed' });
      } else {
        setFlash({ tone: 'success', text: `Your discount code: ${data.discountCode}` });
        await loadAll();
      }
    } catch (err) {
      setFlash({ tone: 'critical', text: String(err) });
    } finally {
      setRedeeming(null);
    }
  }

  if (state.status === 'loading') {
    return (
      <s-section heading="Loyalty rewards">
        <s-paragraph>Loading your points…</s-paragraph>
      </s-section>
    );
  }

  if (state.status === 'error' || !state.loyalty) {
    return (
      <s-section heading="Loyalty rewards">
        <s-banner tone="critical">
          <s-text>{state.error ?? 'Unable to load your loyalty points right now.'}</s-text>
        </s-banner>
      </s-section>
    );
  }

  const { loyalty } = state;
  const balance = loyalty.pointsBalance ?? 0;
  const currentTier = loyalty.tier ?? 'prepper';
  const currentTierDisplay = loyalty.tierDisplayName ?? 'Prepper';
  const nextTierDisplay = loyalty.nextTierDisplayName;
  const pointsToNext = loyalty.pointsToNextTier;

  return (
    <s-section heading="Loyalty rewards">
      <s-stack direction="block" gap="large">

        {flash && (
          <s-banner tone={flash.tone}>
            <s-text>{flash.text}</s-text>
          </s-banner>
        )}

        {/* ─── Header: greeting + balance + tier ─── */}
        <s-stack direction="block" gap="tight">
          <s-heading level="2">
            You have {balance.toLocaleString()} points
          </s-heading>
          <s-stack direction="inline" gap="tight" alignItems="center">
            <s-badge>{currentTierDisplay}</s-badge>
            {loyalty.pointsExpiresAt && (
              <s-text tone="subdued">
                Points expire {new Date(loyalty.pointsExpiresAt).toLocaleDateString()}
              </s-text>
            )}
          </s-stack>
        </s-stack>

        {/* ─── Tier progress banner ─── */}
        {nextTierDisplay && pointsToNext > 0 && (
          <s-banner tone="info">
            <s-text>
              You're in <s-text type="strong">{currentTierDisplay}</s-text>. Earn{' '}
              <s-text type="strong">{pointsToNext.toLocaleString()} more points</s-text> to unlock{' '}
              <s-text type="strong">{nextTierDisplay}</s-text>.
            </s-text>
          </s-banner>
        )}

        {/* ─── Ways to earn points ─── */}
        <s-stack direction="block" gap="tight">
          <s-heading level="3">Ways to earn points</s-heading>
          <s-grid grid-template-columns="1fr 1fr 1fr" gap="tight">
            {EARN_METHODS.map((m) => (
              <s-box key={m.label} padding="base" border="base" border-radius="base">
                <s-stack direction="block" gap="extra-tight">
                  <s-text type="strong">{m.label}</s-text>
                  <s-text tone={m.completed ? 'success' : 'subdued'}>{m.points}</s-text>
                </s-stack>
              </s-box>
            ))}
          </s-grid>
        </s-stack>

        {/* ─── Using your points (redeem grid) ─── */}
        {rewards.length > 0 && (
          <s-stack direction="block" gap="tight">
            <s-heading level="3">Using your points</s-heading>
            <s-paragraph tone="subdued">
              Racking up points is easy. Redeeming them is even easier — click Redeem, then copy
              and paste your code at checkout.
            </s-paragraph>
            <s-grid grid-template-columns="1fr 1fr" gap="tight">
              {rewards.map((r) => {
                const affordable = balance >= r.pointsCost;
                return (
                  <s-box key={r.id} padding="base" border="base" border-radius="base">
                    <s-stack direction="block" gap="tight">
                      <s-heading level="4">{r.name}</s-heading>
                      <s-text tone="subdued">{r.pointsCost.toLocaleString()} points</s-text>
                      <s-button
                        onClick={() => redeem(r.id)}
                        disabled={!affordable || redeeming === r.id}
                      >
                        {redeeming === r.id ? 'Redeeming…' : affordable ? 'Redeem' : 'Not enough points'}
                      </s-button>
                    </s-stack>
                  </s-box>
                );
              })}
            </s-grid>
          </s-stack>
        )}

        {/* ─── Reward tiers ─── */}
        <s-stack direction="block" gap="tight">
          <s-heading level="3">Reward tiers</s-heading>
          <s-grid grid-template-columns="1fr 1fr 1fr" gap="tight">
            {TIERS.map((t) => {
              const isCurrent = t.name === currentTier;
              return (
                <s-box
                  key={t.name}
                  padding="base"
                  border="base"
                  border-radius="base"
                  background={isCurrent ? 'subdued' : undefined}
                >
                  <s-stack direction="block" gap="tight">
                    <s-stack direction="inline" gap="tight" alignItems="center">
                      <s-heading level="4">{t.displayName}</s-heading>
                      {isCurrent && <s-badge tone="success">Current</s-badge>}
                    </s-stack>
                    <s-text tone="subdued">{t.threshold}</s-text>
                    <s-unordered-list>
                      {t.perks.map((p) => (
                        <s-list-item key={p}>{p}</s-list-item>
                      ))}
                    </s-unordered-list>
                  </s-stack>
                </s-box>
              );
            })}
          </s-grid>
        </s-stack>

      </s-stack>
    </s-section>
  );
}
