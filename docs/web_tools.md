# WebSearch/WebFetchツール機能利用ガイド

## 概要

EXA Code CLIは、リアルタイムでWeb上の情報にアクセスできる2つの強力なツールを提供します：

- **WebSearch**: 複数の検索プロバイダーを使ってWeb検索を実行
- **WebFetch**: 指定したWebページの内容を取得・分析

これらのツールにより、最新の技術情報、ドキュメント、ニュースなどにアクセスして開発作業を支援できます。

## 利用可能な検索プロバイダー

### DuckDuckGo（無料・設定不要）
- **料金**: 無料
- **設定**: APIキー不要
- **特徴**: プライバシー重視、すぐに利用開始可能
- **制限**: 基本的な検索結果のみ

### Google Custom Search API（高精度）
- **料金**: 1日100回まで無料、以降従量課金
- **設定**: APIキー + 検索エンジンID が必要
- **特徴**: 高精度・高品質な検索結果
- **制限**: 1回のリクエストで最大10件まで

### Bing Web Search API（高品質）
- **料金**: 月1000回まで無料、以降従量課金
- **設定**: APIキーが必要
- **特徴**: Microsoft提供の高品質検索
- **制限**: 1回のリクエストで最大50件まで

## 初期設定

### Google Custom Search API設定

#### ステップ1: Google Cloud Console設定

1. **Google Cloud Console**（https://console.cloud.google.com/）でプロジェクトを作成
2. **Custom Search JSON API**を有効化
3. **APIキー**を作成（認証情報から作成）

#### ステップ2: Custom Search Engine作成

4. **Google Custom Search Engine**（https://cse.google.com/）にアクセス
5. 「新しい検索エンジンを作成」をクリック
6. **検索対象設定**:
   - 「検索するサイト」に `*` を入力（全Web検索の場合）
   - または特定のサイト（例: `*.stackoverflow.com`）を指定
7. **検索エンジン名**を入力（例: "EXA Code CLI Search"）
8. 「作成」ボタンをクリック

#### ステップ3: 検索エンジンID取得

9. 作成された検索エンジンの「管理」をクリック
10. **基本情報**タブで「検索エンジンID」を確認・コピー

#### 検索エンジンIDの形式

**実際のIDの例**:
```bash
# 本番環境用の実際のID形式
export EXA_GOOGLE_SEARCH_ENGINE_ID="017576662512468239146:omuauf_lfve"
export EXA_GOOGLE_SEARCH_ENGINE_ID="004186512735833622953:szujxnlf2ja"
export EXA_GOOGLE_SEARCH_ENGINE_ID="009217259823014548361:1234567890a"
```

**IDの構成**:
- 形式: `{21桁の数字}:{英数字8-10文字}`
- 長さ: 通常30-32文字
- 例: `017576662512468239146:omuauf_lfve`

#### 環境変数設定

```bash
# 実際の値で設定（例）
export EXA_GOOGLE_SEARCH_API_KEY="AIzaSyBOTI22jXcv9GNUj5fVw-YFhWU23456789"
export EXA_GOOGLE_SEARCH_ENGINE_ID="017576662512468239146:omuauf_lfve"
```

#### ⚠️ 重要な注意事項

**テスト用の値について**:
- コードテストで使用されている `"engine"` は**テスト専用**の値です
- **本番環境では絶対に動作しません**
- 必ずGoogle Custom Search Engineで作成した実際のIDを使用してください

**設定確認**:
```bash
# 設定値を確認
echo $EXA_GOOGLE_SEARCH_API_KEY
echo $EXA_GOOGLE_SEARCH_ENGINE_ID

# 正しく設定されていれば以下のような形式で表示される
# AIzaSy... (APIキー)
# 123456789012345678901:abcdefg (検索エンジンID)
```

### Bing Web Search API設定

1. **Microsoft Azure Portal**でアカウント作成
2. **Bing Search**サービスをサブスクライブ
3. **APIキー**を取得

```bash
# 環境変数で設定
export EXA_BING_SEARCH_API_KEY="your_bing_api_key_here"
```

### DuckDuckGo設定
設定不要です。APIキーやアカウント登録なしですぐに利用できます。

## WebSearchツールの使用方法

### 基本的な検索

EXA Code CLIとの対話中に、AI（Claude等）が自動的に検索を実行します：

```
ユーザー: 「最新のJavaScript ES2024の新機能について教えて」
AI: WebSearchツールを使って最新情報を検索し、結果を基に回答します
```

### 検索パラメータ

WebSearchツールは以下のパラメータを受け付けます：

```json
{
  "query": "検索クエリ文字列",
  "max_results": 10,
  "search_provider": "auto"
}
```

**パラメータ説明**:
- `query` (必須): 検索したいキーワードやフレーズ
- `max_results` (オプション): 取得する結果数（1-20、デフォルト: 10）
- `search_provider` (オプション): 使用するプロバイダー

**search_provider オプション**:
- `auto`: 設定済みプロバイダーを自動選択（デフォルト）
- `duckduckgo`: DuckDuckGoを使用
- `google`: Google Custom Searchを使用
- `bing`: Bing Web Searchを使用

### プロバイダー選択ロジック

#### 自動選択（推奨）
```
Google → Bing → DuckDuckGo
```
設定されているプロバイダーから順番に試行し、最終的にDuckDuckGoで確実に実行されます。

#### 手動指定
特定のプロバイダーを指定することも可能ですが、通常は自動選択が最適です。

## WebFetchツールの使用方法

### 基本的なWebページ取得

```
ユーザー: 「https://example.com/article の内容を要約して」
AI: WebFetchツールでページを取得し、内容を分析して要約を提供します
```

### 取得パラメータ

WebFetchツールは以下のパラメータを受け付けます：

```json
{
  "url": "https://example.com/page",
  "prompt": "実行したい分析内容",
  "timeout": 30000
}
```

**パラメータ説明**:
- `url` (必須): 取得したいWebページのURL
- `prompt` (必須): 取得したコンテンツで実行したい分析内容
- `timeout` (オプション): タイムアウト時間（ミリ秒、1000-60000、デフォルト: 30000）

### 分析プロンプトの例

```json
{
  "url": "https://docs.example.com/api",
  "prompt": "APIの使用方法と主要なエンドポイントを整理してください"
}

{
  "url": "https://news.example.com/article",
  "prompt": "記事の要点を3つのポイントにまとめてください"
}

{
  "url": "https://github.com/project/readme",
  "prompt": "プロジェクトの機能と設定方法を抽出してください"
}
```

## 実用的な使用例

### 技術調査
```
「Next.js 14の新機能について最新情報を教えて」
→ WebSearchで最新情報を検索し、関連するドキュメントをWebFetchで詳細分析
```

### API調査
```
「OpenAI APIの料金体系はどうなってる？」
→ 公式ドキュメントを検索・取得して最新の料金情報を提供
```

### 競合調査
```
「類似のCLIツールでどんなものがある？」
→ 関連ツールを検索し、GitHub等の詳細情報を取得・比較
```

### 学習支援
```
「TypeScriptの新しい型システムの機能について学びたい」
→ 最新のドキュメントやチュートリアルを検索・分析
```

## セキュリティと制限事項

### セキュリティ機能

#### WebFetch
- **IPアドレスフィルタリング**: プライベートネットワーク、localhost、メタデータサービスへのアクセスをブロック
- **プロトコル制限**: HTTP/HTTPSのみ許可
- **コンテンツサイズ制限**: 最大1MBまで
- **リクエストタイムアウト**: デフォルト30秒

#### WebSearch
- **クエリ検証**: 悪意あるパターンの検出とブロック
- **レート制限**: 毎分10リクエスト、ドメインあたり毎分3リクエスト

### ツール権限レベル

- **WebSearch**: 安全ツール（自動実行可能）
- **WebFetch**: 承認必要ツール（ユーザー承認が必要な場合がある）

## 高度な設定

### 環境変数による設定

```bash
# 検索プロバイダー設定
export EXA_GOOGLE_SEARCH_API_KEY="your_google_api_key"
export EXA_GOOGLE_SEARCH_ENGINE_ID="your_search_engine_id"
export EXA_BING_SEARCH_API_KEY="your_bing_api_key"

# フォールバック戦略
export EXA_SEARCH_FALLBACK_STRATEGY="cascade"  # または "strict"

# WebFetch設定
export EXA_WEB_MAX_CONTENT_LENGTH="1048576"    # 最大1MB
export EXA_WEB_REQUEST_TIMEOUT="30000"         # 30秒
```

### フォールバック戦略

#### Cascade（デフォルト）
```bash
export EXA_SEARCH_FALLBACK_STRATEGY="cascade"
```
プロバイダー間のフォールバックを有効にします。一つのプロバイダーが失敗しても、次のプロバイダーを自動的に試行します。

#### Strict
```bash
export EXA_SEARCH_FALLBACK_STRATEGY="strict"
```
指定されたプロバイダーのみを使用します。失敗した場合はエラーを返します。

## トラブルシューティング

### よくある問題と解決方法

#### 1. 「API key not configured」または「Search Engine ID not configured」エラー
**症状**: Google検索時に設定エラー
**エラーメッセージ例**:
- `Google Search API key or Search Engine ID not configured`
- `API key not configured`

**解決方法**:
```bash
# 現在の設定を確認
echo "API Key: $EXA_GOOGLE_SEARCH_API_KEY"
echo "Engine ID: $EXA_GOOGLE_SEARCH_ENGINE_ID"

# 正しい値で再設定
export EXA_GOOGLE_SEARCH_API_KEY="AIzaSyBOTI22jXcv9GNUj5fVw-YFhWU23456789"
export EXA_GOOGLE_SEARCH_ENGINE_ID="017576662512468239146:omuauf_lfve"
```

**よくある設定ミス**:
- ❌ `export EXA_GOOGLE_SEARCH_ENGINE_ID="engine"` (テスト用の値)
- ❌ `export EXA_GOOGLE_SEARCH_ENGINE_ID="your_search_engine_id_here"` (プレースホルダー)
- ✅ `export EXA_GOOGLE_SEARCH_ENGINE_ID="017576662512468239146:omuauf_lfve"` (実際のID)

#### 2. 「Rate limit exceeded」エラー
**症状**: リクエスト制限に達した
**解決方法**:
- しばらく時間をおいてから再試行
- 複数のプロバイダーを設定してロードバランシング

#### 3. 「Connection timeout」エラー
**症状**: ネットワークタイムアウト
**解決方法**:
```bash
# タイムアウト時間を延長
export EXA_WEB_REQUEST_TIMEOUT="60000"  # 60秒
```

#### 4. 「Content too large」エラー
**症状**: 取得コンテンツが大きすぎる
**解決方法**:
```bash
# 最大コンテンツサイズを増加
export EXA_WEB_MAX_CONTENT_LENGTH="2097152"  # 2MB
```

### デバッグ情報の確認

EXA Code CLIは詳細なエラーメッセージを提供します：

```
Web search failed: Google search failed: API key not configured
→ Google APIキーが設定されていない

Bing search failed: Request timeout
→ Bingサービスがタイムアウト

DuckDuckGo search successful with 5 results
→ DuckDuckGoが正常に動作
```

## 料金と使用制限

### 無料利用枠

| プロバイダー | 無料枠 | 制限 |
|-------------|--------|------|
| DuckDuckGo | 無制限 | 基本機能のみ |
| Google Custom Search | 100回/日 | 高精度検索 |
| Bing Web Search | 1000回/月 | 高品質検索 |

### 課金について

#### Google Custom Search
- 1000回まで $5/1000回
- 詳細は Google Cloud Pricing を確認

#### Bing Web Search
- $3/1000回（月1000回超過後）
- 詳細は Microsoft Azure Pricing を確認

## ベストプラクティス

### 効率的な使用方法

1. **最初はDuckDuckGoで十分**: 基本的な検索には無料のDuckDuckGoを活用
2. **高精度が必要な場合はGoogle/Bing**: 専門的な技術情報や最新情報が必要な場合
3. **複数プロバイダーの設定**: フォールバック機能で可用性を向上
4. **適切なクエリ**: 具体的で明確な検索クエリを使用

### セキュリティのベストプラクティス

1. **APIキーの安全な管理**: 環境変数で設定し、リポジトリにコミットしない
2. **ネットワーク制限**: 信頼できないURLへのWebFetchは慎重に実行
3. **レート制限の考慮**: 大量のリクエストを避ける

---

このガイドにより、EXA Code CLIのWebSearch/WebFetchツールを効果的に活用できます。最新の技術情報やドキュメントに簡単にアクセスして、開発作業を効率化してください。