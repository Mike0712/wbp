export async function seed(knex) {
  await knex("sellers")
    .insert([
      { code: "sellerI", name: "ИП Ильясов" },
      { code: "sellerN", name: "ИП Набиев" },
      { code: "sellerB", name: "ИП Берест" },
      { code: "sellerC", name: "ИП Чуриков" },
    ])
    .onConflict("code")
    .ignore();
}
