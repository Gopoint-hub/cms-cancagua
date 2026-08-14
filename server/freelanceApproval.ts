import { Router, type Request, type Response } from "express";
import { eq } from "drizzle-orm";
import { massageBookings } from "../drizzle/schema";
import { getDb } from "./db";
import {
  getTherapistAssignmentRequestView,
  respondToTherapistAssignment,
  startTherapistAssignmentForBooking,
} from "./massageTherapistAssignment";

const router = Router();

const escapeHtml = (value: unknown) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

function htmlPage(title: string, body: string, emoji: string) {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)} — Cancagua Spa</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{min-height:100vh;display:flex;align-items:center;justify-content:center;background:#f4f4f5;
      font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;padding:20px}
    .card{background:#fff;border-radius:16px;padding:40px 32px;max-width:440px;width:100%;
      text-align:center;box-shadow:0 4px 24px rgba(0,0,0,.08)}
    .emoji{font-size:56px;margin-bottom:20px} h1{font-size:22px;color:#18181b;margin-bottom:12px}
    p{font-size:15px;color:#71717a;line-height:1.6}
    small{display:block;margin-top:24px;font-size:12px;color:#a1a1aa}
  </style>
</head>
<body><div class="card"><div class="emoji">${emoji}</div><h1>${escapeHtml(title)}</h1>
  <p>${escapeHtml(body)}</p><small>Cancagua Spa · Sistema de masajes</small></div></body>
</html>`;
}

function confirmationPage(input: {
  token: string;
  therapistName: string;
  clientName: string;
  serviceName: string;
  bookingDate: string;
  startTime: string;
  endTime: string;
}) {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Confirmar masaje — Cancagua Spa</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{min-height:100vh;display:flex;align-items:center;justify-content:center;background:#f4f4f5;
      font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;padding:20px}
    .card{background:#fff;border-radius:16px;padding:40px 32px;max-width:440px;width:100%;
      text-align:center;box-shadow:0 4px 24px rgba(0,0,0,.08)}
    .emoji{font-size:56px;margin-bottom:20px} h1{font-size:22px;color:#18181b;margin-bottom:12px}
    .info{background:#f4f4f5;border-radius:12px;padding:16px;margin:16px 0;text-align:left;
      font-size:14px;color:#3f3f46;line-height:1.8}.info strong{color:#18181b}
    .notice{font-size:13px;color:#b45309;background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:10px}
    .btns{display:flex;flex-direction:column;gap:12px;margin-top:20px}
    .btn{display:block;width:100%;padding:14px;border-radius:10px;border:none;font-size:16px;font-weight:600;cursor:pointer}
    .confirm{background:#10b981;color:#fff}.reject{background:#fff;color:#71717a;border:1px solid #e4e4e7}
    small{display:block;margin-top:24px;font-size:12px;color:#a1a1aa}
  </style>
</head>
<body><div class="card">
  <div class="emoji">💆</div><h1>Hola ${escapeHtml(input.therapistName)}</h1>
  <div class="info"><strong>${escapeHtml(input.serviceName)}</strong><br>
    👤 ${escapeHtml(input.clientName)}<br>📅 ${escapeHtml(input.bookingDate)}<br>
    🕐 ${escapeHtml(input.startTime)} – ${escapeHtml(input.endTime)} hrs</div>
  <div class="notice">Este enlace vence 60 minutos después de ser enviado.</div>
  <div class="btns">
    <form method="POST" action="/api/masajes/freelance-confirmation">
      <input type="hidden" name="token" value="${escapeHtml(input.token)}">
      <input type="hidden" name="action" value="confirm">
      <button class="btn confirm" type="submit">✅ Sí, confirmo el masaje</button>
    </form>
    <form method="POST" action="/api/masajes/freelance-confirmation">
      <input type="hidden" name="token" value="${escapeHtml(input.token)}">
      <input type="hidden" name="action" value="reject">
      <button class="btn reject" type="submit">❌ No puedo realizarlo</button>
    </form>
  </div><small>Cancagua Spa · Sistema de masajes</small>
</div></body></html>`;
}

// Compatibilidad para los puntos que ya disparaban el flujo anterior.
export async function sendFreelanceApprovalRequest(bookingId: number): Promise<void> {
  await startTherapistAssignmentForBooking("massage", bookingId);
}

router.get("/freelance-confirmation", async (req: Request, res: Response) => {
  const token = String(req.query.token ?? "");
  if (!token) return res.status(400).send(htmlPage("Enlace inválido", "Este enlace no es válido.", "⚠️"));

  let view = await getTherapistAssignmentRequestView(token);
  if (view.state === "invalid") {
    // Enlace creado por la versión anterior: inicia la nueva rotación y deja
    // inutilizable el token antiguo para que no pueda confirmar fuera de plazo.
    const db = await getDb();
    const [legacy] = db
      ? await db.select({ id: massageBookings.id }).from(massageBookings)
        .where(eq(massageBookings.therapistConfirmationToken, token)).limit(1)
      : [];
    if (legacy) {
      await startTherapistAssignmentForBooking("massage", legacy.id);
      return res.send(htmlPage(
        "Enlace reemplazado",
        "Por seguridad se envió un enlace nuevo con vigencia de 60 minutos. Revisa el último mensaje de WhatsApp.",
        "🔄",
      ));
    }
  }
  view = await getTherapistAssignmentRequestView(token);
  if (view.state === "invalid") {
    return res.send(htmlPage("Enlace inválido", "Este enlace no existe o ya no corresponde a una asignación.", "⚠️"));
  }
  if (view.state === "expired") {
    return res.send(htmlPage("Enlace expirado", "Pasaron los 60 minutos. La reserva ya fue ofrecida a otro terapeuta.", "⏳"));
  }
  if (view.state !== "pending") {
    return res.send(htmlPage("Solicitud procesada", "Esta respuesta ya fue registrada anteriormente.", "ℹ️"));
  }
  return res.send(confirmationPage({
    token,
    therapistName: view.therapistName ?? "Terapeuta",
    clientName: view.clientName ?? "",
    serviceName: view.serviceName ?? "Masaje",
    bookingDate: view.bookingDate ?? "",
    startTime: view.startTime ?? "",
    endTime: view.endTime ?? "",
  }));
});

router.post("/freelance-confirmation", async (req: Request, res: Response) => {
  const token = String(req.body.token ?? "");
  const action = String(req.body.action ?? "");
  if (!token || (action !== "confirm" && action !== "reject")) {
    return res.status(400).send(htmlPage("Error", "Los datos enviados no son válidos.", "⚠️"));
  }
  const result = await respondToTherapistAssignment(token, action);
  if (result.state === "expired") {
    return res.send(htmlPage("Enlace expirado", "La reserva ya fue ofrecida automáticamente a otro terapeuta.", "⏳"));
  }
  if (result.state === "invalid") {
    return res.send(htmlPage("Enlace inválido", "Este enlace no existe.", "⚠️"));
  }
  if (result.state === "processed") {
    return res.send(htmlPage(
      "Solicitud cerrada",
      "La reserva fue modificada o cerrada y este enlace ya no acepta respuestas.",
      "ℹ️",
    ));
  }
  if (result.state === "rejected") {
    return res.send(htmlPage(
      "Gracias por avisarnos",
      "La reserva fue ofrecida inmediatamente al siguiente terapeuta disponible.",
      "👍",
    ));
  }
  if (result.state !== "confirmed") {
    return res.send(htmlPage("Solicitud procesada", "Esta respuesta ya fue registrada anteriormente.", "ℹ️"));
  }
  return res.send(htmlPage(
    "¡Masaje confirmado!",
    "Tu confirmación fue registrada. Muchas gracias.",
    "✅",
  ));
});

// La aprobación administrativa ya no forma parte del flujo. Se conserva la
// ruta para que enlaces históricos expliquen el cambio en lugar de fallar.
router.get("/freelance-approval", (_req: Request, res: Response) =>
  res.send(htmlPage(
    "Flujo actualizado",
    "La asignación ahora consulta directamente a los terapeutas disponibles y rota automáticamente.",
    "ℹ️",
  )));

export default router;
