// api/defense.js
const Anthropic = require("@anthropic-ai/sdk");

// 1) System: SOLO reglas (corto)
const SYSTEM = `Eres el asistente de defensa del TFM "Health Analytics: Determinantes Globales de la Esperanza de Vida (2000-2019)" de Manuel Garcia Molledo.

REGLAS:
- Responde solo sobre este TFM.
- Máximo 2 frases.
- Máximo 60 palabras.
- Español técnico-académico fluido (no telegráfico).
- Sin frases de relleno ni introducciones genéricas.`;

// 2) Canonical facts: TODO el bloque largo va como contexto (no como reglas)
const CANON = `DATOS CANÓNICOS (hechos del TFM):
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

ARQUITECTURA:
(1) Descriptivo-estructural: convergencia global mediante SD normalizada.
(2) Predictivo-ML: doble validación aleatoria y temporal + SHAP.
(3) Cuasi-causal: Event Study DiD + placebo (UCS Tailandia 2002).

LIMITACIONES:
- Sesgo de selección por cobertura; generalización limitada.
- Modelado usa 418 obs por cobertura simultánea; exclusión no aleatoria.
- Tendencias paralelas no perfectamente verificables.
- Lags máx. 8 años; efectos estructurales largos no capturados.
- Pobreza con 37% missing, imputada con KNN.`;

// --- Hard caps ---
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
      max_tokens: 180, // deja que escriba fluido; recortas después
      system: SYSTEM,
      messages: [
        { role: "user", content: `${CANON}\n\nPregunta: ${question}` }
      ]
      // stop_sequences opcional; mejor omitir para no forzar estilo telegráfico
    });

    let answer = msg.content?.[0]?.text ?? "Sin respuesta.";
    answer = capSentences(answer, 2);
    answer = capWords(answer, 60);

    res.status(200).json({ answer });
  } catch (err) {
    res.status(500).json({ error: err.message || "Error al llamar a Claude" });
  }
};
