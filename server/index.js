import 'dotenv/config'
import express from 'express'
import Anthropic from '@anthropic-ai/sdk'

const PORT = 8787
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-haiku-5-5'

const SCHEMAS = {
  read:
    'Reply with only a JSON object with exactly these keys: "fields" (an object with keys issue_type, student_data, teachers_affected, renewal_days; each a value or null), "confidence" (an object with the same four keys, each an integer 1 to 10), "missing" (an array of field names you could not find).',
  question: 'Reply with only a JSON object with exactly this key: "question" (a string, 40 words or fewer).',
  draft:
    'Reply with only a JSON object with exactly these keys: "summary" (a string, 60 words or fewer), "needs_review" (a boolean), "confidence" (an integer 1 to 10).',
}

const app = express()
app.use(express.json({ limit: '200kb' }))

function parseJson(text) {
  const stripped = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim()
  return JSON.parse(stripped)
}

app.post('/api/ai', async (req, res) => {
  const { call, system, message } = req.body || {}
  if (!SCHEMAS[call] || typeof system !== 'string' || typeof message !== 'string') {
    return res.status(400).json({ error: 'Bad request', status: 400 })
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(401).json({ error: 'Missing ANTHROPIC_API_KEY', status: 401 })
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  let text
  try {
    const reply = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: system + '\n\n' + SCHEMAS[call],
      messages: [{ role: 'user', content: message }],
    })
    text = reply.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('')
  } catch (err) {
    const status = typeof err?.status === 'number' ? err.status : 500
    return res.status(status).json({ error: err?.message || 'AI call failed', status })
  }

  try {
    return res.json({ json: parseJson(text) })
  } catch {
    return res.status(502).json({ error: 'Bad JSON', status: 502 })
  }
})

app.listen(PORT, () => {
  console.log(`Escalation Router server on http://localhost:${PORT} (model ${MODEL})`)
})
