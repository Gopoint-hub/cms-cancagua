import { afterEach, describe, expect, it, vi } from "vitest";
import { checkGitHubBlogHealth } from "./githubBlogHealth";

const originalToken = process.env.GITHUB_BLOG_TOKEN;
const originalGitHubToken = process.env.GITHUB_TOKEN;
const originalPat = process.env.GITHUB_PAT;

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

afterEach(() => {
  vi.unstubAllGlobals();
  restoreEnv("GITHUB_BLOG_TOKEN", originalToken);
  restoreEnv("GITHUB_TOKEN", originalGitHubToken);
  restoreEnv("GITHUB_PAT", originalPat);
});

describe("checkGitHubBlogHealth", () => {
  it("reports a missing token without exposing secrets", async () => {
    delete process.env.GITHUB_BLOG_TOKEN;
    delete process.env.GITHUB_TOKEN;
    delete process.env.GITHUB_PAT;

    await expect(checkGitHubBlogHealth()).resolves.toMatchObject({
      success: false,
      configured: false,
      repository: "Gopoint-hub/web-cancagua",
    });
  });

  it("confirms authenticated write permission", async () => {
    process.env.GITHUB_BLOG_TOKEN = "secret-value-never-returned";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ permissions: { push: true } }),
      })
    );

    const result = await checkGitHubBlogHealth();

    expect(result).toEqual({
      success: true,
      configured: true,
      repository: "Gopoint-hub/web-cancagua",
      status: 200,
      canWrite: true,
    });
    expect(JSON.stringify(result)).not.toContain("secret-value-never-returned");
  });
});
