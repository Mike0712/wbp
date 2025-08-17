export async function up(knex) {
  await knex.raw('create extension if not exists "uuid-ossp"');

  await knex.schema.createTable('users', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.bigInteger('tg_user_id').notNullable().unique(); // Telegram user id
    t.string('tg_username');
    t.string('display_name');
    t.timestamp('created_at').defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('sellers', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.string('code').notNullable().unique(); // sellerA/B/C/D
    t.string('title').notNullable();
    t.timestamp('created_at').defaultTo(knex.fn.now());
  });

  // у одного юзера может быть отдельный телефон на каждого селлера
  await knex.schema.createTable('user_seller_accounts', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('user_id').notNullable().references('users.id').onDelete('cascade');
    t.uuid('seller_id').notNullable().references('sellers.id').onDelete('cascade');
    t.string('phone_e164').notNullable();         // +7....
    t.unique(['user_id','seller_id']);            // по одному номеру на селлера для юзера
    t.timestamp('created_at').defaultTo(knex.fn.now());
  });

  // одноразовые сессии для открытия client.html?seller=...&sid=...
  await knex.schema.createTable('session_tokens', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('user_id').notNullable().references('users.id').onDelete('cascade');
    t.uuid('seller_id').notNullable().references('sellers.id').onDelete('cascade');
    t.string('sid').notNullable().unique();       // рандомный токен
    t.timestamp('expires_at').notNullable();
    t.boolean('used').notNullable().defaultTo(false);
    t.timestamp('created_at').defaultTo(knex.fn.now());
  });

  // для защиты ingest-API шлюза от посторонних узлов
  await knex.schema.createTable('ingest_keys', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.string('seller_code').notNullable().unique();
    t.string('token').notNullable();              // Bearer для seller-ноды
    t.timestamp('created_at').defaultTo(knex.fn.now());
  });
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('ingest_keys');
  await knex.schema.dropTableIfExists('session_tokens');
  await knex.schema.dropTableIfExists('user_seller_accounts');
  await knex.schema.dropTableIfExists('sellers');
  await knex.schema.dropTableIfExists('users');
}
