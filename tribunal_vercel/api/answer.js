// api/defense.js
// Optimized Anthropic (Claude) endpoint:
// - Always returns JSON
// - Retries on overload/rate-limit (529/429/503) with exponential backoff + jitter
// - Guards against invalid JSON bodies
// - Hard-caps output to 2 sentences / 60 words
// - Keeps SYSTEM short; puts canonical facts in user context
//
// Requires: npm i @anthropic-ai/sdk

const Anthropic = require("@anthropic-ai/sdk");

// --- Prompting ---
const SYSTEM = `Eres el asistente de defensa del TFM "Health Analytics: Determinantes Globales de la Esperanza de Vida (2000-2019)" de Manuel Garcia Molledo.

Reglas: responde solo sobre el TFM; máximo 2 frases y 60 palabras; español natural y oral (no académico); evita jerga innecesaria; sin frases de relleno.`;

const CANON = `DATOS CANÓNICOS (hechos del TFM):
- Panel: 40 países x 20 años (2000-2019) = 800 obs, 35 variables
- Fuentes: Our World in Data (UN, IHME, World Bank, WHO, UNODC, Penn World Tables)
- Imputación: KNN k=5. Vacunación 36% missing, pobreza 37% missing
- Brecha: 17,5 años media periodo. +7,8 en desarrollo, +3,9 desarrollados. Convergencia 76 (0,205/año)
- ML: Gradient Boosting R2=0,986 test, MAE=0,4, 418 obs; validación temporal R2=0,917
- SHAP: pobreza 54,8%, GDP 27,1%, vacunación 4,1%, gasto 2,8%
- OLS gasto +0,26***; TWFE gasto -0,728***; R2 OLS=0,860; R2 TWFE=0,989
- Frontier: Chile +7,1, EEUU -5,4, China +6,7, Vietnam +6,4, Tailandia +6,0, Nigeria -16,4
- DiD UCS Tailandia 2002: +1,607 directo, +3,8 acumulado; tendencias paralelas p=0,18; placebo p=0,854
- Lags: vacunación 0,446(l0)→0,547(l8); GDP 0,776→0,803; gasto 0,301→0,412
- Suicidio: R2=0,03
- Umbrales: gasto <2%→2-4% +10; 2-4%→4-6% +3,1; >6% decreciente; vacunación 70→90% +7,3; >90% techo
Arquitectura: descriptivo (convergencia SD), ML (doble validación + SHAP), cuasi-causal (Event Study DiD + placebo).`;

// --- Hard caps ---
function capWords(text, n) {
  return text.trim().split(/\s+/).slice(0, n).join(" ");
}
function capSentences(text, n) {
  const parts = text.match(/[^.!?]+[.!?]*/g) || [text];
  return parts.slice(0, n).join("").trim();
}

// --- Robust request body parsing (handles bad JSON gracefully) ---
async function readJsonBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  let raw = "";
  await new Promise((resolve) => {
    req.on("data", (chunk) => (raw += chunk));
    req.on("end", resolve);
  });
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return { __parseError: true, __raw: raw };
  }
}

// --- Retry with exponential backoff + jitter ---
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function isRetryable(err) {
  const status = err?.status ?? err?.response?.status;
  const msg = (err?.message || "").toLowerCase();
  return (
    status === 529 || // Anthropic overloaded
    status === 429 || // rate limit
    status === 503 || // service unavailable
    msg.includes("overloaded") ||
    msg.includes("rate limit") ||
    msg.includes("timeout") ||
    msg.includes("temporarily")
  );
}

async function callWithRetry(fn, { retries = 4, baseMs = 350, maxMs = 2500 } = {}) {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (err) {
      attempt += 1;
      if (attempt > retries || !isRetryable(err)) throw err;

      const exp = Math.min(maxMs, baseMs * Math.pow(2, attempt - 1));
      const jitter = Math.floor(Math.random() * 200);
      await sleep(exp + jitter);
    }
  }
}

module.exports = async (req, res) => {
  // Always JSON
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Método no permitido" });

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return res.status(500).json({ error: "ANTHROPIC_API_KEY no configurada" });

  const body = await readJsonBody(req);
  if (body.__parseError) {
    return res.status(400).json({ error: "JSON inválido en el body" });
  }

  const question = (body.question || "").toString().trim();
  if (!question) return res.status(400).json({ error: "Falta question" });

  const client = new Anthropic({ apiKey: key });

  // Use stable model to reduce overload errors
  const payload = {
    model: "claude-3-haiku-20240307",
    max_tokens: 180, // allow fluency; hard-cap after
    system: SYSTEM,
    messages: [{ role: "user", content: `${CANON}\n\nPregunta: ${question}` }],
  };

  try {
    const msg = await callWithRetry(() => client.messages.create(payload), {
      retries: 5,
      baseMs: 350,
      maxMs: 2500,
    });

    let answer = msg.content?.[0]?.text ?? "Sin respuesta.";
    answer = capSentences(answer, 2);
    answer = capWords(answer, 60);

    return res.status(200).json({ answer });
  } catch (err) {
    const status = err?.status ?? err?.response?.status ?? 500;
    const message = err?.message || "Error al llamar a Anthropic";

    // Normalize to JSON always
    return res.status(status).json({
      error: message,
      status,
      retryable: isRetryable(err),
    });
  }
};
