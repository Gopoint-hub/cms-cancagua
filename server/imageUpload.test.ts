import { describe, expect, it } from "vitest";
import { decodeCmsImageDataUrl, MAX_CMS_IMAGE_BYTES } from "./imageUpload";

describe("CMS image uploads", () => {
  it("decodes an allowed image data URL", () => {
    const result = decodeCmsImageDataUrl({
      imageData: `data:image/png;base64,${Buffer.from("image-bytes").toString("base64")}`,
      mimeType: "image/png",
    });
    expect(result.extension).toBe("png");
    expect(result.buffer.toString()).toBe("image-bytes");
  });

  it("rejects unsupported or mismatched formats", () => {
    expect(() => decodeCmsImageDataUrl({
      imageData: "data:image/gif;base64,AAAA",
      mimeType: "image/gif",
    })).toThrow("JPG, PNG o WebP");
    expect(() => decodeCmsImageDataUrl({
      imageData: "data:image/png;base64,AAAA",
      mimeType: "image/jpeg",
    })).toThrow("formato válido");
  });

  it("rejects files larger than 5 MB", () => {
    const data = Buffer.alloc(MAX_CMS_IMAGE_BYTES + 1).toString("base64");
    expect(() => decodeCmsImageDataUrl({
      imageData: `data:image/jpeg;base64,${data}`,
      mimeType: "image/jpeg",
    })).toThrow("5 MB");
  });
});
