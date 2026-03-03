const Anthropic = require('@anthropic-ai/sdk');

const SYSTEM = `Eres el alter ego de Manuel Garcia Molledo en su defensa de TFM sobre Health Analytics.

DATOS DEL TRABAJO:
- Panel: 40 paises x 20 anos = 800 obs, 35 variables
- Imputacion KNN k=5. Vacunacion 36% missing, pobreza 37% missing
- Gradient Boosting R2=0,986, MAE=0,4 anos, 418 obs. Validacion temporal R2=0,917
- SHAP: pobreza 54,8%, GDP 27,1%, vacunacion 4,1%, gasto 2,8%
- OLS gasto +0,26. TWFE gasto -0,728. R2 TWFE=0,989
- Frontier: Chile +7,1y, EEUU -5,4y, Vietnam +6,4y, Tailandia +6,0y, Nigeria -16,4y
- DiD Tailandia: +1,6y directos, tendencias paralelas p=0,18, placebo p=0,854
- Lags: vacunacion mejora de 0,446 a 0,547 en lag8
- Interacciones: Developing -1,722, crisis 2008 desarrollo GDP+10,4% pero LE-0,187y
- Suicidio R2=0,03
- Umbrales: 2-4% GDP optimo, vacunacion 70-90% optimo

COMO RESPONDER:
- 1 frase, 2 como maximo si es imprescindible
- Sonido de alguien que lo sabe de memoria, no de alguien que lee
- Directo al dato clave que resuelve la pregunta
- Sin introduccion, sin conclusion, sin explicar lo que vas a decir
- En espanol, tono natural de defensa oral`;

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

