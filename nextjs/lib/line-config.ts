/**
 * LINE Login — Configuration
 * Centralized LINE OAuth constants used by both initiate and callback routes.
 */

export const LINE_CONFIG = {
  authUrl: "https://access.line.me/oauth2/v2.1/authorize",
  tokenUrl: "https://api.line.me/oauth2/v2.1/token",
  profileUrl: "https://api.line.me/v2/profile",
  channelId: process.env.LINE_CHANNEL_ID || "",
  channelSecret: process.env.LINE_CHANNEL_SECRET || "",
  callbackUrl: process.env.LINE_CALLBACK_URL || "http://localhost:3000/api/auth/line/callback",
  scope: "profile openid email",
};
