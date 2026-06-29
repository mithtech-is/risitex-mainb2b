/**
 * Thin Jira Cloud REST v3 client. Wraps issue creation only — the
 * single use case for RISITEX is backorder / packaging tickets
 * (FR-5.03). Auth is HTTP basic with email + API token (Atlassian's
 * canonical pattern).
 *
 * Config comes from env at construction time:
 *   JIRA_BASE_URL       e.g. https://risitex.atlassian.net
 *   JIRA_EMAIL          atlassian account email
 *   JIRA_API_TOKEN      atlassian API token
 *   JIRA_PROJECT_KEY    default project (e.g. "PRD")
 *
 * Missing config = no-op mode: `createIssue` returns `{ skipped: true }`
 * without erroring so subscribers can fire safely on dev machines
 * with no Jira backing.
 */
export type JiraConfig = {
  baseUrl: string
  email: string
  apiToken: string
  defaultProjectKey: string
}

export function loadJiraConfigFromEnv(): JiraConfig | null {
  const baseUrl = process.env.JIRA_BASE_URL?.trim()
  const email = process.env.JIRA_EMAIL?.trim()
  const apiToken = process.env.JIRA_API_TOKEN?.trim()
  const defaultProjectKey = process.env.JIRA_PROJECT_KEY?.trim()
  if (!baseUrl || !email || !apiToken || !defaultProjectKey) {
    return null
  }
  return {
    baseUrl: baseUrl.replace(/\/+$/, ""),
    email,
    apiToken,
    defaultProjectKey,
  }
}

export type CreateIssueInput = {
  projectKey?: string
  summary: string
  /** ADF (Atlassian Document Format) string or plain text — we
   *  convert plain text to ADF inline. */
  descriptionPlain?: string
  issueType?: "Task" | "Story" | "Bug"
  labels?: string[]
}

export type CreateIssueResult =
  | { skipped: true; reason: "no_config" }
  | { skipped: false; issueKey: string; issueId: string; selfUrl: string }

export class JiraClient {
  private cfg: JiraConfig
  constructor(cfg: JiraConfig) {
    this.cfg = cfg
  }
  static fromEnv(): JiraClient | null {
    const cfg = loadJiraConfigFromEnv()
    return cfg ? new JiraClient(cfg) : null
  }

  async createIssue(input: CreateIssueInput): Promise<CreateIssueResult> {
    const adfDescription = input.descriptionPlain
      ? {
          type: "doc",
          version: 1,
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: input.descriptionPlain }],
            },
          ],
        }
      : undefined

    const body = {
      fields: {
        project: { key: input.projectKey ?? this.cfg.defaultProjectKey },
        summary: input.summary,
        issuetype: { name: input.issueType ?? "Task" },
        ...(adfDescription ? { description: adfDescription } : {}),
        ...(input.labels?.length ? { labels: input.labels } : {}),
      },
    }

    const auth = Buffer.from(`${this.cfg.email}:${this.cfg.apiToken}`).toString(
      "base64",
    )
    const res = await fetch(`${this.cfg.baseUrl}/rest/api/3/issue`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => "")
      throw new Error(`Jira createIssue failed (${res.status}): ${text}`)
    }
    const json = (await res.json()) as { key: string; id: string; self: string }
    return {
      skipped: false,
      issueKey: json.key,
      issueId: json.id,
      selfUrl: json.self,
    }
  }
}

/**
 * Convenience wrapper: returns the canonical {issueKey} or {skipped}
 * tuple, swallowing the no-config case gracefully.
 */
export async function createJiraIssueOrSkip(
  input: CreateIssueInput,
): Promise<CreateIssueResult> {
  const client = JiraClient.fromEnv()
  if (!client) return { skipped: true, reason: "no_config" }
  return client.createIssue(input)
}
