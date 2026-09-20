"use client";

import { ChevronDown, Link2, Sparkles } from "lucide-react";
import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type ComposerMode = "agent" | "direct";

const MODES: Array<{ id: ComposerMode; label: string; hint: string; icon: typeof Sparkles }> = [
  {
    id: "agent",
    label: "Find with AI",
    hint: "Describe a speech and the agent finds it",
    icon: Sparkles,
  },
  {
    id: "direct",
    label: "Direct link",
    hint: "Paste a YouTube link to transcribe it as-is",
    icon: Link2,
  },
];

export function ToolMenu({
  value,
  onChange,
  disabled,
}: {
  value: ComposerMode;
  onChange: (mode: ComposerMode) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const current = MODES.find((mode) => mode.id === value) ?? MODES[0];
  const CurrentIcon = current.icon;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          aria-label={`Tool: ${current.label}`}
          className="inline-flex h-8 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
        >
          <CurrentIcon className="size-3.5" />
          {current.label}
          <ChevronDown className="size-3.5" />
        </button>
      </PopoverTrigger>

      <PopoverContent align="start" side="top" className="w-72 p-1">
        {MODES.map((mode) => {
          const Icon = mode.icon;
          return (
            <button
              key={mode.id}
              type="button"
              onClick={() => {
                onChange(mode.id);
                setOpen(false);
              }}
              className={cn(
                "flex w-full items-start gap-2.5 rounded-md px-2.5 py-2 text-left transition-colors hover:bg-accent",
                mode.id === value && "bg-accent",
              )}
            >
              <Icon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
              <span className="min-w-0">
                <span className="block text-xs font-medium text-foreground">{mode.label}</span>
                <span className="mt-0.5 block text-[11px] leading-relaxed text-muted-foreground">
                  {mode.hint}
                </span>
              </span>
            </button>
          );
        })}
      </PopoverContent>
    </Popover>
  );
}
