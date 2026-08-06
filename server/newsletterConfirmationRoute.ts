import { Router, type Request, type Response } from "express";
import { confirmNewsletterSubscriptionByToken } from "./db";

const router = Router();

router.get("/confirm", async (req: Request, res: Response) => {
  const token = typeof req.query.token === "string" ? req.query.token : "";
  const confirmed = /^[a-f0-9]{64}$/.test(token)
    ? await confirmNewsletterSubscriptionByToken(token)
    : false;
  res.status(confirmed ? 200 : 400).send(`<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Newsletter Cancagua</title><body style="font-family:Arial,sans-serif;background:#f7f4ef;color:#222221;padding:48px 20px"><main style="max-width:560px;margin:auto;background:white;padding:40px;border-radius:12px;text-align:center"><h1>${confirmed ? "Suscripción confirmada" : "Enlace no válido"}</h1><p>${confirmed ? "Desde ahora recibirás las novedades de Cancagua." : "Este enlace venció o ya fue utilizado. Puedes volver a suscribirte desde cancagua.cl."}</p><a href="https://cancagua.cl" style="color:#4B5872">Volver a Cancagua</a></main></body></html>`);
});

export default router;
