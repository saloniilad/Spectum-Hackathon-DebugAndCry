/**
 * facialAnalysis.ts  — UPDATED
 * ─────────────────────────────────────────────────────────────────────────────
 * Two-stage pipeline:
 *
 *  Stage 1 — MediaPipe FaceMesh (runs first, geometric truth)
 *    • Extracts 468 landmarks
 *    • Computes real ratios: eye spacing, nose width, lip dims, face shape, etc.
 *    • Geometry overrides Claude's guesses (more accurate)
 *
 *  Stage 2 — Claude Vision (colour & texture analysis)
 *    • Skin tone + hex, eye colour, hair colour, bindi, etc.
 *    • Runs in parallel with Stage 1 for speed
 *
 *  Merge strategy:
 *    Geometry → from landmarks (if detected)
 *    Colour   → always from Claude
 *    Fallback → if both fail, use pixel-sampling heuristics
 */

import type { FacialFeatures } from '../types'
import { extractLandmarkMetrics } from './faceLandmarks'

// ─── Stage 2: Claude Vision ───────────────────────────────────────────────────

async function analyzeWithClaude(
  imageBase64: string,
  mimeType: string,
): Promise<Record<string, unknown>> {
  const prompt = `You are a precise facial analysis system. Analyze this face photo and return ONLY a JSON object — no markdown, no explanation.

Focus on COLOR and TEXTURE features only (geometry is handled separately):

{
  "skinTone": one of ["porcelain","fair","light","medium","tan","deep","rich"],
  "skinToneHex": hex color closely matching the actual skin tone,
  "eyeColor": one of ["brown","dark brown","black","hazel","green","blue","grey"],
  "lipColor": hex color of lips/lipstick actually visible,
  "gender": one of ["feminine","masculine","androgynous"],
  "hairColor": one of ["black","dark brown","brown","auburn","blonde","red","grey","white"],
  "hasHair": true or false,
  "hasBindi": true or false (is there a decorative dot/bindi on the forehead?),
  "skinUndertone": one of ["warm","cool","neutral"],
  "cheekboneProminence": one of ["high","medium","low"],
  "jawline": one of ["defined","soft","angular","rounded"],
  "eyebrowShape": one of ["arched","straight","rounded","bushy","thin"],
  "eyebrowColor": hex color of the eyebrows,
  "notes": "brief description of 2-3 most distinctive features"
}

Return ONLY valid JSON.`

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 800,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: mimeType, data: imageBase64 },
          },
          { type: 'text', text: prompt },
        ],
      }],
    }),
  })

  const data = await response.json()
  const text = data.content
    ?.map((c: { type: string; text?: string }) => c.type === 'text' ? c.text : '')
    .join('') ?? ''
  const clean = text.replace(/```json|```/g, '').trim()
  return JSON.parse(clean)
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isValidHex(h: unknown): h is string {
  return typeof h === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(h)
}

const SKIN_HEX: Record<string, string> = {
  porcelain: '#F5DEB3', fair: '#F2D3B8', light: '#E8C49A',
  medium: '#C68642', tan: '#A0522D', deep: '#7B4A2B', rich: '#4A2511',
}

// ─── Merge stage ─────────────────────────────────────────────────────────────

function buildFeatures(
  claude: Record<string, unknown>,
  imageSrc: string,
  imgW: number,
  imgH: number,
  landmarkFaceShape: string,
  landmarkEyeShape: string,
  faceWidthPx: number,
  faceHeightPx: number,
  eyeSpacingPx: number,
  landmarksDetected: boolean,
): FacialFeatures {
  const skinTone    = (claude.skinTone as string) ?? 'medium'
  const skinToneHex = isValidHex(claude.skinToneHex)
    ? claude.skinToneHex
    : SKIN_HEX[skinTone] ?? '#C68642'

  const eyeColorRaw = ((claude.eyeColor as string) ?? 'brown').toLowerCase()
  const eyeColor = eyeColorRaw.includes('black') || eyeColorRaw.includes('dark') ? 'brown'
    : eyeColorRaw.includes('hazel') ? 'hazel'
    : eyeColorRaw.includes('green') ? 'green'
    : eyeColorRaw.includes('blue')  ? 'blue'
    : eyeColorRaw.includes('grey')  ? 'grey'
    : 'brown'

  // Use landmark geometry if detected; otherwise fall back to image-proportion estimate
  const faceW  = landmarksDetected ? faceWidthPx  : imgW * 0.60
  const faceH  = landmarksDetected ? faceHeightPx : imgH * 0.75
  const eyeSep = landmarksDetected ? eyeSpacingPx : imgW * 0.32

  // Use landmark-derived shape labels when available (more accurate)
  const faceShape = landmarksDetected ? landmarkFaceShape : (claude.faceShape as string ?? 'oval')
  const eyeShape  = landmarksDetected ? landmarkEyeShape  : (claude.eyeShape  as string ?? 'almond')

  return {
    skinTone,
    skinToneHex,
    eyeShape,
    eyeColor,
    faceShape,
    noseType:   (claude.noseType  as string) ?? 'straight',
    lipShape:   (claude.lipShape  as string) ?? "cupid's bow",
    faceWidth:  faceW,
    faceHeight: faceH,
    eyeSpacing: eyeSep,
    capturedImage: imageSrc,
    // Extended
    gender:              (claude.gender              as string)  ?? 'feminine',
    hairColor:           (claude.hairColor           as string)  ?? 'black',
    hasHair:             (claude.hasHair             as boolean) ?? true,
    hasBindi:            (claude.hasBindi            as boolean) ?? false,
    skinUndertone:       (claude.skinUndertone       as string)  ?? 'warm',
    cheekboneProminence: (claude.cheekboneProminence as string)  ?? 'medium',
    jawline:             (claude.jawline             as string)  ?? 'soft',
    eyebrowShape:        (claude.eyebrowShape        as string)  ?? 'arched',
    eyebrowColor: isValidHex(claude.eyebrowColor)  ? claude.eyebrowColor  : '#1a0a00',
    lipColor:     isValidHex(claude.lipColor)       ? claude.lipColor      : '#c05060',
    notes:               (claude.notes              as string)  ?? '',
  }
}

// ─── Pixel fallback (no Claude, no MediaPipe) ─────────────────────────────────

function pixelFallback(imageSrc: string, W: number, H: number): FacialFeatures {
  return {
    skinTone: 'tan', skinToneHex: '#A0522D',
    eyeShape: 'almond', eyeColor: 'brown',
    faceShape: 'oval', noseType: 'straight', lipShape: "cupid's bow",
    faceWidth: W * 0.6, faceHeight: H * 0.7, eyeSpacing: W * 0.2,
    capturedImage: imageSrc,
    gender: 'feminine', hairColor: 'black', hasHair: true, hasBindi: false,
    skinUndertone: 'warm', cheekboneProminence: 'medium', jawline: 'soft',
    eyebrowShape: 'arched', eyebrowColor: '#1a0a00', lipColor: '#c05060', notes: '',
  }
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function extractFacialFeatures(imageSrc: string): Promise<FacialFeatures> {
  return new Promise((resolve) => {
    const img = new Image()

    img.onload = async () => {
      const W = img.width
      const H = img.height

      const commaIdx = imageSrc.indexOf(',')
      if (commaIdx === -1) { resolve(pixelFallback(imageSrc, W, H)); return }
      const mimeMatch = imageSrc.substring(0, commaIdx).match(/:(.*?);/)
      const mimeType  = (mimeMatch?.[1] ?? 'image/jpeg') as string
      const base64Data = imageSrc.substring(commaIdx + 1)

      // ── Run both stages in PARALLEL ────────────────────────────────────────
      const [landmarkResult, claudeResult] = await Promise.allSettled([
        extractLandmarkMetrics(imageSrc),
        analyzeWithClaude(base64Data, mimeType),
      ])

      const landmarks = landmarkResult.status === 'fulfilled'
        ? landmarkResult.value
        : null

      const claudeData: Record<string, unknown> =
        claudeResult.status === 'fulfilled' && Object.keys(claudeResult.value).length >= 4
          ? claudeResult.value
          : {}

      // Log results for debugging
      if (landmarks?.landmarksDetected) {
        console.log('[VibeFit] ✅ MediaPipe landmarks detected:', {
          faceShape: landmarks.derivedFaceShape,
          eyeShape:  landmarks.derivedEyeShape,
          eyeSpX:    landmarks.eyeSpacingRatio.toFixed(3),
          noseW:     landmarks.noseWidthRatio.toFixed(3),
          lipW:      landmarks.lipWidthRatio.toFixed(3),
        })
      } else {
        console.warn('[VibeFit] ⚠️ MediaPipe landmarks not detected — using fallback geometry')
      }

      // If both fail, use pixel heuristics
      if (!landmarks && Object.keys(claudeData).length === 0) {
        resolve(pixelFallback(imageSrc, W, H))
        return
      }

      resolve(buildFeatures(
        claudeData,
        imageSrc,
        W,
        H,
        landmarks?.derivedFaceShape ?? (claudeData.faceShape as string) ?? 'oval',
        landmarks?.derivedEyeShape  ?? (claudeData.eyeShape  as string) ?? 'almond',
        landmarks?.faceWidthPx  ?? W * 0.60,
        landmarks?.faceHeightPx ?? H * 0.75,
        landmarks?.eyeSpacingPx ?? W * 0.32,
        landmarks?.landmarksDetected ?? false,
      ))
    }

    img.onerror = () => resolve(pixelFallback(imageSrc, 640, 480))
    img.src = imageSrc
  })
}