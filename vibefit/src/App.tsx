import React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { AppProvider, useAppStore } from './store/AppStore'
import FaceCapture from './components/FaceCapture'
import BodyMetrics from './components/BodyMetrics'
import AvatarViewer from './components/AvatarViewer'
import ClothingPanel from './components/ClothingPanel'
import OutfitBar from './components/OutfitBar'

const steps = ['capture', 'body-metrics', 'avatar', 'tryOn'] as const

const StepIndicator: React.FC = () => {
  const { step } = useAppStore()
  const idx = steps.indexOf(step as typeof steps[number])
  return (
    <div className="step-indicator">
      {['Scan', 'Profile', 'Avatar', 'Try On'].map((label, i) => (
        <React.Fragment key={label}>
          <div className={`step-dot ${i <= idx ? 'done' : ''} ${i === idx ? 'active' : ''}`}>
            <span>{i < idx ? '✓' : i + 1}</span>
          </div>
          {i < 3 && <div className={`step-line ${i < idx ? 'done' : ''}`} />}
        </React.Fragment>
      ))}
    </div>
  )
}

const OnboardingView: React.FC = () => {
  const { step } = useAppStore()
  return (
    <div className="onboarding-layout">
      <div className="onboarding-brand">
        <div className="brand-logo">VIBE<span>FIT</span></div>
        <div className="brand-tagline">Your AI wardrobe, personalized.</div>
      </div>
      <StepIndicator />
      <div className="onboarding-card">
        <AnimatePresence mode="wait">
          {step === 'capture' && (
            <motion.div key="capture" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }}>
              <FaceCapture />
            </motion.div>
          )}
          {step === 'body-metrics' && (
            <motion.div key="body" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }}>
              <BodyMetrics />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

const TryOnView: React.FC = () => {
  const { wornItems, facialFeatures, bodyMetrics } = useAppStore()
  return (
    <div className="tryon-layout">
      <header className="tryon-header">
        <div className="brand-logo-sm">VIBE<span>FIT</span></div>
        <div className="avatar-info">
          {facialFeatures && (
            <div className="avatar-chips">
              <div className="info-chip">
                <div className="chip-swatch" style={{ background: facialFeatures.skinToneHex }} />
                {facialFeatures.skinTone}
              </div>
              <div className="info-chip">{facialFeatures.faceShape} face</div>
              {bodyMetrics && <div className="info-chip">{bodyMetrics.bodyType} build</div>}
              {bodyMetrics && <div className="info-chip">{bodyMetrics.height}cm</div>}
            </div>
          )}
        </div>
        <div className="header-actions">
          <span className="worn-count">{wornItems.length} on</span>
        </div>
      </header>

      <div className="tryon-main">
        <ClothingPanel side="left" />
        <div className="avatar-center">
          <AvatarViewer wornItems={wornItems} />
        </div>
        <ClothingPanel side="right" />
      </div>

      <AnimatePresence>
        {wornItems.length > 0 && <OutfitBar key="outfit-bar" />}
      </AnimatePresence>
    </div>
  )
}

const AppInner: React.FC = () => {
  const { step } = useAppStore()
  const isOnboarding = step === 'capture' || step === 'body-metrics'
  return (
    <div className="app-root">
      <div className="app-bg">
        <div className="bg-gradient-1" />
        <div className="bg-gradient-2" />
        <div className="bg-grid" />
      </div>
      <AnimatePresence mode="wait">
        {isOnboarding
          ? <motion.div key="onboard" style={{ position: 'relative', zIndex: 1 }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}><OnboardingView /></motion.div>
          : <motion.div key="tryon"   style={{ position: 'relative', zIndex: 1 }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}><TryOnView /></motion.div>
        }
      </AnimatePresence>
    </div>
  )
}

const App: React.FC = () => (
  <AppProvider>
    <AppInner />
  </AppProvider>
)

export default App