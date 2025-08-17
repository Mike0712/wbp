export async function up(knex) {
  await knex.raw(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);
  await knex.raw(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
}
export async function down(knex) {}
