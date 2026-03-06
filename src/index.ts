/**
 * CRM MCP Server — Entry Point
 *
 * ElevenAgents'a CRM tool'larını MCP protocol üzerinden sunar.
 * 8 tool: get_contact_by_phone (kimlik doğrulama),
 *         get_lead_info, get_quote_details, get_ticket_details,
 *         update_opportunity_status, update_quote_status,
 *         update_ticket_escalation, reschedule_call
 *
 * Transport: StreamableHTTP (stateless, her request yeni server instance)
 * Auth: Bearer token (ElevenAgents secret_token)
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { HttpMcpServer } from './server/http-server.js';

// Tool imports
import { getContactByPhoneTool } from './tools/get-contact-by-phone.js';
import { getLeadInfoTool } from './tools/get-lead-info.js';
import { getQuoteDetailsTool } from './tools/get-quote-details.js';
import { getTicketDetailsTool } from './tools/get-ticket-details.js';
import { updateOpportunityTool } from './tools/update-opportunity.js';
import { updateQuoteTool } from './tools/update-quote.js';
import { updateTicketTool } from './tools/update-ticket.js';
import { rescheduleCallTool } from './tools/reschedule-call.js';

// ─── Environment Validation ──────────────────────────────────────────────────

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const MCP_AUTH_TOKEN = process.env.MCP_AUTH_TOKEN;
const PORT = parseInt(process.env.PORT ?? '8080', 10);
const HOST = process.env.HOST ?? '0.0.0.0';

// Debug: log env var presence at startup (no values)
console.error('[CRM-MCP] Env check — SUPABASE_URL:', SUPABASE_URL ? 'SET' : 'MISSING');
console.error('[CRM-MCP] Env check — SUPABASE_SERVICE_ROLE_KEY:', SUPABASE_SERVICE_ROLE_KEY ? `SET (${SUPABASE_SERVICE_ROLE_KEY.length} chars)` : 'MISSING');
console.error('[CRM-MCP] Env check — MCP_AUTH_TOKEN:', MCP_AUTH_TOKEN ? 'SET' : 'MISSING');

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !MCP_AUTH_TOKEN) {
  console.error('Missing required environment variables:');
  if (!SUPABASE_URL) console.error('  - SUPABASE_URL');
  if (!SUPABASE_SERVICE_ROLE_KEY) console.error('  - SUPABASE_SERVICE_ROLE_KEY');
  if (!MCP_AUTH_TOKEN) console.error('  - MCP_AUTH_TOKEN');
  process.exit(1);
}

// ─── Supabase Client ─────────────────────────────────────────────────────────

const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// ─── Tool Registry ───────────────────────────────────────────────────────────

interface CrmTool {
  name: string;
  description: string;
  inputSchema: z.ZodTypeAny;
  mcpInputSchema: object;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Zod validates at runtime
  execute: (input: any, client: SupabaseClient) => Promise<unknown>;
}

const allTools: CrmTool[] = [
  getContactByPhoneTool,
  getLeadInfoTool,
  getQuoteDetailsTool,
  getTicketDetailsTool,
  updateOpportunityTool,
  updateQuoteTool,
  updateTicketTool,
  rescheduleCallTool,
];

const tools = new Map<string, CrmTool>(
  allTools.map(t => [t.name, t])
);

// MCP capabilities — ListTools'un döneceği format
const toolCapabilities = Object.fromEntries(
  Array.from(tools.values()).map(t => [
    t.name,
    { name: t.name, description: t.description, inputSchema: t.mcpInputSchema },
  ])
);

// ─── MCP Server Factory ─────────────────────────────────────────────────────

function createMcpServer(): Server {
  const server = new Server(
    { name: 'crm-mcp-server', version: '1.0.0' },
    { capabilities: { tools: toolCapabilities } },
  );

  // ListTools — tüm tool tanımlarını döndürür
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: Object.values(toolCapabilities),
  }));

  // CallTool — tool çalıştırır
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const toolName = request.params.name;
    const tool = tools.get(toolName);

    if (!tool) {
      throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${toolName}`);
    }

    try {
      // Zod ile input validation
      const parsedArgs = tool.inputSchema.parse(request.params.arguments);

      // Tool'u çalıştır
      const result = await tool.execute(parsedArgs, supabase);

      return {
        content: [{
          type: 'text' as const,
          text: typeof result === 'string' ? result : JSON.stringify(result, null, 2),
        }],
      };
    } catch (error: unknown) {
      console.error(`[CRM-MCP] Tool ${toolName} error:`, error);

      let errorMessage = `Error executing ${toolName}: `;
      if (error instanceof z.ZodError) {
        errorMessage += `Input validation: ${error.issues.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`;
      } else if (error instanceof Error) {
        errorMessage += error.message;
      } else {
        errorMessage += String(error);
      }

      return {
        content: [{ type: 'text' as const, text: errorMessage }],
        isError: true,
      };
    }
  });

  return server;
}

// ─── Start Server ────────────────────────────────────────────────────────────

async function main() {
  console.error('[CRM-MCP] Initializing CRM MCP Server...');
  console.error(`[CRM-MCP] Tools registered: ${Array.from(tools.keys()).join(', ')}`);
  console.error(`[CRM-MCP] Supabase URL: ${SUPABASE_URL}`);

  const httpServer = new HttpMcpServer(
    {
      port: PORT,
      host: HOST,
      authToken: MCP_AUTH_TOKEN!,
      // ElevenLabs webhook tools için REST executor
      toolExecutor: async (name: string, args: unknown) => {
        const tool = tools.get(name);
        if (!tool) throw new Error(`Unknown tool: ${name}`);
        const parsedArgs = tool.inputSchema.parse(args);
        return tool.execute(parsedArgs, supabase);
      },
    },
    createMcpServer,
  );

  await httpServer.start();

  // Graceful shutdown
  const shutdown = () => {
    void (async () => {
      console.error('[CRM-MCP] Shutting down...');
      await httpServer.stop();
      process.exit(0);
    })();
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((error) => {
  console.error('[CRM-MCP] Fatal error:', error);
  process.exit(1);
});
