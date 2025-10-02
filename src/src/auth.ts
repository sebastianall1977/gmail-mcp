import express from "express";
import fetch from "node-fetch";
import querystring from "querystring";

const router = express.Router();

// Step 1: Start Google OAuth
router.get("/connect-gmail", (req, res) => {
  const params = querystring.stringify({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: process.env.OAUTH_REDIRECT_URI!,
    response_type: "code",
    scope: "https://www.googleapis.com/auth/gmail.readonly",
    access_type: "offline",
    prompt: "consent",
  });

  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
});

// Step 2: OAuth Callback
router.get("/oauth/callback", async (req, res) => {
  const code = req.query.code as string;

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: querystring.stringify({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: process.env.OAUTH_REDIRECT_URI!,
      grant_type: "authorization_code",
    }),
  });

  const tokens = await tokenRes.json();

  if (tokens.error) {
    console.error("OAuth error:", tokens);
    return res.status(400).send("❌ Failed to authenticate with Gmail.");
  }

  console.log("✅ Received tokens:", tokens);

  // TODO: Save tokens in DB (for now just log)
  res.send("✅ Gmail connected! Refresh token saved on server logs.");
});

export default router;
