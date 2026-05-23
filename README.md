# Insight-Style Grammar Maker

英文を入力すると、空欄補充・答え・Tip（思考誘導）・解説を生成する Next.js アプリです。

Google スプレッドシートで共有された文字起こしデータの列構成（日本語、英文（穴埋め）、答え、Tip、解説、Words to Use）と、Tip が「何に注目すべきか」を疑問文で誘導するトーンを参考にしています。

## Features

- 複数英文をまとめて入力し、1文ごとに問題化
- 入力英文ごとに日本語訳（ローカルの簡易下訳）を問題表示に追加
- 文法項目を「まとめて設定する」「個別に設定する」から選択
- 各英文ごとに文法項目と空欄数を指定可能
- 現在完了形、進行形、未来表現、受動態、不定詞、条件節、時制、無生物主語を簡易検出・指定
- few-shot prompt プレビューを画面内に表示
- `frontend/data/vision-quest-insight.json` の教材DBから、文法項目・入力英文・空欄数に近い few-shot 例を動的選択
- `/api/generate` で OpenAI API と連携し、`OPENAI_API_KEY` 未設定時はDB類似例のみを返すフォールバック動作
- ルールで検出できない英文も、指定した文法項目を前提に文構造・語法問題としてフォールバック生成

## Frontend

```bash
cd frontend
npm install
npm run build
npm run dev
```

## Backend

既存の FastAPI OCR API は `backend/app/main.py` に残しています。PDF OCR や Word/Excel エクスポート用の API として利用できます。

```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload
```

## Dataset / OpenAI / Vercel

教材データは `frontend/data/vision-quest-insight.json` に JSON 化しています。アプリはこの JSON を読み込み、文法項目・英文中の語句・指定空欄数に基づいて類似例を検索し、few-shot prompt を動的に組み立てます。

OpenAI API 連携を使う場合は、Vercel の Project Settings > Environment Variables に以下を設定してください。

```bash
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4.1-mini
```

`OPENAI_API_KEY` が未設定の場合、`/api/generate` は OpenAI 生成を行わず、検索された類似例と prompt を返します。
