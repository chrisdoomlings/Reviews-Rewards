import '@shopify/ui-extensions/preact';
import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';

// Points to the deployed Reviews Rewards app. Must match `application_url`
// in shopify.app.toml. Extensions cannot read TOML at runtime.
const APP_URL = 'https://reviews-rewards.vercel.app';

export default async () => {
  render(<LoyaltyBlock />, document.body);
};

function LoyaltyBlock() {
  const [state, setState] = useState({ status: 'loading' });
  const [rewards, setRewards] = useState([]);
  const [redeeming, setRedeeming] = useState(null);
  const [flash, setFlash] = useState(null);

  const customerGid = shopify.customer?.id ?? '';
  const customerId = customerGid.split('/').pop() ?? '';
  const shop = shopify.shop?.myshopifyDomain ?? '';

  async function loadAll() {
    if (!customerId || !shop) {
      setState({ status: 'error', error: 'Could not identify customer' });
      return;
    }
    try {
      const [loyaltyResp, rewardsResp] = await Promise.all([
        fetch(`${APP_URL}/api/loyalty/customer/${customerId}?shop=${shop}`),
        fetch(`${APP_URL}/api/loyalty/rewards?shop=${shop}`),
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
        body: JSON.stringify({ shop, shopifyCustomerId: customerId, rewardId }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        setFlash({ tone: 'critical', text: data.error ?? 'Redemption failed' });
      } else {
        setFlash({
          tone: 'success',
          text: `Your discount code: ${data.discountCode}`,
        });
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
          <s-text>Unable to load your loyalty points right now.</s-text>
        </s-banner>
      </s-section>
    );
  }

  const { loyalty } = state;
  const balance = loyalty.pointsBalance ?? 0;
  const tier = loyalty.tier ?? 'base';

  return (
    <s-section heading="Loyalty rewards">
      <s-stack direction="block" gap="base">
        {flash && (
          <s-banner tone={flash.tone}>
            <s-text>{flash.text}</s-text>
          </s-banner>
        )}

        <s-stack direction="inline" gap="base" alignItems="center">
          <s-heading level="2">{balance.toLocaleString()} points</s-heading>
          <s-badge>{tier}</s-badge>
        </s-stack>

        {loyalty.pointsExpiresAt && (
          <s-paragraph tone="subdued">
            Points expire {new Date(loyalty.pointsExpiresAt).toLocaleDateString()}
          </s-paragraph>
        )}

        {rewards.length > 0 && (
          <s-stack direction="block" gap="tight">
            <s-heading level="3">Redeem</s-heading>
            {rewards.map((r) => {
              const affordable = balance >= r.pointsCost;
              return (
                <s-stack
                  key={r.id}
                  direction="inline"
                  gap="base"
                  alignItems="center"
                >
                  <s-stack direction="block" gap="extra-tight">
                    <s-text>{r.name}</s-text>
                    <s-text tone="subdued">
                      {r.pointsCost.toLocaleString()} points
                    </s-text>
                  </s-stack>
                  <s-button
                    onClick={() => redeem(r.id)}
                    disabled={!affordable || redeeming === r.id}
                  >
                    {redeeming === r.id ? 'Redeeming…' : 'Redeem'}
                  </s-button>
                </s-stack>
              );
            })}
          </s-stack>
        )}
      </s-stack>
    </s-section>
  );
}
