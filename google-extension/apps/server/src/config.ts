import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";

loadEnv({ path: resolve(process.cwd(), "../../.env") });
loadEnv();

const forceMockApis = process.env.USE_MOCK_APIS === "true";
const geminiApiKey = process.env.GEMINI_API_KEY ?? "";
const gptzeroApiKey = process.env.GPTZERO_API_KEY ?? "";

export const config = {
  host: process.env.HOST ?? "127.0.0.1",
  port: Number(process.env.PORT ?? 3001),
  geminiApiKey,
  gptzeroApiKey,
  geminiModel: process.env.GEMINI_MODEL ?? "gemini-3.8-flash",
  forceMockApis,
  useMockTranscription: forceMockApis || !geminiApiKey,
  useMockGptZero: forceMockApis || !gptzeroApiKey,
  dataDir: resolve(process.cwd(), "data"),
};
