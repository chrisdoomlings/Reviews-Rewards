import '@shopify/ui-extensions/preact';
import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';

const APP_URL = 'https://reviews-rewards.vercel.app';

export default async () => {
  render(<LoyaltyBlock />, document.body);
};

function LoyaltyBlock() {
  const [state, setState] = useState(
    /** @type {{status: string, loyalty?: any, error?: string}} */ ({ status: 'loading' }),
  );

  const customerGid = shopify.authenticatedAccount?.customer?.value?.id ?? '';
  const customerId = customerGid.split('/').pop() ?? '';

  useEffect(() => {
    if (!customerId) {
      setState({ status: 'error', error: 'Could not identify customer' });
      return;
    }
    fetch(`${APP_URL}/api/loyalty/customer/${customerId}`)
      .then((r) => r.json())
      .then((loyalty) => setState({ status: 'ready', loyalty }))
      .catch((err) => setState({ status: 'error', error: String(err) }));
  }, []);

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
  const tierDisplay = loyalty.tierDisplayName ?? 'Prepper';
  const nextTierDisplay = loyalty.nextTierDisplayName;
  const pointsToNext = loyalty.pointsToNextTier;
  const rewardsUrl = 'extension:loyalty-rewards-page/';

  return (
    <s-section heading="Loyalty rewards">
      <s-stack direction="block" gap="base">
        <s-stack direction="block" gap="small-300">
          <s-heading>You have {balance.toLocaleString()} points</s-heading>
          <s-stack direction="inline" gap="small-300" align-items="center">
            <s-badge>{tierDisplay}</s-badge>
            {loyalty.pointsExpiresAt && (
              <s-text color="subdued">
                Expires {new Date(loyalty.pointsExpiresAt).toLocaleDateString()}
              </s-text>
            )}
          </s-stack>
        </s-stack>

        {nextTierDisplay && pointsToNext > 0 && (
          <s-text color="subdued">
            Earn {pointsToNext.toLocaleString()} more points to unlock {nextTierDisplay}.
          </s-text>
        )}

        <s-button href={rewardsUrl}>View rewards & redeem</s-button>
      </s-stack>
    </s-section>
  );
}
