// Brand image upload helper for CMS

export interface BrandImageCatalogItem {
  name: string;
  description: string;
}

export const BRAND_IMAGE_CATALOG: BrandImageCatalogItem[] = [
  { name: "logo", description: "Logo principal de Cancagua" },
  { name: "logoFooter", description: "Logo para footer de emails" },
  { name: "hero", description: "Imagen hero principal" },
  { name: "spa", description: "Imagen del spa" },
  { name: "naturaleza", description: "Imagen de naturaleza" },
];

export function getBrandImageUrls(): Record<string, string> {
  // Returns a map of image name -> URL
  // In production, these would be fetched from Cloudinary/S3
  return {
    logo: "https://res.cloudinary.com/dhuln9b1n/image/upload/v1770308861/cancagua/images/01_logo-cancagua.png",
    logoFooter: "https://res.cloudinary.com/dhuln9b1n/image/upload/v1769960664/cancagua/images/logo-cancagua-white.webp",
    hero: "",
    spa: "",
    naturaleza: "",
  };
}

export async function uploadBrandImages(images: any[]): Promise<any[]> {
  console.log("[BrandImages] Stub: upload not configured");
  return [];
}
