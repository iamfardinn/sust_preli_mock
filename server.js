'use strict';

require('dotenv').config();

const express   = require('express');
const rateLimit = require('express-rate-limit');
const { GoogleGenAI } = require('@google/genai');

// ─── Constants & Enums ───────────────────────────────────────────────────────

const ALLOWED_CASE_TYPES = [
  'wrong_transfer',
  'payment_failed',
  'refund_request',
  'phishing_or_social_engineering',
  'other',
];

const ALLOWED_SEVERITIES = ['low', 'medium', 'high', 'critical'];

const ALLOWED_DEPARTMENTS = [
  'customer_support',
  'dispute_resolution',
  'payments_ops',
  'fraud_risk',
];

// ─── Gemini Client ────────────────────────────────────────────────────────────

const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// ─── System Instruction (prompt engineering) ──────────────────────────────────

const SYSTEM_INSTRUCTION = `
You are an automated CRM ticket classifier for bKash, a mobile financial services company.
Your sole responsibility is to analyze an incoming customer support message and produce a
structured JSON classification. You must follow ALL rules below — no exceptions.

## OUTPUT FORMAT
Return ONLY a valid JSON object — no markdown fences, no prose. The object must have exactly
these six fields:
  - "case_type"            : string (see allowed values below)
  - "severity"            : string (see allowed values below)
  - "department"          : string (see allowed values below)
  - "agent_summary"       : string (a concise, professional summary for the support agent)
  - "human_review_required": boolean
  - "confidence"          : number between 0.00 and 1.00

## ALLOWED ENUM VALUES — use ONLY these exact strings, nothing else:

case_type     → "wrong_transfer" | "payment_failed" | "refund_request" | "phishing_or_social_engineering" | "other"
severity      → "low" | "medium" | "high" | "critical"
department    → "customer_support" | "dispute_resolution" | "payments_ops" | "fraud_risk"

## CLASSIFICATION GUIDANCE

case_type:
  - wrong_transfer              : Customer sent money to an unintended recipient.
  - payment_failed              : A payment attempt did not complete successfully.
  - refund_request              : Customer is asking for money back for a completed transaction.
  - phishing_or_social_engineering: Customer reports being deceived, tricked, manipulated, or
                                    suspects fraud / scam / unauthorized access attempts.
  - other                       : Any message that does not clearly fit the above categories,
                                  INCLUDING messages that are completely off-topic, nonsensical,
                                  random, or unrelated to financial services (e.g. "I eat rice",
                                  "hello", "test", random characters, etc.).

severity:
  - low      : General inquiry, no financial loss, no urgency. Also use "low" for completely
               off-topic, irrelevant, or nonsensical messages that have no financial context.
  - medium   : Minor inconvenience, small financial impact, or unclear outcome.
  - high     : Confirmed financial loss, failed high-value transaction, or customer distress.
  - critical : ONLY for active fraud, phishing, account compromise, or large unauthorized
               transactions where there is clear evidence of malicious activity. Do NOT use
               "critical" for vague, random, or off-topic messages.

department:
  - customer_support    : General inquiries, account questions, low-severity issues, off-topic messages.
  - dispute_resolution  : Wrong transfers, refund disputes, contested transactions.
  - payments_ops        : Failed payments, technical payment errors, merchant issues.
  - fraud_risk          : Phishing, social engineering, unauthorized access, critical fraud cases.

human_review_required:
  - Set to TRUE  if and only if severity is "critical" OR case_type is "phishing_or_social_engineering".
  - Set to FALSE in all other cases — including off-topic or nonsensical messages.

## HANDLING OFF-TOPIC OR IRRELEVANT MESSAGES
If the customer message has NO clear connection to financial services, payments, transfers, or
account issues (e.g. random words, food comments, greetings, gibberish), you MUST:
  - Set case_type to "other"
  - Set severity to "low"
  - Set department to "customer_support"
  - Set human_review_required to false
  - Set confidence to a low value (< 0.60) reflecting the ambiguity
  - Write an agent_summary explaining the message appears unrelated to financial services

confidence:
  - Reflect how certain you are of the classification. Be honest; if the message is ambiguous use a
    lower score (< 0.70). For off-topic messages, use a score below 0.60.

## AGENT SUMMARY RULES — CRITICAL SAFETY REQUIREMENT
The "agent_summary" field MUST:
  - Be written in clear, professional English for an internal support agent.
  - Briefly describe the customer's issue and suggest the next action.
  - NEVER instruct or ask the customer to share their PIN, OTP, password, or full card number.
  - NEVER include any sensitive credential fields in the summary whatsoever.
  - Not exceed 100 words.

## EXAMPLE (for reference only — do not repeat this in your output)
Input message: "I sent 500 taka to the wrong number and want it back."
Output:
{
  "case_type": "wrong_transfer",
  "severity": "medium",
  "department": "dispute_resolution",
  "agent_summary": "Customer reports an accidental transfer of BDT 500 to an unintended recipient and is requesting a refund or reversal. Agent should verify transaction details via the bKash portal and initiate the standard wrong-transfer recovery process.",
  "human_review_required": false,
  "confidence": 0.94
}
`.trim();

// ─── Helper: build fallback response ─────────────────────────────────────────

function buildFallback(ticketId, errorMsg) {
  return {
    ticket_id: ticketId,
    case_type: 'other',
    severity: 'high',
    department: 'customer_support',
    agent_summary:
      'Automated classification failed. Please review this ticket manually and escalate if needed.',
    human_review_required: true,
    confidence: 0.0,
    _error: errorMsg || 'LLM classification unavailable',
  };
}

// ─── Helper: sanitise & validate LLM response ─────────────────────────────────

function validateAndSanitise(raw, ticketId) {
  let parsed;

  // Strip markdown code fences if model returns them despite instruction
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error(`LLM returned non-JSON content: ${cleaned.slice(0, 120)}`);
  }

  // Enforce enums — fall back to 'other'/'high'/'customer_support' on bad values
  if (!ALLOWED_CASE_TYPES.includes(parsed.case_type)) {
    console.warn(`[WARN] Invalid case_type "${parsed.case_type}" — defaulting to "other"`);
    parsed.case_type = 'other';
  }
  if (!ALLOWED_SEVERITIES.includes(parsed.severity)) {
    console.warn(`[WARN] Invalid severity "${parsed.severity}" — defaulting to "high"`);
    parsed.severity = 'high';
  }
  if (!ALLOWED_DEPARTMENTS.includes(parsed.department)) {
    console.warn(`[WARN] Invalid department "${parsed.department}" — defaulting to "customer_support"`);
    parsed.department = 'customer_support';
  }

  // Enforce human_review_required business rule regardless of LLM output
  const mustReview =
    parsed.severity === 'critical' ||
    parsed.case_type === 'phishing_or_social_engineering';
  parsed.human_review_required = mustReview;

  // Safety guard on agent_summary — strip any line containing dangerous keywords
  const FORBIDDEN_PATTERNS =
    /\b(pin|otp|one.?time.?password|password|full.?card.?number|card.?number)\b/gi;
  if (FORBIDDEN_PATTERNS.test(parsed.agent_summary || '')) {
    console.warn('[WARN] agent_summary contained forbidden credential keywords — redacting');
    parsed.agent_summary =
      'Summary redacted due to safety policy. Please review the original message and handle per standard protocol.';
  }

  // Clamp confidence to [0, 1]
  parsed.confidence = Math.min(1, Math.max(0, Number(parsed.confidence) || 0));

  // Inject ticket_id into response
  parsed.ticket_id = ticketId;

  return parsed;
}

// ─── Rate Limiters ───────────────────────────────────────────────────────────

// Global limiter — all routes: 100 requests per minute per IP
const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,   // Return RateLimit-* headers
  legacyHeaders: false,
  message: {
    error: 'Too Many Requests',
    message: 'You are sending requests too quickly. Please wait a moment and try again.',
  },
});

// Strict limiter — /sort-ticket only: 10 requests per minute per IP
// Protects Gemini API quota and prevents abuse
const ticketLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too Many Requests',
    message: 'Ticket classification limit reached (10/min). Please wait before submitting another ticket.',
  },
});

// ─── Express App ──────────────────────────────────────────────────────────────

const app = express();
app.use(express.json());
app.use(express.static('public'));
app.use(globalLimiter);   // Apply global limiter to all routes

// ── GET /health ───────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
  });
});

// ── POST /sort-ticket ─────────────────────────────────────────────────────────
app.post('/sort-ticket', ticketLimiter, async (req, res) => {
  const { ticket_id, channel, locale, message } = req.body || {};

  // ── Input validation ──────────────────────────────────────────────────────
  if (!ticket_id || typeof ticket_id !== 'string' || ticket_id.trim() === '') {
    return res.status(400).json({
      error: 'Bad Request',
      message: '`ticket_id` is required and must be a non-empty string.',
    });
  }
  if (!message || typeof message !== 'string' || message.trim() === '') {
    return res.status(400).json({
      error: 'Bad Request',
      message: '`message` is required and must be a non-empty string.',
    });
  }

  const tid = ticket_id.trim();

  // ── Build user prompt ─────────────────────────────────────────────────────
  const userPrompt = [
    `Classify the following customer support message.`,
    channel ? `Channel: ${channel}` : null,
    locale  ? `Locale: ${locale}`   : null,
    ``,
    `Customer message:`,
    `"""`,
    message.trim(),
    `"""`,
  ]
    .filter((line) => line !== null)
    .join('\n');

  // ── Call Gemini ───────────────────────────────────────────────────────────
  try {
    const response = await genAI.models.generateContent({
      model: 'gemini-2.5-flash',
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        responseMimeType: 'application/json',
        temperature: 0.1,   // Low temperature for consistent, deterministic classification
        topP: 0.95,
        maxOutputTokens: 512,
      },
      contents: [
        {
          role: 'user',
          parts: [{ text: userPrompt }],
        },
      ],
    });

    const rawText = response.text;

    if (!rawText) {
      throw new Error('Empty response from Gemini API');
    }

    const classified = validateAndSanitise(rawText, tid);

    console.log(
      `[INFO] ticket=${tid} case=${classified.case_type} severity=${classified.severity} ` +
      `review=${classified.human_review_required} confidence=${classified.confidence}`
    );

    return res.status(200).json(classified);
  } catch (err) {
    console.error(`[ERROR] Failed to classify ticket ${tid}:`, err?.message || err);
    return res.status(200).json(buildFallback(tid, err?.message));
  }
});

// ── 404 catch-all ─────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: 'Not Found', message: 'The requested endpoint does not exist.' });
});

// ─── Start Server ─────────────────────────────────────────────────────────────

const PORT = parseInt(process.env.PORT, 10) || 3000;
app.listen(PORT, () => {
  console.log(`[INFO] QueueStorm Ticket Classifier running on http://localhost:${PORT}`);
  console.log(`[INFO] Gemini model : gemini-2.5-flash`);
  console.log(`[INFO] Endpoints    : GET /health  |  POST /sort-ticket`);
});
