// api/answer.js
// Anthropic (Claude) — Data Interview Prep Assistant
// Covers: Python, SQL, ML, Stats, Data Engineering, System Design, Behavioural
// Hard caps: max 3 sentences + 90 words — concise, interview-ready answers

const Anthropic = require("@anthropic-ai/sdk");

// ====== SYSTEM PROMPT ======
const SYSTEM = `Eres un experto en entrevistas técnicas de Data Analyst y Data Scientist con 15 años de experiencia en industria.

Rol: preparar al candidato para superar entrevistas técnicas reales — no dar clases teóricas.

Reglas de respuesta:
- Máximo 3 frases y 90 palabras.
- Responde siempre en español natural, directo, como si estuvieras en una sesión de coaching.
- Primero la respuesta correcta y concisa. Luego, si cabe, un matiz o trampa habitual de entrevista.
- Cuando el concepto lo requiera, incluye un fragmento de código corto (Python o SQL) inline — nunca bloques largos.
- Nunca enumeres más de 3 puntos. Nunca uses bullet points.
- Si la pregunta es ambigua, elige la interpretación más habitual en entrevistas y responde.
- Prioriza ejemplos concretos sobre definiciones abstractas.
- Alerta al candidato si la pregunta es una trampa clásica de entrevista.`;

// ====== CANON — conocimiento de referencia ======
const CANON = `DOMINIO TÉCNICO DE REFERENCIA:

PYTHON:
- Pandas: iloc vs loc, vectorización vs apply, merge vs join, groupby+agg, pivot_table, memory_usage
- NumPy: broadcasting, fancy indexing, np.where, operaciones vectorizadas vs loops
- Comprehensions vs generators: memoria, lazy evaluation
- Decoradores, context managers, type hints, dataclasses
- OOP aplicado a datos: herencia, composición, dunder methods
- Testing: pytest, fixtures, mock, parametrize
- Performance: profiling con cProfile/line_profiler, Numba, multiprocessing vs threading (GIL)
- Librerías: scikit-learn pipelines, joblib, pydantic, polars como alternativa a pandas

SQL:
- Window functions: ROW_NUMBER, RANK, DENSE_RANK, LAG, LEAD, NTILE, FIRST_VALUE
- CTEs vs subqueries vs temp tables: rendimiento y legibilidad
- EXPLAIN / EXPLAIN ANALYZE: interpretar query plans
- Índices: B-tree, hash, compuesto, covering index, cuándo no indexar
- Joins: INNER, LEFT, CROSS, SELF JOIN, anti-join con NOT EXISTS
- Aggregations: GROUP BY, HAVING, ROLLUP, GROUPING SETS
- NULL handling: COALESCE, NULLIF, comportamiento en aggregations
- BigQuery específico: partitioning, clustering, ARRAY_AGG, UNNEST, STRUCT
- Optimización: evitar SELECT *, predicado pushdown, materializar CTEs en BigQuery

MACHINE LEARNING:
- Bias-variance tradeoff: underfitting vs overfitting, regularización L1/L2
- Cross-validation: k-fold, stratified, time-series split (no leak)
- Métricas: accuracy vs precision/recall/F1 vs AUC-ROC vs PR curve — cuándo usar cada una
- Árboles: CART, Random Forest (bagging), Gradient Boosting (boosting secuencial), XGBoost/LightGBM
- Regularización: Ridge, Lasso, ElasticNet, early stopping en boosting
- Feature engineering: encoding (OHE, target encoding, embeddings), scaling, imputación
- Feature importance: permutation importance vs SHAP vs coeficientes — diferencias críticas
- Imbalanced data: SMOTE, class_weight, threshold tuning, métricas adecuadas
- Pipelines sklearn: ColumnTransformer, Pipeline, GridSearchCV, cross_val_score
- Clustering: K-means (inercia, elbow), DBSCAN (eps, min_samples), evaluación silhouette
- Series temporales: train/test split temporal, walk-forward validation, ARIMA vs Prophet vs ML

ESTADÍSTICA:
- Hipótesis nula, p-valor, tipo I y II, potencia estadística
- A/B testing: tamaño muestral, multiple testing (Bonferroni, FDR), efecto mínimo detectable
- Correlación vs causalidad: confounding, Simpson's paradox
- Distribuciones: Normal, Binomial, Poisson, aplicaciones prácticas
- Regresión lineal: supuestos (OLS), multicolinealidad (VIF), heterocedasticidad
- Intervalos de confianza vs p-valor: interpretación correcta vs errores comunes

DATA ENGINEERING / STACK:
- ETL vs ELT: cuándo cada uno, dbt como transformación en warehouse
- Data warehouse vs data lake vs lakehouse
- Airflow: DAGs, operadores, XComs, retries, SLAs
- BigQuery: arquitectura columnar, slots, coste por bytes escaneados
- Partitioning vs clustering en BigQuery: cuándo y cómo
- dbt: models, tests (not_null, unique, relationships), macros, lineage
- Streaming vs batch: Kafka, Pub/Sub, casos de uso

SYSTEM DESIGN PARA DATOS:
- Diseñar un pipeline de recomendación a escala
- Diseñar un sistema de detección de anomalías en tiempo real
- Diseñar un feature store
- Trade-offs: consistencia vs disponibilidad, latencia vs throughput

PREGUNTAS TRAMPA CLÁSICAS:
- "¿Cuándo usarías un Random Forest vs Gradient Boosting?" — no hay una respuesta única, depende de datos, interpretabilidad y tiempo de inferencia
- "¿El p-valor es la probabilidad de que H0 sea cierta?" — NO. Es P(datos|H0). Error muy habitual.
- "¿iloc vs loc en pandas?" — iloc es posicional (enteros), loc es por etiqueta. Trampas con reindex.
- "¿Cuándo no usarías accuracy?" — clases desbalanceadas, costes asimétricos de error
- "SHAP vs feature importance de Random Forest" — RF importance tiene sesgo hacia variables de alta cardinalidad; SHAP es más fiable
- "LEFT JOIN vs LEFT OUTER JOIN" — son idénticos en SQL estándar
- "¿La correlación de Pearson detecta relaciones no lineales?" — NO. Usar Spearman o mutual information.

PROYECTOS DE REFERENCIA DEL CANDIDATO (Manuel García Molledo):
- SME Benchmark: ETL Python sobre Central de Balances BdE → SQLite → dashboard HTML interactivo con Chart.js. Ratios ROA, ROE, EBITDA%, leverage por sector y tamaño.
- Health Analytics TFM: panel 40 países 2000-2019, KNN imputation (k=5), Gradient Boosting R2=0.986, TWFE, DiD (Tailandia UCS 2002 +1.6y), SHAP (pobreza 54.8%, GDP 27.1%), eficiencia frontier.
- Power BI MCP Server: automatización de scaffold PBIP y creación de visuales vía MCP tools.
- Stack: Python, pandas, scikit-learn, SQL, BigQuery, Power BI, Tableau, dbt.`;

// ====== UTILS ======
function capWords(text, n) {
  return text.trim().split(/\s+/).slice(0, n).join(" ");
}

function capSentences(text, n) {
  const parts = text.match(/[^.!?]+[.!?]*/g) || [text];
  return parts.slice(0, n).join("").trim();
}

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
      model: "claude-haiku-4-5-20251001",
      max_tokens: 300,
      system: SYSTEM,
      messages: [{ role: "user", content: `${CANON}\n\nPregunta de entrevista: ${question}` }],
    };

    const msg = await callWithRetry(() => client.messages.create(payload), {
      retries: 5,
      baseMs: 350,
      maxMs: 4000,
    });

    let answer = msg.content?.[0]?.text ?? "Sin respuesta.";
    answer = capSentences(answer, 3);
    answer = capWords(answer, 90);

    return res.status(200).json({ answer, model: payload.model });
  } catch (err) {
    const status = err?.status ?? err?.response?.status ?? 500;
    return res.status(status).json({
      error: err?.message || "Error al llamar a Anthropic",
      retryable: isRetryable(err),
    });
  }
};

