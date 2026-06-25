# QueueStorm Warmup — Mock Preliminary Task
**bKash SUST CSE Carnival 2026**

A lightweight Express.js API that classifies bKash customer support tickets using the **Gemini 2.5 Flash** LLM. Given a raw customer message it returns a structured JSON object containing the case type, severity, department routing, an agent summary, a human-review flag, and a confidence score.

---

## Table of Contents
- [Prerequisites](#prerequisites)
- [Local Setup](#local-setup)
- [Configuration](#configuration)
- [Running Locally](#running-locally)
- [Deployment](#deployment)
  - [Vercel](#deploy-to-vercel)
  - [Render](#deploy-to-render)
- [API Reference](#api-reference)
  - [GET /health](#get-health)
  - [POST /sort-ticket](#post-sort-ticket)
- [Testing the API](#testing-the-api)
- [Business Rules](#business-rules)
- [Project Structure](#project-structure)
- [Submission](#submission)

---

## Prerequisites
| Tool | Version |
|------|---------| 
| Node.js | ≥ 18.x |
| npm | ≥ 9.x |
| Git | any |
| Gemini API Key | Free key from [Google AI Studio](https://aistudio.google.com/) |

---

## Local Setup

```bash
# 1. Clone the repository
git clone https://github.com/iamfardinn/sust_preli_mock.git
cd sust_preli_mock

# 2. Install all dependencies
npm install
```

---

## Configuration

Create your `.env` file in the project root:

```bash
# Windows (PowerShell)
Copy-Item .env.example .env   # if example exists, otherwise create manually
```

**.env**
```env
PORT=3000
GEMINI_API_KEY=your_actual_gemini_api_key_here
```

Get your free API key at → **[aistudio.google.com](https://aistudio.google.com/)** → Get API Key → Create API Key

> **⚠️ Never commit your `.env` file.** It is listed in `.gitignore` and will NOT be pushed to GitHub.

---

## Running Locally

```bash
# Start the server
npm start

# Development mode (auto-restart on file changes)
npm run dev
```

The server starts at **[http://localhost:3000](http://localhost:3000)**

- Frontend UI → `http://localhost:3000/`
- Health check → `http://localhost:3000/health`
- Classify ticket → `POST http://localhost:3000/sort-ticket`

---

## Deployment

### Deploy to Vercel

Vercel is the recommended platform — it auto-deploys on every `git push`.

**Step 1 — Push your code to GitHub** (already done if you cloned this repo)

**Step 2 — Connect to Vercel**
1. Go to **[vercel.com/new](https://vercel.com/new)**
2. Click **"Import Git Repository"**
3. Select `iamfardinn/sust_preli_mock`
4. Leave all build settings as default (Vercel auto-detects `vercel.json`)

**Step 3 — Add environment variable**

In the Vercel project settings under **Environment Variables**, add:
```
GEMINI_API_KEY = your_actual_gemini_api_key_here
```

**Step 4 — Deploy**

Click **Deploy**. Your live URL will be:
```
https://sust-preli-mock.vercel.app
```

**Future deploys** happen automatically on every `git push`:
```bash
git add .
git commit -m "your message"
git push
# Vercel auto-redeploys in ~30 seconds
```

---

### Deploy to Render

Render is a great alternative with a persistent server (no cold starts).

1. Go to **[render.com](https://render.com)** → **New → Web Service**
2. Connect your GitHub repo `iamfardinn/sust_preli_mock`
3. Fill in the settings:

| Setting | Value |
|---------|-------|
| **Build Command** | `npm install` |
| **Start Command** | `npm start` |
| **Environment** | `Node` |

4. Add environment variable:
```
GEMINI_API_KEY = your_actual_gemini_api_key_here
```
5. Click **Create Web Service**

---

## API Reference

### GET /health

Returns service liveness status.

**Response `200 OK`:**
```json
{
  "status": "ok",
  "timestamp": "2026-06-25T16:00:00.000Z"
}
```

---

### POST /sort-ticket

Classifies a customer support ticket using the Gemini LLM.

**Request Headers:**
```
Content-Type: application/json
```

**Request Body:**
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `ticket_id` | string | ✅ | Unique identifier for the ticket |
| `message` | string | ✅ | Raw customer support message |
| `channel` | string | ❌ | Channel origin (e.g., `app`, `web`, `sms`) |
| `locale` | string | ❌ | Customer locale (e.g., `bn-BD`, `en-US`) |

**Response `200 OK`:**
```json
{
  "ticket_id": "T-001",
  "case_type": "wrong_transfer",
  "severity": "medium",
  "department": "dispute_resolution",
  "agent_summary": "Customer reports an accidental BDT 500 transfer to an unintended recipient and requests reversal. Agent should verify the transaction ID via bKash portal and initiate standard wrong-transfer recovery.",
  "human_review_required": false,
  "confidence": 0.94
}
```

**Response `400 Bad Request`** (missing `ticket_id` or `message`):
```json
{
  "error": "Bad Request",
  "message": "`ticket_id` is required and must be a non-empty string."
}
```

**Response `429 Too Many Requests`** (rate limit exceeded):
```json
{
  "error": "Too Many Requests",
  "message": "Ticket classification limit reached (10/min). Please wait before submitting another ticket."
}
```

#### Allowed Enum Values

| Field | Allowed Values |
|-------|---------------|
| `case_type` | `wrong_transfer`, `payment_failed`, `refund_request`, `phishing_or_social_engineering`, `other` |
| `severity` | `low`, `medium`, `high`, `critical` |
| `department` | `customer_support`, `dispute_resolution`, `payments_ops`, `fraud_risk` |

#### Rate Limits
| Endpoint | Limit |
|----------|-------|
| All routes | 100 requests / minute / IP |
| `/sort-ticket` | 10 requests / minute / IP |

---

## Testing the API

### Using the Web UI
Open `http://localhost:3000` (or your Vercel URL) in the browser — fill in the form and click **Classify Ticket**.

### Using PowerShell (Windows)
```powershell
# Health check
Invoke-WebRequest -Uri http://localhost:3000/health -UseBasicParsing | Select-Object -ExpandProperty Content

# Classify a ticket
$body = '{"ticket_id": "T-001", "channel": "app", "message": "I sent money to the wrong number by mistake."}'
Invoke-WebRequest -Uri http://localhost:3000/sort-ticket -Method POST -ContentType "application/json" -Body $body -UseBasicParsing | Select-Object -ExpandProperty Content
```

### Using curl (Linux/Mac/Git Bash)
```bash
# Health check
curl http://localhost:3000/health

# Wrong transfer
curl -X POST http://localhost:3000/sort-ticket \
  -H "Content-Type: application/json" \
  -d '{"ticket_id": "T-001", "channel": "app", "locale": "bn-BD", "message": "Ami vul number e 500 taka pathiye felchi, please help koro refund er jonno."}'

# Phishing report
curl -X POST http://localhost:3000/sort-ticket \
  -H "Content-Type: application/json" \
  -d '{"ticket_id": "T-002", "message": "Someone called me claiming to be bKash support and asked for my account details. I think I got scammed."}'

# Payment failed
curl -X POST http://localhost:3000/sort-ticket \
  -H "Content-Type: application/json" \
  -d '{"ticket_id": "T-003", "message": "I tried to pay my electricity bill but the payment keeps failing. Money was deducted but payment shows failed."}'
```

---

## Business Rules

| Rule | Detail |
|------|--------|
| **Response time** | `/health` < 10s · `/sort-ticket` < 30s |
| **Safety — CRITICAL** | `agent_summary` must **never** ask the customer to share their PIN, OTP, password, or full card number |
| **Enum adherence** | All classification fields are validated server-side; invalid LLM output is corrected automatically |
| **Human review** | `human_review_required` is `true` **only** when `severity === "critical"` OR `case_type === "phishing_or_social_engineering"` |
| **Fallback** | If the LLM call fails, a safe fallback is returned: `case_type: "other"`, `severity: "high"`, `human_review_required: true` |
| **Rate limiting** | Global: 100 req/min · `/sort-ticket`: 10 req/min (protects Gemini quota) |

---

## Project Structure

```
sust_preli_mock/
├── server.js           # Main Express application + Gemini integration
├── public/
│   └── index.html      # Frontend UI for testing the API
├── vercel.json         # Vercel deployment configuration
├── package.json        # Dependencies & npm scripts
├── .env                # Environment variables (NOT committed)
├── .gitignore          # Git ignore rules
└── README.md           # This file
```

---

## Submission

Repository: **[github.com/iamfardinn/sust_preli_mock](https://github.com/iamfardinn/sust_preli_mock)**

```bash
git add .
git commit -m "feat: complete QueueStorm warmup submission"
git push origin main
```

---

*Built for the bKash SUST CSE Carnival 2026 — QueueStorm Warmup Task.*
