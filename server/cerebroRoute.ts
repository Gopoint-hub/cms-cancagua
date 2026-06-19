import { Router, type Request, type Response } from "express";
import fs from "fs";
import { join } from "path";
import { authenticateRequest, isAdmin } from "./_core/auth";

const router = Router();

// process.cwd() apunta al root del proyecto tanto en dev como en producción (Render)
const GRAPH_PATH = join(process.cwd(), "server/cerebro/graph.html");

function noticePage(title: string, body: string, emoji: string): string {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} — Cerebro</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{min-height:100vh;display:flex;align-items:center;justify-content:center;
      background:#0b0b0f;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;padding:20px}
    .card{background:#17171c;border:1px solid #27272e;border-radius:16px;padding:40px 32px;
      max-width:460px;width:100%;text-align:center}
    .emoji{font-size:52px;margin-bottom:18px}
    h1{font-size:20px;color:#fafafa;margin-bottom:12px}
    p{font-size:14px;color:#a1a1aa;line-height:1.6}
    code{background:#27272e;color:#e4e4e7;padding:2px 6px;border-radius:4px;font-size:13px}
  </style>
</head>
<body>
  <div class="card">
    <div class="emoji">${emoji}</div>
    <h1>${title}</h1>
    <p>${body}</p>
  </div>
</body>
</html>`;
}

// GET /api/cerebro/graph — sirve el grafo de conocimiento solo a administradores
router.get("/graph", async (req: Request, res: Response) => {
  // 1. Autenticación: solo admins / super_admins pueden ver el grafo
  let user;
  try {
    user = await authenticateRequest(req);
  } catch {
    return res
      .status(401)
      .type("html")
      .send(noticePage("Sesión requerida", "Inicia sesión en el CMS para ver el Cerebro.", "🔒"));
  }
  if (!isAdmin(user)) {
    return res
      .status(403)
      .type("html")
      .send(noticePage("Acceso restringido", "El Cerebro solo está disponible para administradores.", "⛔"));
  }

  // 2. Servir el grafo si existe
  if (!fs.existsSync(GRAPH_PATH)) {
    return res
      .status(404)
      .type("html")
      .send(
        noticePage(
          "Grafo no generado",
          "Aún no se ha generado el grafo. Ejecuta <code>/graphify</code> en el proyecto y copia <code>graphify-out/graph.html</code> a <code>server/cerebro/graph.html</code>.",
          "🧠"
        )
      );
  }

  // Cache corto y permitir embebido same-origin en el iframe del CMS
  res.setHeader("Cache-Control", "private, max-age=300");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.type("html");
  fs.createReadStream(GRAPH_PATH).pipe(res);
});

export default router;
