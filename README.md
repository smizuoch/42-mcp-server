# 42 MCP Server

English | [日本語](README.ja.md)

**42 MCP Server** is a server that exposes [42](https://www.42.fr/)'s intranet API through the [Model Context Protocol (MCP)](https://modelcontextprotocol.io/). This enables LLM (Large Language Model) agents to safely and standardized access to 42's rich data (user information, projects, campus information, etc.).

## Overview

This server abstracts requests to the 42 API and provides them in the form of resources and tools defined by MCP. It supports two transport modes, Stdio and HTTP, making it compatible with a wide range of clients from CLI tools to modern IDE extensions.

## Features

- **Dual Transport:** Supports both Stdio and HTTP.
- **42 API Integration:** Provides information about 42 users, projects, campuses, and more.
- **Tools:** Equipped with many useful tools such as user search and Cursus level retrieval.

## Prerequisites

- [Node.js](https://nodejs.org/) (v20.x or later)
- [npm](https://www.npmjs.com/)
- 42 API client ID and secret

## Setup

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/smizuoch/42-mcp-server.git
    cd 42-mcp-server
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Get 42 API credentials:**
    You need to create an OAuth application on the 42 intranet to get the client ID and secret.
    
    1. Access [42 OAuth Applications](https://profile.intra.42.fr/oauth/applications/new)
    2. Log in with your 42 account
    3. Fill in the application details:
       - **Name:** Enter a name for your application (e.g., "42 MCP Server")
       - **Redirect URI:** Enter `http://localhost:8080` (or any localhost URL)
       - **Scopes:** Select appropriate scopes (e.g., `public` for basic access)
    4. Click "Submit" to create the application
    5. Copy the generated **Application ID** and **Secret**

4.  **Set up environment variables:**
    Copy `.env.example` to create a `.env` file and fill in your 42 API credentials.
    ```bash
    cp .env.example .env
    ```
    Contents of `.env` file:
    ```
    42_CLIENT_ID=YOUR_42_CLIENT_ID
    42_CLIENT_SECRET=YOUR_42_CLIENT_SECRET
    ```
    Replace `YOUR_42_CLIENT_ID` with the Application ID and `YOUR_42_CLIENT_SECRET` with the Secret from step 3.

## Usage

### Development Mode

- **Stdio Mode:**
  Communicates with MCP clients using standard input/output.
  ```bash
  npm run dev
  ```

- **HTTP Mode:**
  Starts an HTTP server to communicate with MCP clients. Useful for VSCode extensions and similar tools.
  ```bash
  npm run dev:http
  ```

### Production

1.  **Build TypeScript:**
    ```bash
    npm run build
    ```

2.  **Start HTTP server:**
    ```bash
    npm run start
    ```
    The server will start at `http://127.0.0.1:8042`.

## VSCode Integration

1.  **Start the server in HTTP mode:**
    ```bash
    npm run dev:http
    ```
    You'll see logs like this in the terminal:

    ```
    MCP HTTP server ready on port 8042
    MCP endpoint: http://127.0.0.1:8042/
    Health check: http://127.0.0.1:8042/health

    VSCode Configuration (.vscode/mcp.json):
    {
      "servers": {
        "42-api": {
          "url": "http://127.0.0.1:8042/"
        }
      }
    }
    ```

2.  **Create VSCode configuration file:**
    Create a file named `.vscode/mcp.json` in the project root and paste the content shown in the logs above.

    **`.vscode/mcp.json`:**
    ```json
    {
      "servers": {
        "42-api": {
          "url": "http://127.0.0.1:8042/"
        }
      }
    }
    ```

3.  After reloading VSCode, the extension will recognize the server and you can call resources and tools with prefixes like `@42-api`.

## Provided MCP Features

### Resources

| URI                     | Description                                        |
| ----------------------- | -------------------------------------------------- |
| `42://user/{id}`        | User profile for the specified ID                 |
| `42://me`               | Profile of the currently authenticated user       |
| `42://campus`           | List of all campuses                              |
| `42://attachments`      | List of all attachments                           |
| `42://attachments/{id}` | Attachments for the specified project            |
| `42://projects`         | List of all projects                              |
| `42://project/{id}`     | Project details for the specified ID             |
| `42://me/projects`      | List of projects for the authenticated user      |

### Tools

| Tool Name           | Description                                                                      |
| ------------------- | -------------------------------------------------------------------------------- |
| `searchUsers`       | Search for users by login name.                                                 |
| `getCursusLevel`    | Get a user's level in a specific Cursus.                                        |
| `getUserProjects`   | Get a list of user's projects.                                                  |
| `getCoalition`      | Get Coalition information for a user.                                           |
| `getCampusUsers`    | Get campus-user associations by campus ID or user ID.                           |
| `getBalances`       | Get balance information (requires specific role).                               |
| `getClusters`       | Get cluster information (requires specific role).                               |
| `getLocations`      | Get user login status (seat information).                                       |
| `getAttachments`    | Get a list of attachments for projects or project sessions.                     |
| `getAttachment`     | Get detailed information (such as PDF URLs) for a specific attachment.          |
| `getProjects`       | Get a list of projects (with optional Cursus and filter specifications).       |
| `getProject`        | Get detailed information for a specific project.                                |
| `getMyProjects`     | Get a list of projects for the authenticated user.                              |

## Tech Stack

- [TypeScript](https://www.typescriptlang.org/)
- [Node.js](https://nodejs.org/)
- [Express](https://expressjs.com/)
- [@modelcontextprotocol/sdk](https://www.npmjs.com/package/@modelcontextprotocol/sdk)
- [Zod](https://zod.dev/)
