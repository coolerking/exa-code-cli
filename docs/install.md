# EXA Code CLI インストールマニュアル

## 概要

EXA Code CLIは、様々なAIプロバイダーをサポートするコード生成・編集CLIツールです。
このマニュアルでは、EXA標準PC（WSL/Ubuntu環境）でのインストール手順を説明します。

## 前提条件

### 必須要件

1. **Node.js 16以上**
   - WSL/Ubuntu環境での推奨インストール方法はnvmを使用することです

2. **対応するAIプロバイダーのアカウント**
   - 以下のいずれか1つ以上のプロバイダーでAPIアクセスを設定してください：
     - Groq
     - OpenAI
     - Anthropic (Claude)
     - Azure OpenAI Service
     - AWS Bedrock
     - OpenRouter
     - Ollama（ローカル実行）
     - Google Gemini

## インストール手順

### 1. Node.js/nvmのセットアップ（WSL/Ubuntu）

```bash
# nvmのインストール
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash

# シェルを再読み込みまたは新しいターミナルを開く
source ~/.bashrc

# 最新のNode.js LTSをインストール
nvm install --lts
nvm use --lts
nvm alias default node

# インストール確認
node --version
npm --version
```

### 2. EXA Code CLIのインストール

#### 開発用インストール（推奨）

```bash
# リポジトリをクローン
git clone https://github.com/your-org/exa-code-cli.git
cd exa-code-cli

# 依存関係をインストール
npm install

# ビルド
npm run build

# グローバルにリンク（`exa`コマンドを有効化）
npm link
```

#### グローバルインストール

```bash
# NPMからインストール（パッケージが公開されている場合）
npm install -g exa-code-cli
```

### 3. 環境変数の設定

各プロバイダーに応じて、`~/.bashrc`ファイルに以下の環境変数を設定してください：

#### Groq

```bash
echo 'export GROQ_API_KEY="gsk_your_groq_api_key_here"' >> ~/.bashrc
```

#### OpenAI

```bash
echo 'export OPENAI_API_KEY="sk-your_openai_api_key_here"' >> ~/.bashrc
```

#### Anthropic (Claude)

```bash
echo 'export ANTHROPIC_API_KEY="sk-ant-your_anthropic_api_key_here"' >> ~/.bashrc
```

#### Azure OpenAI Service

```bash
echo 'export AZURE_OPENAI_API_KEY="your_azure_openai_api_key"' >> ~/.bashrc
echo 'export AZURE_OPENAI_ENDPOINT="https://your-resource.openai.azure.com"' >> ~/.bashrc
echo 'export AZURE_OPENAI_DEPLOYMENT_NAME="your-deployment-name"' >> ~/.bashrc
echo 'export AZURE_OPENAI_API_VERSION="2024-10-21"' >> ~/.bashrc
```

#### AWS Bedrock

```bash
echo 'export AWS_ACCESS_KEY_ID="your_aws_access_key"' >> ~/.bashrc
echo 'export AWS_SECRET_ACCESS_KEY="your_aws_secret_key"' >> ~/.bashrc
echo 'export AWS_REGION="us-east-1"' >> ~/.bashrc
```

#### OpenRouter

```bash
echo 'export OPENROUTER_API_KEY="sk-or-your_openrouter_api_key_here"' >> ~/.bashrc
```

#### Ollama（ローカル実行）

```bash
echo 'export OLLAMA_ENDPOINT="http://localhost:11434"' >> ~/.bashrc
```

**注意**: Ollamaを使用する場合は、事前にOllamaサーバーを起動しておく必要があります。

#### Google Gemini

```bash
echo 'export GOOGLE_API_KEY="your_google_gemini_api_key"' >> ~/.bashrc
```

### 4. 環境変数の反映

```bash
source ~/.bashrc
```

## 使用開始

### 初回セットアップ

```bash
# EXA Code CLIを起動
exa

# 初回起動時にプロバイダーとAPIキーを設定
/login
```

### 基本的な使用方法

```bash
# 対話セッションを開始
exa

# 利用可能なコマンド一覧
/help

# モデルの選択
/model

# 履歴をクリア
/clear

# 統計情報の表示
/stats
```

## プロキシ設定（必要に応じて）

企業環境でプロキシを使用している場合：

```bash
# HTTPプロキシの設定
echo 'export HTTP_PROXY="http://proxy.company.com:8080"' >> ~/.bashrc
echo 'export HTTPS_PROXY="http://proxy.company.com:8080"' >> ~/.bashrc

# または起動時にプロキシを指定
exa --proxy http://proxy.company.com:8080
```

## トラブルシューティング

### よくある問題

1. **`command not found: exa`エラー**
   - `npm link`が正常に実行されたか確認してください
   - PATHに`~/.npm-global/bin`が含まれているか確認してください

2. **API接続エラー**
   - 環境変数が正しく設定されているか確認：`echo $GROQ_API_KEY`
   - APIキーが有効で、十分な残高があるか確認してください

3. **プロキシ接続エラー**
   - プロキシ設定が正しいか確認してください
   - 社内ネットワークのファイアウォール設定を確認してください

4. **Ollama接続エラー**
   - Ollamaサーバーが起動しているか確認：`curl http://localhost:11434/api/version`
   - エンドポイントURLが正しいか確認してください

### ログ出力

デバッグ情報が必要な場合：

```bash
exa --debug
```

デバッグログは現在のディレクトリの`debug-agent.log`に出力されます。

## アンインストール方法

### グローバルインストールの場合

```bash
# パッケージをアンインストール
npm uninstall -g exa-code-cli
```

### 開発用インストールの場合

```bash
# シンボリックリンクを削除
npm unlink -g exa-code-cli

# または手動でリンクを削除
which exa  # パスを確認
sudo rm $(which exa)  # 見つかったパスのファイルを削除
```

### 設定ファイルの削除

```bash
# ホームディレクトリの設定フォルダを削除
rm -rf ~/.exa

# 環境変数の削除（~/.bashrcを編集）
nano ~/.bashrc
# 該当するexport文を削除してください

# 環境変数の反映
source ~/.bashrc
```

### プロジェクトフォルダの削除

```bash
# 開発用インストールの場合、クローンしたディレクトリを削除
rm -rf /path/to/exa-code-cli
```

## サポート

問題が発生した場合は、以下のいずれかの方法でサポートを受けてください：

1. **GitHub Issues**: プロジェクトのGitHubページでIssueを作成
2. **社内サポート**: EXA社内のサポートチームにお問い合わせ
3. **ドキュメント**: 追加のドキュメントは`docs/`フォルダ内を確認

---

<p align="right">以上</p>
