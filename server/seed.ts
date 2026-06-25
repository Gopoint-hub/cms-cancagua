import { getDb, fastBulkImportSubscribers, getSubscriberIdsByEmails, bulkAddSubscribersToList, createList } from "./db";
import { sql } from "drizzle-orm";
import { readFileSync } from "fs";
import { join } from "path";

const DEFAULT_LISTS = [
  { name: "B2C-VIP", description: "Clientes VIP - Alta frecuencia y ticket promedio" },
  { name: "B2C-Loyal", description: "Clientes leales - Múltiples visitas recientes" },
  { name: "B2C-Regular", description: "Clientes regulares - Visitas periódicas" },
  { name: "B2C-Occasional", description: "Clientes ocasionales - Visitas esporádicas" },
  { name: "B2C-Cold", description: "Clientes fríos - Sin visitas recientes" },
  { name: "B2C-Sin-Pedidos", description: "Contactos con ordersCount 0 - validar antes de campañas masivas" },
  { name: "B2C-Mujeres-Activas", description: "Segmento mujeres activas" },
  { name: "B2B-Prioridad-1", description: "Empresas B2B de alta prioridad" },
  { name: "B2B-Universidades", description: "Universidades y centros educativos" },
];

async function ensureMarketingTables(db: any) {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS marketing_calendar_events (
      id int AUTO_INCREMENT NOT NULL,
      date varchar(10) NOT NULL,
      title text NOT NULL,
      type enum('newsletter','personal','social','otro') NOT NULL DEFAULT 'newsletter',
      audience text,
      subject text,
      notes text,
      status enum('pending','done','cancelled') NOT NULL DEFAULT 'pending',
      html_template text,
      created_by_id int,
      created_at timestamp NOT NULL DEFAULT (now()),
      updated_at timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT marketing_calendar_events_id PRIMARY KEY(id)
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS marketing_blog_articles (
      id int AUTO_INCREMENT NOT NULL,
      title text NOT NULL,
      slug varchar(255) NOT NULL,
      content text NOT NULL,
      meta_description text,
      meta_keywords text,
      category varchar(100),
      estimated_reading_time int NOT NULL DEFAULT 5,
      status enum('draft','approved','published') NOT NULL DEFAULT 'draft',
      campaign_subject text,
      published_url text,
      published_at timestamp,
      created_by_id int,
      created_at timestamp NOT NULL DEFAULT (now()),
      updated_at timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT marketing_blog_articles_id PRIMARY KEY(id),
      CONSTRAINT marketing_blog_articles_slug_unique UNIQUE(slug)
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS personal_email_logs (
      id int AUTO_INCREMENT NOT NULL,
      \`to\` varchar(320) NOT NULL,
      primer_nombre varchar(120),
      subject text NOT NULL,
      body_text text NOT NULL,
      reply_to varchar(320),
      status enum('sent','failed') NOT NULL,
      provider_id varchar(255),
      error_message text,
      sent_by_id int,
      sent_at timestamp NOT NULL DEFAULT (now()),
      CONSTRAINT personal_email_logs_id PRIMARY KEY(id)
    )
  `);
}

export async function runSeedIfNeeded() {
  const db = await getDb();
  if (!db) return;

  try {
    await ensureMarketingTables(db);
    const { subscriberLists, newsletterSubscribers } = await import("../drizzle/schema");

    // ── 1. Create missing default lists ────────────────────────────────────
    const existingLists = await db.select().from(subscriberLists);
    const existingListNames = new Set(existingLists.map((list: any) => list.name));
    const missingLists = DEFAULT_LISTS.filter((list) => !existingListNames.has(list.name));
    if (missingLists.length > 0) {
      console.log(`[seed] Creating ${missingLists.length} missing default subscriber lists...`);
      for (const list of missingLists) {
        await createList(list);
      }
      console.log(`[seed] ${missingLists.length} subscriber lists created.`);
    }

    // Load seed file
    const seedPath = join(__dirname, "data", "seed_contacts.json");
    const contacts: Array<{ email: string; name?: string; segment?: string }> = JSON.parse(
      readFileSync(seedPath, "utf-8")
    );
    const uniqueSeedEmails = new Set(contacts.map((contact) => contact.email.toLowerCase().trim()));

    // ── 2. Import contacts while seed contacts are missing ─────────────────
    const [countRow] = await db
      .select({ count: sql<number>`count(*)` })
      .from(newsletterSubscribers)
      .catch(() => [{ count: 0 }]);

    const existingCount = Number(countRow?.count ?? 0);
    if (existingCount >= uniqueSeedEmails.size) {
      console.log(`[seed] ${existingCount} subscribers already exist — skipping contact import.`);
      return;
    }
    console.log(`[seed] Importing ${contacts.length} segment rows for ${uniqueSeedEmails.size} unique contacts...`);

    // Get list map by name
    const lists = await db.select().from(subscriberLists);
    const listMap = Object.fromEntries(lists.map((l: any) => [l.name, l.id]));

    // Group contacts by segment
    const bySegment = new Map<string, typeof contacts>();
    for (const c of contacts) {
      const seg = c.segment ?? "";
      if (!bySegment.has(seg)) bySegment.set(seg, []);
      bySegment.get(seg)!.push(c);
    }

    let totalCreated = 0;
    let totalSkipped = 0;

    for (const [segment, segContacts] of Array.from(bySegment.entries())) {
      const result = await fastBulkImportSubscribers(segContacts);
      totalCreated += result.created;
      totalSkipped += result.skipped;

      const listId = listMap[segment];
      if (listId) {
        const emails = segContacts.map((c: { email: string }) => c.email);
        const ids = await getSubscriberIdsByEmails(emails);
        if (ids.length > 0) await bulkAddSubscribersToList(ids, listId);
        console.log(`[seed]   ${segment}: ${result.created} new, assigned to list ${listId}`);
      }
    }

    console.log(`[seed] Import complete — created: ${totalCreated}, skipped: ${totalSkipped}`);
  } catch (err) {
    console.error("[seed] Error during seed:", err);
  }
}
