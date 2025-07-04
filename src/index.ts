/**
 * 42 API → Model Context Protocol Server (v0.1.5)
 * ----------------------------------------------
 * TypeScript implementation bridging 42 Intranet REST API and the MCP standard.
 * Supports both stdio and HTTP transports for maximum compatibility.
 */

import 'dotenv/config';
import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import fetch from 'node-fetch';
import NodeCache from 'node-cache';
import { z } from 'zod';
import express, { Request, Response } from 'express';

// -----------------------------------------------------------------------------
// Environment & Constants
// -----------------------------------------------------------------------------

const CLIENT_ID = process.env['42_CLIENT_ID'];
const CLIENT_SECRET = process.env['42_CLIENT_SECRET'];
const API_BASE = 'https://api.intra.42.fr';

if (!CLIENT_ID || !CLIENT_SECRET) {
  throw new Error('Missing 42_CLIENT_ID or 42_CLIENT_SECRET in environment');
}

// Cache OAuth token (50 min)
const tokenCache = new NodeCache({ stdTTL: 60 * 50 });

async function getAccessToken(): Promise<string> {
  const cached = tokenCache.get<string>('access_token');
  if (cached) return cached;

  const res = await fetch(`${API_BASE}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'client_credentials',
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
    }),
  });
  if (!res.ok) {
    throw new Error(`42 API oauth failure: ${res.status} ${await res.text()}`);
  }
  const { access_token, expires_in } = (await res.json()) as {
    access_token: string;
    expires_in: number;
  };
  tokenCache.set('access_token', access_token, expires_in - 60);
  return access_token;
}

async function apiRequest<T>(path: string): Promise<T> {
  const token = await getAccessToken();
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(`42 API error: ${res.status} ${await res.text()}`);
  }
  return res.json() as Promise<T>;
}

// -----------------------------------------------------------------------------
// MCP Server definition
// -----------------------------------------------------------------------------

const server = new McpServer({
  name: '42-api-server',
  version: '0.1.5',
  description: 'Expose 42 Intranet data as MCP resources and tools',
});

// -----------------------------------------------------------------------------
// Resources
// -----------------------------------------------------------------------------

// User profile resource with proper template
const userTemplate = new ResourceTemplate('42://user/{id}', {
  list: async () => {
    return { 
      resources: [] // Empty array as we don't enumerate all users
    };
  },
  complete: {
    id: async () => [] // No auto-completion for user IDs
  }
});

server.registerResource(
  'user',
  userTemplate,
  {
    title: '42 User Profile',
    description: 'JSON profile for a cadet or staff member fetched from 42 API',
    mimeType: 'application/json',
  },
  async (_uri, variables) => {
    const id = Array.isArray(variables.id) ? variables.id[0] : variables.id;
    const data = await apiRequest(`/v2/users/${id}`);
    return {
      contents: [{ uri: `42://user/${id}`, text: JSON.stringify(data, null, 2) }],
    };
  },
);

server.registerResource(
  'me',
  '42://me',
  {
    title: 'My 42 Profile',
    description: 'Your own user object from 42 API',
    mimeType: 'application/json',
  },
  async () => {
    const data = await apiRequest('/v2/me');
    return { contents: [{ uri: '42://me', text: JSON.stringify(data, null, 2) }] };
  },
);

// Campus resource
server.registerResource(
  'campus',
  '42://campus',
  {
    title: '42 Campus List',
    description: 'List of all 42 campuses worldwide',
    mimeType: 'application/json',
  },
  async () => {
    const data = await apiRequest('/v2/campus');
    return { contents: [{ uri: '42://campus', text: JSON.stringify(data, null, 2) }] };
  },
);

// -----------------------------------------------------------------------------
// Tools
// -----------------------------------------------------------------------------

server.registerTool(
  'searchUsers',
  {
    title: 'Search Users',
    description: 'Find 42 users by a case-insensitive login substring (max 5 results)',
    inputSchema: {
      query: z.string().min(2).max(30).describe('Search query for user login'),
    },
  },
  async ({ query }) => {
    const users = await apiRequest<any[]>(
      `/v2/users?filter[login]=${encodeURIComponent(query)}&page[size]=5`,
    );
    return { content: [{ type: 'text', text: JSON.stringify(users, null, 2) }] };
  },
);

server.registerTool(
  'getCursusLevel',
  {
    title: 'Get Cursus Level',
    description: 'Returns the level of a user in a specific cursus',
    inputSchema: {
      userId: z.number().describe('42 user ID'),
      cursusId: z.number().default(21).describe('Cursus ID (default: 21 for 42cursus)'),
    },
  },
  async ({ userId, cursusId }) => {
    const cursusUsers = await apiRequest<any[]>(
      `/v2/users/${userId}/cursus_users?filter[cursus_id]=${cursusId}`,
    );
    if (!cursusUsers.length) {
      return { content: [{ type: 'text', text: 'User not enrolled in this cursus.' }] };
    }
    const level = cursusUsers[0].level;
    return { content: [{ type: 'text', text: `Level ${level} in cursus ${cursusId}` }] };
  },
);

server.registerTool(
  'getUserProjects',
  {
    title: 'Get User Projects',
    description: 'Retrieve all projects for a specific user',
    inputSchema: {
      userId: z.number().describe('42 user ID'),
      cursusId: z.number().optional().describe('Filter by cursus ID (optional)'),
    },
  },
  async ({ userId, cursusId }) => {
    let url = `/v2/users/${userId}/projects_users`;
    if (cursusId) {
      url += `?filter[cursus_id]=${cursusId}`;
    }
    const projects = await apiRequest<any[]>(url);
    return { content: [{ type: 'text', text: JSON.stringify(projects, null, 2) }] };
  },
);

server.registerTool(
  'getCoalition',
  {
    title: 'Get Coalition Info',
    description: 'Get coalition information for a user',
    inputSchema: {
      userId: z.number().describe('42 user ID'),
    },
  },
  async ({ userId }) => {
    const coalitions = await apiRequest<any[]>(`/v2/users/${userId}/coalitions`);
    return { content: [{ type: 'text', text: JSON.stringify(coalitions, null, 2) }] };
  },
);

// -----------------------------------------------------------------------------
// Simple HTTP MCP Transport (Manual Implementation)
// -----------------------------------------------------------------------------

class SimpleHttpMcpTransport {
  constructor(private mcpServer: McpServer) {}

  async handleRequest(requestBody: any): Promise<any> {
    // Handle different MCP requests manually
    const { jsonrpc, method, params, id } = requestBody;
    
    if (jsonrpc !== '2.0') {
      return {
        jsonrpc: '2.0',
        error: { code: -32600, message: 'Invalid Request' },
        id: id || null,
      };
    }

    try {
      switch (method) {
        case 'initialize':
          return {
            jsonrpc: '2.0',
            result: {
              protocolVersion: '2024-11-05',
              capabilities: {
                tools: { listChanged: true },
                resources: { subscribe: true, listChanged: true },
              },
              serverInfo: {
                name: '42-api-server',
                version: '0.1.5',
              },
            },
            id,
          };

        case 'tools/list':
          return {
            jsonrpc: '2.0',
            result: {
              tools: [
                {
                  name: 'searchUsers',
                  description: 'Find 42 users by a case-insensitive login substring (max 5 results)',
                  inputSchema: {
                    type: 'object',
                    properties: {
                      query: {
                        type: 'string',
                        description: 'Search query for user login',
                        minLength: 2,
                        maxLength: 30,
                      },
                    },
                    required: ['query'],
                  },
                },
                {
                  name: 'getCursusLevel',
                  description: 'Returns the level of a user in a specific cursus',
                  inputSchema: {
                    type: 'object',
                    properties: {
                      userId: { type: 'number', description: '42 user ID' },
                      cursusId: { type: 'number', description: 'Cursus ID (default: 21 for 42cursus)', default: 21 },
                    },
                    required: ['userId'],
                  },
                },
                {
                  name: 'getUserProjects',
                  description: 'Retrieve all projects for a specific user',
                  inputSchema: {
                    type: 'object',
                    properties: {
                      userId: { type: 'number', description: '42 user ID' },
                      cursusId: { type: 'number', description: 'Filter by cursus ID (optional)' },
                    },
                    required: ['userId'],
                  },
                },
                {
                  name: 'getCoalition',
                  description: 'Get coalition information for a user',
                  inputSchema: {
                    type: 'object',
                    properties: {
                      userId: { type: 'number', description: '42 user ID' },
                    },
                    required: ['userId'],
                  },
                },
              ],
            },
            id,
          };

        case 'tools/call':
          const { name, arguments: args } = params;
          
          switch (name) {
            case 'searchUsers':
              const users = await apiRequest<any[]>(
                `/v2/users?filter[login]=${encodeURIComponent(args.query)}&page[size]=5`,
              );
              return {
                jsonrpc: '2.0',
                result: {
                  content: [{ type: 'text', text: JSON.stringify(users, null, 2) }],
                },
                id,
              };

            case 'getCursusLevel':
              const cursusUsers = await apiRequest<any[]>(
                `/v2/users/${args.userId}/cursus_users?filter[cursus_id]=${args.cursusId || 21}`,
              );
              const levelText = cursusUsers.length 
                ? `Level ${cursusUsers[0].level} in cursus ${args.cursusId || 21}`
                : 'User not enrolled in this cursus.';
              return {
                jsonrpc: '2.0',
                result: {
                  content: [{ type: 'text', text: levelText }],
                },
                id,
              };

            case 'getUserProjects':
              let url = `/v2/users/${args.userId}/projects_users`;
              if (args.cursusId) {
                url += `?filter[cursus_id]=${args.cursusId}`;
              }
              const projects = await apiRequest<any[]>(url);
              return {
                jsonrpc: '2.0',
                result: {
                  content: [{ type: 'text', text: JSON.stringify(projects, null, 2) }],
                },
                id,
              };

            case 'getCoalition':
              const coalitions = await apiRequest<any[]>(`/v2/users/${args.userId}/coalitions`);
              return {
                jsonrpc: '2.0',
                result: {
                  content: [{ type: 'text', text: JSON.stringify(coalitions, null, 2) }],
                },
                id,
              };

            default:
              return {
                jsonrpc: '2.0',
                error: { code: -32601, message: 'Method not found' },
                id,
              };
          }

        case 'resources/list':
          return {
            jsonrpc: '2.0',
            result: {
              resources: [
                {
                  uri: '42://me',
                  name: 'My 42 Profile',
                  description: 'Your own user object from 42 API',
                  mimeType: 'application/json',
                },
                {
                  uri: '42://campus',
                  name: '42 Campus List',
                  description: 'List of all 42 campuses worldwide',
                  mimeType: 'application/json',
                },
              ],
            },
            id,
          };

        default:
          return {
            jsonrpc: '2.0',
            error: { code: -32601, message: 'Method not found' },
            id,
          };
      }
    } catch (error) {
      console.error('Error processing request:', error);
      return {
        jsonrpc: '2.0',
        error: { code: -32603, message: 'Internal error' },
        id,
      };
    }
  }
}

// -----------------------------------------------------------------------------
// Transport selection
// -----------------------------------------------------------------------------

(async () => {
  const useHttp = process.argv.includes('--http');
  
  if (useHttp) {
    try {
      console.log('🚀 Starting HTTP server...');
      
      // Create Express app
      const app = express();
      app.use(express.json());
      
      // Enable CORS for VSCode
      app.use((req, res, next) => {
        res.header('Access-Control-Allow-Origin', '*');
        res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        if (req.method === 'OPTIONS') {
          res.sendStatus(200);
        } else {
          next();
        }
      });
      
      // Create manual MCP transport
      const httpTransport = new SimpleHttpMcpTransport(server);
      
      // Main MCP endpoint
      app.post('/', async (req: Request, res: Response) => {
        try {
          console.log('📨 Received MCP request:', JSON.stringify(req.body, null, 2));
          
          const response = await httpTransport.handleRequest(req.body);
          
          console.log('Sending response:', JSON.stringify(response, null, 2));
          res.json(response);
          
        } catch (error) {
          console.error('Error handling request:', error);
          res.status(500).json({
            jsonrpc: '2.0',
            error: { code: -32603, message: 'Internal error' },
            id: req.body?.id || null,
          });
        }
      });

      // Health check endpoint
      app.get('/health', (req: Request, res: Response) => {
        res.json({ status: 'healthy', server: '42-api-server', version: '0.1.5' });
      });
      
      // Start HTTP server
      const PORT = parseInt(process.env.PORT || '3000', 10);
      const httpServer = app.listen(PORT, '127.0.0.1', () => {
        console.log(`MCP HTTP server ready on port ${PORT}`);
        console.log(`MCP endpoint: http://127.0.0.1:${PORT}/`);
        console.log(`Health check: http://127.0.0.1:${PORT}/health`);
        console.log('');
        console.log('Test the server manually:');
        console.log(`curl -X POST http://127.0.0.1:${PORT}/ \\`);
        console.log(`  -H "Content-Type: application/json" \\`);
        console.log(`  -d '{"jsonrpc":"2.0","method":"initialize","params":{},"id":1}'`);
        console.log('');
        console.log('VSCode Configuration (.vscode/mcp.json):');
        console.log(JSON.stringify({
          servers: {
            "42-api": {
              url: `http://127.0.0.1:${PORT}/`
            }
          }
        }, null, 2));
      });
      
      // Handle server errors
      httpServer.on('error', (error) => {
        console.error('Server error:', error);
      });
      
    } catch (error) {
      console.error('HTTP transport failed:', error);
      console.error('Falling back to stdio transport...');
      
      const transport = new StdioServerTransport();
      await server.connect(transport);
      console.log('MCP server ready (stdio)');
    }
  } else {
    // Use stdio transport (for command line clients)
    const transport = new StdioServerTransport();
    await server.connect(transport);
    
    console.log('MCP server ready (stdio)');
    console.log('Available tools:', [
      'searchUsers',
      'getCursusLevel', 
      'getUserProjects',
      'getCoalition'
    ].join(', '));
    console.log('Available resources:', [
      '42://user/{id}',
      '42://me',
      '42://campus'
    ].join(', '));
  }
})();