# QueueStorm Warmup — Mock Preliminary Task
**bKash SUST CSE Carnival 2026**

A lightweight Express.js API that classifies bKash customer support tickets using the **Gemini 2.5 Flash** LLM. Given a raw customer message it returns a structured JSON object containing the case type, severity, department routing, an agent summary, a human-review flag, and a confidence score.

---

## Table of Contents
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Configuration](#configuration)
- [Running the Server](#running-the-server)
- [API Reference](#api-reference)
  - [GET /health](#get-health)
  - [POST /sort-ticket](#post-sort-ticket)
- [Sample cURL Commands](#sample-curl-commands)
- [Business Rules](#business-rules)
- [Submission](#submission)

---

## Prerequisites
| Tool | Version |
|------|---------|
| Node.js | ≥ 18.x |
| npm | ≥ 9.x |
| Gemini API Key | Active key from [Google AI Studio](https://aistudio.google.com/) |

---

## Installation

```bash
# Clone the repository
git clone https://github.com/iamfardinn/queuestorm-warmup.git
cd queuestorm-warmup

# Install dependencies
npm install
```

---

## Configuration

Copy the `.env` template and fill in your credentials:

```bash
# The .env file is already present in the repo root as a template
# Edit it and replace the placeholder with your real API key
```

**.env**
```env
PORT=3000
GEMINI_API_KEY=your_actual_gemini_api_key_here
```

> **⚠️ Never commit your `.env` file.** It is listed in `.gitignore`.

---

## Running the Server

```bash
# Production
npm start

# Development (auto-restart on file changes — requires nodemon)
npm run dev
```

The server will start on `http://localhost:3000` by default.

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

#### Allowed Enum Values

| Field | Allowed Values |
|-------|---------------|
| `case_type` | `wrong_transfer`, `payment_failed`, `refund_request`, `phishing_or_social_engineering`, `other` |
| `severity` | `low`, `medium`, `high`, `critical` |
| `department` | `customer_support`, `dispute_resolution`, `payments_ops`, `fraud_risk` |

---

## Sample cURL Commands

### Health Check
```bash
curl -X GET http://localhost:3000/health
```

### Classify a Ticket — Wrong Transfer
```bash
curl -X POST http://localhost:3000/sort-ticket \
  -H "Content-Type: application/json" \
  -d '{
    "ticket_id": "T-001",
    "channel": "app",
    "locale": "bn-BD",
    "message": "Ami vul number e 500 taka pathiye felchi, please help koro refund er jonno."
  }'
```

### Classify a Ticket — Phishing Report
```bash
curl -X POST http://localhost:3000/sort-ticket \
  -H "Content-Type: application/json" \
  -d '{
    "ticket_id": "T-002",
    "channel": "web",
    "message": "Someone called me claiming to be bKash support and asked me for my account details. I think I got scammed."
  }'
```

### Classify a Ticket — Payment Failed
```bash
curl -X POST http://localhost:3000/sort-ticket \
  -H "Content-Type: application/json" \
  -d '{
    "ticket_id": "T-003",
    "message": "I tried to pay my electricity bill but the payment keeps failing. Money was deducted but payment shows failed."
  }'
```

---

## Business Rules

| Rule | Detail |
|------|--------|
| **Response time** | `/health` < 10s &nbsp;·&nbsp; `/sort-ticket` < 30s |
| **Safety — CRITICAL** | `agent_summary` must **never** ask the customer to share their PIN, OTP, password, or full card number |
| **Enum adherence** | All classification fields are validated against the allowed enums; invalid LLM output is corrected |
| **Human review** | `human_review_required` is `true` **only** when `severity === "critical"` OR `case_type === "phishing_or_social_engineering"` |
| **Fallback** | If the LLM call fails, the API returns a safe fallback with `case_type: "other"`, `severity: "high"`, and `human_review_required: true` |

---

## Submission

The final code is hosted on GitHub under the **iamfardinn** account:

```
https://github.com/iamfardinn/queuestorm-warmup
```

Push your changes before the submission deadline:
```bash
git add .
git commit -m "feat: complete QueueStorm warmup submission"
git push origin main
```

---

## Project Structure

```
queuestorm-warmup/
├── server.js        # Main Express application
├── package.json     # Dependencies & scripts
├── .env             # Environment variables (not committed)
├── .gitignore       # Git ignore rules
└── README.md        # This file
```

---

*Built for the bKash SUST CSE Carnival 2026 — QueueStorm Warmup Task.*
