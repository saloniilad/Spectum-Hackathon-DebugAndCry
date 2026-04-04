export interface FacialFeatures {
  skinTone: string
  skinToneHex: string
  eyeShape: string
  eyeColor: string
  faceShape: string
  noseType: string
  lipShape: string
  faceWidth: number
  faceHeight: number
  eyeSpacing: number
  capturedImage: string
  // Extended fields from Claude vision analysis
  gender?: string
  hairColor?: string
  hasHair?: boolean
  hasBindi?: boolean
  skinUndertone?: string
  cheekboneProminence?: string
  jawline?: string
  eyebrowShape?: string
  eyebrowColor?: string
  lipColor?: string
  notes?: string
}

export interface BodyMetrics {
  height: number // cm
  weight: number // kg
  bodyType: BodyType
  shoulderWidth: 'narrow' | 'medium' | 'broad'
  hipWidth: 'narrow' | 'medium' | 'wide'
}

export type BodyType = 'hourglass' | 'pear' | 'apple' | 'rectangle' | 'inverted-triangle'

export interface ClothingItem {
  id: string
  name: string
  category: 'tops' | 'bottoms' | 'shoes' | 'accessories'
  glbPath?: string
  thumbnail: string
  color: string
  brand?: string
  price?: number
}

export interface AvatarCustomization {
  skinTone: string
  headScale: [number, number, number]
  bodyScale: [number, number, number]
  wornItems: string[]
}

export type AppStep = 'capture' | 'body-metrics' | 'avatar' | 'tryOn'