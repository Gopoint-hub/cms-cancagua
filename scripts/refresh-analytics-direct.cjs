/**
 * Script directo para regenerar analytics cache usando fetch nativo
 * Uso: node scripts/refresh-analytics-direct.js 2026-05
 */
const fs = require('fs');

const MATON_API_KEY = process.env.MATON_API_KEY || "";
const SKEDU_APP_ID = process.env.SKEDU_APP_ID || "";
const SKEDU_APP_SECRET = process.env.SKEDU_APP_SECRET || "";
const SKEDU_STORE_UUID = "c5e0a893-7eff-42b8-815a-296b1a9c345d";
const SEARCH_CONSOLE_SITE = "https://cancagua.cl/";

const DATABASE_URL = process.env.DATABASE_URL;

function getDaysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

async function fetchSearchConsole(startDate, endDate) {
  const site = encodeURIComponent(SEARCH_CONSOLE_SITE);
  const body = JSON.stringify({ startDate, endDate, dimensions: ["query"], rowLimit: 25 });
  const resp = await fetch(
    `https://gateway.maton.ai/google-search-console/webmasters/v3/sites/${site}/searchAnalytics/query`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${MATON_API_KEY}`, "Content-Type": "application/json" },
      body,
    }
  );
  if (!resp.ok) return null;
  const data = await resp.json();
  if (!data.rows) return null;
  const topQueries = data.rows.map(r => ({
    query: r.keys[0],
    clicks: r.clicks,
    impressions: r.impressions,
    ctr: r.ctr,
    position: r.position,
  }));
  const totalClicks = topQueries.reduce((s, q) => s + q.clicks, 0);
  const totalImpressions = topQueries.reduce((s, q) => s + q.impressions, 0);
  return {
    totalClicks,
    totalImpressions,
    avgCtr: topQueries.length > 0 ? topQueries.reduce((s, q) => s + q.ctr, 0) / topQueries.length : 0,
    avgPosition: topQueries.length > 0 ? topQueries.reduce((s, q) => s + q.position, 0) / topQueries.length : 0,
    topQueries,
  };
}

async function fetchSearchPages(startDate, endDate) {
  const site = encodeURIComponent(SEARCH_CONSOLE_SITE);
  const body = JSON.stringify({ startDate, endDate, dimensions: ["page"], rowLimit: 15 });
  const resp = await fetch(
    `https://gateway.maton.ai/google-search-console/webmasters/v3/sites/${site}/searchAnalytics/query`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${MATON_API_KEY}`, "Content-Type": "application/json" },
      body,
    }
  );
  if (!resp.ok) return [];
  const data = await resp.json();
  if (!data.rows) return [];
  return data.rows.map(r => ({
    page: r.keys[0].replace(SEARCH_CONSOLE_SITE, "/"),
    clicks: r.clicks,
    impressions: r.impressions,
    ctr: r.ctr,
    position: r.position,
  }));
}

async function fetchSkedu(startDate, endDate) {
  const params = new URLSearchParams({
    StoreUUID: SKEDU_STORE_UUID,
    limit: "1500",
    "StartsAt~ge": startDate + "T00:00:00Z",
    "StartsAt~lt": endDate + "T23:59:59Z",
  });
  const resp = await fetch(`https://api.getskedu.com/appointments?${params}`, {
    headers: {
      "X-Skedu-App-ID": SKEDU_APP_ID,
      "X-Skedu-App-Secret": SKEDU_APP_SECRET,
      "User-Agent": "Mozilla/5.0 (compatible; CancaguaCMS/1.0; +https://cms.cancagua.cl)",
      Accept: "application/json",
      "Accept-Language": "es-CL,es;q=0.9,en;q=0.8",
    },
  });
  if (!resp.ok) {
    console.error("[Skedu] HTTP", resp.status);
    return null;
  }
  const data = await resp.json();
  const items = data?.Data || data?.data || [];
  if (!Array.isArray(items) || items.length === 0) return null;

  const bookings = items.map(b => ({
    id: b.UUID || b.ID || "",
    serviceName: b.Service?.Name || b.Variant?.Name || "Sin servicio",
    clientName: "Sin cliente",
    date: b.StartsAt || "",
    status: b.IsConfirmed ? "confirmed" : (b.DeletedAt ? "cancelled" : "pending"),
    price: b.SessionPrice || b.SessionPriceWithDiscount || 0,
  }));

  const confirmed = bookings.filter(b => b.status === "confirmed");
  const cancelled = bookings.filter(b => b.status === "cancelled");

  const serviceMap = new Map();
  for (const b of confirmed) {
    const ex = serviceMap.get(b.serviceName) || { count: 0, revenue: 0 };
    ex.count++;
    ex.revenue += b.price;
    serviceMap.set(b.serviceName, ex);
  }

  const serviceBreakdown = Array.from(serviceMap.entries())
    .map(([name, d]) => ({ name, count: d.count, revenue: d.revenue }))
    .sort((a, b) => b.revenue - a.revenue);

  return {
    totalBookings: bookings.length,
    confirmedBookings: confirmed.length,
    cancelledBookings: cancelled.length,
    totalRevenue: confirmed.reduce((s, b) => s + b.price, 0),
    serviceBreakdown,
    // bookings: omitimos la lista completa para no exceder el límite TEXT (64KB)
  };
}

async function saveToDb(periodKey, data) {
  const mysql = require("mysql2/promise");
  const conn = await mysql.createConnection(DATABASE_URL);
  const jsonData = JSON.stringify(data);
  const [existing] = await conn.execute(
    "SELECT id FROM analytics_cache WHERE period_key = ? LIMIT 1",
    [periodKey]
  );
  if (existing.length > 0) {
    await conn.execute(
      "UPDATE analytics_cache SET data = ?, updated_at = NOW() WHERE id = ?",
      [jsonData, existing[0].id]
    );
  } else {
    await conn.execute(
      "INSERT INTO analytics_cache (period_key, data, updated_at) VALUES (?, ?, NOW())",
      [periodKey, jsonData]
    );
  }
  await conn.end();
}

async function main() {
  const periodKey = process.argv[2];
  if (!periodKey || !/^\d{4}-\d{2}$/.test(periodKey)) {
    console.error("Uso: node scripts/refresh-analytics-direct.js YYYY-MM");
    process.exit(1);
  }

  const [y, m] = periodKey.split("-").map(Number);
  const startDate = `${periodKey}-01`;
  const endDate = `${periodKey}-${getDaysInMonth(y, m)}`;

  console.log(`Refrescando ${periodKey} (${startDate} - ${endDate})...\n`);

  console.time("total");

  const [searchConsole, searchPages, skedu] = await Promise.all([
    fetchSearchConsole(startDate, endDate).catch(e => { console.error("SC error:", e.message); return null; }),
    fetchSearchPages(startDate, endDate).catch(e => { console.error("SC pages error:", e.message); return []; }),
    fetchSkedu(startDate, endDate).catch(e => { console.error("Skedu error:", e.message); return null; }),
  ]);

  const googleAds = null;
  const metaAds = null;
  const keywordTrends = [];

  const totalInvestment = 0;
  const totalRevenue = skedu?.totalRevenue || 0;
  const totalConversions = 0;

  const payload = {
    period: { startDate, endDate },
    googleAds,
    metaAds,
    searchConsole,
    searchPages,
    skedu,
    keywordTrends,
    summary: {
      totalInvestment,
      totalRevenue,
      roas: 0,
      totalConversions,
      costPerConversion: 0,
    },
  };

  console.log("\nResultados:");
  console.log("  Search Console:", searchConsole ? `${searchConsole.totalClicks} clicks, ${searchConsole.totalImpressions} impresiones` : "null");
  console.log("  Search Pages:", searchPages.length);
  console.log("  Skedu:", skedu ? `${skedu.confirmedBookings} confirmadas, $${skedu.totalRevenue}` : "null");
  console.log("  Revenue:", totalRevenue);

  await saveToDb(periodKey, payload);
  console.log(`\nGuardado en BD: ${periodKey}`);

  console.timeEnd("total");
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
