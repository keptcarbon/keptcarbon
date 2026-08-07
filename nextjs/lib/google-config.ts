export const GOOGLE_CONFIG = {
  clientId: process.env.GOOGLE_CLIENT_ID || "",
  clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
  authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
  tokenUrl: "https://oauth2.googleapis.com/token",
  profileUrl: "https://www.googleapis.com/oauth2/v2/userinfo",
  redirectUri: process.env.GOOGLE_CALLBACK_URL || "http://localhost:3000/api/auth/google/callback",
  scope: "openid email profile",
};
