import React, { useState } from 'react'
import { motion } from 'framer-motion'
import { useAppStore } from '../store/AppStore'
import type { BodyType } from '../types'

const bodyTypes: { id: BodyType; label: string; icon: string; desc: string }[] = [
  { id: 'hourglass',         label: 'Hourglass',    icon: '⧗', desc: 'Shoulders ≈ hips, defined waist' },
  { id: 'pear',              label: 'Pear',          icon: '⬡', desc: 'Hips wider than shoulders'       },
  { id: 'apple',             label: 'Apple',         icon: '◎', desc: 'Fuller midsection'               },
  { id: 'rectangle',        label: 'Rectangle',     icon: '▭', desc: 'Shoulders ≈ waist ≈ hips'        },
  { id: 'inverted-triangle', label: 'Inv. Triangle', icon: '▽', desc: 'Shoulders wider than hips'       },
]

function getSizeForBodyType(height: number, weight: number, bodyType: BodyType) {
  const bmi = weight / ((height / 100) ** 2)
  let top = 'M'
  if (bmi < 18.5) top = 'S'
  else if (bmi < 25) top = 'M'
  else if (bmi < 29) top = 'L'
  else if (bmi < 33) top = 'XL'
  else top = 'XXL'

  const waistEst = weight * 0.42 + height * 0.08
  let bottom = '32'
  if (waistEst < 68) bottom = '28'
  else if (waistEst < 74) bottom = '30'
  else if (waistEst < 80) bottom = '32'
  else if (waistEst < 88) bottom = '34'
  else if (waistEst < 96) bottom = '36'
  else bottom = '38'

  let shoe = '8'
  if (height < 155) shoe = '5-6'
  else if (height < 163) shoe = '6-7'
  else if (height < 170) shoe = '7-8'
  else if (height < 178) shoe = '8-9'
  else shoe = '9-10'

  const tips: Record<BodyType, string> = {
    hourglass: 'Fitted & wrap styles. Belted waist. Form-fitting cuts.',
    pear: 'A-line skirts, boat neck tops, structured shoulders.',
    apple: 'Empire waist, wrap tops, V-necks, flowy fabrics.',
    rectangle: 'Belted styles, peplum tops, ruffles add curves.',
    'inverted-triangle': 'Wide-leg trousers, flared skirts, low-rise bottoms.',
  }

  return { top, bottom, shoe, tip: tips[bodyType] }
}

const BodyMetrics: React.FC = () => {
  const { setBodyMetrics, setStep, facialFeatures } = useAppStore()
  const [height, setHeight] = useState(165)
  const [weight, setWeight] = useState(60)
  const [bodyType, setBodyType] = useState<BodyType>('rectangle')
  const [unit, setUnit] = useState<'metric' | 'imperial'>('metric')

  const displayHeight = unit === 'metric'
    ? `${height} cm`
    : `${Math.floor(height / 30.48)}' ${Math.round((height % 30.48) / 2.54)}"`
  const displayWeight = unit === 'metric'
    ? `${weight} kg`
    : `${Math.round(weight * 2.205)} lbs`

  const sizes = getSizeForBodyType(height, weight, bodyType)

  const proceed = () => {
    const bmi = weight / ((height / 100) ** 2)
    const shoulderWidth = bmi < 22 ? 'narrow' : bmi < 27 ? 'medium' : 'broad'
    const hipWidth = bodyType === 'pear' || bodyType === 'hourglass' ? 'wide'
      : bodyType === 'rectangle' ? 'medium' : 'narrow'
    setBodyMetrics({ height, weight, bodyType, shoulderWidth, hipWidth })
    setStep('avatar')
  }

  return (
    <div className="body-metrics">
      <div className="step-label">STEP 02</div>
      <h2 className="panel-title">Body Profile</h2>
      <p className="panel-desc">We'll use these to recommend the perfect fit and build your avatar.</p>

      <div className="unit-toggle">
        <button className={unit === 'metric' ? 'active' : ''} onClick={() => setUnit('metric')}>Metric</button>
        <button className={unit === 'imperial' ? 'active' : ''} onClick={() => setUnit('imperial')}>Imperial</button>
      </div>

      <div className="slider-group">
        <div className="slider-row">
          <div className="slider-header">
            <span className="slider-label">Height</span>
            <span className="slider-value">{displayHeight}</span>
          </div>
          <input type="range" min={140} max={220} value={height}
            onChange={e => setHeight(+e.target.value)} className="custom-slider" />
          <div className="slider-range-labels"><span>140 cm</span><span>220 cm</span></div>
        </div>

        <div className="slider-row">
          <div className="slider-header">
            <span className="slider-label">Weight</span>
            <span className="slider-value">{displayWeight}</span>
          </div>
          <input type="range" min={35} max={150} value={weight}
            onChange={e => setWeight(+e.target.value)} className="custom-slider" />
          <div className="slider-range-labels"><span>35 kg</span><span>150 kg</span></div>
        </div>
      </div>

      <div className="body-type-section">
        <h3 className="section-title">Body Shape</h3>
        <div className="body-type-grid">
          {bodyTypes.map(bt => (
            <motion.button key={bt.id}
              whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.95 }}
              className={`body-type-card ${bodyType === bt.id ? 'selected' : ''}`}
              onClick={() => setBodyType(bt.id)}>
              <span className="bt-icon">{bt.icon}</span>
              <span className="bt-label">{bt.label}</span>
            </motion.button>
          ))}
        </div>
      </div>

      {/* Live size recommendation */}
      <div className="size-recommend">
        <div className="size-recommend-title">📐 Your Recommended Sizes</div>
        <div className="size-chips">
          <div className="size-chip">
            <span className="size-chip-label">Tops</span>
            <span className="size-chip-value">{sizes.top}</span>
          </div>
          <div className="size-chip">
            <span className="size-chip-label">Bottoms</span>
            <span className="size-chip-value">{sizes.bottom}"</span>
          </div>
          <div className="size-chip">
            <span className="size-chip-label">Shoes (IN)</span>
            <span className="size-chip-value">{sizes.shoe}</span>
          </div>
        </div>
        <p className="size-note">💡 {sizes.tip}</p>
      </div>

      {facialFeatures && (
        <div className="face-summary">
          <img src={facialFeatures.capturedImage} alt="" className="face-thumb" />
          <div className="face-summary-info">
            <div className="face-summary-label">Face Detected</div>
            <div className="face-summary-detail">
              {facialFeatures.faceShape} face · {facialFeatures.skinTone} skin · {facialFeatures.eyeColor} eyes
            </div>
          </div>
          <div className="face-summary-dot" style={{ background: facialFeatures.skinToneHex }} />
        </div>
      )}

      <motion.button
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.97 }}
        className="proceed-btn"
        onClick={proceed}
      >
        Build My Avatar →
      </motion.button>
    </div>
  )
}

export default BodyMetrics