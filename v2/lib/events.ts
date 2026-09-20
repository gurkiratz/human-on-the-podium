import type { ProjectEntry } from "./projects";
import type { Transcript, TranscriptStats, VideoProposal } from "./types";

export type AgentEvent =
  | { type: "meta"; model: string }
  | { type: "step"; label: string }
  | { type: "reply"; text: string }
  | { type: "proposal"; video: VideoProposal; sessionId?: string }
  | {
      type: "transcript";
      transcript: Transcript;
      stats: TranscriptStats;
      primarySpeaker?: string | null;
      primarySpeakerReason?: string;
    }
  | { type: "project"; project: ProjectEntry }
  | { type: "error"; message: string }
  | { type: "done" };
