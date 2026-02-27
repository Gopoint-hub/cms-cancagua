export const ENV = {
  // App configuration
  appUrl: process.env.APP_URL ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  isProduction: process.env.NODE_ENV === "production",

  // Database
  databaseUrl: process.env.DATABASE_URL ?? "",

  // Cloudinary (for file storage)
  cloudinaryUrl: process.env.CLOUDINARY_URL ?? "",

  // Email (Resend)
  resendApiKey: process.env.RESEND_API_KEY ?? "",

  // WebPay (Transbank)
  webpayApiKey: process.env.WEBPAY_API_KEY ?? "",
  webpayCommerceCode: process.env.WEBPAY_COMMERCE_CODE ?? "",
  webpayEnvironment: process.env.WEBPAY_ENVIRONMENT ?? "integration",

  // Frontend URL (for WebPay return URL)
  frontendUrl: process.env.FRONTEND_URL ?? "https://cancagua.cl",

  // Contact email for reservations
  contactEmail: process.env.CONTACT_EMAIL ?? "contacto@cancagua.cl",

  // Google AI (Gemini LLM, image generation, transcription)
  googleApiKey: process.env.GOOGLE_API_KEY ?? "",
};
