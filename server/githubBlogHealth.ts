export interface GitHubBlogHealth {
  success: boolean;
  configured: boolean;
  repository: string;
  status?: number;
  canWrite?: boolean;
  error?: string;
}

export async function checkGitHubBlogHealth(): Promise<GitHubBlogHealth> {
  const token =
    process.env.GITHUB_BLOG_TOKEN ||
    process.env.GITHUB_TOKEN ||
    process.env.GITHUB_PAT;
  const owner = process.env.GITHUB_BLOG_OWNER || "Gopoint-hub";
  const repo = process.env.GITHUB_BLOG_REPO || "web-cancagua";
  const repository = `${owner}/${repo}`;

  if (!token) {
    return {
      success: false,
      configured: false,
      repository,
      error: "GITHUB_BLOG_TOKEN is not configured",
    };
  }

  try {
    const response = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });

    if (!response.ok) {
      return {
        success: false,
        configured: true,
        repository,
        status: response.status,
        canWrite: false,
        error: `GitHub health returned ${response.status}`,
      };
    }

    const data = await response.json();
    const canWrite = data?.permissions?.push === true;
    return {
      success: canWrite,
      configured: true,
      repository,
      status: response.status,
      canWrite,
      ...(canWrite ? {} : { error: "Token does not have push permission" }),
    };
  } catch (error) {
    return {
      success: false,
      configured: true,
      repository,
      canWrite: false,
      error: error instanceof Error ? error.message : "Unknown GitHub health error",
    };
  }
}
