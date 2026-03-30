import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["192.168.0.*", "192.168.0.50", "203.234.214.137"],
};

initOpenNextCloudflareForDev();

export default nextConfig;
