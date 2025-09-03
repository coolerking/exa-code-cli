# モデルプロバイダー機能利用マニュアル

## 概要

EXA Code CLIは複数のAIモデルプロバイダーに対応しており、用途や予算に応じて最適なモデルを選択できます。本マニュアルでは、各プロバイダーの設定方法と利用方法について説明します。

## 対応プロバイダー一覧

### 1. Groq Cloud (`groq`)
- **特徴**: 高速推論に特化したクラウドサービス
- **料金**: 従量課金制
- **デフォルトモデル**: Kimi K2 Instruct

### 2. OpenAI API (`openai`)
- **特徴**: GPTシリーズの最新モデルを利用
- **料金**: 従量課金制
- **デフォルトモデル**: o3-mini

### 3. Azure OpenAI Service (`azure`)
- **特徴**: Microsoft Azureが提供するOpenAIサービス
- **料金**: 従量課金制（企業向け）
- **デフォルトモデル**: o3-mini

### 4. Anthropic (`anthropic`)
- **特徴**: Claudeシリーズのモデル
- **料金**: 従量課金制
- **デフォルトモデル**: Claude Sonnet 4

### 5. OpenRouter (`openrouter`)
- **特徴**: 複数のモデルを統一APIで利用
- **料金**: 従量課金制
- **デフォルトモデル**: GPT OSS 120B

### 6. Ollama (`ollama`)
- **特徴**: ローカル環境でのモデル実行
- **料金**: 無料（自前のハードウェア）
- **デフォルトモデル**: Gemma 3 270M

### 7. AWS Bedrock (`aws-bedrock`)
- **特徴**: AWSが提供するマネージドAIサービス
- **料金**: 従量課金制
- **デフォルトモデル**: Claude Sonnet 4 (Bedrock)

## 初期設定方法

### プロバイダー認証情報の設定

1. EXA Code CLIを起動
2. `/login` コマンドを実行
3. 使用したいプロバイダーを選択
4. 必要な認証情報を入力

```bash
# 基本コマンド
/login

# 特定のプロバイダーを直接指定
/login groq
/login openai
/login azure
```

### プロバイダー別設定項目

#### Groq Cloud
- **APIキー**: console.groq.com で取得

#### OpenAI API
- **APIキー**: platform.openai.com で取得

#### Azure OpenAI Service
- **APIキー**: Azure ポータルで取得
- **エンドポイント**: `https://your-resource.openai.azure.com`
- **デプロイメント名**: モデルのデプロイメント名
- **APIバージョン**: `2024-10-21`（省略可能）

#### Anthropic
- **APIキー**: console.anthropic.com で取得

#### OpenRouter
- **APIキー**: openrouter.ai で取得

#### Ollama
- **エンドポイントURL**: ローカルサーバーのURL（例: `http://192.168.11.11:11434`）

#### AWS Bedrock
- **リージョン**: AWSリージョン（例: `us-east-1`）
- **AWSクレデンシャル**: 環境変数またはAWSプロファイルで設定

## モデル選択・変更方法

### モデル選択コマンド

```bash
/model
```

このコマンドで以下の操作が可能です：
1. プロバイダーの変更
2. モデルの変更
3. 現在の設定確認

### 利用可能モデル一覧

#### Groq Cloud
- **Kimi K2 Instruct**: 最高性能モデル
- **GPT OSS 120B**: 高性能・安価モデル
- **GPT OSS 20B**: 最速・最安価モデル
- **Qwen 3 32B**: Alibaba製モデル
- **Llama 4 Maverick**: Meta製実験モデル
- **Llama 4 Scout**: Meta製軽量モデル

#### OpenAI API
- **o3-mini**: 高速推論モデル（検証済み）
- **o4-mini**: 次世代ミニモデル
- **GPT-5**: 次世代フラッグシップモデル

#### Azure OpenAI Service
- **o3-mini**: 高速推論モデル（デプロイメント必要）
- **o4-mini**: 次世代ミニモデル（デプロイメント必要）
- **GPT-5**: 次世代フラッグシップモデル（デプロイメント必要）

#### Anthropic
- **Claude Opus 4.1**: 最高性能モデル - 複雑なタスク・大規模研究に最適
- **Claude Sonnet 4**: バランス型モデル - 日常使用に最適（デフォルト）

#### OpenRouter
- **GPT OSS 120B**: 高性能・安価モデル（デフォルト）
- **GPT OSS 20B**: 最速・最安価モデル
- **DeepSeek Chat v3.1**: 高度推論モデル

#### Ollama
- **Gemma 3 270M**: 軽量Googleモデル（デフォルト）
- **GPT OSS 20B**: 中規模高性能モデル
- **GPT OSS 120B**: 大規模高性能モデル

#### AWS Bedrock
- **Claude Opus 4.1 (Bedrock)**: AWS Bedrock経由 - 最高性能モデル
- **Claude Sonnet 4 (Bedrock)**: AWS Bedrock経由 - バランス型モデル（デフォルト）

## 設定の管理

### 設定ファイルの場所
認証情報は以下のファイルに保存されます：
```
~/.exa/local-settings.json
```

### 環境変数による設定
設定ファイルより環境変数が優先されます：

```bash
# Groq
export GROQ_API_KEY="your_api_key"

# OpenAI
export OPENAI_API_KEY="your_api_key"

# Azure OpenAI
export AZURE_OPENAI_API_KEY="your_api_key"
export AZURE_OPENAI_ENDPOINT="your_endpoint"
export AZURE_OPENAI_DEPLOYMENT_NAME="your_deployment"

# Anthropic
export ANTHROPIC_API_KEY="your_api_key"

# OpenRouter
export OPENROUTER_API_KEY="your_api_key"

# Ollama
export OLLAMA_ENDPOINT="http://localhost:11434"

# AWS Bedrock
export AWS_REGION="us-east-1"
export AWS_ACCESS_KEY_ID="your_access_key"
export AWS_SECRET_ACCESS_KEY="your_secret_key"
```

## トラブルシューティング

### よくある問題と解決方法

#### 1. APIキーエラー
**症状**: `API key is invalid` エラー
**解決方法**: 
- APIキーの有効性を確認
- `/login` コマンドで再設定

#### 2. Azure OpenAIでデプロイメントエラー
**症状**: `Deployment not found` エラー
**解決方法**:
- Azureポータルでデプロイメント名を確認
- 正しいデプロイメント名で再設定

#### 3. Ollamaサーバー接続エラー
**症状**: `Connection refused` エラー
**解決方法**:
- Ollamaサーバーが起動していることを確認
- エンドポイントURLが正しいことを確認

#### 4. AWS Bedrockクレデンシャルエラー
**症状**: `No valid AWS credentials` エラー
**解決方法**:
- AWS環境変数を設定
- AWSプロファイルを確認
- IAM権限を確認

### パッケージ依存関係

一部のプロバイダーは追加パッケージが必要です：

```bash
# Anthropic
npm install @anthropic-ai/sdk

# AWS Bedrock
npm install @aws-sdk/client-bedrock-runtime @aws-sdk/credential-providers

# OpenAI (通常は含まれています)
npm install openai
```

## 使用上の注意事項

1. **料金**: 従量課金制のプロバイダーは使用量に応じて料金が発生します
2. **セキュリティ**: APIキーは安全に管理してください
3. **モデル切り替え**: モデル変更時にチャット履歴がクリアされます
4. **ネットワーク**: クラウドプロバイダーはインターネット接続が必要です
5. **レート制限**: 各プロバイダーのレート制限に注意してください

## よくある使用パターン

### 開発・テスト用
- **推奨**: Groq（高速）またはOllama（無料）
- **モデル**: GPT OSS 20BまたはGemma 3 270M

### 本格的な作業用
- **推奨**: OpenAI、Anthropic、またはAzure OpenAI
- **モデル**: Claude Sonnet 4、o3-mini、または類似モデル

### 企業環境用
- **推奨**: Azure OpenAI ServiceまたはAWS Bedrock
- **モデル**: 企業要件に応じて選択

---

このマニュアルは現在の実装に基づいています。新しいプロバイダーやモデルの追加、機能変更がある場合は随時更新されます。