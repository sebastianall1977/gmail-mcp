#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { createStatefulServer } from "@smithery/sdk/server/stateful.js"
import { z } from "zod"
import { google, gmail_v1 } from 'googleapis'
import fs from "fs"
import express from "express"
import { MCP_CONFIG_DIR, PORT, TELEMETRY_ENABLED } from "./config.js"
import { instrumentServer } from "@shinzolabs/instrumentation-mcp"

type Draft = gmail_v1.Schema$Draft
type DraftCreateParams = gmail_v1.Params$Resource$Users$Drafts$Create
type DraftUpdateParams = gmail_v1.Params$Resource$Users$Drafts$Update
type Message = gmail_v1.Schema$Message
type MessagePart = gmail_v1.Schema$MessagePart
type MessagePartBody = gmail_v1.Schema$MessagePartBody
type MessagePartHeader = gmail_v1.Schema$MessagePartHeader
type MessageSendParams = gmail_v1.Params$Resource$Users$Messages$Send
type Thread = gmail_v1.Schema$Thread

const RESPONSE_HEADERS_LIST = ['Date','From','To','Subject','Message-ID','In-Reply-To','References']

// --- OAuth2 Helpers ---
const clientId = process.env.GOOGLE_CLIENT_ID!
const clientSecret = process.env.GOOGLE_CLIENT_SECRET!
const redirectUri = process.env.OAUTH_REDIRECT_URI!

function getOAuth2Client(refreshToken?: string) {
  const client = new google.auth.OAuth2(clientId, clientSecret, redirectUri)
  if (refreshToken) client.setCredentials({ refresh_token: refreshToken })
  return client
}

// --- Utility formatters ---
const formatResponse = (response: any) => ({ content: [{ type: "text", text: JSON.stringify(response) }] })

const handleTool = async (refreshToken: string | undefined, apiCall: (gmail: gmail_v1.Gmail) => Promise<any>) => {
  try {
    const oauth2Client = getOAuth2Client(refreshToken)
    const gmailClient = google.gmail({ version: 'v1', auth: oauth2Client })
    const result = await apiCall(gmailClient)
    return result
  } catch (error: any) {
    return formatResponse({ error: `Tool execution failed: ${error.message}` })
  }
}

// --- Express OAuth Router ---
function buildAuthRouter() {
  const router = express.Router()

  // Step 1: Redirect user to Google
  router.get("/connect-gmail", (req, res) => {
    const url = getOAuth2Client().generateAuthUrl({
      access_type: "offline",
      prompt: "consent",
      scope: [
        "https://www.googleapis.com/auth/gmail.readonly",
        "https://www.googleapis.com/auth/gmail.modify",
        "https://www.googleapis.com/auth/gmail.send"
      ]
    })
    res.redirect(url)
  })

  // Step 2: Callback
  router.get("/oauth/callback", async (req, res) => {
    try {
      const code = req.query.code as string
      const { tokens } = await getOAuth2Client().getToken(code)

      if (tokens.refresh_token) {
        res.json({
          message: "✅ Success! Save this refresh_token securely.",
          refresh_token: tokens.refresh_token
        })
      } else {
        res.json({ message: "Got tokens but no refresh_token", tokens })
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message })
    }
  })

  return router
}

// --- Example Tool Using Refresh Token from Headers ---
function createServer() {
  const serverInfo = {
    name: "Gmail-MCP",
    version: "1.8.0",
    description: "Gmail MCP with OAuth2 Web Flow (multi-user ready)"
  }

  const server = new McpServer(serverInfo)

  if (TELEMETRY_ENABLED !== "false") {
    instrumentServer(server, {
      serverName: serverInfo.name,
      serverVersion: serverInfo.version,
      exporterEndpoint: "https://api.otel.shinzo.tech/v1"
    })
  }

  // Simple example tool: list messages
  server.tool("list_messages",
    "List messages in the user's mailbox (requires refresh_token in headers)",
    {
      maxResults: z.number().optional(),
    },
    async (params, context) => {
      const refreshToken = context?.headers?.authorization?.replace("Bearer ", "")
      return handleTool(refreshToken, async (gmail: gmail_v1.Gmail) => {
        const { data } = await gmail.users.messages.list({ userId: 'me', maxResults: params.maxResults || 10 })
        return formatResponse(data)
      })
    }
  )

  return server.server
}

// --- Main Entry ---
const main = async () => {
  fs.mkdirSync(MCP_CONFIG_DIR, { recursive: true })

  // Stdio Server
  const stdioServer = createServer()
  const transport = new StdioServerTransport()
  await stdioServer.connect(transport)

  // HTTP Server
  const { app } = createStatefulServer(createServer)
  app.use("/", buildAuthRouter())
  app.listen(PORT, () => {
    console.log(`🚀 Gmail MCP Server running at http://localhost:${PORT}`)
    console.log(`🔗 Visit http://localhost:${PORT}/connect-gmail to start auth`)
  })
}

main()
