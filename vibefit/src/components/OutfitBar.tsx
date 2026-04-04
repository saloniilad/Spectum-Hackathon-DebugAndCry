import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAppStore } from '../store/AppStore'

const OutfitBar: React.FC = () => {
  const { wornItems, toggleWornItem, getActiveSize, setItemSize, getRecommendedSize } = useAppStore()
  const [saved, setSaved] = useState(false)
  const total = wornItems.reduce((sum, i) => sum + (i.price ?? 0), 0)

  if (wornItems.length === 0) return null

  const handleSave = () => {
    setSaved(true)
    setTimeout(() => setSaved(false), 2200)
  }

  return (
    <motion.div
      className="outfit-dock"
      initial={{ y: 100, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 100, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 260, damping: 25 }}
    >
      <div className="dock-items scrollbar-hide">
        <AnimatePresence>
          {wornItems.map(item => {
            const activeSize = getActiveSize(item.id)
            const recSize = getRecommendedSize(item.id)
            return (
              <motion.div
                key={item.id}
                className="dock-chip"
                initial={{ scale: 0.8, opacity: 0, width: 0 }}
                animate={{ scale: 1, opacity: 1, width: 'auto' }}
                exit={{ scale: 0.8, opacity: 0, width: 0 }}
              >
                <div className="chip-color" style={{ background: item.color }} />
                <div className="chip-info">
                  <span className="chip-name">{item.name}</span>
                  {/* Inline size switcher */}
                  <div className="chip-sizes">
                    {(['S', 'M', 'L'] as const).map(sz => (
                      <button
                        key={sz}
                        className={`chip-size-btn ${activeSize === sz ? 'active' : ''}`}
                        onClick={() => setItemSize(item.id, sz)}
                        title={sz === recSize ? `AI recommended size` : sz}
                      >
                        {sz}{sz === recSize ? '★' : ''}
                      </button>
                    ))}
                  </div>
                </div>
                <button className="chip-remove" onClick={() => toggleWornItem(item)}>×</button>
              </motion.div>
            )
          })}
        </AnimatePresence>
      </div>

      <div className="dock-checkout">
        <div className="dock-total">
          <span className="total-label">Total</span>
          <span className="total-amount">₹{(total * 83.5).toFixed(0)}</span>
        </div>
        <motion.button
          whileHover={{ scale: 1.04 }}
          whileTap={{ scale: 0.96 }}
          className={`checkout-btn ${saved ? 'saved' : ''}`}
          onClick={handleSave}
        >
          {saved ? 'Added to Cart ✓' : 'Shop Look'}
        </motion.button>
      </div>
    </motion.div>
  )
}

export default OutfitBar