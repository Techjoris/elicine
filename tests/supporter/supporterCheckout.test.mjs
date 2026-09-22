/**
 * Bouton « Soutenir le projet » : 7 montants ponctuels, chacun ouvrant Paddle Checkout
 * avec son propre price_id, sans jamais toucher au Pass Pro ni à un abonnement.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SUPPORTER_TIERS, SUPPORTER_PRODUCT_TYPE, formatSupporterAmount, isSupporterTierAvailable,
  openSupporterCheckout, supporterCustomData, supporterPriceId
} from '../../src/services/supporterService.ts';

const AMOUNTS = [1, 2, 3, 5, 7, 10, 50];
const LABELS = ['Coup de pouce', 'Petit soutien', 'Merci !', 'Soutien', 'Gros soutien', 'Super soutien', 'Soutien exceptionnel'];

async function withEnv(values, run) {
  const previous = {};
  for (const [key, value] of Object.entries(values)) {
    previous[key] = process.env[key];
    process.env[key] = value;
  }
  try { return await run(); } finally {
    for (const key of Object.keys(values)) {
      if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key];
    }
  }
}

function fakePaddleWindow() {
  const opened = [];
  const previous = globalThis.window;
  globalThis.window = {
    location: { origin: 'https://elicine.app' },
    Paddle: {
      Environment: { set() {} },
      Initialize() { globalThis.window.Paddle.__ready = true; },
      Checkout: { open: options => { opened.push(options); } }
    }
  };
  return { opened, restore: () => { globalThis.window = previous; } };
}

test('the modal offers exactly the seven one-time amounts and their labels', () => {
  assert.deepEqual(SUPPORTER_TIERS.map(tier => tier.amount), AMOUNTS);
  assert.deepEqual(SUPPORTER_TIERS.map(tier => tier.label), LABELS);
  assert.equal(formatSupporterAmount(1), '1 €');
  assert.equal(formatSupporterAmount(50), '50 €');
  assert.ok(SUPPORTER_TIERS.every(tier => tier.tagline.length > 0));
});

test('each amount resolves its own price id and stays unavailable until configured', async () => {
  assert.equal(supporterPriceId(5), '');
  assert.equal(isSupporterTierAvailable(SUPPORTER_TIERS[3]), false);
  await withEnv({ VITE_PADDLE_SUPPORTER_PRICE_5: 'pri_supporter_5' }, () => {
    assert.equal(supporterPriceId(5), 'pri_supporter_5');
    assert.equal(isSupporterTierAvailable(SUPPORTER_TIERS[3]), true);
    assert.equal(isSupporterTierAvailable(SUPPORTER_TIERS[0]), false, 'les autres montants restent indépendants');
  });
});

test('the checkout payload is one-time and identifies the Supporter product', async () => {
  const env = {
    VITE_PADDLE_SUPPORTER_PRICE_1: 'pri_supporter_1',
    VITE_PADDLE_SUPPORTER_PRICE_2: 'pri_supporter_2',
    VITE_PADDLE_SUPPORTER_PRICE_3: 'pri_supporter_3',
    VITE_PADDLE_SUPPORTER_PRICE_5: 'pri_supporter_5',
    VITE_PADDLE_SUPPORTER_PRICE_7: 'pri_supporter_7',
    VITE_PADDLE_SUPPORTER_PRICE_10: 'pri_supporter_10',
    VITE_PADDLE_SUPPORTER_PRICE_50: 'pri_supporter_50'
  };
  const user = { id: 'user-42', email: 'Supporter@Example.com', name: 'Ivan' };
  const custom = supporterCustomData(SUPPORTER_TIERS[3], user);
  assert.equal(custom.product_type, SUPPORTER_PRODUCT_TYPE);
  assert.equal(custom.purchase_type, 'one_time');
  assert.equal(custom.user_id, 'user-42');
  assert.equal(custom.user_email, 'supporter@example.com');

  await withEnv(env, () => {
    for (const tier of SUPPORTER_TIERS) {
      const paddle = fakePaddleWindow();
      try {
        const opened = openSupporterCheckout(tier, user, {});
        assert.ok(opened instanceof Promise);
      } finally { paddle.restore(); }
    }
  });
});

test('every amount opens the checkout with its own price id', async () => {
  const env = Object.fromEntries(AMOUNTS.map(amount => [`VITE_PADDLE_SUPPORTER_PRICE_${amount}`, `pri_supporter_${amount}`]));
  await withEnv(env, async () => {
    for (const tier of SUPPORTER_TIERS) {
      const paddle = fakePaddleWindow();
      try {
        const opened = [];
        globalThis.window.Paddle.Checkout.open = options => opened.push(options);
        const result = await openSupporterCheckout(tier, { id: 'user-1', email: 'a@b.com', name: 'Ivan' }, {});
        assert.equal(result, true);
        assert.equal(opened.length, 1);
        assert.equal(opened[0].items.length, 1);
        assert.equal(opened[0].items[0].priceId, `pri_supporter_${tier.amount}`);
        assert.equal(opened[0].items[0].quantity, 1);
        assert.equal(opened[0].customData.product_type, SUPPORTER_PRODUCT_TYPE);
        assert.equal(opened[0].customData.supporter_amount, tier.amount);
        assert.equal(opened[0].settings.displayMode, 'overlay');
        // Aucun champ d'abonnement : le soutien reste un paiement unique.
        assert.equal(opened[0].settings.successUrl, undefined);
        assert.equal(opened[0].subscription, undefined);
        assert.ok(!JSON.stringify(opened[0]).match(/billing|subscription|recurring/i));
      } finally { paddle.restore(); }
    }
  });
});

test('an unconfigured amount reports an error instead of opening a wrong checkout', async () => {
  const errors = [];
  const result = await openSupporterCheckout(SUPPORTER_TIERS[6], null, { onError: error => errors.push(error) });
  assert.equal(result, false);
  assert.equal(errors.length, 1);
  assert.match(errors[0].message, /n’est pas encore disponible/);
});

test('the Paddle SDK failure is surfaced to the modal', async () => {
  const errors = [];
  const previous = globalThis.window;
  globalThis.window = undefined;
  try {
    await withEnv({ VITE_PADDLE_SUPPORTER_PRICE_1: 'pri_supporter_1' }, async () => {
      const result = await openSupporterCheckout(SUPPORTER_TIERS[0], null, { onError: error => errors.push(error) });
      assert.equal(result, false);
      assert.equal(errors.length, 1);
    });
  } finally { globalThis.window = previous; }
});
