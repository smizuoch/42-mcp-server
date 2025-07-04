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

server.registerTool(
  'getCampusUsers',
  {
    title: 'Get Campus Users',
    description: 'Retrieve campus-user associations by campusId or userId',
    inputSchema: {
      campusId: z.number().optional().describe('Campus ID'),
      userId: z.number().optional().describe('User ID'),
    },
  },
  async ({ campusId, userId }) => {
    let url = '/v2/campus_users';
    if (userId) {
      url = `/v2/users/${userId}/campus_users`;
    } else if (campusId) {
      url += `?filter[campus_id]=${campusId}`;
    }
    const campusUsers = await apiRequest<any[]>(url);
    return { content: [{ type: 'text', text: JSON.stringify(campusUsers, null, 2) }] };
  },
);

server.registerTool(
  'getBalances',
  {
    title: 'Get Balances',
    description: 'Retrieve balances globally or for a specific pool (requires Advanced tutor role)',
    inputSchema: {
      poolId: z.number().optional().describe('Pool ID'),
    },
  },
  async ({ poolId }) => {
    let url = '/v2/balances';
    if (poolId) {
      url = `/v2/pools/${poolId}/balances`;
    }
    const balances = await apiRequest<any[]>(url);
    return { content: [{ type: 'text', text: JSON.stringify(balances, null, 2) }] };
  },
);

server.registerTool(
  'getClusters',
  {
    title: 'Get Clusters',
    description: 'Retrieve clusters with optional campusId and/or name filter (requires Basic staff role)',
    inputSchema: {
      campusId: z.number().optional().describe('Campus ID'),
      name: z.string().optional().describe('Substring of cluster name'),
      pageSize: z.number().default(30).describe('Page size (default 30)'),
    },
  },
  async ({ campusId, name, pageSize }) => {
    let url = `/v2/clusters?page[size]=${pageSize}`;
    const filters: string[] = [];
    
    if (campusId) {
      filters.push(`filter[campus_id]=${campusId}`);
    }
    if (name) {
      filters.push(`filter[name]=${encodeURIComponent(name)}`);
    }
    
    if (filters.length > 0) {
      url += '&' + filters.join('&');
    }
    
    const clusters = await apiRequest<any[]>(url);
    return { content: [{ type: 'text', text: JSON.stringify(clusters, null, 2) }] };
  },
);

server.registerTool(
  'getLocations',
  {
    title: 'Get Locations',
    description: 'Retrieve user locations (seats) with optional campus, host, and activity filters',
    inputSchema: {
      campusId: z.number().optional().describe('Campus ID'),
      active: z.boolean().default(true).describe('Filter for active (currently sitting) users only'),
      host: z.string().optional().describe('Specific host/computer name'),
      pageSize: z.number().default(100).describe('Page size (default 100)'),
    },
  },
  async ({ campusId, active, host, pageSize }) => {
    let url = `/v2/locations?page[size]=${pageSize}`;
    const filters: string[] = [];
    
    if (campusId) {
      url = `/v2/campus/${campusId}/locations?page[size]=${pageSize}`;
    }
    
    if (active) {
      filters.push('filter[active]=true');
    }
    if (host) {
      filters.push(`filter[host]=${encodeURIComponent(host)}`);
    }
    
    if (filters.length > 0) {
      url += '&' + filters.join('&');
    }
    
    const locations = await apiRequest<any[]>(url);
    return { content: [{ type: 'text', text: JSON.stringify(locations, null, 2) }] };
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
                {
                  name: 'getCampusUsers',
                  description: 'Retrieve campus-user associations by campusId or userId',
                  inputSchema: {
                    type: 'object',
                    properties: {
                      campusId: { type: 'number', description: 'Campus ID' },
                      userId: { type: 'number', description: 'User ID' },
                    },
                  },
                },
                {
                  name: 'getBalances',
                  description: 'Retrieve balances globally or for a specific pool (requires Advanced tutor role)',
                  inputSchema: {
                    type: 'object',
                    properties: {
                      poolId: { type: 'number', description: 'Pool ID' },
                    },
                  },
                },
                {
                  name: 'getClusters',
                  description: 'Retrieve clusters with optional campusId and/or name filter (requires Basic staff role)',
                  inputSchema: {
                    type: 'object',
                    properties: {
                      campusId: { type: 'number', description: 'Campus ID' },
                      name: { type: 'string', description: 'Substring of cluster name' },
                      pageSize: { type: 'number', description: 'Page size (default 30)', default: 30 },
                    },
                  },
                },
                {
                  name: 'getLocations',
                  description: 'Retrieve user locations (seats) with optional campus, host, and activity filters',
                  inputSchema: {
                    type: 'object',
                    properties: {
                      campusId: { type: 'number', description: 'Campus ID' },
                      active: { type: 'boolean', description: 'Filter for active (currently sitting) users only', default: true },
                      host: { type: 'string', description: 'Specific host/computer name' },
                      pageSize: { type: 'number', description: 'Page size (default 100)', default: 100 },
                    },
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
              let projectsUrl = `/v2/users/${args.userId}/projects_users`;
              if (args.cursusId) {
                projectsUrl += `?filter[cursus_id]=${args.cursusId}`;
              }
              const projects = await apiRequest<any[]>(projectsUrl);
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

            case 'getCampusUsers':
              let campusUsersUrl = '/v2/campus_users';
              if (args.userId) {
                campusUsersUrl = `/v2/users/${args.userId}/campus_users`;
              } else if (args.campusId) {
                campusUsersUrl += `?filter[campus_id]=${args.campusId}`;
              }
              const campusUsers = await apiRequest<any[]>(campusUsersUrl);
              return {
                jsonrpc: '2.0',
                result: {
                  content: [{ type: 'text', text: JSON.stringify(campusUsers, null, 2) }],
                },
                id,
              };

            case 'getBalances':
              let balancesUrl = '/v2/balances';
              if (args.poolId) {
                balancesUrl = `/v2/pools/${args.poolId}/balances`;
              }
              const balances = await apiRequest<any[]>(balancesUrl);
              return {
                jsonrpc: '2.0',
                result: {
                  content: [{ type: 'text', text: JSON.stringify(balances, null, 2) }],
                },
                id,
              };

            case 'getClusters':
              let clustersUrl = `/v2/clusters?page[size]=${args.pageSize || 30}`;
              const filters: string[] = [];
              
              if (args.campusId) {
                filters.push(`filter[campus_id]=${args.campusId}`);
              }
              if (args.name) {
                filters.push(`filter[name]=${encodeURIComponent(args.name)}`);
              }
              
              if (filters.length > 0) {
                clustersUrl += '&' + filters.join('&');
              }
              
              const clusters = await apiRequest<any[]>(clustersUrl);
              return {
                jsonrpc: '2.0',
                result: {
                  content: [{ type: 'text', text: JSON.stringify(clusters, null, 2) }],
                },
                id,
              };

            case 'getLocations':
              let locationsUrl = `/v2/locations?page[size]=${args.pageSize || 100}`;
              const locationFilters: string[] = [];
              
              if (args.campusId) {
                locationsUrl = `/v2/campus/${args.campusId}/locations?page[size]=${args.pageSize || 100}`;
              }
              
              if (args.active !== false) { // default to true
                locationFilters.push('filter[active]=true');
              }
              if (args.host) {
                locationFilters.push(`filter[host]=${encodeURIComponent(args.host)}`);
              }
              
              if (locationFilters.length > 0) {
                locationsUrl += '&' + locationFilters.join('&');
              }
              
              const locations = await apiRequest<any[]>(locationsUrl);
              return {
                jsonrpc: '2.0',
                result: {
                  content: [{ type: 'text', text: JSON.stringify(locations, null, 2) }],
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
      console.log('Starting HTTP server...');
      
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
          console.log('Received MCP request:', JSON.stringify(req.body, null, 2));
          
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
      const PORT = parseInt(process.env.PORT || '8042', 10);
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
      'getCoalition',
      'getCampusUsers',
      'getBalances',
      'getClusters',
      'getLocations'
    ].join(', '));
    console.log('Available resources:', [
      '42://user/{id}',
      '42://me',
      '42://campus'
    ].join(', '));
  }
})();