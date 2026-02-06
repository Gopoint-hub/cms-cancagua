import { describe, expect, it } from "vitest";

describe("secrets validation", () => {
  it("CLOUDINARY_URL is set and has correct format", () => {
    const url = process.env.CLOUDINARY_URL;
    expect(url).toBeTruthy();
    expect(url).toMatch(/^cloudinary:\/\//);
  });

  it("RESEND_API_KEY is set and has correct format", () => {
    const key = process.env.RESEND_API_KEY;
    expect(key).toBeTruthy();
    expect(key).toMatch(/^re_/);
  });

  it("JWT_SECRET is set", () => {
    const secret = process.env.JWT_SECRET;
    expect(secret).toBeTruthy();
    expect(secret!.length).toBeGreaterThan(10);
  });
});
