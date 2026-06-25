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
  { name: "B2C-Mujeres-Activas", description: "Segmento mujeres activas" },
  { name: "B2B-Prioridad-1", description: "Empresas B2B de alta prioridad" },
  { name: "B2B-Universidades", description: "Universidades y centros educativos" },
];

export async function runSeedIfNeeded() {
  const db = await getDb();
  if (!db) return;

  try {
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
