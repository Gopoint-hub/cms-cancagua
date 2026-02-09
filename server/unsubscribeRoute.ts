import { Router, Request, Response } from "express";
import { unsubscribeFromNewsletter } from "./db";

const unsubscribeRouter = Router();

/**
 * GET /api/unsubscribe?email=xxx@example.com
 * Public endpoint that processes newsletter unsubscription and shows a confirmation page.
 * The email is base64-encoded in the URL to avoid issues with special characters.
 */
unsubscribeRouter.get("/", async (req: Request, res: Response) => {
  const encodedEmail = req.query.email as string;
  
  if (!encodedEmail) {
    return res.status(400).send(renderPage(
      "Error",
      "No se proporcionó un email válido.",
      false
    ));
  }

  let email: string;
  try {
    email = Buffer.from(encodedEmail, "base64").toString("utf-8");
  } catch {
    email = encodedEmail; // Fallback: try using as-is
  }

  // Basic email validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).send(renderPage(
      "Error",
      "El email proporcionado no es válido.",
      false
    ));
  }

  try {
    await unsubscribeFromNewsletter(email);
    return res.send(renderPage(
      "Suscripción cancelada",
      `El email <strong>${escapeHtml(email)}</strong> ha sido dado de baja exitosamente de nuestro newsletter. Ya no recibirás más comunicaciones.`,
      true
    ));
  } catch (error) {
    console.error("Error processing unsubscribe:", error);
    return res.status(500).send(renderPage(
      "Error",
      "Ocurrió un error al procesar tu solicitud. Por favor intenta nuevamente más tarde.",
      false
    ));
  }
});

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderPage(title: string, message: string, success: boolean): string {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} - Cancagua</title>
  <link href="https://fonts.googleapis.com/css2?family=Josefin+Sans:wght@300;400&family=Fira+Sans:wght@400;500&display=swap" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Fira Sans', Arial, sans-serif;
      background-color: #F1E7D9;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
    }
    .card {
      background: #ffffff;
      border-radius: 12px;
      padding: 48px 40px;
      max-width: 480px;
      width: 100%;
      text-align: center;
      box-shadow: 0 4px 24px rgba(0,0,0,0.08);
    }
    .logo {
      max-width: 160px;
      margin-bottom: 32px;
    }
    .icon {
      width: 64px;
      height: 64px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 24px;
      font-size: 28px;
    }
    .icon-success { background: #e8f5e9; }
    .icon-error { background: #fce4ec; }
    h1 {
      font-family: 'Josefin Sans', Arial, sans-serif;
      font-weight: 300;
      letter-spacing: 2px;
      text-transform: uppercase;
      color: #3a3a3a;
      font-size: 22px;
      margin-bottom: 16px;
    }
    p {
      color: #666;
      font-size: 15px;
      line-height: 1.6;
      margin-bottom: 24px;
    }
    .link {
      display: inline-block;
      background: #D3BC8D;
      color: #3a3a3a;
      text-decoration: none;
      padding: 12px 32px;
      border-radius: 4px;
      font-weight: 500;
      font-size: 14px;
      transition: opacity 0.2s;
    }
    .link:hover { opacity: 0.85; }
  </style>
</head>
<body>
  <div class="card">
    <img src="https://res.cloudinary.com/dhuln9b1n/image/upload/v1769960664/cancagua/images/logo-cancagua-dark.webp" alt="Cancagua" class="logo" />
    <div class="icon ${success ? 'icon-success' : 'icon-error'}">
      ${success ? '✓' : '✕'}
    </div>
    <h1>${title}</h1>
    <p>${message}</p>
    <a href="https://cancagua.cl" class="link">Visitar Cancagua</a>
  </div>
</body>
</html>`;
}

export default unsubscribeRouter;
