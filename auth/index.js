import express from 'express';
import knexfile from './knexfile.js';
import knexFn from 'knex';
import { randomBytes } from 'crypto';

const app = express();
app.use(express.json());

const db = knexFn(knexfile);
const SID_TTL = Number(process.env.SID_TTL_SECONDS || 900);
const BOT_INTERNAL_SECRET = process.env.BOT_INTERNAL_SECRET || '';

async function findOrCreateUserByTg({ tg_user_id, tg_username, display_name }) {
  const existing = await db('users').where({ tg_user_id }).first();
  if (existing) return existing;
  const [row] = await db('users')
    .insert({ tg_user_id, tg_username, display_name })
    .returning('*');
  return row;
}

app.post('/auth/issue-sid', async (req, res) => {
  try {
    const { secret, tg_user_id, tg_username, display_name, seller_code } = req.body || {};
    if (secret !== BOT_INTERNAL_SECRET) return res.status(403).json({ error: 'forbidden' });
    if (!tg_user_id || !seller_code) return res.status(400).json({ error: 'bad_request' });

    const user = await findOrCreateUserByTg({ tg_user_id, tg_username, display_name });
    const seller = await db('sellers').where({ code: seller_code }).first();
    if (!seller) return res.status(404).json({ error: 'seller_not_found' });

    const acc = await db('user_seller_accounts').where({ user_id: user.id, seller_id: seller.id }).first();
    if (!acc) return res.status(403).json({ error: 'no_phone_for_seller' });

    const sid = randomBytes(24).toString('hex');
    const expiresAt = new Date(Date.now() + SID_TTL * 1000);
    await db('session_tokens').insert({ user_id: user.id, seller_id: seller.id, sid, expires_at: expiresAt });

    res.json({ sid, expires_at: expiresAt.toISOString() });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'server_error' });
  }
});

app.get('/auth/validate', async (req, res) => {
  const { sid, seller } = req.query;
  if (!sid || !seller) return res.status(400).json({ ok: false });
  
  const sellerRow = await db('sellers').where({ code: seller }).first();
  if (!sellerRow) return res.json({ ok: false });

  const row = await db('session_tokens')
    .where({ sid, seller_id: sellerRow.id, used: false })
    .andWhere('expires_at', '>', db.fn.now())
    .first();

  if (!row) return res.json({ ok: false });

  await db('session_tokens').where({ id: row.id }).update({ used: true });
  res.json({ ok: true, user_id: row.user_id, seller_code: seller });
});

app.post('/ingest/verify', async (req, res) => {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const { seller_code } = req.body || {};
  if (!token || !seller_code) return res.status(400).json({ ok: false });
  const row = await db('ingest_keys').where({ seller_code, token }).first();
  res.json({ ok: !!row });
});

const PORT = Number(process.env.PORT || 8080);
app.listen(PORT, () => console.log('auth-api on :' + PORT));