export const FACEBOOK_CONFIG = {
  clientId: process.env.FACEBOOK_APP_ID || "",
  clientSecret: process.env.FACEBOOK_APP_SECRET || "",
  authUrl: "https://www.facebook.com/v15.0/dialog/oauth",
  tokenUrl: "https://graph.facebook.com/v15.0/oauth/access_token",
  profileUrl: "https://graph.facebook.com/me?fields=id,name,email,picture",
  redirectUri: process.env.FACEBOOK_CALLBACK_URL || "http://localhost:3000/api/auth/facebook/callback",
  scope: "email public_profile",
};
