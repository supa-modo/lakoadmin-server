import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function optional(name: string, fallback = ""): string {
  return process.env[name] ?? fallback;
}

function optionalNumber(name: string, fallback: number): number {
  const v = process.env[name];
  return v ? parseInt(v, 10) : fallback;
}

function optionalBool(name: string, fallback: boolean): boolean {
  const v = process.env[name];
  if (v === undefined) return fallback;
  return v.toLowerCase() === "true";
}

export const env = {
  NODE_ENV: optional("NODE_ENV", "development"),
  PORT: optionalNumber("PORT", 5000),
  isDev: optional("NODE_ENV", "development") === "development",
  isProd: optional("NODE_ENV", "development") === "production",

  DATABASE_URL: required("DATABASE_URL"),

  REDIS_URL: optional("REDIS_URL", ""),

  JWT_ACCESS_SECRET: required("JWT_ACCESS_SECRET"),
  JWT_REFRESH_SECRET: required("JWT_REFRESH_SECRET"),
  JWT_ACCESS_EXPIRES_IN: optional("JWT_ACCESS_EXPIRES_IN", "15m"),
  JWT_REFRESH_EXPIRES_IN: optional("JWT_REFRESH_EXPIRES_IN", "7d"),

  MAX_LOGIN_ATTEMPTS: optionalNumber("MAX_LOGIN_ATTEMPTS", 5),
  LOCKOUT_MINUTES: optionalNumber("LOCKOUT_MINUTES", 15),

  CORS_ORIGIN: optional("CORS_ORIGIN", "http://localhost:5173"),

  SPACES_KEY: optional("SPACES_KEY", ""),
  SPACES_SECRET: optional("SPACES_SECRET", ""),
  SPACES_ENDPOINT: optional(
    "SPACES_ENDPOINT",
    "https://fra1.digitaloceanspaces.com",
  ),
  SPACES_BUCKET: optional("SPACES_BUCKET", "lako-agency"),
  SPACES_REGION: optional("SPACES_REGION", "fra1"),

  SMTP_HOST: optional("SMTP_HOST", "smtp.gmail.com"),
  SMTP_PORT: optionalNumber("SMTP_PORT", 587),
  SMTP_SECURE: optionalBool("SMTP_SECURE", false),
  SMTP_USER: optional("SMTP_USER", ""),
  SMTP_PASS: optional("SMTP_PASS", ""),
  SMTP_FROM: optional("SMTP_FROM", "Lako Admin <noreply@lako.co.ke>"),

  AT_API_KEY: optional("AT_API_KEY", ""),
  AT_USERNAME: optional("AT_USERNAME", "sandbox"),

  ADMIN_EMAIL: optional("ADMIN_EMAIL", "admin@lako.co.ke"),
  ADMIN_PASSWORD: optional("ADMIN_PASSWORD", "Admin@1234!"),
  ADMIN_FIRST_NAME: optional("ADMIN_FIRST_NAME", "System"),
  ADMIN_LAST_NAME: optional("ADMIN_LAST_NAME", "Admin"),

  ENABLE_WORKERS: optionalBool("ENABLE_WORKERS", false),

  FRONTEND_URL: optional("FRONTEND_URL", "http://localhost:5173"),
};
