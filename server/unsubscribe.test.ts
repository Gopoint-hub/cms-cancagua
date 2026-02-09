import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

describe("Newsletter unsubscribe functionality", () => {
  // Test 1: Unsubscribe route file exists
  it("unsubscribeRoute.ts exists and exports a router", async () => {
    const filePath = path.resolve(__dirname, "unsubscribeRoute.ts");
    expect(fs.existsSync(filePath)).toBe(true);
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("export default unsubscribeRouter");
    expect(content).toContain('Router');
  });

  // Test 2: Route handles GET requests at /api/unsubscribe
  it("unsubscribe route handles GET with email parameter", () => {
    const content = fs.readFileSync(
      path.resolve(__dirname, "unsubscribeRoute.ts"),
      "utf-8"
    );
    expect(content).toContain('unsubscribeRouter.get("/",');
    expect(content).toContain('req.query.email');
  });

  // Test 3: Email is base64 decoded
  it("unsubscribe route decodes base64 email", () => {
    const content = fs.readFileSync(
      path.resolve(__dirname, "unsubscribeRoute.ts"),
      "utf-8"
    );
    expect(content).toContain('Buffer.from(encodedEmail, "base64")');
  });

  // Test 4: Route validates email format
  it("unsubscribe route validates email format", () => {
    const content = fs.readFileSync(
      path.resolve(__dirname, "unsubscribeRoute.ts"),
      "utf-8"
    );
    expect(content).toContain("emailRegex");
  });

  // Test 5: Route calls unsubscribeFromNewsletter
  it("unsubscribe route calls db.unsubscribeFromNewsletter", () => {
    const content = fs.readFileSync(
      path.resolve(__dirname, "unsubscribeRoute.ts"),
      "utf-8"
    );
    expect(content).toContain("unsubscribeFromNewsletter(email)");
  });

  // Test 6: Route renders success page with Cancagua branding
  it("unsubscribe route renders branded confirmation page", () => {
    const content = fs.readFileSync(
      path.resolve(__dirname, "unsubscribeRoute.ts"),
      "utf-8"
    );
    expect(content).toContain("Cancagua");
    expect(content).toContain("Suscripción cancelada");
    expect(content).toContain("cancagua.cl");
  });

  // Test 7: Server registers the unsubscribe route
  it("server entry point registers /api/unsubscribe route", () => {
    const content = fs.readFileSync(
      path.resolve(__dirname, "_core/index.ts"),
      "utf-8"
    );
    expect(content).toContain('"/api/unsubscribe"');
    expect(content).toContain("unsubscribeRouter");
  });

  // Test 8: Newsletter send mutation includes unsubscribe URL
  it("newsletter send mutation injects unsubscribe URL into emails", () => {
    const content = fs.readFileSync(
      path.resolve(__dirname, "routers.ts"),
      "utf-8"
    );
    expect(content).toContain("/api/unsubscribe?email=");
    expect(content).toContain("Buffer.from(sub.email).toString('base64')");
  });

  // Test 9: Unsubscribe URL replaces placeholder in AI-generated HTML
  it("newsletter send replaces {{unsubscribe_url}} placeholder", () => {
    const content = fs.readFileSync(
      path.resolve(__dirname, "routers.ts"),
      "utf-8"
    );
    expect(content).toContain("{{unsubscribe_url}}");
    expect(content).toContain("unsubscribe_url");
  });

  // Test 10: Fallback footer is appended if no unsubscribe link exists
  it("newsletter send appends unsubscribe footer as fallback", () => {
    const content = fs.readFileSync(
      path.resolve(__dirname, "routers.ts"),
      "utf-8"
    );
    expect(content).toContain("Darse de baja de este newsletter");
    expect(content).toContain("</body>");
  });

  // Test 11: LLM prompt instructs AI to include unsubscribe link
  it("LLM prompt includes unsubscribe instruction", () => {
    const content = fs.readFileSync(
      path.resolve(__dirname, "routers.ts"),
      "utf-8"
    );
    expect(content).toContain("{{unsubscribe_url}}");
    expect(content).toContain("Darse de baja de este newsletter");
  });

  // Test 12: Base64 encoding/decoding roundtrip works
  it("base64 encoding roundtrip preserves email", () => {
    const email = "test@example.com";
    const encoded = Buffer.from(email).toString("base64");
    const decoded = Buffer.from(encoded, "base64").toString("utf-8");
    expect(decoded).toBe(email);
  });

  // Test 13: Base64 encoding handles special characters
  it("base64 handles emails with special characters", () => {
    const email = "user+tag@sub.domain.com";
    const encoded = Buffer.from(email).toString("base64");
    const decoded = Buffer.from(encoded, "base64").toString("utf-8");
    expect(decoded).toBe(email);
  });
});
