# MCPクライアント利用マニュアル

exa-code-cliのModel Context Protocol (MCP) クライアント機能を使用して、外部MCPサーバーのツールを利用する方法を説明します。

## 概要

MCPクライアント機能により、exa-code-cliは外部のMCPサーバーに接続し、そのサーバーが提供するツールをAIエージェントが自動的に利用できるようになります。

- **設定方法**: CLI・設定ファイル・チャットコマンドの3通り
- **対応transport**: stdio・sse・http
- **自動統合**: AIが必要に応じてMCPツールを自動実行
- **リアルタイム監視**: 接続状態・エラー・ツール数の表示

### MCP設定形式

exa-code-cliは**標準MCP設定形式**に対応しています：

- **`command`**: 実行コマンド（文字列）
- **`args`**: コマンド引数（配列）

この形式はClaude Code CLI・VS Code等で使用される標準仕様です。

## 1. 新規MCPサーバーの追加

### 1.1. ~/.exa/local-settings.json での設定

設定ファイルに直接MCPサーバーを追加する場合：

**注意**: 標準MCP形式では`command`は文字列、引数は`args`配列で指定します。

```json
{
  "mcp": {
    "servers": {
      "my-server": {
        "transport": "stdio",
        "command": "node",
        "args": ["/path/to/server.js", "--verbose"],
        "env": {
          "NODE_ENV": "production",
          "API_KEY": "your-api-key"
        },
        "enabled": true,
        "timeout": 30000
      },
      "web-server": {
        "transport": "http",
        "url": "http://localhost:3000/mcp",
        "enabled": true,
        "timeout": 10000
      }
    },
    "globalTimeout": 30000,
    "debugMode": false
  }
}
```

**実使用例**:
```json
{
  "mcp": {
    "servers": {
      "perplexity-ask": {
        "transport": "stdio",
        "command": "npx",
        "args": ["-y", "server-perplexity-ask"],
        "env": {
          "PERPLEXITY_API_KEY": "your-perplexity-api-key"
        }
      }
    }
  }
}
```

### 1.2. exa mcp コマンドでの追加

#### stdio transport（ローカルプロセス）
```bash
# 基本的な追加
exa mcp add my-server node /path/to/server.js

# 実用例: perplexity-ask
exa mcp add perplexity-ask npx -y server-perplexity-ask \
  --env PERPLEXITY_API_KEY=your-perplexity-api-key

# オプション付き追加
exa mcp add my-server node /path/to/server.js \
  --env NODE_ENV=production \
  --env API_KEY=your-api-key \
  --args --verbose \
  --timeout 30000

# 無効状態で追加
exa mcp add my-server node /path/to/server.js --disabled
```

#### HTTP transport（リモートサーバー）
```bash
# HTTPサーバー追加
exa mcp add web-server \
  --transport http \
  --url http://localhost:3000/mcp \
  --timeout 10000

# HTTPS + 認証
exa mcp add secure-server \
  --transport http \
  --url https://api.example.com/mcp \
  --env AUTH_TOKEN=your-token \
  --timeout 15000
```

#### SSE transport（Server-Sent Events）
```bash
# SSEサーバー追加
exa mcp add sse-server \
  --transport sse \
  --url ws://localhost:4000/sse \
  --timeout 20000
```

### 1.3. スラッシュコマンド /mcp での確認

チャットでMCPサーバーの状態を確認：

```
/mcp status     # 全体状況確認
/mcp servers    # サーバー詳細表示
/mcp tools      # 利用可能ツール一覧
```

## 2. MCPサーバーの設定変更

### 2.1. ~/.exa/local-settings.json での変更

設定ファイルを直接編集して変更を適用。保存後、チャットで `/mcp refresh` を実行して設定を再読み込み。

### 2.2. exa mcp コマンドでの変更

#### サーバーの有効化・無効化
```bash
# サーバー無効化
exa mcp disable my-server

# サーバー有効化  
exa mcp enable my-server
```

#### 設定の確認
```bash
# 全サーバー一覧
exa mcp list

# 詳細情報表示
exa mcp list -v

# 特定サーバーの設定確認
exa mcp get my-server
```

### 2.3. スラッシュコマンド /mcp での管理

```
/mcp status     # 現在の状態確認
/mcp health     # ヘルス状態・エラー診断
/mcp errors     # 最近のエラー履歴
/mcp refresh    # 設定再読み込み・再接続
```

## 3. MCPサーバーの削除

### 3.1. ~/.exa/local-settings.json での削除

設定ファイルから該当サーバーの設定を削除し、チャットで `/mcp refresh` を実行。

### 3.2. exa mcp コマンドでの削除

```bash
# サーバー削除（確認付き）
exa mcp remove my-server -y

# 削除前の確認
exa mcp get my-server  # 設定確認
exa mcp remove my-server  # 確認フラグ案内表示
```

### 3.3. スラッシュコマンド /mcp での確認

```
/mcp servers    # 削除後のサーバー一覧確認
/mcp status     # 全体状況確認
```

## 4. MCPツールの利用

### 4.1. 自動利用

AIエージェントが必要に応じて自動的にMCPツールを呼び出します。ユーザーは特別な操作は不要です。

### 4.2. 利用可能ツールの確認

```
/mcp tools      # 全MCPツール一覧表示
```

### 4.3. ツール名の形式

MCPツールは `mcp_[サーバー名]_[ツール名]` 形式で識別されます。

例：
- サーバー `database` のツール `query` → `mcp_database_query`
- サーバー `file-system` のツール `read_file` → `mcp_file_system_read_file`

## 5. トラブルシューティング

### 5.1. 接続エラーの対処

```bash
# サーバー状態確認
exa mcp list -v

# チャットでヘルス確認
/mcp health

# エラー履歴確認
/mcp errors

# 再接続試行
/mcp refresh
```

### 5.2. よくあるエラーと対処法

#### Connection Error
```
MCP Error [connection, server: my-server]: ECONNREFUSED
```
**対処法**:
- MCPサーバーが起動しているか確認
- コマンド・パス・引数が正しいか確認
- ネットワーク接続確認（HTTP/SSE transport）

#### Timeout Error
```
MCP Error [timeout, server: my-server]: Connection timeout
```
**対処法**:
- `--timeout` を大きくして再設定
- サーバーの応答性能確認
- ネットワーク速度確認

#### Tool Not Found
```
MCP Error [tool_not_found, server: my-server, tool: unknown_tool]
```
**対処法**:
- `/mcp tools` でツール一覧確認
- サーバードキュメント確認
- サーバー再接続: `/mcp refresh`

### 5.3. デバッグモード

```bash
# 設定ファイルでデバッグモード有効化
{
  "mcp": {
    "debugMode": true
  }
}

# または起動時にデバッグフラグ
exa --debug
```

## A. 備考

### A.1. ~/.exa/local-settings.json 設定例

#### 完全な設定例
```json
{
  "defaultProvider": "anthropic",
  "providers": {
    "anthropic": {
      "apiKey": "your-anthropic-key"
    }
  },
  "mcp": {
    "servers": {
      "file-manager": {
        "transport": "stdio",
        "command": "python",
        "args": ["/opt/mcp-servers/file-manager.py", "--safe-mode"],
        "env": {
          "PYTHONPATH": "/opt/mcp-servers",
          "LOG_LEVEL": "info"
        },
        "enabled": true,
        "timeout": 30000
      },
      "database-tools": {
        "transport": "http",
        "url": "https://internal-tools.company.com/mcp",
        "env": {
          "AUTH_TOKEN": "your-auth-token"
        },
        "enabled": true,
        "timeout": 15000
      },
      "development-server": {
        "transport": "sse",
        "url": "ws://localhost:4000/mcp-sse",
        "enabled": false,
        "timeout": 10000
      }
    },
    "globalTimeout": 30000,
    "debugMode": false
  }
}
```

### A.2. 推奨設定

#### セキュリティ
- 設定ファイルの権限: `0o600` （所有者のみ読み書き）
- 認証情報は環境変数の利用を推奨
- 内部ネットワークでのHTTP transport利用

#### パフォーマンス
- `timeout`: 30秒（デフォルト）推奨
- `globalTimeout`: 全サーバー共通タイムアウト設定
- 不要なサーバーは `"enabled": false` に設定

#### 開発・運用
- `debugMode`: 開発時は `true`、本番時は `false`
- 定期的な `/mcp health` による状態確認
- エラー発生時は `/mcp errors` で原因調査

### A.3. 対応MCPサーバー例

#### 一般的なMCPサーバー
- **File System**: ファイル操作ツール
- **Database**: SQL実行・データ分析
- **API Gateway**: 外部API呼び出し
- **Development Tools**: Git操作・ビルドツール
- **Documentation**: 文書生成・検索

#### 企業内MCPサーバー
- **Internal APIs**: 社内システム連携
- **Security Tools**: セキュリティスキャン・監査
- **Deployment**: デプロイメント自動化
- **Monitoring**: システム監視・ログ解析

### A.4. ベストプラクティス

1. **サーバー命名**: 用途が分かりやすい名前を使用
2. **環境分離**: 開発・本番でサーバーを分ける
3. **権限管理**: 最小権限でのツール提供
4. **監視**: 定期的な動作確認とエラーチェック
5. **ドキュメント**: サーバー固有の利用方法記録

### A.5. 参考リンク

- [Model Context Protocol 公式仕様](https://modelcontextprotocol.io/)
- [MCP サーバー実装例](https://github.com/modelcontextprotocol)
- [exa-code-cli README](../README.md)

---

**このマニュアルは exa-code-cli v1.0.2+ で利用可能なMCP機能について説明しています。**