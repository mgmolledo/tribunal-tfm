// api/defense.js
const Anthropic = require("@anthropic-ai/sdk");

const SYSTEM = `Eres el asistente de defensa del TFM "Health Analytics: Determinantes Globales de la Esperanza de Vida (2000-2019)" de Manuel Garcia Molledo.

DATOS CANÓNICOS:
- Panel: 40 países x 20 años (2000-2019) = 800 obs
- Fuentes: Our World in Data (UN, IHME, World Bank, WHO, UNODC, Penn World Tables)
- Imputación: KNN k=5
- ML: Gradient Boosting con validación temporal
- SHAP: pobreza y GDP dominan importancia
- Econometría: OLS vs TWFE muestran causalidad inversa
- Causalidad: Event Study DiD reforma sanitaria Tailandia 2002

REGLAS:
Máximo 2 frases.
Máximo 60 palabras.
Lenguaje técnico directo.
Sin introducciones ni conclusiones.`;

// recorte duro de palabras
function capWords(text, n) {
  return text.trim().split(/\s+/).slice(0, n).join(" ");
}

// recorte duro de frases
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
      max_tokens: 90,
      system: SYSTEM,
      messages: [{ role: "user", content: question }],
      stop_sequences: ["###", "END", "<END>"] // secuencias válidas
    });

    let answer = msg.content?.[0]?.text ?? "Sin respuesta.";
    answer = capSentences(answer, 2);
    answer = capWords(answer, 60);

    res.status(200).json({ answer });
  } catch (err) {
    res.status(500).json({ error: err.message || "Error al llamar a Claude" });
  }
};
