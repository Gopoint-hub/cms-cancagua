import { z } from "zod";
import { router, protectedProcedure } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { invokeLLM } from "./_core/llm";
import * as db from "./db";

const EVENTOS_EMAIL = "Cancagua Eventos <eventos@cancagua.cl>";

export const marketingRouter = router({
  // ─── Envío personal one-to-one desde eventos@cancagua.cl ─────────────────
  sendPersonalEmail: protectedProcedure
    .input(
      z.object({
        to: z.string().email(),
        primerNombre: z.string().optional(),
        subject: z.string().min(2),
        bodyText: z.string().min(10),
        replyTo: z.string().email().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (
        ctx.user.role !== "super_admin" &&
        ctx.user.role !== "admin" &&
        ctx.user.role !== "editor"
      ) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      const { Resend } = await import("resend");
      const resend = new Resend(process.env.RESEND_API_KEY);

      const personalizedBody = input.primerNombre
        ? input.bodyText.replace(/\{\{primer_nombre\}\}/gi, input.primerNombre)
        : input.bodyText.replace(/\{\{primer_nombre\}\}/gi, "");

      const { data, error } = await resend.emails.send({
        from: EVENTOS_EMAIL,
        to: [input.to],
        subject: input.subject,
        text: personalizedBody,
        replyTo: input.replyTo || "eventos@cancagua.cl",
        tags: [{ name: "type", value: "personal" }],
      });

      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error.message,
        });
      }

      return { success: true, id: data?.id };
    }),

  // ─── Generación de artículo de blog con IA ───────────────────────────────
  generateBlogArticle: protectedProcedure
    .input(
      z.object({
        campaignSubject: z.string(),
        campaignBody: z.string().optional(),
        targetAudience: z.string().optional(),
        additionalContext: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (
        ctx.user.role !== "super_admin" &&
        ctx.user.role !== "admin" &&
        ctx.user.role !== "editor"
      ) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      const prompt = `Eres un experto en SEO y AEO (Answer Engine Optimization) para Cancagua Spa & Retreat Center, ubicado en Puerto Varas, Chile. Cancagua ofrece biopiscinas geotermales naturales, masajes, retiros de bienestar, y eventos corporativos.

Acaba de salir una campaña de email marketing con el asunto: "${input.campaignSubject}"
${input.campaignBody ? `Contenido de la campaña:\n${input.campaignBody.slice(0, 500)}` : ""}
${input.targetAudience ? `Audiencia objetivo: ${input.targetAudience}` : ""}
${input.additionalContext ? `Contexto adicional: ${input.additionalContext}` : ""}

Genera un artículo de blog optimizado en SEO y AEO que:
1. Esté relacionado temáticamente con la campaña enviada
2. Tenga entre 800-1200 palabras
3. Incluya H1, H2, H3 correctamente jerarquizados
4. Responda preguntas frecuentes (AEO) que los usuarios harían sobre el tema
5. Incluya palabras clave long-tail para el sur de Chile / Puerto Varas / bienestar / spa
6. Tenga una conclusión con CTA hacia cancagua.cl
7. Sea en español chileno natural

Responde SOLAMENTE con un JSON con esta estructura exacta:
{
  "title": "Título del artículo (H1)",
  "slug": "url-amigable-del-articulo",
  "metaDescription": "Descripción meta para SEO (150-160 caracteres)",
  "metaKeywords": ["keyword1", "keyword2", "keyword3"],
  "content": "Contenido completo del artículo en Markdown",
  "estimatedReadingTime": 5,
  "category": "Bienestar|Spa|Eventos|Naturaleza|Corporativo"
}`;

      const result = await invokeLLM({
        messages: [{ role: "user", content: prompt }],
        responseFormat: { type: "json_object" },
      });

      const raw =
        result.choices[0]?.message?.content;
      const text = typeof raw === "string" ? raw : JSON.stringify(raw);

      let article: any;
      try {
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        article = jsonMatch ? JSON.parse(jsonMatch[0]) : JSON.parse(text);
      } catch {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Error al parsear la respuesta de IA",
        });
      }

      return {
        title: article.title || "Artículo generado",
        slug: article.slug || `articulo-${Date.now()}`,
        metaDescription: article.metaDescription || "",
        metaKeywords: article.metaKeywords || [],
        content: article.content || text,
        estimatedReadingTime: article.estimatedReadingTime || 5,
        category: article.category || "Bienestar",
        generatedAt: new Date().toISOString(),
      };
    }),

  // ─── Publicar artículo en web-cancagua ───────────────────────────────────
  publishBlogArticle: protectedProcedure
    .input(
      z.object({
        title: z.string(),
        slug: z.string(),
        content: z.string(),
        metaDescription: z.string().optional(),
        metaKeywords: z.array(z.string()).optional(),
        category: z.string().optional(),
        author: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (
        ctx.user.role !== "super_admin" &&
        ctx.user.role !== "admin"
      ) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      const token = process.env.GITHUB_TOKEN;
      if (!token) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "GITHUB_TOKEN no configurado",
        });
      }

      const date = new Date().toISOString().split("T")[0];
      const fileName = `blog-articles/${input.slug}-${date}.md`;

      const frontmatter = `---
title: "${input.title.replace(/"/g, '\\"')}"
slug: "${input.slug}"
date: "${date}"
author: "${input.author || "Cancagua"}"
category: "${input.category || "Bienestar"}"
metaDescription: "${(input.metaDescription || "").replace(/"/g, '\\"')}"
keywords: [${(input.metaKeywords || []).map((k) => `"${k}"`).join(", ")}]
status: "published"
---

`;

      const fullContent = frontmatter + input.content;
      const encoded = Buffer.from(fullContent).toString("base64");

      // Check if file exists to get SHA for update
      let sha: string | undefined;
      try {
        const checkResp = await fetch(
          `https://api.github.com/repos/gopoint-hub/web-cancagua/contents/${fileName}`,
          { headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" } }
        );
        if (checkResp.ok) {
          const existing = await checkResp.json();
          sha = existing.sha;
        }
      } catch {}

      const body: any = {
        message: `blog: publish "${input.title}"`,
        content: encoded,
        branch: "main",
      };
      if (sha) body.sha = sha;

      const resp = await fetch(
        `https://api.github.com/repos/gopoint-hub/web-cancagua/contents/${fileName}`,
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/vnd.github+json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        }
      );

      if (!resp.ok) {
        const err = await resp.text();
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Error publicando en GitHub: ${err.slice(0, 200)}`,
        });
      }

      return {
        success: true,
        fileName,
        url: `https://cancagua.cl/blog/${input.slug}`,
      };
    }),

  // ─── Seed default subscriber lists (run once) ─────────────────────────────
  seedDefaultLists: protectedProcedure.mutation(async ({ ctx }) => {
    if (ctx.user.role !== "super_admin" && ctx.user.role !== "admin") {
      throw new TRPCError({ code: "FORBIDDEN" });
    }
    const LISTS = [
      { name: "B2C-VIP", description: "Clientes VIP - Alta frecuencia y ticket promedio" },
      { name: "B2C-Loyal", description: "Clientes leales - Múltiples visitas recientes" },
      { name: "B2C-Regular", description: "Clientes regulares - Visitas periódicas" },
      { name: "B2C-Occasional", description: "Clientes ocasionales - Visitas esporádicas" },
      { name: "B2C-Cold", description: "Clientes fríos - Sin visitas recientes" },
      { name: "B2C-Mujeres-Activas", description: "Segmento mujeres activas" },
      { name: "B2B-Prioridad-1", description: "Empresas B2B de alta prioridad" },
      { name: "B2B-Universidades", description: "Universidades y centros educativos" },
    ];
    const created: string[] = [];
    for (const list of LISTS) {
      await db.createList(list);
      created.push(list.name);
    }
    return { success: true, created };
  }),

  // ─── ROI & Investments ──────────────────────────────────────────────────
  getAllInvestments: protectedProcedure.query(async ({ ctx }) => {
    if (
      ctx.user.role !== "super_admin" &&
      ctx.user.role !== "admin" &&
      ctx.user.role !== "editor"
    ) {
      throw new TRPCError({ code: "FORBIDDEN" });
    }
    return await db.getAllMarketingInvestments();
  }),

  createInvestment: protectedProcedure
    .input(
      z.object({
        channel: z.enum([
          "seo",
          "facebook_organic",
          "instagram_organic",
          "tiktok_organic",
          "facebook_ads",
          "instagram_ads",
          "google_ads",
          "tiktok_ads",
          "other",
        ]),
        amount: z.number(),
        startDate: z.date(),
        endDate: z.date(),
        description: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (
        ctx.user.role !== "super_admin" &&
        ctx.user.role !== "admin" &&
        ctx.user.role !== "editor"
      ) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      await db.createMarketingInvestment(input);
      return { success: true };
    }),

  updateInvestment: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        channel: z
          .enum([
            "seo",
            "facebook_organic",
            "instagram_organic",
            "tiktok_organic",
            "facebook_ads",
            "instagram_ads",
            "google_ads",
            "tiktok_ads",
            "other",
          ])
          .optional(),
        amount: z.number().optional(),
        startDate: z.date().optional(),
        endDate: z.date().optional(),
        description: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (
        ctx.user.role !== "super_admin" &&
        ctx.user.role !== "admin" &&
        ctx.user.role !== "editor"
      ) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      const { id, ...data } = input;
      await db.updateMarketingInvestment(id, data);
      return { success: true };
    }),

  deleteInvestment: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "super_admin" && ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      await db.deleteMarketingInvestment(input.id);
      return { success: true };
    }),

  getROIReport: protectedProcedure
    .input(
      z.object({
        startDate: z.date(),
        endDate: z.date(),
      })
    )
    .query(async ({ ctx, input }) => {
      if (
        ctx.user.role !== "super_admin" &&
        ctx.user.role !== "admin" &&
        ctx.user.role !== "editor"
      ) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      return await db.getMarketingROIReport(input);
    }),
});
