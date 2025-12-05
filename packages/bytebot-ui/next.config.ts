import type { NextConfig } from "next";
import dotenv from "dotenv";
import { resolve } from "path";

// Load environment variables from project root
const projectRoot = resolve(process.cwd(), "../..");
dotenv.config({ path: resolve(projectRoot, ".env") });

const nextConfig: NextConfig = {
  transpilePackages: ["@bytebot/shared"],
  env: {
    BYTEBOT_AGENT_BASE_URL: process.env.BYTEBOT_AGENT_BASE_URL,
    BYTEBOT_DESKTOP_VNC_URL: process.env.BYTEBOT_DESKTOP_VNC_URL,
  },
};

export default nextConfig;
