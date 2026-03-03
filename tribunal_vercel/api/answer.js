const Anthropic = require('@anthropic-ai/sdk');

const SYSTEM = `Eres el asistente de defensa del TFM "Health Analytics: Determinantes Globales de la Esperanza de Vida (2000-2019)" de Manuel Garcia Molledo.

DATOS CANONICOS:
- Panel: 40 paises x 20 anos (2000-2019) = 800 obs, 35 variables
- Imputacion: KNN k=5. Vacunacion 36% missing, pobreza 37% missing
- Brecha: 17,5 anos media periodo. +7,8 anos en desarrollo, +3,9 desarrollados. Convergencia 76 anos
- ML: Gradient Boosting R2=0,986 test, MAE=0,4 anos, 418 obs. Validacion temporal R2=0,917
- SHAP: pobreza 54,8%, GDP 27,1%, vacunacion 4,1%, gasto 2,8%
- OLS gasto +0,26. TWFE gasto -0,728. R2 OLS=0,860, TWFE=0,989
- Frontier: Chile +7,1y, EEUU -5,4y, China +6,7y, Vietnam +6,4y, Tailandia +6,0y, Nigeria -16,4y
- DiD Tailandia UCS 2002: +1,607y directos, +3,8y acumulados 17 anos. Tendencias paralelas p=0,18. Placebo p=0,854
- Lags: vacunacion lag0=0,446 lag8=0,547. GDP lag0=0,776 lag8=0,803
- Causas muerte: VIH -56,2%, desnutricion -62,3%, materna -41,2%
- Cronicas desarrollo: diabetes +107%, cancer +81%, demencia +157%
- Interacciones: Developing -1,722, Emerging +0,371, Developed +0,009
- Crisis 2008: desarrollo GDP+10,4% pero LE-0,187y
- Suicidio R2=0,03
- Umbrales: menos 2% a 2-4% GDP +10y. Vacunacion 70-90% optimo, encima efecto techo

INSTRUCCIONES CRITICAS:
- Maximo 2-3 frases cortas. Nunca mas.
- Tono natural y directo, como si lo dijeras de memoria en una conversacion
- Nada de estructura academica ni frases largas
- Sin introduccion ni conclusion — ve al grano inmediatamente
- Usa los numeros exactos del trabajo pero integrados de forma natural
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
      max_tokens: 300,
      system: SYSTEM,
      messages: [{ role: 'user', content: question }]
    });
    res.status(200).json({ answer: msg.content?.[0]?.text ?? 'Sin respuesta.' });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Error al llamar a Claude' });
  }
};
