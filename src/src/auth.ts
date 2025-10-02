import express, { Request, Response } from "express";
import fetch from "node-fetch";
import querystring from "querystring";

const router = express.Router();

// Start Gmail OAuth flow
router.get("/connect-gmail", (req: Request, res: Response) => {
  const clientId = process.env.GOOGLE_CLIENT_ID!;
  const redirectUri = process.env.OAUTH_REDIRECT_URI!;
  const scope = encodeURIComponent("https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.modify");
  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${querystring.stringify({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    scope,
  })}`;

  res.redirect(authUrl);
});

// OAuth callback
router.get("/oauth/callback", async (req: Request, res: Response) => {
  try {
    const code = req.query.code as string;
    if (!code) {
      return res.status(400).send("Missing OAuth code");
    }

    const clientId = process.env.GOOGLE_CLIENT_ID!;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET!;
    const redirectUri = process.env.OAUTH_REDIRECT_URI!;

    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: querystring.stringify({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenRes.ok) {
      const errorText = await tokenRes.text();
      return res.status(500).send(`Token exchange failed: ${errorText}`);
    }

    const tokens = (await tokenRes.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
    };

    // For now, just return tokens to test flow — later, save to DB
    return res.json(tokens);
  } catch (err: any) {
    return res.status(500).send(`OAuth callback error: ${err.message}`);
  }
});

export default router;
