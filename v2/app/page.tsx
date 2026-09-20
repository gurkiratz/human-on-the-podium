"use client";

import Link from "next/link";
import { PanelLeft, SlidersHorizontal, Sparkles } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { AnalyticsPanel } from "@/components/AnalyticsPanel";
import { AudioToolsView } from "@/components/AudioToolsView";
import { ChatPanel } from "@/components/ChatPanel";
import { ChatSidebar } from "@/components/ChatSidebar";
import { LeaderboardView } from "@/components/LeaderboardView";
import { LibraryView } from "@/components/LibraryView";
import { LiveView } from "@/components/LiveView";
import { ProjectsView } from "@/components/ProjectsView";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAgentChat } from "@/components/useAgentChat";
import { cn } from "@/lib/utils";

const SPRING = { type: "spring" as const, stiffness: 150, damping: 24 };
const MOBILE_QUERY = "(max-width: 767px)";

export default function Page() {
  const chat = useAgentChat();
  const [tab, setTab] = useState("live");
  const [existingView, setExistingView] = useState<"chat" | "transcripts">("chat");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [liveRailOpen, setLiveRailOpen] = useState(false);
  // Bumped to re-open the created project even if it was already opened and closed.
  const [projectFocus, setProjectFocus] = useState(0);

  // The history rail is an overlay on phones, so it must start closed there —
  // open it by default only when there is room to dock it beside the chat.
  useEffect(() => {
    if (typeof window !== "undefined" && window.matchMedia(MOBILE_QUERY).matches) {
      setSidebarOpen(false);
    }
  }, []);

  const split =
    existingView === "chat" && chat.view === "split" && chat.transcript && chat.stats;

  return (
    <Tabs value={tab} onValueChange={setTab} className="flex h-dvh flex-col gap-0!">
      <header className="glass-strong shrink-0 border-b border-border/70 px-3 pt-2 sm:grid sm:h-12 sm:grid-cols-[1fr_auto_1fr] sm:items-center sm:gap-3 sm:pt-0">
        <div className="flex min-w-0 items-center gap-2">
          {tab === "live" && !liveRailOpen ? (
            <Button
              variant="ghost"
              size="icon"
              className="size-8 text-muted-foreground hover:text-foreground"
              onClick={() => setLiveRailOpen(true)}
              aria-label="Show live sessions"
            >
              <PanelLeft className="size-4" />
            </Button>
          ) : tab === "existing" && !sidebarOpen ? (
            <Button
              variant="ghost"
              size="icon"
              className="size-8 text-muted-foreground hover:text-foreground"
              onClick={() => setSidebarOpen(true)}
              aria-label="Show history"
            >
              <PanelLeft className="size-4" />
            </Button>
          ) : null}

          <span
            className="grid size-6 shrink-0 place-items-center rounded-md bg-primary text-primary-foreground"
            aria-hidden="true"
          >
            <Sparkles className="size-3.5" />
          </span>
          <span className="truncate text-sm font-medium tracking-tight">
            Human on the Podium
          </span>
        </div>

        {/* Horizontal scroll on phones, centred in the grid cell from sm up. */}
        <div className="scroll-quiet -mx-1 mt-1 flex overflow-x-auto px-1 pb-2 sm:mx-0 sm:mt-0 sm:justify-center sm:overflow-visible sm:pb-0">
          <TabsList>
            <TabsTrigger value="live" className="px-3">
              Live
            </TabsTrigger>
            <TabsTrigger value="existing" className="px-3">
              Chat
            </TabsTrigger>
            <TabsTrigger value="projects" className="px-3">
              Projects
            </TabsTrigger>
            <TabsTrigger value="leaderboard" className="px-3">
              Leaderboard
            </TabsTrigger>
          </TabsList>
        </div>

        <div className="mt-1 flex items-center justify-end gap-3 text-xs text-muted-foreground sm:mt-0">
          <Button
            variant={tab === "audio" ? "secondary" : "ghost"}
            size="sm"
            className="gap-1.5"
            onClick={() => setTab("audio")}
            aria-pressed={tab === "audio"}
          >
            <SlidersHorizontal className="size-3.5" />
            <span className="hidden sm:inline">Audio tools</span>
            <span className="sm:hidden">Tools</span>
          </Button>
          <Link
            href="/investigate"
            className="hidden underline-offset-4 hover:text-foreground hover:underline sm:inline"
          >
            Investigate ↗
          </Link>
          <Link
            href="/map"
            className="hidden underline-offset-4 hover:text-foreground hover:underline sm:inline"
          >
            Map ↗
          </Link>
          {chat.sessionId ? (
            <a
              className="hidden underline-offset-4 hover:text-foreground hover:underline sm:inline"
              href={`https://www.browserbase.com/sessions/${chat.sessionId}`}
              target="_blank"
              rel="noreferrer"
            >
              Browser session ↗
            </a>
          ) : null}
        </div>
      </header>

      <TabsContent
        forceMount
        value="existing"
        className="relative flex min-h-0 flex-1 flex-row data-[state=inactive]:hidden"
      >
        {/* Phone overlay scrim: tapping it puts the rail away. */}
        <AnimatePresence>
          {sidebarOpen ? (
            <motion.button
              key="scrim"
              type="button"
              aria-label="Hide history"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSidebarOpen(false)}
              className="fixed inset-0 z-30 bg-black/50 md:hidden"
            />
          ) : null}
        </AnimatePresence>

        <AnimatePresence initial={false}>
          {sidebarOpen ? (
            <motion.aside
              key="history"
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 264, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={SPRING}
              className="min-h-0 shrink-0 overflow-hidden border-r border-border/60 max-md:absolute max-md:inset-y-0 max-md:left-0 max-md:z-40 max-md:bg-sidebar"
            >
              <ChatSidebar
                activeId={chat.chatId}
                refreshKey={chat.saveCount}
                onCollapse={() => setSidebarOpen(false)}
                onNew={chat.startNew}
                onSelect={(session) => {
                  chat.restore(session);
                  setExistingView("chat");
                  if (window.matchMedia(MOBILE_QUERY).matches) setSidebarOpen(false);
                }}
                onShowTranscripts={() => setExistingView("transcripts")}
              />
            </motion.aside>
          ) : null}
        </AnimatePresence>

        {existingView === "transcripts" ? (
          <div className="min-h-0 flex-1">
            <LibraryView onBack={() => setExistingView("chat")} />
          </div>
        ) : (
          <motion.main
            layout
            transition={SPRING}
            className={cn(
              "flex min-h-0 flex-1 gap-5 px-4 sm:px-5",
              split ? "flex-col lg:flex-row" : "justify-center",
            )}
          >
            <AnimatePresence initial={false}>
              {split ? (
                <motion.section
                  key="analytics"
                  layout
                  initial={{ opacity: 0, x: -28 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={SPRING}
                  className="flex min-h-0 min-w-0 flex-1 flex-col py-4 sm:py-5"
                >
                  <div className="scroll-quiet min-h-0 flex-1 overflow-y-auto pr-1">
                    <AnalyticsPanel
                      video={chat.proposal}
                      transcript={chat.transcript!}
                      stats={chat.stats!}
                      sessionId={chat.sessionId}
                      primarySpeaker={chat.primarySpeaker}
                      primarySpeakerReason={chat.primarySpeakerReason}
                      onOpenProject={
                        chat.createdProject
                          ? () => {
                              setProjectFocus((count) => count + 1);
                              setTab("projects");
                            }
                          : undefined
                      }
                    />
                  </div>
                </motion.section>
              ) : null}
            </AnimatePresence>

            <motion.section
              layout
              layoutId="chat"
              transition={SPRING}
              className={cn(
                "flex min-h-0 flex-col py-4 sm:py-5",
                split
                  ? "w-full border-t border-border/60 lg:w-[420px] lg:shrink-0 lg:border-t-0 lg:border-l lg:pl-5"
                  : "w-full",
              )}
            >
              <ChatPanel
                messages={chat.messages}
                status={chat.status}
                busy={chat.busy}
                model={chat.model}
                proposal={chat.proposal}
                onSend={chat.send}
                onConfirm={chat.createProject}
                onReject={() => chat.reject()}
                mode={chat.mode}
                onModeChange={chat.setMode}
                onTranscribeDirect={chat.transcribeDirect}
                startEnabled={chat.startEnabled}
                startValue={chat.startValue}
                onStartEnabledChange={chat.setStartEnabled}
                onStartValueChange={chat.setStartValue}
              />
            </motion.section>
          </motion.main>
        )}
      </TabsContent>

      <TabsContent
        forceMount
        value="projects"
        className="min-h-0 flex-1 data-[state=inactive]:hidden"
      >
        <ProjectsView focusId={chat.createdProject?.id} focusToken={projectFocus} />
      </TabsContent>

      <TabsContent
        forceMount
        value="leaderboard"
        className="min-h-0 flex-1 data-[state=inactive]:hidden"
      >
        <LeaderboardView />
      </TabsContent>

      <TabsContent
        forceMount
        value="live"
        className="min-h-0 flex-1 data-[state=inactive]:hidden"
      >
        <LiveView
          railOpen={liveRailOpen}
          onRailClose={() => setLiveRailOpen(false)}
        />
      </TabsContent>
      <TabsContent
        forceMount
        value="audio"
        className="min-h-0 flex-1 data-[state=inactive]:hidden"
      >
        <AudioToolsView
          video={chat.proposal}
          transcribeOptions={chat.transcribeOptions}
          onTranscribeOptionsChange={chat.setTranscribeOptions}
        />
      </TabsContent>
    </Tabs>
  );
}
