# QAFI App

Clinical web application for protein variant functional impact prediction and interpretation.

Built on the [QAFI](../QAFI_CODE_NEW/) machine learning framework.

## Architecture

```
Browser (React)              Backend (FastAPI)           ML Pipeline
┌──────────────┐  HTTP    ┌──────────────────┐  subprocess  ┌──────────────┐
│ Dashboard    │────────→│ /api/predict/*   │────────────→│              │
│ Prediction   │────────→│ /api/analysis/*  │             │ QAFI_CODE_NEW│
│ Interpretation│────────→│ /api/agent/chat  │────────────→│ (unmodified) │
│ AI Agent     │←────────│                  │←────────────│              │
└──────────────┘         └──────────────────┘             └──────────────┘
  :5173                    :8000
```

## Prerequisites

- Python 3.10+ (via conda)
- Node.js 18+
- Conda environment `pipi` with QAFI dependencies
- (Optional) Anthropic API key for AI Agent feature

## Quick Start

### 1. Clone & configure

```bash
cd QAFI_App
cp .env.example .env
# Edit .env — set your ANTHROPIC_API_KEY and paths
```

### 2. Backend setup

```bash
conda activate qafi_agent
pip install -r requirements.txt
```

### 3. Frontend setup

```bash
cd frontend
npm install
cd ..
```

### 4. Run (development)

```bash
# Terminal 1: Backend
conda activate qafi_agent
uvicorn backend.main:app --port 8000 --reload

# Terminal 2: Frontend
cd frontend
npm run dev
```

Open http://localhost:5173

Or use the convenience script:

```bash
./dev.sh
```

## Project Structure

```
QAFI_App/
├── backend/                  # FastAPI (Python)
│   ├── main.py               # App entry, CORS
│   ├── routers/
│   │   ├── predict.py        # Prediction endpoints
│   │   ├── analysis.py       # Data analysis endpoints
│   │   └── agent.py          # AI Agent chat endpoint
│   └── services/
│       └── qafi.py           # QAFI_CODE_NEW wrapper
├── frontend/                 # React + TypeScript + Vite
│   ├── src/
│   │   ├── api/client.ts     # API client
│   │   ├── components/       # Shared components
│   │   └── pages/            # Page components
│   ├── package.json
│   └── package-lock.json
├── .env.example              # Environment template
├── .gitignore
├── pyproject.toml            # Python project metadata
├── requirements.txt          # Python dependencies
└── README.md
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health` | GET | Health check |
| `/api/predict/proteins` | GET | List available proteins |
| `/api/predict/methods` | GET | List PSP & QAFI methods |
| `/api/predict/run` | POST | Run a prediction |
| `/api/analysis/features/{id}` | GET | Get protein features |
| `/api/analysis/dataset/overview` | GET | Dataset statistics |
| `/api/analysis/feature-importance` | GET | Feature descriptions |
| `/api/agent/chat` | POST | AI Agent conversation |
