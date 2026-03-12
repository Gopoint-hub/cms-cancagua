export const ENV = {
  // App configuration
  appId: process.env.VITE_APP_ID ?? "",
  appUrl: process.env.APP_URL ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  isProduction: process.env.NODE_ENV === "production",
  
  // Database
  databaseUrl: process.env.DATABASE_URL ?? "",
  
  // Authentication
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  
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
  
  // Manus built-in APIs (LLM, storage, etc.) - legacy
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",

  // Google Gemini API
  googleApiKey: process.env.GOOGLE_API_KEY ?? "",
};
