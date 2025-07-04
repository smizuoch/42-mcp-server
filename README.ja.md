# 42 MCP Server

[English](README.md) | 日本語

**42 MCP Server** は、[42](https://www.42.fr/)のイントラネットAPIを[Model Context Protocol (MCP)](https://modelcontextprotocol.io/)を通じて公開するためのサーバーです。これにより、LLM（大規模言語モデル）エージェントが42の豊富なデータ（ユーザー情報、プロジェクト、キャンパス情報など）を安全かつ標準化された方法で利用できるようになります。

## 概要 (Overview)

このサーバーは、42 APIへのリクエストを抽象化し、MCPが規定するリソースとツールの形式で提供します。StdioとHTTPの2つのトランスポートモードをサポートしており、CLIツールから最新のIDE拡張機能まで、幅広いクライアントに対応可能です。

## 主な機能 (Features)

- **デュアルトランスポート:** StdioとHTTPの両方をサポート。
- **42 API連携:** 42のユーザー、プロジェクト、キャンパスなどの情報を提供。
- **ツール:** ユーザー検索、Cursusレベルの取得など、便利なツールを多数搭載。

## 前提条件 (Prerequisites)

- [Node.js](https://nodejs.org/) (v20.x or later)
- [npm](https://www.npmjs.com/)
- 42 APIのクライアントIDとシークレット

## セットアップ (Setup)

1.  **リポジトリをクローンします:**
    ```bash
    git clone https://github.com/smizuoch/42-mcp-server.git
    cd 42-mcp-server
    ```

2.  **依存関係をインストールします:**
    ```bash
    npm install
    ```

3.  **環境変数を設定します:**
    `.env.example`をコピーして`.env`ファイルを作成し、ご自身の42 APIクレデンシャルを記入してください。
    ```bash
    cp .env.example .env
    ```
    `.env`ファイルの中身:
    ```
    42_CLIENT_ID=YOUR_42_CLIENT_ID
    42_CLIENT_SECRET=YOUR_42_CLIENT_SECRET
    ```

## 使い方 (Usage)

### 開発モード (Development)

- **Stdioモード:**
  標準入出力を使用してMCPクライアントと通信します。
  ```bash
  npm run dev
  ```

- **HTTPモード:**
  HTTPサーバーを起動してMCPクライアントと通信します。VSCode拡張機能などでの利用に便利です。
  ```bash
  npm run dev:http
  ```

### 本番環境 (Production)

1.  **TypeScriptをビルドします:**
    ```bash
    npm run build
    ```

2.  **HTTPサーバーを起動します:**
    ```bash
    npm run start
    ```
    サーバーは `http://127.0.0.1:8042` で起動します。

## VSCodeでの使い方 (VSCode Integration)

1.  **HTTPモードでサーバーを起動します:**
    ```bash
    npm run dev:http
    ```
    ターミナルに以下のようなログが表示されます。

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

2.  **VSCodeの設定ファイルを作成します:**
    プロジェクトのルートに `.vscode/mcp.json` というファイルを作成し、上記のログに表示された内容を貼り付けます。

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

3.  VSCodeをリロードすると、拡張機能がサーバーを認識し、`@42-api` のようなプレフィックスでリソースやツールを呼び出せるようになります。

## 提供されるMCP機能 (Provided MCP Features)

### リソース (Resources)

| URI                     | 説明                               |
| ----------------------- | ---------------------------------- |
| `42://user/{id}`        | 指定したIDのユーザープロファイル   |
| `42://me`               | 認証中のユーザー自身のプロファイル |
| `42://campus`           | 全てのキャンパスのリスト           |
| `42://attachments`      | 全ての添付ファイルのリスト         |
| `42://attachments/{id}` | 指定したプロジェクトの添付ファイル |
| `42://projects`         | 全てのプロジェクトのリスト         |
| `42://project/{id}`     | 指定したIDのプロジェクト詳細       |
| `42://me/projects`      | 認証中ユーザーのプロジェクト一覧   |

### ツール (Tools)

| ツール名            | 説明                                                                 |
| ------------------- | -------------------------------------------------------------------- |
| `searchUsers`       | ログイン名でユーザーを検索します。                                   |
| `getCursusLevel`    | ユーザーの特定のCursusにおけるレベルを取得します。                   |
| `getUserProjects`   | ユーザーのプロジェクト一覧を取得します。                             |
| `getCoalition`      | ユーザーの所属するCoalition情報を取得します。                        |
| `getCampusUsers`    | キャンパスIDまたはユーザーIDでキャンパスとユーザーの関連を取得します。 |
| `getBalances`       | 残高情報を取得します (特定のロールが必要)。                          |
| `getClusters`       | クラスター情報を取得します (特定のロールが必要)。                    |
| `getLocations`      | ユーザーのログイン状況（座席）を取得します。                         |
| `getAttachments`    | プロジェクトやプロジェクトセッションの添付ファイル一覧を取得します。 |
| `getAttachment`     | 特定の添付ファイルの詳細情報（PDFのURLなど）を取得します。           |
| `getProjects`       | プロジェクト一覧を取得します（Cursusやフィルター指定可能）。         |
| `getProject`        | 特定のプロジェクトの詳細情報を取得します。                           |
| `getMyProjects`     | 認証中ユーザーのプロジェクト一覧を取得します。                       |


## 技術スタック (Tech Stack)

- [TypeScript](https://www.typescriptlang.org/)
- [Node.js](https://nodejs.org/)
- [Express](https://expressjs.com/)
- [@modelcontextprotocol/sdk](https://www.npmjs.com/package/@modelcontextprotocol/sdk)
- [Zod](https://zod.dev/)
