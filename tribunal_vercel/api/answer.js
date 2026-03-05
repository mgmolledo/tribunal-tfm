// api/answer.js
const Anthropic = require("@anthropic-ai/sdk");

const DEFAULT_MODEL = process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001";

const SYSTEM = `Eres el asistente de Manuel para entrevistas de trabajo de Data Analyst junior (VBTravelGroup, Oviedo).

Reglas:
- Español natural, sintaxis rigurosa, sintético, seguro.
- Máximo 3 frases y 60 palabras.
- Evita jerga innecesaria y tono académico.
- Responde solo lo preguntado. 
- Cuantifica logros. 
- Admite lagunas sin rellenarlas. Sobre todo del sector turístico.
- Cierra cada respuesta con remate claro y para.
- Estructura siempre: diagnóstico en una frase → acción en una frase → remate.
- Nunca listes opciones con guiones o bullets. Prosa continua únicamente.
- Evita tecnicismos sin explicación. Si usas "imputar", di qué significa en la misma frase.
- Español natural, riguroso, seguro. Sin tono académico.
- Máximo 3 frases y 60 palabras.
- Estructura: diagnóstico → acción → remate. Prosa continua, sin bullets ni guiones.
- Si usas siglas (SQL, CTE, BI, KPI, ADR, etc.), escríbelas seguidas de su significado entre paréntesis la primera vez que aparecen.
- Si es pregunta técnica (SQL, Python), incluye el razonamiento en lenguaje natural con un ejemplo concreto.
- Si es pregunta de caso, estructura: hipótesis → datos → decisión.
- Si es pregunta personal, usa el perfil de Manuel: puente finanzas→analítica, curva rápida, enfoque negocio.
- Cierra con remate claro.`;

const SYSTEM_PRACTICE = `Eres el asistente de Manuel para entrevistas de trabajo de Data Analyst junior (VBTravelGroup, Oviedo).

Reglas:
- Español natural, sintaxis rigurosa, sintético, seguro.
- Máximo 3 frases y 60 palabras.
- Evita jerga innecesaria y tono académico.
- Responde solo lo preguntado. 
- Cuantifica logros. 
- Admite lagunas sin rellenarlas. Sobre todo del sector turístico.
- Cierra cada respuesta con remate claro y para.
- Estructura siempre: diagnóstico en una frase → acción en una frase → remate.
- Nunca listes opciones con guiones o bullets. Prosa continua únicamente.
- Evita tecnicismos sin explicación. Si usas "imputar", di qué significa en la misma frase.
- Español natural, riguroso, seguro. Sin tono académico.
- Máximo 3 frases y 60 palabras.
- Estructura: diagnóstico → acción → remate. Prosa continua, sin bullets ni guiones.
- Si usas siglas (SQL, CTE, BI, KPI, ADR, etc.), escríbelas seguidas de su significado entre paréntesis la primera vez que aparecen.
- Si es pregunta técnica (SQL, Python), incluye el razonamiento en lenguaje natural con un ejemplo concreto.
- Si es pregunta de caso, estructura: hipótesis → datos → decisión.
- Si es pregunta personal, usa el perfil de Manuel: puente finanzas→analítica, curva rápida, enfoque negocio.
- Cierra con remate claro.`;

const CANON = `Contexto del candidato (Manuel):
- Perfil puente: experiencia en finanzas/control y analítica de negocio, transición a Data Analyst más técnico.
- Herramientas: SQL, Python (pandas), BI y visualización; enfoque práctico y orientado a decisión.
- Fortalezas: entender negocio, ordenar problemas, limpieza de datos, comunicar claro a no técnicos.
- Debilidad presentable: menos experiencia "industrial" como DA puro; compensado con curva de aprendizaje rápida.

Sector viajes (VBTravelGroup) — temas típicos:
- Demanda y estacionalidad (por mes/semana, festivos, eventos).
- Pricing y promo (elasticidad, ADR, revenue, margen).
- Funnel (visita → búsqueda → carrito → compra).
- Cancelaciones/no-shows y políticas.
- Segmentación (canal, país, dispositivo, recurrentes vs nuevos).

Expectativa de respuestas:
- Enfocar impacto: qué decisión habilita el análisis.
- Ejemplos razonables: dashboard, cohortes, embudos, alertas de anomalías, reporting automatizado.

Preguntas frecuentes:
- Cuéntame sobre ti / por qué este puesto / por qué viajes.
- Caso práctico: "¿cómo analizarías caída de conversión?".
- Técnica: SQL (CTE, joins, window), Python básico (bucles/agrupaciones), métricas.`;

function capWords(text, n) {
  return text.trim().split(/\s+/).slice(0, n).join(" ");
}

function capSentences(text, n) {
  const parts = text.match(/[^.!?]+[.!?]*/g) || [text];
  return parts.slice(0, n).join("").trim();
}

function normalizeAnswer(raw, mode) {
  let a = (raw || "").trim();
  if (mode === 'practice') {
    a = capSentences(a, 5);
    a = capWords(a, 120);
  } else {
    a = capSentences(a, 2);
    a = capWords(a, 70);
  }
  return a || "No tengo suficiente contexto para responder con precisión.";
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function callAnthropicWithRetry(client, payload, maxRetries = 4) {
  let lastErr;
  for (let i = 0; i <= maxRetries; i++) {
    try {
      return await client.messages.create(payload);
    } catch (e) {
      lastErr = e;
      const status = e?.status || e?.response?.status;

      if ((status === 529 || status === 429) && i < maxRetries) {
        const backoff = 400 * Math.pow(2, i);
        await sleep(backoff);
        continue;
      }

      if (status === 404 && i < maxRetries) {
        payload.model = "claude-haiku-4-5";
        await sleep(150);
        continue;
      }

      throw e;
    }
  }
  throw lastErr;
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const body = req.body || {};
    const question = String(body.question || "").trim();
    const mode = String(body.mode || 'live');
    if (!question) return res.status(400).json({ error: "Falta question" });

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(500).json({ error: "ANTHROPIC_API_KEY no configurada" });
    }

    const payload = {
      model: DEFAULT_MODEL,
      max_tokens: mode === 'practice' ? 400 : 220,
      system: mode === 'practice' ? SYSTEM_PRACTICE : SYSTEM,
      messages: [
        {
          role: "user",
          content: `${CANON}\n\nPregunta: ${question}\n\nResponde ahora:`,
        },
      ],
    };

    const msg = await callAnthropicWithRetry(client, payload);
    const raw = msg?.content?.[0]?.text || "";
    const answer = normalizeAnswer(raw, mode);

    return res.status(200).json({ answer });
  } catch (err) {
    const status = err?.status || 500;
    return res.status(500).json({ error: err?.message || String(err), status });
  }
};
