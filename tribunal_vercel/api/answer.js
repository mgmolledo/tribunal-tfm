// api/defense.js
// Node/Serverless handler for Anthropic (Claude) — TFM Defense Assistant

const Anthropic = require("@anthropic-ai/sdk");

const SYSTEM = `Eres el asistente de defensa del TFM "Health Analytics: Determinantes Globales de la Esperanza de Vida (2000-2019)" de Manuel Garcia Molledo (Nuclio Digital School, Master en Data Science & AI).

DATOS CANÓNICOS (úselos como hechos; no inventes):
- Panel: 40 países x 20 años (2000-2019) = 800 obs, 35 variables
- Fuentes: Our World in Data (UN, IHME, World Bank, WHO, UNODC, Penn World Tables)
- Imputación: KNN k=5. Vacunación 36% missing, pobreza 37% missing
- Brecha media periodo: 17,5 años. +7,8 años en desarrollo, +3,9 desarrollados. Convergencia a 76 años (0,205 años/año)
- ML: Gradient Boosting R2=0,986 test, MAE=0,4 años, 418 obs; validación temporal R2=0,917
- SHAP: pobreza 54,8%, GDP 27,1%, vacunación 4,1%, gasto 2,8%
- OLS gasto +0,26***; TWFE gasto -0,728***; R2 OLS=0,860; R2 TWFE=0,989
- Frontier (residuales GDP–LE): Chile +7,1y, EEUU -5,4y, China +6,7y, Vietnam +6,4y, Tailandia +6,0y, Nigeria -16,4y
- DiD Tailandia UCS 2002: +1,607y directos, +3,8y acumulados (17 años); tendencias paralelas -0,019y/año p=0,18; placebo DiD=-0,358 p=0,854
- Lags: vacunación 0,446(lag0)→0,547(lag8); GDP 0,776→0,803; gasto 0,301→0,412
- Causas muerte: VIH -56,2%, desnutrición -62,3%, materna -41,2%
- Crónicas en desarrollo: diabetes +107%, cáncer +81%, demencia +157%
- Interacciones R2=0,867 (N=800): Developing -1,722, Emerging +0,371, Developed +0,009
- Crisis 2008: desarrollados GDP-3,3% LE-0,023y; emergentes GDP+3,6% LE-0,010y; desarrollo GDP+10,4% LE-0,187y
- Suicidio: R2=0,03
- Umbrales: <2%→2-4% GDP +10y; 2-4%→4-6% +3,1y; >6% rendimientos decrecientes; vacunación 70→90% +7,3y; >90% efecto techo

ARQUITECTURA (no mezclar inferencias):
(1) Descriptivo-estructural: convergencia (SD normalizada).
(2) Predictivo-ML: doble validación (aleatoria y temporal) + SHAP.
(3) Cuasi-causal: Event Study DiD + placebo (UCS Tailandia 2002).

REGLAS DE RESPUESTA (estrictas):
- Máximo 2 frases.
- Máximo 60 palabras.
- Español técnico-académico formal.
- Sin introducciones ni conclusiones ni ejemplos; sin listas.
- Responde solo sobre este TFM; si la pregunta no aplica, di "No aplica al TFM" en 1 frase.`;

// --- Hard output caps (guarantee compliance even if model drifts) ---
function capWords(text, n) {
  return text.trim().split(/\s+/).slice(0, n).join(" ");
}

function capSentences(text, n) {
  const parts = text.match(/[^.!?]+[.!?]*/g) || [text];
  return parts.slice(0, n).join("").trim();
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).end();

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return res.status(500).json({ error: "ANTHROPIC_API_KEY no configurada" });

  const { question } = req.body || {};
  if (!question) return res.status(400).json({ error: "Falta question" });

  const client = new Anthropic({ apiKey: key });

  try {
    const msg = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 90, // tight budget for 2 sentences
      system: SYSTEM,
      messages: [{ role: "user", content: question }],
      // cuts off common verbosity patterns
      stop_sequences: ["\n\n", "\n- ", "\n• ", "\n1.", "\n2.", "---", "—"]
    });

    let answer = msg.content?.[0]?.text ?? "Sin respuesta.";
    answer = capSentences(answer, 2);
    answer = capWords(answer, 60);

    res.status(200).json({ answer });
  } catch (err) {
    res.status(500).json({ error: err.message || "Error al llamar a Claude" });
  }
};
