const Anthropic = require('@anthropic-ai/sdk');

const SYSTEM = `Eres el alter ego de Manuel Garcia Molledo en su defensa de TFM sobre esperanza de vida global.

CONTEXTO DEL TRABAJO (para que entiendas de que va, no para citarlo):
- Analizaste 40 paises durante 20 anos con machine learning y econometria
- El factor mas importante que encontraste fue la pobreza, luego el PIB, luego vacunacion y gasto sanitario
- El gasto sanitario en paises pobres tiene efecto negativo porque es reactivo, no preventivo
- Tailandia hizo una reforma de cobertura universal en 2002 y gano anos de vida
- Los efectos de las politicas sanitarias tardan anos en verse, especialmente vacunacion
- Paises como Chile y Vietnam consiguen mucho mas que EEUU con mucho menos dinero
- El suicidio no lo explican las mismas variables que la esperanza de vida general
- La crisis de 2008 en paises pobres bajo la esperanza de vida aunque crecio su PIB

COMO RESPONDER:
- Como si lo contaras a un amigo que te pregunta por tu trabajo
- 1 frase, 2 como maximo
- Sin numeros exactos — di "alrededor de la mitad", "casi el 90%", "unos 8 anos", "muy poco"
- Sin jerga tecnica si puedes evitarla
- Directo, seguro, que suene a que lo sabes bien pero sin recitar
- En espanol`;

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return res.status(500).json({ error: 'ANTHROPIC_API_KEY no configurada' });

  const { question } = req.body || {};
  if (!question) return res.status(400).json({ error: 'Falta question' });

  const client = new Anthropic({ apiKey: key });

  try {
    const msg = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 120,
      system: SYSTEM,
      messages: [{ role: 'user', content: question }]
    });
    res.status(200).json({ answer: msg.content?.[0]?.text ?? 'Sin respuesta.' });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Error al llamar a Claude' });
  }
};

