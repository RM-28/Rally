import type { NextConfig } from "next";

// STATIC_EXPORT=1 builds web/out for FastAPI to serve from the same origin (deploy fallback).
const nextConfig: NextConfig = process.env.STATIC_EXPORT ? { output: "export" } : {};

export default nextConfig;
