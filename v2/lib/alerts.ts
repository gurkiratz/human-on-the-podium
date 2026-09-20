import { createHash } from "node:crypto";
import { query } from "./db";
import { env } from "./env";

/**
 * Alerts are the "action" half: a high AI reading, or an unsupported claim, is recorded so the
 * dashboard can show it, and posted to an optional Slack-compatible webhook so a human hears
 * about it without watching the screen.
 */

export type AlertKind = "ai_score" | "unsupported_claim";
export type AlertSeverity = "high" | "medium";

export interface AlertInput {
  kind: AlertKind;
  severity: AlertSeverity;
  title: string;
  detail: string;
  source?: string | null;
  politician?: string | null;
  party?: string | null;
  /** The number that triggered it, e.g. the AI probability. */
  value?: number | null;
}

export interface Alert {
  id: string;
  kind: AlertKind;
  severity: AlertSeverity;
  title: string;
  detail: string;
  source: string | null;
  politician: string | null;
  party: string | null;
  value: number | null;
  delivered: boolean;
  createdAt: string;
}

type AlertRow = {
  id: string;
  kind: AlertKind;
  severity: AlertSeverity;
  title: string;
  detail: string;
  source: string | null;
  politician: string | null;
  party: string | null;
  value: number | null;
  delivered: boolean;
  created_at: Date;
};

function toAlert(row: AlertRow): Alert {
  return {
    id: row.id,
    kind: row.kind,
    severity: row.severity,
    title: row.title,
    detail: row.detail,
    source: row.source,
    politician: row.politician,
    party: row.party,
    value: row.value,
    delivered: row.delivered,
    createdAt: row.created_at.toISOString(),
  };
}

/** Post to the configured webhook. Slack incoming webhooks take a plain `{ text }` body. */
async function deliver(alert: Omit<Alert, "id" | "createdAt" | "delivered">): Promise<boolean> {
  if (!env.hasAlertWebhook()) return false;
  try {
    const response = await fetch(env.alertWebhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: `:rotating_light: *${alert.severity.toUpperCase()}* — ${alert.title}\n${alert.detail}`,
      }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export async function raiseAlert(input: AlertInput): Promise<Alert> {
  const id = createHash("sha256")
    .update(`${input.kind}:${input.title}:${Date.now()}:${Math.random()}`)
    .digest("hex")
    .slice(0, 32);

  const { rows } = await query<AlertRow>(
    `INSERT INTO alerts (id, kind, severity, title, detail, source, politician, party, value)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [
      id,
      input.kind,
      input.severity,
      input.title,
      input.detail,
      input.source ?? null,
      input.politician ?? null,
      input.party ?? null,
      input.value ?? null,
    ],
  );

  const alert = toAlert(rows[0]);
  const delivered = await deliver(alert);
  if (delivered) {
    await query(`UPDATE alerts SET delivered = true WHERE id = $1`, [id]);
    alert.delivered = true;
  }

  return alert;
}

export async function listAlerts(limit = 20): Promise<Alert[]> {
  const { rows } = await query<AlertRow>(
    `SELECT * FROM alerts ORDER BY created_at DESC LIMIT $1`,
    [Math.min(Math.max(limit, 1), 100)],
  );
  return rows.map(toAlert);
}

/** Re-scoring the same speech must not spam the channel, so alerts are deduped by title. */
export async function hasRecentAlert(
  kind: AlertKind,
  title: string,
  withinMinutes = 60,
): Promise<boolean> {
  const { rows } = await query<{ exists: boolean }>(
    `SELECT EXISTS(
       SELECT 1 FROM alerts
        WHERE kind = $1 AND title = $2
          AND created_at > now() - ($3 || ' minutes')::interval
     ) AS exists`,
    [kind, title, String(withinMinutes)],
  );
  return rows[0]?.exists === true;
}
