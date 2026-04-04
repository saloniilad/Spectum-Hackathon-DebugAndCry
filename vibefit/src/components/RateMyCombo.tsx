import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAppStore } from '../store/AppStore'

interface Breakdown {
  colorHarmony: number
  fitForBodyType: number
  styleCoherence: number
  occasionReadiness: number
}

interface RatingResult {
  score: number
  breakdown: Breakdown
  verdict: string
  reasoning: string
  tips: string[]
}

function scoreColor(n: number) {
  if (n >= 8) return '#1D9E75'
  if (n >= 6) return '#BA7517'
  return '#E24B4A'
}

function scoreLabel(n: number) {
  if (n >= 9) return 'Outfit goals'
  if (n >= 7) return 'Solid look'
  if (n >= 5) return 'Could be elevated'
  return 'Needs work'
}

const BREAKDOWN_LABELS: Record<keyof Breakdown, string> = {
  colorHarmony: 'Color harmony',
  fitForBodyType: 'Fit for body type',
  styleCoherence: 'Style coherence',
  occasionReadiness: 'Occasion readiness',
}

const GROQ_API_KEY = (import.meta as any).env.VITE_GROQ_API_KEY

export const RateMyCombo: React.FC = () => {
  const { wornItems, facialFeatures, bodyMetrics, getActiveSize } = useAppStore()
  const [result, setResult] = useState<RatingResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (wornItems.length < 2) return null

  const handleRate = async () => {
    setLoading(true)
    setResult(null)
    setError(null)

    const outfitDesc = wornItems
      .map(i => `${i.name} (${i.category}, size ${getActiveSize(i.id)}, color ${i.color})`)
      .join(', ')

    const personDesc = facialFeatures
      ? `${facialFeatures.skinTone} skin (${facialFeatures.skinUndertone ?? 'neutral'} undertone), ` +
        `${facialFeatures.faceShape} face, ${facialFeatures.eyeColor} eyes, ` +
        `${bodyMetrics?.bodyType ?? 'unknown'} body type, ` +
        `${bodyMetrics?.height ?? 165}cm, ${bodyMetrics?.weight ?? 60}kg`
      : 'no face data available'

    const prompt = `You are a professional fashion stylist. Rate this outfit from 1 to 10.

Outfit: ${outfitDesc}
Person: ${personDesc}

Return ONLY valid JSON, no markdown, no explanation:
{
  "score": <integer 1-10>,
  "breakdown": {
    "colorHarmony": <integer 1-10>,
    "fitForBodyType": <integer 1-10>,
    "styleCoherence": <integer 1-10>,
    "occasionReadiness": <integer 1-10>
  },
  "verdict": "<one punchy sentence, max 10 words>",
  "reasoning": "<2-3 sentences explaining the rating honestly>",
  "tips": ["<tip 1, max 8 words>", "<tip 2, max 8 words>", "<tip 3, max 8 words>"]
}`

    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${GROQ_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: [{ role: 'user', content: prompt }],
          response_format: { type: 'json_object' },
          temperature: 0.7,
        }),
      })

      if (!res.ok) {
        const errData = await res.json()
        throw new Error(errData?.error?.message ?? `HTTP ${res.status}`)
      }

      const data = await res.json()
      const clean = data.choices[0].message.content.replace(/```json|```/g, '').trim()
      setResult(JSON.parse(clean))
    } catch (e: any) {
      setError(e?.message ?? 'Something went wrong. Try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="rate-my-combo-wrap">
      <motion.button
        className={`rate-btn ${loading ? 'rate-btn--loading' : ''}`}
        whileHover={{ scale: loading ? 1 : 1.03 }}
        whileTap={{ scale: 0.96 }}
        onClick={handleRate}
        disabled={loading}
      >
        {loading
          ? <><span className="rate-spinner" /> Rating…</>
          : <><span className="rate-star">★</span> {result ? 'Re-rate' : 'Rate my combo'}</>
        }
      </motion.button>

      {error && (
        <div className="combo-error">{error}</div>
      )}

      <AnimatePresence>
        {result && (
          <motion.div
            className="combo-result"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
          >
            {/* Score */}
            <div className="combo-score-row">
              <div
                className="combo-score-circle"
                style={{ borderColor: scoreColor(result.score) }}
              >
                <span className="combo-score-num">{result.score}</span>
                <span className="combo-score-denom">/10</span>
              </div>
              <div>
                <div
                  className="combo-verdict-label"
                  style={{ color: scoreColor(result.score) }}
                >
                  {scoreLabel(result.score)}
                </div>
                <div className="combo-verdict-sub">{result.verdict}</div>
              </div>
            </div>

            {/* Breakdown bars */}
            <div className="combo-breakdown">
              {(Object.keys(result.breakdown) as (keyof Breakdown)[]).map(k => {
                const v = result.breakdown[k]
                return (
                  <div key={k} className="combo-b-item">
                    <div className="combo-b-label">{BREAKDOWN_LABELS[k]}</div>
                    <div className="combo-b-track">
                      <motion.div
                        className="combo-b-fill"
                        initial={{ width: 0 }}
                        animate={{ width: `${v * 10}%` }}
                        transition={{ duration: 0.5, ease: 'easeOut' }}
                        style={{ background: scoreColor(v) }}
                      />
                    </div>
                    <span className="combo-b-score">{v}/10</span>
                  </div>
                )
              })}
            </div>

            {/* Reasoning */}
            <p className="combo-reasoning">{result.reasoning}</p>

            {/* Tips */}
            <div className="combo-tips">
              {result.tips.map((t, i) => (
                <span key={i} className="combo-tip">{t}</span>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default RateMyCombo