import { Telegraf, Markup } from 'telegraf';
import knexFn from 'knex';
import knexfile from './knexfile.js';
import fetch from 'node-fetch';

const BOT_TOKEN = process.env.BOT_TOKEN;
if (!BOT_TOKEN) {
  console.error('BOT_TOKEN is not set');
  process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);
const knex = knexFn(knexfile);

const PUBLIC_CLIENT_BASE = process.env.PUBLIC_CLIENT_BASE || 'https://proxy.example.com/client.html';
const AUTH_URL = process.env.AUTH_URL || 'http://auth-api:8080/auth/issue-sid';
const BOT_INTERNAL_SECRET = process.env.BOT_INTERNAL_SECRET || '';

const ADMINS = (process.env.BOT_ADMINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)
  .map((s) => Number(s));

/** Получить список селлеров, к которым у юзера есть привязка (user_seller_accounts) */
async function getLinkedSellers(userId) {
  return knex('user_seller_accounts as usa')
    .join('sellers as s', 'usa.seller_id', 's.id')
    .select('s.code', 's.title')
    .where('usa.user_id', userId);
}

function sellerMenuFromList(list) {
  // строим меню только из доступных селлеров
  const rows = list.map((s) => [Markup.button.callback(s.title, `seller:${s.code}`)]);
  return Markup.inlineKeyboard(rows.length ? rows : [[Markup.button.callback('— нет доступных продавцов —', 'nope')]]);
}

// -------------------------- Регистрация --------------------------

/** /start — если юзера нет → кнопка регистрации; если есть → показать меню только при наличии связей */
bot.start(async (ctx) => {
  const tg_user_id = ctx.from.id;
  const user = await knex('users').where({ tg_user_id }).first();
  if (!user) {
    return ctx.reply(
      'Привет! Тебя ещё нет в системе. Нажми кнопку, чтобы зарегистрироваться.',
      Markup.inlineKeyboard([[Markup.button.callback('✅ Зарегистрироваться', 'reg')]])
    );
  }
  // есть пользователь — проверим связи
  const linked = await getLinkedSellers(user.id);
  if (!linked.length) {
    return ctx.reply(
      'Вы зарегистрированы, но доступ к продавцам ещё не выдан.\nОбратитесь к администратору.',
    );
  }
  return ctx.reply('Выберите продавца:', sellerMenuFromList(linked));
});

/** Кнопка регистрации — создаём запись в users, НО меню показываем только если уже есть связи */
bot.action('reg', async (ctx) => {
  const tg_user_id = ctx.from.id;
  let user = await knex('users').where({ tg_user_id }).first();
  if (!user) {
    const tg_username = ctx.from.username || null;
    const display_name = `${ctx.from.first_name || ''} ${ctx.from.last_name || ''}`.trim();
    await knex('users').insert({ tg_user_id, tg_username, display_name });
    user = await knex('users').where({ tg_user_id }).first();
  }
  const linked = await getLinkedSellers(user.id);
  if (!linked.length) {
    try {
      await ctx.editMessageText('Регистрация выполнена. Доступов пока нет — обратитесь к администратору.');
    } catch {
      await ctx.reply('Регистрация выполнена. Доступов пока нет — обратитесь к администратору.');
    }
    return;
  }
  try {
    await ctx.editMessageText('Выберите продавца:', sellerMenuFromList(linked));
  } catch {
    await ctx.reply('Выберите продавца:', sellerMenuFromList(linked));
  }
});

// -------------------------- Вспомогательные команды --------------------------

bot.command('myid', async (ctx) => {
  await ctx.reply(`Ваш Telegram ID: \`${ctx.from.id}\``, { parse_mode: 'Markdown' });
});

/**
 * /setphone @username sellerA +7...
 * Админ привязывает (или обновляет) номер сотрудника к селлеру.
 * После этого у юзера появится доступ к sellerA в меню.
 */
bot.command('setphone', async (ctx) => {
  try {
    if (!ADMINS.includes(ctx.from.id)) return;
    const text = ctx.message.text || '';
    const [, uname, sellerCode, phoneRaw] = text.trim().split(/\s+/);
    if (!uname || !sellerCode || !phoneRaw) {
      return ctx.reply('Формат: /setphone @username sellerA +7...');
    }
    const username = uname.replace(/^@/, '');
    const user = await knex('users').whereRaw('lower(tg_username)=lower(?)', [username]).first();
    if (!user) return ctx.reply('Пользователь с таким @username не найден');

    const seller = await knex('sellers').where({ code: sellerCode }).first();
    if (!seller) return ctx.reply('Неизвестный seller_code');

    // вставим/обновим связь; телефон сохраняем как есть (валидацию можно добавить отдельно)
    await knex('user_seller_accounts')
      .insert({ user_id: user.id, seller_id: seller.id, phone_e164: phoneRaw })
      .onConflict(['user_id', 'seller_id'])
      .merge({ phone_e164: phoneRaw });

    await ctx.reply(`OK: @${username} → ${sellerCode} → ${phoneRaw}`);
  } catch (e) {
    console.error(e);
    await ctx.reply('Ошибка /setphone');
  }
});

// -------------------------- Выбор продавца (только из доступных) --------------------------

bot.action(/seller:(.+)/, async (ctx) => {
  const code = ctx.match[1];
  const tg_user_id = ctx.from.id;

  const user = await knex('users').where({ tg_user_id }).first();
  if (!user) {
    return ctx.answerCbQuery('Сначала зарегистрируйтесь (/start)', { show_alert: true });
  }
  // Разрешаем только если есть связь user↔seller
  const linked = await knex('user_seller_accounts as usa')
    .join('sellers as s', 'usa.seller_id', 's.id')
    .where('usa.user_id', user.id)
    .andWhere('s.code', code)
    .first();

  if (!linked) {
    return ctx.answerCbQuery('Нет доступа к этому продавцу', { show_alert: true });
  }

  const seller = await knex('sellers').where({ code }).first();
  if (!seller) return ctx.answerCbQuery('Неизвестный продавец', { show_alert: true });

  await sendOpenLink(ctx, user, seller);
});

bot.action('nope', async (ctx) => {
  await ctx.answerCbQuery('Доступов нет. Обратитесь к администратору.', { show_alert: true });
});

// -------------------------- Ссылка на сессию --------------------------

async function sendOpenLink(ctx, user, seller) {
  try {
    const r = await fetch(AUTH_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        secret: BOT_INTERNAL_SECRET,
        tg_user_id: user.tg_user_id,
        tg_username: user.tg_username,
        display_name: user.display_name,
        seller_code: seller.code,
      }),
    });
    if (!r.ok) return ctx.reply('Не удалось получить сессию. Попробуйте позже.');
    const { sid } = await r.json();
    const url = `${PUBLIC_CLIENT_BASE}?seller=${encodeURIComponent(seller.code)}&sid=${encodeURIComponent(sid)}`;
    await ctx.reply(`Открывайте кабинет **${seller.title}**:`, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: 'Открыть кабинет', url }],
        ],
      },
    });
  } catch (e) {
    console.error(e);
    await ctx.reply('Ошибка связи с auth-api.');
  }
}

// -------------------------- Start bot --------------------------
bot.launch().then(() => console.log('bot started'));