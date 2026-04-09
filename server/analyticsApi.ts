/**
 * Analytics API - Wrapper para consultar datos externos
 * Usa MCP GoPoint para Google Ads y Meta Ads
 * Usa Maton para Search Console y GA4
 * Usa Skedu API para datos de ventas/reservas
 */

import { getSkeduEvents } from "./skedu";

// ==========================================
// MCP GoPoint Client
// ==========================================

const MCP_URL = "https://mcp-gopoint.onrender.com/mcp";
const MCP_TOKEN = "fd69a44471f964fa57d0ae9263e071330861bd2c8d9680c24b7524f63e145c47";

// IDs de cuentas Cancagua
const GOOGLE_ADS_CUSTOMER_ID = "1127431927";
const META_ADS_ACCOUNT_TODOS = "act_651846839876922";
const META_ADS_ACCOUNT_IGNACIO = "act_620003496534356";
const GA4_PROPERTY_ID = "532419117";
const SEARCH_CONSOLE_SITE = "https://cancagua.cl/";

async function callMcpTool(toolName: string, args: Record<string, any>): Promise<any> {
  const body = JSON.stringify({
    jsonrpc: "2.0",
    method: "tools/call",
    params: { name: toolName, arguments: args },
    id: Date.now(),
  });

  const resp = await fetch(MCP_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${MCP_TOKEN}`,
      Accept: "application/json, text/event-stream",
    },
    body,
  });

  const text = await resp.text();

  // Parse SSE response
  for (const line of text.split("\n")) {
    if (line.startsWith("data:")) {
      const json = JSON.parse(line.slice(5));
      const content = json?.result?.content?.[0]?.text;
      if (json?.result?.isError) {
        console.error(`[MCP] Error calling ${toolName}:`, content);
        return null;
      }
      try {
        return JSON.parse(content);
      } catch {
        return content;
      }
    }
  }
  return null;
}

// ==========================================
// Maton API Client (Google Search Console, GA4)
// ==========================================

const MATON_API_KEY = process.env.MATON_API_KEY || "";

async function callMaton(path: string, method = "GET", body?: any): Promise<any> {
  const url = `https://gateway.maton.ai${path}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${MATON_API_KEY}`,
    "Content-Type": "application/json",
  };

  const resp = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!resp.ok) {
    console.error(`[Maton] Error ${resp.status} for ${path}`);
    return null;
  }

  return resp.json();
}

// ==========================================
// Google Ads
// ==========================================

export interface GoogleAdsKeyword {
  keyword: string;
  matchType: string;
  campaign: string;
  impressions: number;
  clicks: number;
  cost: number;
  conversions: number;
}

export interface GoogleAdsCampaign {
  name: string;
  status: string;
  impressions: number;
  clicks: number;
  costMicros: number;
  cost: number;
  conversions: number;
}

export interface GoogleAdsMetrics {
  totalImpressions: number;
  totalClicks: number;
  totalCost: number;
  totalConversions: number;
  campaigns: GoogleAdsCampaign[];
  keywords: GoogleAdsKeyword[];
}

export async function fetchGoogleAdsMetrics(startDate: string, endDate: string): Promise<GoogleAdsMetrics | null> {
  // Fetch campaigns and keywords in parallel
  const [campaignData, keywordData] = await Promise.all([
    callMcpTool("google_ads_gaql_query", {
      customer_id: GOOGLE_ADS_CUSTOMER_ID,
      query: `SELECT campaign.name, campaign.status, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions FROM campaign WHERE segments.date BETWEEN '${startDate}' AND '${endDate}' AND campaign.status != 'REMOVED' ORDER BY metrics.cost_micros DESC`,
    }),
    callMcpTool("google_ads_gaql_query", {
      customer_id: GOOGLE_ADS_CUSTOMER_ID,
      query: `SELECT campaign.name, ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions FROM keyword_view WHERE segments.date BETWEEN '${startDate}' AND '${endDate}' ORDER BY metrics.cost_micros DESC LIMIT 30`,
    }),
  ]);

  if (!campaignData?.[0]?.results) return null;

  const campaigns: GoogleAdsCampaign[] = campaignData[0].results.map((r: any) => {
    const costMicros = parseInt(r.metrics?.costMicros || "0");
    return {
      name: r.campaign?.name || "Sin nombre",
      status: r.campaign?.status || "UNKNOWN",
      impressions: parseInt(r.metrics?.impressions || "0"),
      clicks: parseInt(r.metrics?.clicks || "0"),
      costMicros,
      cost: costMicros / 1_000_000,
      conversions: r.metrics?.conversions || 0,
    };
  });

  const keywords: GoogleAdsKeyword[] = (keywordData?.[0]?.results || []).map((r: any) => {
    const costMicros = parseInt(r.metrics?.costMicros || "0");
    return {
      keyword: r.adGroupCriterion?.keyword?.text || "",
      matchType: r.adGroupCriterion?.keyword?.matchType || "",
      campaign: r.campaign?.name || "",
      impressions: parseInt(r.metrics?.impressions || "0"),
      clicks: parseInt(r.metrics?.clicks || "0"),
      cost: costMicros / 1_000_000,
      conversions: r.metrics?.conversions || 0,
    };
  }).filter((k: GoogleAdsKeyword) => k.impressions > 0);

  const activeCampaigns = campaigns.filter(c => c.impressions > 0 || c.cost > 0);

  return {
    totalImpressions: activeCampaigns.reduce((s, c) => s + c.impressions, 0),
    totalClicks: activeCampaigns.reduce((s, c) => s + c.clicks, 0),
    totalCost: activeCampaigns.reduce((s, c) => s + c.cost, 0),
    totalConversions: activeCampaigns.reduce((s, c) => s + c.conversions, 0),
    campaigns: activeCampaigns,
    keywords,
  };
}

// ==========================================
// Meta Ads
// ==========================================

export interface MetaAdsCampaign {
  id: string;
  name: string;
  status: string;
  objective: string;
  impressions: number;
  clicks: number;
  spend: number;
  purchases: number;
  linkClicks: number;
  landingPageViews: number;
}

export interface MetaAdsMetrics {
  totalImpressions: number;
  totalClicks: number;
  totalSpend: number;
  totalPurchases: number;
  totalLandingPageViews: number;
  campaigns: MetaAdsCampaign[];
}

export async function fetchMetaAdsMetrics(startDate: string, endDate: string): Promise<MetaAdsMetrics | null> {
  // Fetch account insights and campaign list in parallel
  const [todosInsights, ignacioInsights, campaignList] = await Promise.all([
    fetchMetaAccountInsights(META_ADS_ACCOUNT_TODOS, startDate, endDate),
    fetchMetaAccountInsights(META_ADS_ACCOUNT_IGNACIO, startDate, endDate),
    callMcpTool("meta_ads_list_campaigns", {
      ad_account_id: META_ADS_ACCOUNT_TODOS,
      status_filter: "ALL",
    }),
  ]);

  // Build campaign name map from list
  const campaignNames = new Map<string, { name: string; objective: string }>();
  if (campaignList?.data) {
    for (const c of campaignList.data) {
      campaignNames.set(c.id, { name: c.name || "Sin nombre", objective: c.objective || "" });
    }
  }

  // Get per-campaign insights
  const campaignInsights = await callMcpTool("meta_ads_get_insights", {
    ad_account_id: META_ADS_ACCOUNT_TODOS,
    object_id: META_ADS_ACCOUNT_TODOS,
    level: "campaign",
    time_range: `{"since":"${startDate}","until":"${endDate}"}`,
    fields: "campaign_id,impressions,clicks,spend,actions",
  });

  const campaigns: MetaAdsCampaign[] = [];
  if (campaignInsights?.data) {
    for (const c of campaignInsights.data) {
      const actions = c.actions || [];
      const purchases = actions.find((a: any) => a.action_type === "purchase")?.value || 0;
      const linkClicks = actions.find((a: any) => a.action_type === "link_click")?.value || 0;
      const lpViews = actions.find((a: any) => a.action_type === "landing_page_view")?.value || 0;
      const campId = c.campaign_id || "";
      const campInfo = campaignNames.get(campId);

      campaigns.push({
        id: campId,
        name: campInfo?.name || "Sin nombre",
        status: "ACTIVE",
        objective: campInfo?.objective || "",
        impressions: parseInt(c.impressions || "0"),
        clicks: parseInt(c.clicks || "0"),
        spend: parseFloat(c.spend || "0"),
        purchases: parseInt(purchases),
        linkClicks: parseInt(linkClicks),
        landingPageViews: parseInt(lpViews),
      });
    }
  }

  // Combine totals from both accounts
  const todos = todosInsights || { impressions: 0, clicks: 0, spend: 0, purchases: 0, landingPageViews: 0 };
  const ignacio = ignacioInsights || { impressions: 0, clicks: 0, spend: 0, purchases: 0, landingPageViews: 0 };

  return {
    totalImpressions: todos.impressions + ignacio.impressions,
    totalClicks: todos.clicks + ignacio.clicks,
    totalSpend: todos.spend + ignacio.spend,
    totalPurchases: todos.purchases + ignacio.purchases,
    totalLandingPageViews: todos.landingPageViews + ignacio.landingPageViews,
    campaigns: campaigns.filter(c => c.impressions > 0 || c.spend > 0),
  };
}

async function fetchMetaAccountInsights(accountId: string, startDate: string, endDate: string) {
  const data = await callMcpTool("meta_ads_get_account_insights", {
    ad_account_id: accountId,
    time_range: `{"since":"${startDate}","until":"${endDate}"}`,
    fields: "impressions,clicks,spend,actions",
  });

  // If account insights fail, try with get_insights using object_id
  if (!data?.data?.[0]) {
    const fallback = await callMcpTool("meta_ads_get_insights", {
      ad_account_id: accountId,
      object_id: accountId,
      time_range: `{"since":"${startDate}","until":"${endDate}"}`,
      fields: "impressions,clicks,spend,actions",
    });
    if (fallback?.data?.[0]) {
      const d = fallback.data[0];
      const actions = d.actions || [];
      return {
        impressions: parseInt(d.impressions || "0"),
        clicks: parseInt(d.clicks || "0"),
        spend: parseFloat(d.spend || "0"),
        purchases: parseInt(actions.find((a: any) => a.action_type === "purchase")?.value || "0"),
        landingPageViews: parseInt(actions.find((a: any) => a.action_type === "landing_page_view")?.value || "0"),
      };
    }
    return null;
  }

  if (!data?.data?.[0]) return null;

  const d = data.data[0];
  const actions = d.actions || [];
  const purchases = parseInt(actions.find((a: any) => a.action_type === "purchase")?.value || "0");
  const lpViews = parseInt(actions.find((a: any) => a.action_type === "landing_page_view")?.value || "0");

  return {
    impressions: parseInt(d.impressions || "0"),
    clicks: parseInt(d.clicks || "0"),
    spend: parseFloat(d.spend || "0"),
    purchases,
    landingPageViews: lpViews,
  };
}

// ==========================================
// Search Console
// ==========================================

export interface SearchQuery {
  query: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface SearchConsoleMetrics {
  totalClicks: number;
  totalImpressions: number;
  avgCtr: number;
  avgPosition: number;
  topQueries: SearchQuery[];
}

export async function fetchSearchConsoleMetrics(startDate: string, endDate: string): Promise<SearchConsoleMetrics | null> {
  const encodedSite = encodeURIComponent(SEARCH_CONSOLE_SITE);
  const data = await callMaton(
    `/google-search-console/webmasters/v3/sites/${encodedSite}/searchAnalytics/query`,
    "POST",
    {
      startDate,
      endDate,
      dimensions: ["query"],
      rowLimit: 25,
    }
  );

  if (!data?.rows) return null;

  const topQueries: SearchQuery[] = data.rows.map((r: any) => ({
    query: r.keys[0],
    clicks: r.clicks,
    impressions: r.impressions,
    ctr: r.ctr,
    position: r.position,
  }));

  return {
    totalClicks: topQueries.reduce((s, q) => s + q.clicks, 0),
    totalImpressions: topQueries.reduce((s, q) => s + q.impressions, 0),
    avgCtr: topQueries.length > 0 ? topQueries.reduce((s, q) => s + q.ctr, 0) / topQueries.length : 0,
    avgPosition: topQueries.length > 0 ? topQueries.reduce((s, q) => s + q.position, 0) / topQueries.length : 0,
    topQueries,
  };
}

// ==========================================
// Search Console - Pages
// ==========================================

export interface SearchPage {
  page: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export async function fetchSearchConsolePages(startDate: string, endDate: string): Promise<SearchPage[]> {
  const encodedSite = encodeURIComponent(SEARCH_CONSOLE_SITE);
  const data = await callMaton(
    `/google-search-console/webmasters/v3/sites/${encodedSite}/searchAnalytics/query`,
    "POST",
    {
      startDate,
      endDate,
      dimensions: ["page"],
      rowLimit: 15,
    }
  );

  if (!data?.rows) return [];

  return data.rows.map((r: any) => ({
    page: r.keys[0].replace(SEARCH_CONSOLE_SITE, "/"),
    clicks: r.clicks,
    impressions: r.impressions,
    ctr: r.ctr,
    position: r.position,
  }));
}

// ==========================================
// Skedu (Ventas / Reservas)
// ==========================================

export interface SkeduSale {
  id: string;
  serviceName: string;
  clientName: string;
  date: string;
  status: string;
  price: number;
}

export interface SkeduMetrics {
  totalBookings: number;
  confirmedBookings: number;
  cancelledBookings: number;
  totalRevenue: number;
  serviceBreakdown: { name: string; count: number; revenue: number }[];
  bookings: SkeduSale[];
}

export async function fetchSkeduMetrics(startDate: string, endDate: string): Promise<SkeduMetrics | null> {
  try {
    const data = await getSkeduEvents({ startDate, endDate });

    const items = data?.Data || data?.data || [];
    if (!Array.isArray(items) || items.length === 0) return null;

    const bookings: SkeduSale[] = items.map((b: any) => ({
      id: b.UUID || b.ID || "",
      serviceName: b.Service?.Name || b.Variant?.Name || "Sin servicio",
      clientName: b.Fields?.["Exención de responsabilidad "] || "Sin cliente",
      date: b.StartsAt || "",
      status: b.IsConfirmed ? "confirmed" : (b.DeletedAt ? "cancelled" : "pending"),
      price: b.SessionPrice || b.SessionPriceWithDiscount || 0,
    }));

    const confirmed = bookings.filter(b => b.status === "confirmed");
    const cancelled = bookings.filter(b => b.status === "cancelled");

    // Service breakdown
    const serviceMap = new Map<string, { count: number; revenue: number }>();
    for (const b of confirmed) {
      const existing = serviceMap.get(b.serviceName) || { count: 0, revenue: 0 };
      existing.count++;
      existing.revenue += b.price;
      serviceMap.set(b.serviceName, existing);
    }

    const serviceBreakdown = Array.from(serviceMap.entries())
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.revenue - a.revenue);

    return {
      totalBookings: bookings.length,
      confirmedBookings: confirmed.length,
      cancelledBookings: cancelled.length,
      totalRevenue: confirmed.reduce((s, b) => s + b.price, 0),
      serviceBreakdown,
      bookings,
    };
  } catch (error) {
    console.error("[Analytics] Error fetching Skedu data:", error);
    return null;
  }
}

// ==========================================
// DataForSEO - Keyword trends
// ==========================================

export interface KeywordTrend {
  keyword: string;
  searchVolume: number;
  competition: string;
  cpc: number;
}

export async function fetchKeywordTrends(): Promise<KeywordTrend[]> {
  // Keywords agrupadas por servicio real de Cancagua
  const keywords = [
    // Biopiscinas (servicio principal)
    "biopiscinas", "biopiscinas frutillar", "piscinas termales frutillar",
    // Hot Tubs
    "hot tub frutillar", "hot tubs sur de chile", "jacuzzi frutillar",
    // Masajes
    "masajes frutillar", "masaje relajante frutillar", "masaje descontracturante sur chile",
    // Spa general
    "spa frutillar", "spa puerto varas", "spa sur de chile", "spa lago llanquihue",
    // Termas / Aguas termales
    "termas frutillar", "termas puerto varas", "termas region de los lagos", "aguas termales chile",
    // Sauna
    "sauna frutillar", "sauna sur chile",
    // Gift Cards
    "gift card spa chile", "regalo spa sur chile",
    // Marca
    "cancagua", "cancagua spa",
    // Eventos
    "eventos frutillar", "evento corporativo frutillar",
  ];

  const data = await callMcpTool("dataforseo_keyword_search_volume", {
    keywords,
    location_code: 2152, // Chile
    language_code: "es",
  });

  if (!data?.tasks?.[0]?.result) return [];

  return data.tasks[0].result.map((r: any) => ({
    keyword: r.keyword || "",
    searchVolume: r.search_volume || 0,
    competition: r.competition || "N/A",
    cpc: r.cpc || 0,
  })).sort((a: KeywordTrend, b: KeywordTrend) => b.searchVolume - a.searchVolume);
}

// ==========================================
// Aggregated Dashboard Data
// ==========================================

export interface DashboardData {
  period: { startDate: string; endDate: string };
  googleAds: GoogleAdsMetrics | null;
  metaAds: MetaAdsMetrics | null;
  searchConsole: SearchConsoleMetrics | null;
  searchPages: SearchPage[];
  skedu: SkeduMetrics | null;
  keywordTrends: KeywordTrend[];
  summary: {
    totalInvestment: number;
    totalRevenue: number;
    roas: number;
    totalConversions: number;
    costPerConversion: number;
  };
}

export async function fetchDashboardData(startDate: string, endDate: string): Promise<DashboardData> {
  // Fetch all data in parallel
  const [googleAds, metaAds, searchConsole, searchPages, skedu, keywordTrends] = await Promise.all([
    fetchGoogleAdsMetrics(startDate, endDate).catch(e => { console.error("[Analytics] Google Ads error:", e); return null; }),
    fetchMetaAdsMetrics(startDate, endDate).catch(e => { console.error("[Analytics] Meta Ads error:", e); return null; }),
    fetchSearchConsoleMetrics(startDate, endDate).catch(e => { console.error("[Analytics] Search Console error:", e); return null; }),
    fetchSearchConsolePages(startDate, endDate).catch(e => { console.error("[Analytics] Search Pages error:", e); return []; }),
    fetchSkeduMetrics(startDate, endDate).catch(e => { console.error("[Analytics] Skedu error:", e); return null; }),
    fetchKeywordTrends().catch(e => { console.error("[Analytics] Keywords error:", e); return []; }),
  ]);

  const totalInvestment = (googleAds?.totalCost || 0) + (metaAds?.totalSpend || 0);
  const totalRevenue = skedu?.totalRevenue || 0;
  const totalConversions = (googleAds?.totalConversions || 0) + (metaAds?.totalPurchases || 0);

  return {
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
      roas: totalInvestment > 0 ? totalRevenue / totalInvestment : 0,
      totalConversions,
      costPerConversion: totalConversions > 0 ? totalInvestment / totalConversions : 0,
    },
  };
}
