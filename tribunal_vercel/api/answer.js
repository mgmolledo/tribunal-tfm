// api/defense.js
// Anthropic (Claude) TFM Defense Assistant — final version
// - Includes full canonical facts
// - Natural oral Spanish
// - Hard caps: max 2 sentences + 60 words
// - Stable model + retry on overload/rate-limit
// - Always returns JSON

const Anthropic = require("@anthropic-ai/sdk");

// ====== STYLE / RULES (keep short) ======
const SYSTEM = `Eres el asistente de defensa del TFM "Health Analytics: Determinantes Globales de la Esperanza de Vida (2000-2019)" de Manuel Garcia Molledo.

Reglas:
- Responde solo sobre este TFM.
- Máximo 2 frases y 70 palabras.
- Español natural y oral, como respondiendo al tribunal en directo.
- Habla como si estuvieras pensando y explicando a la vez, no leyendo un texto.
- Prioriza claridad sobre terminología técnica; evita estructuras tipo artículo.
- Usa conectores variados y evita enumeraciones.`;

// ====== FULL CANONICAL FACTS (as provided) ======
const CANON = `DATOS CANONICOS:
- Panel: 40 paises x 20 anos (2000-2019) = 800 obs, 35 variables
- Fuentes: Our World in Data (UN, IHME, World Bank, WHO, UNODC, Penn World Tables)
- Imputacion: KNN k=5. Vacunacion 36% missing, pobreza 37% missing
- Brecha: 17,5 anos media periodo. +7,8 anos en desarrollo, +3,9 desarrollados. Convergencia 76 anos (0,205 anos/ano)
- ML: Gradient Boosting R2=0,986 test, MAE=0,4 anos, 418 obs. Validacion temporal R2=0,917
- SHAP: pobreza 54,8%, GDP 27,1%, vacunacion 4,1%, gasto 2,8%
- OLS gasto +0,26***. TWFE gasto -0,728***. R2 OLS=0,860, TWFE=0,989
- Frontier: Chile +7,1y, EEUU -5,4y, China +6,7y, Vietnam +6,4y, Tailandia +6,0y, Nigeria -16,4y
- DiD Tailandia UCS 2002: +1,607y directos, +3,8y acumulados 17 anos. Tendencias paralelas -0,019y/ano p=0,18. Placebo DiD=-0,358 p=0,854
- Lags: vacunacion 0,446(lag0) a 0,547(lag8). GDP 0,776 a 0,803. Gasto 0,301 a 0,412
- Causas muerte: VIH -56,2%, desnutricion -62,3%, materna -41,2%
- Cronicas desarrollo: diabetes +107%, cancer +81%, demencia +157%
- Interacciones R2=0,867 N=800: Developing -1,722, Emerging +0,371, Developed +0,009
- Crisis 2008: desarrollados GDP-3,3% LE-0,023y; emergentes GDP+3,6% LE-0,010y; desarrollo GDP+10,4% LE-0,187y
- Suicidio R2=0,03
- Umbrales: <2% a 2-4% GDP +10y; 2-4% a 4-6% +3,1y; >6% decreciente; vacunacion 70 a 90% +7,3y; >90% efecto techo

INFERENCIA Y DISEÑO:
- Tres niveles analiticos: (1) Descriptivo-estructural: convergencia global con SD normalizada. (2) Predictivo-ML: doble validacion aleatoria y temporal + SHAP. (3) Cuasi-causal: Event Study DiD + placebo (UCS Tailandia 2002).
- Separar niveles evita confundir asociacion estructural con causalidad.
- OLS vs TWFE: OLS captura estructura (paises ricos gastan mas y viven mas); TWFE usa variacion intra-pais y refleja causalidad inversa en crisis; efectos positivos aparecen en lags y en Event Study.
- Limitaciones: sesgo de seleccion por cobertura; modelado usa 418/800 y no es aleatorio; tendencias paralelas no perfectamente verificables; lags max 8 anos; pobreza con 37% missing imputada por KNN.`;

// ====== HARD CAPS ======
function capWords(text, n) {
  return text.trim().split(/\s+/).slice(0, n).join(" ");
}

function capSentences(text, n) {
  const parts = text.match(/[^.!?]+[.!?]*/g) || [text];
  return parts.slice(0, n).join("").trim();
}

// ====== RETRY (529/429/503/timeout) ======
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function isRetryable(err) {
  const status = err?.status ?? err?.response?.status;
  const msg = (err?.message || "").toLowerCase();
  return (
    status === 529 ||
    status === 429 ||
    status === 503 ||
    msg.includes("overloaded") ||
    msg.includes("rate") ||
    msg.includes("timeout") ||
    msg.includes("temporarily")
  );
}

async function callWithRetry(fn, { retries = 5, baseMs = 350, maxMs = 4000 } = {}) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt >= retries || !isRetryable(err)) throw err;
      const backoff = Math.min(maxMs, baseMs * 2 ** attempt);
      const jitter = Math.floor(Math.random() * 250);
      await sleep(backoff + jitter);
    }
  }
}

// ====== HANDLER ======
module.exports = async (req, res) => {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Metodo no permitido" });

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return res.status(500).json({ error: "ANTHROPIC_API_KEY no configurada" });

  // robust body parse (works even if req.body is undefined)
  let body = req.body;
  if (!body || typeof body !== "object") {
    let raw = "";
    await new Promise((resolve) => {
      req.on("data", (c) => (raw += c));
      req.on("end", resolve);
    });
    try {
      body = raw ? JSON.parse(raw) : {};
    } catch {
      return res.status(400).json({ error: "JSON invalido" });
    }
  }

  const question = (body.question || "").toString().trim();
  if (!question) return res.status(400).json({ error: "Falta question" });

  const client = new Anthropic({ apiKey: key });

  try {
    const payload = {
      // Most stable choice for peak traffic:
      model: "claude-haiku-4-5-20251001",
      max_tokens: 220, // allow fluency; hard-cap after
      system: SYSTEM,
      messages: [{ role: "user", content: `${CANON}\n\nPregunta: ${question}` }],
    };

    const msg = await callWithRetry(() => client.messages.create(payload), {
      retries: 5,
      baseMs: 350,
      maxMs: 4000,
    });

    let answer = msg.content?.[0]?.text ?? "Sin respuesta.";
    answer = capSentences(answer, 2);
    answer = capWords(answer, 60);

    return res.status(200).json({ answer, model: payload.model });
  } catch (err) {
    const status = err?.status ?? err?.response?.status ?? 500;
    return res.status(status).json({
      error: err?.message || "Error al llamar a Anthropic",
      retryable: isRetryable(err),
    });
  }
};
