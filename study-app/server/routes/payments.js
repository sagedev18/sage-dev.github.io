const express = require('express');
const db = require('../db');
const { requireAuth } = require('../auth');
const { required, str, int, wrap } = require('../helpers');

const router = express.Router();
router.use(requireAuth);

// Launch pricing. Kept as constants so the amount stored with a payment
// always matches what the site advertised when it was submitted.
const PRICE = { charged: 3500, listed: 5000 };

function currentSettings() {
  const rows = db.prepare('SELECT key, value FROM app_settings').all();
  const out = { price_charged: PRICE.charged, price_listed: PRICE.listed };
  for (const r of rows) out[r.key] = r.value;
  return {
    priceCharged: Number(out.price_charged) || PRICE.charged,
    priceListed: Number(out.price_listed) || PRICE.listed,
    paymentDetails: out.payment_details || '',
    bankName: out.bank_name || '',
    accountName: out.account_name || '',
    accountNumber: out.account_number || '',
    supportEmail: out.support_email || '',
    premiumEnabled: out.premium_enabled !== '0',
  };
}

router.get(
  '/pricing',
  wrap((req, res) => {
    const settings = currentSettings();
    res.json({
      ...settings,
      savings: settings.priceListed - settings.priceCharged,
      isPremium: Boolean(req.dbUser.is_premium),
    });
  })
);

router.get(
  '/',
  wrap((req, res) => {
    const payments = db
      .prepare(
        `SELECT p.*, u.name AS user_name, u.email AS user_email
           FROM payments p
           JOIN users u ON u.id = p.user_id
          WHERE p.user_id = ?
          ORDER BY p.created_at DESC, p.id DESC`
      )
      .all(req.user.sub);
    res.json({ payments, isPremium: Boolean(req.dbUser.is_premium) });
  })
);

router.post(
  '/',
  wrap((req, res) => {
    if (req.dbUser.is_premium) {
      return res.status(400).json({ error: 'Your account is already premium.' });
    }

    const reference = required(req.body.reference, 'Payment reference', 80).toUpperCase();
    const amount = int(req.body.amount, currentSettings().priceCharged, 1, 10_000_000);
    const payerName = str(req.body.payerName, 120);
    const bank = str(req.body.bank, 80);
    const note = str(req.body.note, 500);

    // Guards against the same reference being submitted twice, which would
    // otherwise let one payment unlock multiple accounts.
    const dupe = db
      .prepare("SELECT id FROM payments WHERE UPPER(reference) = ? AND status != 'rejected'")
      .get(reference);
    if (dupe) {
      return res.status(409).json({ error: 'That reference has already been submitted.' });
    }

    const info = db
      .prepare(
        `INSERT INTO payments (user_id, amount, reference, payer_name, bank, note)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(req.user.sub, amount, reference, payerName, bank, note);

    res.status(201).json({
      payment: db.prepare('SELECT * FROM payments WHERE id = ?').get(info.lastInsertRowid),
    });
  })
);

module.exports = router;
module.exports.currentSettings = currentSettings;
module.exports.PRICE = PRICE;