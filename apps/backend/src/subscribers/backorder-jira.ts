import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import {
  BACKORDER_MODULE,
  BackorderModuleService,
} from "../modules/backorder"

/**
 * Production ticketing (FR-5.03). When a backorder is placed, open a Jira issue
 * for the manufacturing / warehouse team and stamp the issue key onto the
 * backorder (status → in_prod).
 *
 * Fail-safe: if Jira env (JIRA_BASE_URL / JIRA_EMAIL / JIRA_API_TOKEN /
 * JIRA_PROJECT_KEY) isn't configured, this no-ops — the backorder still exists,
 * just without a linked ticket. Never throws into the event bus.
 */
export default async function backorderJira({
  event: { data },
  container,
}: SubscriberArgs<{ id: string }>) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const backorderModule = container.resolve(
    BACKORDER_MODULE,
  ) as BackorderModuleService

  const bo = await (backorderModule as any)
    .retrieveBackorderRequest(data.id)
    .catch(() => null)
  if (!bo || bo.jira_ticket_id) return

  const {
    JIRA_BASE_URL,
    JIRA_EMAIL,
    JIRA_API_TOKEN,
    JIRA_PROJECT_KEY,
  } = process.env
  if (!JIRA_BASE_URL || !JIRA_EMAIL || !JIRA_API_TOKEN || !JIRA_PROJECT_KEY) {
    logger.info(
      `[backorder-jira] Jira not configured — skipping ticket for backorder ${bo.id}`,
    )
    return
  }

  try {
    const auth = Buffer.from(`${JIRA_EMAIL}:${JIRA_API_TOKEN}`).toString(
      "base64",
    )
    const resp = await fetch(`${JIRA_BASE_URL}/rest/api/3/issue`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        fields: {
          project: { key: JIRA_PROJECT_KEY },
          issuetype: { name: "Task" },
          summary: `Backorder: ${bo.qty}× ${bo.sku} (order ${bo.order_id})`,
          description: {
            type: "doc",
            version: 1,
            content: [
              {
                type: "paragraph",
                content: [
                  {
                    type: "text",
                    text: `Production/packaging needed for backorder ${bo.id}: ${bo.qty} units of SKU ${bo.sku} on order ${bo.order_id}.`,
                  },
                ],
              },
            ],
          },
        },
      }),
    })

    if (!resp.ok) {
      logger.warn(
        `[backorder-jira] Jira API returned ${resp.status} for backorder ${bo.id}`,
      )
      return
    }
    const issue = (await resp.json()) as { key?: string }
    if (!issue.key) return

    await (backorderModule as any).updateBackorderRequests([
      { id: bo.id, jira_ticket_id: issue.key, status: "in_prod" },
    ])
    logger.info(
      `[backorder-jira] opened ${issue.key} for backorder ${bo.id}`,
    )
  } catch (err) {
    logger.warn(
      `[backorder-jira] failed for backorder ${bo.id}: ${err instanceof Error ? err.message : err}`,
    )
  }
}

export const config: SubscriberConfig = {
  event: "backorder.placed",
}
