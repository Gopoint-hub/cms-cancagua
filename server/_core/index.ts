import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import cors from "cors";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import conciergeWebhook from "../conciergeWebhook";
import getnetWebhook from "../getnetWebhook";
import unsubscribeRouter from "../unsubscribeRoute";
import freelanceApprovalRouter from "../freelanceApproval";
import cerebroRouter from "../cerebroRoute";
import publicMasajesCatalog from "../publicMasajesCatalog";
import { checkWhatsAppHealth } from "./whapi";
import { checkGitHubBlogHealth } from "../githubBlogHealth";
import { ensureMassageDiscountSchema } from "../ensureMassageDiscountSchema";
import { ensureMassageAvailabilitySchema } from "../ensureMassageAvailabilitySchema";
import { ensureMassageTherapistUsersSchema } from "../ensureMassageTherapistUsersSchema";
import { ensureMassageNpsSchema } from "../ensureMassageNpsSchema";
import { ensureMassageBookingSchema } from "../ensureMassageBookingSchema";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  await ensureMassageBookingSchema();
  await ensureMassageDiscountSchema();
  await ensureMassageAvailabilitySchema();
  await ensureMassageTherapistUsersSchema();
  await ensureMassageNpsSchema();
  const app = express();
  const server = createServer(app);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  // CORS: Allow cross-origin requests from the frontend (cancagua.cl)
  // Needed for Concierge payment confirmation flow
  const allowedOrigins = [
    "https://cancagua.cl",
    "https://www.cancagua.cl",
    "http://localhost:5173",
    "http://localhost:3000",
  ];
  app.use(cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, curl, server-to-server)
      if (!origin) return callback(null, true);
      if (allowedOrigins.some(allowed => origin.startsWith(allowed))) {
        return callback(null, true);
      }
      callback(null, false);
    },
    credentials: true,
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }));

  // Verificación no invasiva del canal WhatsApp; nunca expone el token.
  app.get("/api/health/whapi", async (_req, res) => {
    const health = await checkWhatsAppHealth();
    res.status(health.success ? 200 : 503).json(health);
  });

  // Verifica token y permiso de escritura del publicador del blog sin exponerlo.
  app.get("/api/health/github-blog", async (_req, res) => {
    const health = await checkGitHubBlogHealth();
    res.status(health.success ? 200 : 503).json(health);
  });

  // Webhook para Skedu (Módulo Concierge)
  app.use("/api/webhooks/skedu", conciergeWebhook);
  // Webhook para Getnet (Módulo Masajes)
  app.use("/api/webhooks/getnet", getnetWebhook);
  // Aprobación de terapeutas freelance (Tamara) y confirmación de terapeutas
  app.use("/api/masajes", freelanceApprovalRouter);
  // Catálogo público consumido por cancagua.cl
  app.use("/api/public/masajes", publicMasajesCatalog);
  // Unsubscribe route for newsletters
  app.use("/api/unsubscribe", unsubscribeRouter);
  // Cerebro: grafo de conocimiento del proyecto (solo admins)
  app.use("/api/cerebro", cerebroRouter);
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer()
  .then(async () => {
    const { startMassageNpsScheduler } = await import("../massageNps");
    startMassageNpsScheduler();
    const { runSeedIfNeeded } = await import("../seed");
    try {
      await runSeedIfNeeded();
    } catch (error) {
      console.error("[seed] Startup seed failed:", error);
    }
    try {
      const { runInitialMassageTherapistInvitations } = await import("../massageTherapistInvitations");
      await runInitialMassageTherapistInvitations();
    } catch (error) {
      console.error("[startup] Therapist invitations failed:", error);
    }
  })
  .catch(console.error);
