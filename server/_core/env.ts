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
  
  // Manus built-in APIs (LLM, storage, etc.)
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
};
