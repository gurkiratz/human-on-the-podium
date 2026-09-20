"use client";

import { Tags } from "lucide-react";
import { cn } from "@/lib/utils";
import { entitySecondsAt, type Transcript, type TranscriptEntity } from "@/lib/types";

type Tone = "sensitive" | "offensive" | "neutral";

const OFFENSIVE = new Set(["very_offensive_language", "less_offensive_language"]);

const SENSITIVE = new Set([
  "account_number",
  "bank_account",
  "credit_card",
  "credit_card_expiration",
  "cvv",
  "dob",
  "driver_license",
  "email_address",
  "healthcare_number",
  "ip_address",
  "name",
  "name_given",
  "name_family",
  "name_medical_professional",
  "numerical_pii",
  "passport_number",
  "password",
  "phone_number",
  "ssn",
  "username",
  "vehicle_id",
  "routing_number",
  "condition",
  "drug",
  "injury",
  "blood_type",
  "medical_process",
  "clinical_measurement",
]);

function toneFor(entityType: string): Tone {
  if (OFFENSIVE.has(entityType)) return "offensive";
  if (SENSITIVE.has(entityType)) return "sensitive";
  return "neutral";
}

const TONE_CHIP: Record<Tone, string> = {
  sensitive: "border-amber-400/40 text-amber-200",
  offensive: "border-red-400/40 text-red-200",
  neutral: "border-border/70 text-muted-foreground",
};

const TONE_LABEL: Record<Tone, string> = {
  sensitive: "text-amber-300",
  offensive: "text-red-300",
  neutral: "text-muted-foreground",
};

function formatTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = Math.floor(seconds % 60);
  return `${minutes}:${rest.toString().padStart(2, "0")}`;
}

function humanize(entityType: string): string {
  return entityType.replace(/_/g, " ");
}

export function EntityPanel({
  transcript,
  entities,
}: {
  transcript: Transcript;
  entities?: TranscriptEntity[];
}) {
  if (!entities || entities.length === 0) return null;

  const groups = new Map<string, TranscriptEntity[]>();
  for (const entity of entities) {
    const group = groups.get(entity.entityType) ?? [];
    group.push(entity);
    groups.set(entity.entityType, group);
  }
  const ordered = [...groups.entries()].sort((a, b) => b[1].length - a[1].length);

  return (
    <div
      data-testid="entity-panel"
      className="glass flex flex-col gap-3 rounded-2xl border border-border/70 px-4 py-3"
    >
      <span className="inline-flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        <Tags className="size-3.5" />
        Entities
        <span className="text-[10px] normal-case tracking-normal opacity-70">
          {entities.length}
        </span>
      </span>

      <div className="flex flex-col gap-2.5">
        {ordered.map(([entityType, items]) => {
          const tone = toneFor(entityType);
          return (
            <div key={entityType} className="flex flex-col gap-1">
              <span
                className={cn(
                  "text-[11px] font-medium capitalize tracking-wide",
                  TONE_LABEL[tone],
                )}
              >
                {humanize(entityType)}
                <span className="ml-1 opacity-60">{items.length}</span>
              </span>
              <div className="flex flex-wrap gap-1.5">
                {items.map((entity, index) => {
                  const at = entitySecondsAt(transcript, entity.startChar);
                  return (
                    <span
                      key={`${entity.startChar}-${index}`}
                      className={cn(
                        "inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px]",
                        TONE_CHIP[tone],
                      )}
                    >
                      <span className="truncate text-foreground/90">{entity.text}</span>
                      {at !== null ? (
                        <span className="shrink-0 tabular-nums opacity-70">
                          {formatTime(at)}
                        </span>
                      ) : null}
                    </span>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
