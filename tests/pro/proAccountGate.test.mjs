/**
 * Un paiement de Pass Pro doit toujours être rattaché à un compte, sinon
 * l'abonnement ne peut être activé nulle part. Le bouton Paddle ouvrait
 * directement la fenêtre de paiement : la règle est vérifiée désormais au
 * moment où le paiement démarre, sur chaque porte d'entrée.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  PRO_ACCOUNT_REQUIRED_TOAST,
  isProCheckoutAccountMissing,
  rememberProCheckoutBeforeSignup
} from '../../src/lib/proAccountGate.ts';

const read = (relative) => readFileSync(new URL(relative, import.meta.url), 'utf8');

test('a visitor without an account cannot start a Pro payment', () => {
  assert.equal(isProCheckoutAccountMissing(null), true);
  assert.equal(isProCheckoutAccountMissing(undefined), true);
});

test('a real account can pay, even when only the e-mail is available', () => {
  assert.equal(isProCheckoutAccountMissing({ id: 'usr_123' }), false);
  assert.equal(isProCheckoutAccountMissing({ email: 'cinephile@elicine.app' }), false);
  assert.equal(isProCheckoutAccountMissing({ id: 'usr_123', email: 'cinephile@elicine.app' }), false);
});

test('empty or blank identifiers do not count as an account', () => {
  assert.equal(isProCheckoutAccountMissing({ id: '', email: '' }), true);
  assert.equal(isProCheckoutAccountMissing({ id: '   ', email: '  ' }), true);
  assert.equal(isProCheckoutAccountMissing({ id: null, email: null }), true);
});

test('the cart is kept so the payment can resume after signing up', () => {
  const store = new Map();
  globalThis.sessionStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k)
  };
  try {
    rememberProCheckoutBeforeSignup({
      plan: 'monthly',
      currency: 'EUR',
      amount: '1,99',
      numericAmount: 1.99,
      paymentMethod: 'paddle',
      provider: 'paddle',
      gateway: 'paddle'
    });

    assert.equal(store.get('pending_checkout'), 'true');
    assert.equal(store.get('payment_method'), 'paddle');
    assert.equal(store.get('checkout_gateway'), 'paddle');
    assert.equal(store.get('checkout_plan'), 'monthly');
    assert.equal(store.get('checkout_currency'), 'EUR');
    assert.equal(store.get('checkout_numeric_amount'), '1.99');
  } finally {
    delete globalThis.sessionStorage;
  }
});

test('a refused storage never blocks the sign-up step', () => {
  globalThis.sessionStorage = {
    getItem: () => { throw new Error('refusé'); },
    setItem: () => { throw new Error('refusé'); },
    removeItem: () => { throw new Error('refusé'); }
  };
  try {
    assert.doesNotThrow(() => rememberProCheckoutBeforeSignup({
      plan: 'yearly',
      currency: 'EUR',
      amount: '17,90',
      numericAmount: 17.9,
      paymentMethod: 'paddle',
      provider: 'paddle'
    }));
  } finally {
    delete globalThis.sessionStorage;
  }
});

test('the Pro window checks the account before opening Paddle', () => {
  const modal = read('../../src/components/SubscriptionModal.tsx');
  const start = modal.indexOf('const handlePaddleCheckout');
  const end = modal.indexOf('const handleCheckoutClick');
  assert.ok(start > -1 && end > start, 'la fonction de paiement Paddle doit exister');

  const body = modal.slice(start, end);
  const gate = body.indexOf('isProCheckoutAccountMissing(');
  const opensPaddle = body.indexOf('openPaddleCheckout(');

  assert.ok(gate > -1, 'le compte doit être vérifié avant tout paiement');
  assert.ok(opensPaddle > gate, "l'overlay Paddle ne doit s'ouvrir qu'après la vérification");
  assert.match(body, /onPay\(\{/, "sans compte, la main repasse à la fenêtre Pro qui ouvre l'inscription");
});

test('the other Paddle Pro entry point applies the same rule', () => {
  const context = read('../../src/context/AppContext.tsx');
  const start = context.indexOf('const openPaddleProCheckout');
  const end = context.indexOf('const updateApiSettings');
  assert.ok(start > -1 && end > start, 'le point d\'entrée Paddle Pro doit exister');

  const body = context.slice(start, end);
  const gate = body.indexOf('isProCheckoutAccountMissing(');
  const opensPaddle = body.indexOf('openPaddleCheckout(');

  assert.ok(gate > -1 && opensPaddle > gate, 'même règle sur ce point d\'entrée');
  assert.match(body, /openAuthModal\('pro_upgrade'\)/, "l'inscription doit être proposée");
  assert.equal(PRO_ACCOUNT_REQUIRED_TOAST.length > 0, true);
});
