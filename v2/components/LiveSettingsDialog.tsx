"use client";

import { Settings } from "lucide-react";
import { DeviceSelect } from "./DeviceSelect";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { DeviceOption } from "@/lib/useDevices";
import { VOICES } from "@/lib/voices";
import { DEFAULT_PREFS, type LivePrefs } from "@/lib/live-prefs";

export { DEFAULT_PREFS };
export type { LivePrefs };

type Props = {
  mics: DeviceOption[];
  cameras: DeviceOption[];
  micId: string;
  cameraId: string;
  onMicChange: (id: string) => void;
  onCameraChange: (id: string) => void;
  voiceId: string;
  onVoiceChange: (id: string) => void;
  prefs: LivePrefs;
  onPrefsChange: (prefs: LivePrefs) => void;
  running: boolean;
};

export function LiveSettingsDialog(props: Props) {
  const set = <K extends keyof LivePrefs>(key: K, value: LivePrefs[K]) =>
    props.onPrefsChange({ ...props.prefs, [key]: value });

  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          aria-label="Capture settings"
          title="Capture settings"
          className="glass grid size-9 place-items-center rounded-full text-foreground outline-none transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Settings className="size-4" />
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Capture settings</DialogTitle>
          <DialogDescription>
            Pick the input devices and the voice that reacts to AI text, and
            choose what shows on screen.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <DeviceSelect
            label="Microphone"
            value={props.micId}
            onChange={props.onMicChange}
            disabled={props.running}
            options={props.mics.map((m) => ({ value: m.deviceId, label: m.label }))}
          />
          <DeviceSelect
            label="Camera"
            value={props.cameraId}
            onChange={props.onCameraChange}
            disabled={props.running}
            options={props.cameras.map((c) => ({ value: c.deviceId, label: c.label }))}
          />
          <DeviceSelect
            label="Roast voice"
            value={props.voiceId}
            onChange={props.onVoiceChange}
            options={VOICES.map((v) => ({ value: v.id, label: `${v.name} — ${v.blurb}` }))}
          />
        </div>

        <div className="grid gap-2 border-t border-border/60 pt-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/60">
            Display
          </p>
          <SettingToggle
            label="Live captions"
            hint="Show the transcript over the camera, subtitle-style."
            checked={props.prefs.captions}
            onChange={(value) => set("captions", value)}
          />
          <SettingToggle
            label="Voice callouts"
            hint="Speak the roast and praise lines out loud."
            checked={props.prefs.voice}
            onChange={(value) => set("voice", value)}
          />
          <SettingToggle
            label="Mirror camera"
            hint="Flip the preview so it reads like a mirror."
            checked={props.prefs.mirror}
            onChange={(value) => set("mirror", value)}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SettingToggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-border/60 px-3 py-2.5">
      <div className="min-w-0">
        <p className="text-[13px] font-medium">{label}</p>
        <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">{hint}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative h-5 w-9 shrink-0 rounded-full transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
          checked ? "bg-primary" : "bg-muted",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 size-4 rounded-full bg-background shadow-sm transition-all",
            checked ? "left-[1.15rem]" : "left-0.5",
          )}
        />
      </button>
    </div>
  );
}
