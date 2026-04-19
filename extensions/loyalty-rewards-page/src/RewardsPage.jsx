import '@shopify/ui-extensions/preact';
import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';

const APP_URL = 'https://reviews-rewards.vercel.app';

const EARN_METHODS = [
  { label: 'Points for purchases', points: '1 point per $1 spent' },
  { label: 'Create an account', points: 'Completed', completed: true },
  { label: 'Sign up for SMS', points: '25 points' },
  { label: 'Leave a review', points: '20 points' },
  { label: 'Add photo in review', points: '25 points' },
  { label: 'Add video in review', points: '25 points' },
  { label: 'Local game store purchase', points: 'Upload receipt — 1 point per $1' },
  { label: 'Join our Discord', points: '10 points' },
  { label: 'Follow on Instagram', points: '10 points' },
  { label: 'Follow on TikTok', points: '10 points' },
  { label: 'Follow on Twitch', points: '10 points' },
  { label: 'Join our Facebook community', points: '10 points' },
  { label: 'Share on Facebook', points: '10 points' },
  { label: 'Birthday reward', points: '50 points' },
];

const TIERS = [
  { name: 'prepper', displayName: 'Prepper', threshold: 'Join', perks: ['1 point per $1 spent'] },
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
  render(<RewardsPage />, document.body);
};

function RewardsPage() {
  const [state, setState] = useState(
    /** @type {{status: string, loyalty?: any, error?: string}} */ ({ status: 'loading' }),
  );
  const [rewards, setRewards] = useState(/** @type {any[]} */ ([]));
  const [redeeming, setRedeeming] = useState(/** @type {string|null} */ (null));
  const [flash, setFlash] = useState(
    /** @type {{tone: 'success'|'critical'|'info'|'warning', text: string}|null} */ (null),
  );

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
      <s-page heading="Rewards">
        <s-section>
          <s-stack direction="inline" gap="small-300" align-items="center">
            <s-spinner accessibility-label="Loading" />
            <s-text>Loading your points…</s-text>
          </s-stack>
        </s-section>
      </s-page>
    );
  }

  if (state.status === 'error' || !state.loyalty) {
    return (
      <s-page heading="Rewards">
        <s-banner tone="critical">
          <s-text>{state.error ?? 'Unable to load your loyalty points right now.'}</s-text>
        </s-banner>
      </s-page>
    );
  }

  const { loyalty } = state;
  const balance = loyalty.pointsBalance ?? 0;
  const currentTier = loyalty.tier ?? 'prepper';
  const currentTierDisplay = loyalty.tierDisplayName ?? 'Prepper';
  const nextTierDisplay = loyalty.nextTierDisplayName;
  const pointsToNext = loyalty.pointsToNextTier;
  const nextTierMinPoints = loyalty.nextTierMinPoints;

  const progressValue = nextTierMinPoints ? Math.min(balance, nextTierMinPoints) : 0;

  return (
    <s-page heading="Rewards" subheading={`You have ${balance.toLocaleString()} points`}>
      <s-stack direction="block" gap="large">

        {flash && (
          <s-banner tone={flash.tone}>
            <s-text>{flash.text}</s-text>
          </s-banner>
        )}

        {/* Header card: balance + tier */}
        <s-section>
          <s-stack direction="block" gap="base">
            <s-stack direction="inline" gap="small-300" align-items="center">
              <s-heading>You have {balance.toLocaleString()} points</s-heading>
              <s-badge>{currentTierDisplay}</s-badge>
            </s-stack>
            {loyalty.pointsExpiresAt && (
              <s-text color="subdued">
                Points expire {new Date(loyalty.pointsExpiresAt).toLocaleDateString()}
              </s-text>
            )}
            {nextTierDisplay && pointsToNext > 0 && (
              <s-stack direction="block" gap="small-300">
                <s-text>
                  Earn <s-text type="strong">{pointsToNext.toLocaleString()} more points</s-text>{' '}
                  to unlock <s-text type="strong">{nextTierDisplay}</s-text>.
                </s-text>
                {nextTierMinPoints && (
                  <s-progress
                    value={progressValue}
                    max={nextTierMinPoints}
                    accessibility-label={`${balance} of ${nextTierMinPoints} points`}
                  />
                )}
              </s-stack>
            )}
          </s-stack>
        </s-section>

        {/* Ways to earn */}
        <s-section heading="Ways to earn points">
          <s-grid grid-template-columns="1fr 1fr" gap="base">
            {EARN_METHODS.map((m) => (
              <s-grid-item key={m.label}>
                <s-box padding="base" border="base" border-radius="base">
                  <s-stack direction="block" gap="small-300">
                    <s-text type="strong">{m.label}</s-text>
                    <s-text color={m.completed ? undefined : 'subdued'} tone={m.completed ? 'success' : undefined}>{m.points}</s-text>
                  </s-stack>
                </s-box>
              </s-grid-item>
            ))}
          </s-grid>
        </s-section>

        {/* Redeem */}
        <s-section heading="Using your points">
          <s-paragraph color="subdued">
            Racking up points is easy. Redeeming them is even easier — click Redeem, then copy and
            paste your code at checkout.
          </s-paragraph>
          {rewards.length === 0 ? (
            <s-text color="subdued">No rewards available yet.</s-text>
          ) : (
            <s-grid grid-template-columns="1fr 1fr" gap="base">
              {rewards.map((r) => {
                const affordable = balance >= r.pointsCost;
                return (
                  <s-grid-item key={r.id}>
                    <s-box padding="base" border="base" border-radius="base">
                      <s-stack direction="block" gap="small-300">
                        <s-heading>{r.name}</s-heading>
                        <s-text color="subdued">{r.pointsCost.toLocaleString()} points</s-text>
                        <s-button
                          onClick={() => redeem(r.id)}
                          disabled={!affordable || redeeming === r.id}
                        >
                          {redeeming === r.id
                            ? 'Redeeming…'
                            : affordable
                            ? 'Redeem'
                            : 'Not enough points'}
                        </s-button>
                      </s-stack>
                    </s-box>
                  </s-grid-item>
                );
              })}
            </s-grid>
          )}
        </s-section>

        {/* Reward tiers */}
        <s-section heading="Reward tiers">
          <s-grid grid-template-columns="1fr 1fr 1fr" gap="base">
            {TIERS.map((t) => {
              const isCurrent = t.name === currentTier;
              return (
                <s-grid-item key={t.name}>
                  <s-box
                    padding="base"
                    border="base"
                    border-radius="base"
                    background={isCurrent ? 'subdued' : undefined}
                  >
                    <s-stack direction="block" gap="small-300">
                      <s-stack direction="inline" gap="small-300" align-items="center">
                        <s-heading>{t.displayName}</s-heading>
                        {isCurrent && <s-badge icon="check-circle-filled">Current</s-badge>}
                      </s-stack>
                      <s-text color="subdued">{t.threshold}</s-text>
                      <s-unordered-list>
                        {t.perks.map((p) => (
                          <s-list-item key={p}>{p}</s-list-item>
                        ))}
                      </s-unordered-list>
                    </s-stack>
                  </s-box>
                </s-grid-item>
              );
            })}
          </s-grid>
        </s-section>

        {/* Rewards history */}
        {Array.isArray(loyalty.recentTransactions) && loyalty.recentTransactions.length > 0 && (
          <s-section heading="Rewards history">
            <s-stack direction="block" gap="small-300">
              {loyalty.recentTransactions.map((tx, i) => (
                <s-stack
                  key={i}
                  direction="inline"
                  gap="base"
                  align-items="center"
                >
                  <s-stack direction="block" gap="none">
                    <s-text type="strong">{tx.description ?? tx.type}</s-text>
                    <s-text color="subdued">
                      {new Date(tx.createdAt).toLocaleDateString()}
                    </s-text>
                  </s-stack>
                  <s-text tone={tx.points >= 0 ? 'success' : 'critical'}>
                    {tx.points >= 0 ? '+' : ''}
                    {tx.points} pts
                  </s-text>
                </s-stack>
              ))}
            </s-stack>
          </s-section>
        )}

      </s-stack>
    </s-page>
  );
}
