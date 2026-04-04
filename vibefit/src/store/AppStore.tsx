import React, { createContext, useContext, useState, type ReactNode } from 'react'
import type { FacialFeatures, BodyMetrics, AppStep, ClothingItem } from '../types'

interface SizeRecommendation {
  top: string
  bottom: string
  shoe: string
  notes: string
}

interface AppState {
  step: AppStep
  facialFeatures: FacialFeatures | null
  bodyMetrics: BodyMetrics | null
  wornItems: ClothingItem[]
  language: string
  sizeRecommendation: SizeRecommendation | null
  setStep: (step: AppStep) => void
  setFacialFeatures: (f: FacialFeatures) => void
  setBodyMetrics: (b: BodyMetrics) => void
  toggleWornItem: (item: ClothingItem) => void
  isWorn: (id: string) => boolean
  setLanguage: (lang: string) => void
  getRecommendedSize: (itemId: string) => 'S' | 'M' | 'L'
  getActiveSize: (itemId: string) => 'S' | 'M' | 'L'
  setItemSize: (itemId: string, size: 'S' | 'M' | 'L') => void
}

const AppContext = createContext<AppState | null>(null)

function computeSizeRecommendation(metrics: BodyMetrics): SizeRecommendation {
  const bmi = metrics.weight / ((metrics.height / 100) ** 2)
  const h = metrics.height

  let top = 'M'
  if (bmi < 18.5 || (h < 160 && bmi < 22)) top = 'S'
  else if (bmi > 27 || (h > 175 && bmi > 24)) top = 'L'
  else if (bmi > 32) top = 'XL'
  else if (bmi > 36) top = 'XXL'

  let bottom = '32'
  const waistEst = metrics.weight * 0.42 + metrics.height * 0.08
  if (waistEst < 68) bottom = '28'
  else if (waistEst < 74) bottom = '30'
  else if (waistEst < 80) bottom = '32'
  else if (waistEst < 88) bottom = '34'
  else if (waistEst < 96) bottom = '36'
  else bottom = '38+'

  let shoe = '8'
  if (h < 155) shoe = '5-6'
  else if (h < 163) shoe = '6-7'
  else if (h < 170) shoe = '7-8'
  else if (h < 178) shoe = '8-9'
  else shoe = '9-10'

  const notes = metrics.bodyType === 'hourglass'
    ? 'Fitted styles work great for your balanced proportions.'
    : metrics.bodyType === 'pear'
    ? 'A-line cuts and boat necks will beautifully balance your silhouette.'
    : metrics.bodyType === 'apple'
    ? 'Empire waist and wrap styles will flatter your figure.'
    : metrics.bodyType === 'inverted-triangle'
    ? 'Wide-leg pants and full skirts add balance to broader shoulders.'
    : 'Belted styles help define your waist. Most silhouettes work well!'

  return { top, bottom, shoe, notes }
}

/** Derive S/M/L recommendation from body metrics */
function deriveClothingSize(metrics: BodyMetrics | null, category: ClothingItem['category']): 'S' | 'M' | 'L' {
  if (!metrics) return 'M'
  const bmi = metrics.weight / ((metrics.height / 100) ** 2)
  const h = metrics.height

  if (category === 'shoes') {
    if (h < 163) return 'S'
    if (h < 175) return 'M'
    return 'L'
  }
  if (category === 'bottoms') {
    const waist = metrics.weight * 0.42 + metrics.height * 0.08
    if (waist < 72) return 'S'
    if (waist < 85) return 'M'
    return 'L'
  }
  // tops, accessories, dresses
  if (bmi < 20 || (h < 158 && bmi < 23)) return 'S'
  if (bmi > 27 || (h > 175 && bmi > 25)) return 'L'
  return 'M'
}

// ─── GLB paths mapping (served from /uploads/ or public folder) ───────────────
// In a real app these would be served from /public/models/ — here we point to uploads
const GLB_BASE = '/public'

export const clothingCatalog: ClothingItem[] = [
  // ── TOPS ──
  { id: 'tshirt-lp',       name: 'Low Poly Tee',           category: 'tops',        thumbnail: '', color: '#F8F8F5', brand: 'VIBE',      price: 29,  glbPath: `${GLB_BASE}/t-shirt_low_poly.glb`                   },
  { id: 'tshirt-lp2',      name: 'Classic Tee',             category: 'tops',        thumbnail: '', color: '#1A1A1A', brand: 'VIBE',      price: 29,  glbPath: `${GLB_BASE}/t-shirt___lp.glb`                       },
  { id: 'tshirt-T1',       name: 'Street Tee Vol.1',        category: 'tops',        thumbnail: '', color: '#FF6B6B', brand: 'VIBE',      price: 35,  glbPath: `${GLB_BASE}/T_Shirt__1_.glb`                        },
  { id: 'tshirt-T2',       name: 'Street Tee Vol.2',        category: 'tops',        thumbnail: '', color: '#1B3A6B', brand: 'VIBE',      price: 35,  glbPath: `${GLB_BASE}/T-shirt.glb`                            },
  { id: 'shirt-classic',   name: 'Classic Shirt',           category: 'tops',        thumbnail: '', color: '#FAFAF7', brand: 'DESI DRIP', price: 59,  glbPath: `${GLB_BASE}/shirt.glb`                              },
  { id: 'shirt-oversize',  name: 'Oversize Shirt + Tie',    category: 'tops',        thumbnail: '', color: '#2E4A7A', brand: 'DESI DRIP', price: 69,  glbPath: `${GLB_BASE}/low_poly_woman_oversize_shirt_with_tie.glb`},

  // ── BOTTOMS ──
  { id: 'pant-woven',      name: 'Woven Fashion Pant',      category: 'bottoms',     thumbnail: '', color: '#C3A882', brand: 'CASUALS',   price: 49,  glbPath: `${GLB_BASE}/women_fashionable_woven_pant.glb`        },
  { id: 'pant-floral',     name: 'Flower Print Pant',       category: 'bottoms',     thumbnail: '', color: '#8FAF88', brand: 'BLOOM',     price: 55,  glbPath: `${GLB_BASE}/women_flower_printed_fashion_pant.glb`   },

  // ── DRESSES ──
  { id: 'dress-woman',     name: 'Casual Dress',            category: 'bottoms',     thumbnail: '', color: '#D4A017', brand: 'LUXE',      price: 89,  glbPath: `${GLB_BASE}/low_poly_woman_dress.glb`               },
  { id: 'dress-business',  name: 'Business Dress',          category: 'bottoms',     thumbnail: '', color: '#1C1C1C', brand: 'EXEC',      price: 119, glbPath: `${GLB_BASE}/futuristic_business_dress.glb`          },
  { id: 'dress-black',     name: 'Black Long Dress',        category: 'bottoms',     thumbnail: '', color: '#111111', brand: 'NOIR',      price: 99,  glbPath: `${GLB_BASE}/black_long_dress_low_poly_mesh.glb`     },
  { id: 'dress-skirt',     name: 'Skirt Dress',             category: 'bottoms',     thumbnail: '', color: '#C02020', brand: 'CHIC',      price: 79,  glbPath: `${GLB_BASE}/low_poly_female_skirt_dress.glb`        },

  // ── SHOES ──
  { id: 'shoes-lp3d',      name: 'Sport Sneakers',          category: 'shoes',       thumbnail: '', color: '#F5F5F0', brand: 'STRIDE',    price: 89,  glbPath: `${GLB_BASE}/low_poly_3d_shoes.glb`                  },
  { id: 'shoes-boots',     name: 'Low-Poly Boots',          category: 'shoes',       thumbnail: '', color: '#111111', brand: 'STRIDE',    price: 109, glbPath: `${GLB_BASE}/boots_low-poly_shoes.glb`               },
  { id: 'shoes-lp',        name: 'Casual Shoes',            category: 'shoes',       thumbnail: '', color: '#C4A882', brand: 'STRIDE',    price: 79,  glbPath: `${GLB_BASE}/shoes_low_poly.glb`                     },
]

export const AppProvider = ({ children }: { children: ReactNode }) => {
  const [step, setStep] = useState<AppStep>('capture')
  const [facialFeatures, setFacialFeatures] = useState<FacialFeatures | null>(null)
  const [bodyMetrics, setBodyMetrics] = useState<BodyMetrics | null>(null)
  const [wornItems, setWornItems] = useState<ClothingItem[]>([])
  const [language, setLanguage] = useState('en')
  const [sizeRecommendation, setSizeRecommendation] = useState<SizeRecommendation | null>(null)
  // itemId → chosen size
  const [itemSizes, setItemSizes] = useState<Record<string, 'S' | 'M' | 'L'>>({})

  const setBodyMetricsWithSize = (b: BodyMetrics) => {
    setBodyMetrics(b)
    setSizeRecommendation(computeSizeRecommendation(b))
  }

  const toggleWornItem = (item: ClothingItem) => {
    setWornItems(prev => {
      const existingInCategory = prev.find(w => w.category === item.category)
      if (existingInCategory?.id === item.id) return prev.filter(w => w.id !== item.id)
      return [...prev.filter(w => w.category !== item.category), item]
    })
  }

  const isWorn = (id: string) => wornItems.some(w => w.id === id)

  const getRecommendedSize = (itemId: string): 'S' | 'M' | 'L' => {
    const item = clothingCatalog.find(i => i.id === itemId)
    if (!item) return 'M'
    return deriveClothingSize(bodyMetrics, item.category)
  }

  const getActiveSize = (itemId: string): 'S' | 'M' | 'L' => {
    return itemSizes[itemId] ?? getRecommendedSize(itemId)
  }

  const setItemSize = (itemId: string, size: 'S' | 'M' | 'L') => {
    setItemSizes(prev => ({ ...prev, [itemId]: size }))
  }

  return (
    <AppContext.Provider value={{
      step, facialFeatures, bodyMetrics, wornItems, language, sizeRecommendation,
      setStep, setFacialFeatures,
      setBodyMetrics: setBodyMetricsWithSize,
      toggleWornItem, isWorn, setLanguage,
      getRecommendedSize, getActiveSize, setItemSize,
    }}>
      {children}
    </AppContext.Provider>
  )
}

export const useAppStore = () => {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useAppStore must be inside AppProvider')
  return ctx
}