import { defineConfig } from "wxt";

export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  manifest: {
    name: "HumanonthePodium",
    description:
      "Real-time AI-written likelihood feedback for livestream and meeting audio.",
    permissions: [
      "tabCapture",
      "offscreen",
      "storage",
      "activeTab",
      "tabs",
      "sidePanel",
    ],
    host_permissions: [
      "<all_urls>",
      "http://127.0.0.1:3001/*",
      "http://localhost:3001/*",
    ],
    side_panel: {
      default_path: "sidepanel.html",
    },
    action: {
      default_title: "Open HumanonthePodium",
    },
  },
});
