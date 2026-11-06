import { defineConfig } from "@trigger.dev/sdk";
export default defineConfig({
  project: process.env.TRIGGER_PROJECT_ID || "configure-trigger-project",
  runtime: "node",
  dirs: ["./src/jobs"],
  maxDuration: 300,
});
