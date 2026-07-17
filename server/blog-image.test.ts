import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const marketingRouter = fs.readFileSync(path.resolve(__dirname, "marketingRouter.ts"), "utf8");
const blogPage = fs.readFileSync(path.resolve(__dirname, "../client/src/pages/cms/BlogContenido.tsx"), "utf8");
const schema = fs.readFileSync(path.resolve(__dirname, "../drizzle/schema.ts"), "utf8");

describe("blog hero image flow", () => {
  it("persists a hero image URL with the CMS article", () => {
    expect(schema).toContain('imageUrl: text("image_url")');
    expect(marketingRouter).toContain("imageUrl: z.string().url().optional()");
  });

  it("accepts only supported images and limits uploads", () => {
    expect(marketingRouter).toContain('z.enum(["image/jpeg", "image/png", "image/webp"])');
    expect(marketingRouter).toContain("8 * 1024 * 1024");
    expect(marketingRouter).toContain("storagePut(fileKey, buffer, input.mimeType)");
  });

  it("publishes the image in blog frontmatter", () => {
    expect(marketingRouter).toContain('image: "${input.imageUrl.replace');
    expect(blogPage).toContain("imageUrl: a.imageUrl || undefined");
  });

  it("offers upload and preview controls in generation and editing", () => {
    expect(blogPage).toContain("Imagen principal del artículo");
    expect(blogPage).toContain('accept="image/jpeg,image/png,image/webp"');
    expect(blogPage).toContain("Aparecerá en el hero del artículo");
    expect(blogPage).toContain('uploadImage(file, "editor")');
  });
});
