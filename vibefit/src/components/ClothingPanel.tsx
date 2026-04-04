import React, { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAppStore, clothingCatalog } from '../store/AppStore'
import type { ClothingItem } from '../types'

type Category = 'tops' | 'bottoms' | 'shoes' | 'accessories'

const categories: { id: Category; label: string; icon: string }[] = [
  { id: 'tops',        label: 'Tops',     icon: '👕' },
  { id: 'bottoms',     label: 'Bottoms',  icon: '👗' },
  { id: 'shoes',       label: 'Shoes',    icon: '👟' },
  { id: 'accessories', label: 'Extras',   icon: '🧣' },
]

function getRecommendedColors(skinUndertone?: string): string[] {
  if (skinUndertone === 'warm') return ['#D4A017', '#FF6B6B', '#8FAF88', '#C3A882', '#8B1A1A']
  if (skinUndertone === 'cool') return ['#1B3A6B', '#2A8A8A', '#7A1A2A', '#3B5998', '#111111']
  return ['#1A1A1A', '#F8F8F5', '#3B5998', '#8FAF88', '#C3A882']
}

function isColorSimilar(hex1: string, hex2: string, threshold = 80): boolean {
  try {
    const parse = (h: string) => {
      const c = h.replace('#', '')
      return [parseInt(c.slice(0, 2), 16), parseInt(c.slice(2, 4), 16), parseInt(c.slice(4, 6), 16)]
    }
    const [r1, g1, b1] = parse(hex1)
    const [r2, g2, b2] = parse(hex2)
    return Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2) < threshold
  } catch { return false }
}

// ─── Size selector chip ───────────────────────────────────────────────────────
const SizeChip: React.FC<{
  size: 'S' | 'M' | 'L'
  active: boolean
  recommended: boolean
  onClick: () => void
}> = ({ size, active, recommended, onClick }) => (
  <motion.button
    whileTap={{ scale: 0.88 }}
    onClick={e => { e.stopPropagation(); onClick() }}
    className={`size-chip ${active ? 'size-active' : ''} ${recommended && !active ? 'size-rec' : ''}`}
    title={recommended ? `AI recommends ${size}` : size}
  >
    {size}
    {recommended && <span className="size-star">★</span>}
  </motion.button>
)

// ─── Clothing card ────────────────────────────────────────────────────────────
const ClothingCard: React.FC<{ item: ClothingItem; colorRecommended?: boolean }> = ({ item, colorRecommended }) => {
  const { toggleWornItem, isWorn, getRecommendedSize, getActiveSize, setItemSize } = useAppStore()
  const worn = isWorn(item.id)
  const recSize = getRecommendedSize(item.id)
  const activeSize = getActiveSize(item.id)

  return (
    <motion.div
      className={`clothing-card ${worn ? 'worn' : ''}`}
      whileHover={{ scale: 1.02, translateY: -4 }}
      whileTap={{ scale: 0.95 }}
      onClick={() => toggleWornItem(item)}
      layout
    >
      {/* Color preview */}
      <div className="card-visual">
        <div className="color-preview" style={{ background: item.color }}>
          <div className="color-shine" />
          {/* GLB indicator */}
          {item.glbPath && (
            <div className="glb-badge" title="3D model available">3D</div>
          )}
        </div>
        {colorRecommended && !worn && (
          <div className="ai-badge">✨ AI PICK</div>
        )}
        {worn && (
          <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="worn-badge">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </motion.div>
        )}
      </div>

      {/* Info */}
      <div className="card-info">
        <div className="card-header">
          <span className="card-brand">{item.brand}</span>
          {item.price && <span className="card-price">₹{(item.price * 83.5).toFixed(0)}</span>}
        </div>
        <div className="card-name">{item.name}</div>

        {/* Size selector */}
        <div className="size-selector" onClick={e => e.stopPropagation()}>
          {(['S', 'M', 'L'] as const).map(sz => (
            <SizeChip
              key={sz}
              size={sz}
              active={activeSize === sz}
              recommended={recSize === sz}
              onClick={() => setItemSize(item.id, sz)}
            />
          ))}
          <span className="size-ai-label">AI: {recSize}</span>
        </div>
      </div>
    </motion.div>
  )
}

// ─── Main panel ───────────────────────────────────────────────────────────────
const ClothingPanel: React.FC<{ side: 'left' | 'right' }> = ({ side }) => {
  const { wornItems, facialFeatures } = useAppStore()
  const panelCategories = side === 'left' ? categories.slice(0, 2) : categories.slice(2, 4)
  const [localActive, setLocalActive] = useState<Category>(panelCategories[0].id)

  const recommendedColors = useMemo(() =>
    getRecommendedColors(facialFeatures?.skinUndertone),
    [facialFeatures?.skinUndertone]
  )

  const filteredItems = clothingCatalog.filter(i => i.category === localActive)

  const sortedItems = useMemo(() =>
    [...filteredItems].sort((a, b) => {
      const aRec = recommendedColors.some(c => isColorSimilar(a.color, c))
      const bRec = recommendedColors.some(c => isColorSimilar(b.color, c))
      return aRec === bRec ? 0 : aRec ? -1 : 1
    }),
    [filteredItems, recommendedColors]
  )

  return (
    <motion.div
      className={`clothing-panel glass-panel panel-${side}`}
      initial={{ x: side === 'left' ? -50 : 50, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={{ type: 'spring', damping: 20, stiffness: 100 }}
    >
      <div className="panel-tabs">
        {panelCategories.map(cat => (
          <button key={cat.id}
            className={`panel-tab ${localActive === cat.id ? 'active' : ''}`}
            onClick={() => setLocalActive(cat.id)}
          >
            <span className="tab-icon">{cat.icon}</span>
            <span className="tab-label">{cat.label}</span>
            {wornItems.some(w => w.category === cat.id) && <span className="tab-indicator" />}
          </button>
        ))}
      </div>

      <div className="panel-content scrollbar-hide">
        <AnimatePresence mode="wait">
          <motion.div key={localActive}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="clothes-grid"
          >
            {sortedItems.length > 0
              ? sortedItems.map(item => (
                  <ClothingCard
                    key={item.id}
                    item={item}
                    colorRecommended={recommendedColors.some(c => isColorSimilar(item.color, c))}
                  />
                ))
              : (
                <div className="empty-state">
                  <span className="empty-icon">🧺</span>
                  <p>More styles dropping soon</p>
                </div>
              )
            }
          </motion.div>
        </AnimatePresence>
      </div>
    </motion.div>
  )
}

export default ClothingPanel