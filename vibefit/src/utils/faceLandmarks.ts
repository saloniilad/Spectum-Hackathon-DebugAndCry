/**
 * faceLandmarks.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * MediaPipe FaceMesh integration for VibeFit.
 * Extracts 468 facial landmarks from a photo and maps them to avatar params.
 *
 * HOW IT WORKS
 * ────────────
 * 1. Dynamically loads MediaPipe FaceMesh from CDN (no npm bundle bloat).
 * 2. Draws the image onto a hidden canvas and runs detection.
 * 3. Harvests ~20 key landmark indices covering eyes, nose, lips, jaw, forehead.
 * 4. Converts normalised [0–1] coords → real pixel distances → ratios.
 * 5. Returns a `LandmarkMetrics` object that `facialAnalysis.ts` merges with
 *    Claude's colour / feature analysis.
 *
 * LANDMARK INDEX REFERENCE  (MediaPipe canonical face model)
 * ────────────────────────────────────────────────────────────
 *  10  – forehead centre
 *  152 – chin tip
 *  234 – left jaw outer
 *  454 – right jaw outer
 *  33  – left eye inner corner
 *  133 – left eye outer corner
 *  362 – right eye inner corner
 *  263 – right eye outer corner
 *  159 – left eye top lid
 *  145 – left eye bottom lid
 *  386 – right eye top lid
 *  374 – right eye bottom lid
 *  1   – nose tip
 *  98  – left ala (nostril edge)
 *  327 – right ala (nostril edge)
 *  6   – nose bridge
 *  13  – upper lip top centre
 *  14  – lower lip bottom centre
 *  61  – left lip corner
 *  291 – right lip corner
 *  70  – left brow arch peak
 *  300 – right brow arch peak
 *  107 – left brow inner
 *  336 – right brow inner
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface LandmarkMetrics {
  /** Face width / face height — 0.65=narrow, 0.85=round */
  faceWidthRatio: number
  /** Eye separation as fraction of face width */
  eyeSpacingRatio: number
  /** Nose width as fraction of face width */
  noseWidthRatio: number
  /** Lip width as fraction of face width */
  lipWidthRatio: number
  /** Upper-lip height as fraction of face height */
  lipUpperHeightRatio: number
  /** Lower-lip height as fraction of face height */
  lipLowerHeightRatio: number
  /** Eye openness (height/width of eye aperture) — 0.25=hooded, 0.5=round */
  eyeOpennessRatio: number
  /** Brow arch — positive = arched, ~0 = straight */
  browArchRatio: number
  /** Jawline width at lower third vs cheekbone width */
  jawTaperRatio: number
  /** Derived face shape label */
  derivedFaceShape: 'oval' | 'round' | 'square' | 'heart' | 'oblong' | 'diamond'
  /** Derived eye shape label */
  derivedEyeShape: 'almond' | 'round' | 'hooded' | 'monolid' | 'upturned' | 'downturned'
  /** Pixel face width (for Three.js scale helpers) */
  faceWidthPx: number
  /** Pixel face height */
  faceHeightPx: number
  /** Eye spacing in pixels */
  eyeSpacingPx: number
  /** Whether landmark detection actually ran (false = fallback values used) */
  landmarksDetected: boolean
}

interface MPLandmark { x: number; y: number; z: number }

// ─── CDN loader ───────────────────────────────────────────────────────────────

let _faceMeshLoaded = false
let _faceMeshInstance: unknown = null

async function loadMediaPipe(): Promise<unknown> {
  if (_faceMeshLoaded && _faceMeshInstance) return _faceMeshInstance

  // Inject scripts only once
  await injectScript(
    'https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/face_mesh.js',
    'mediapipe-face-mesh',
  )

  return new Promise((resolve, reject) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const win = window as any
    let attempts = 0
    const wait = setInterval(() => {
      attempts++
      if (win.FaceMesh) {
        clearInterval(wait)
        try {
          const fm = new win.FaceMesh({
            locateFile: (f: string) =>
              `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${f}`,
          })
          fm.setOptions({
            maxNumFaces: 1,
            refineLandmarks: true,
            minDetectionConfidence: 0.5,
            minTrackingConfidence: 0.5,
          })
          _faceMeshInstance = fm
          _faceMeshLoaded = true
          resolve(fm)
        } catch (e) {
          reject(e)
        }
      } else if (attempts > 60) {
        clearInterval(wait)
        reject(new Error('MediaPipe FaceMesh failed to load after 6 s'))
      }
    }, 100)
  })
}

function injectScript(src: string, id: string): Promise<void> {
  return new Promise((resolve) => {
    if (document.getElementById(id)) { resolve(); return }
    const s = document.createElement('script')
    s.id = id
    s.src = src
    s.crossOrigin = 'anonymous'
    s.onload = () => resolve()
    s.onerror = () => resolve() // resolve anyway; we'll fail later with useful msg
    document.head.appendChild(s)
  })
}

// ─── Run FaceMesh on an image element ────────────────────────────────────────

async function detectLandmarks(imgEl: HTMLImageElement): Promise<MPLandmark[] | null> {
  // Draw image to a canvas so MediaPipe can read it
  const canvas = document.createElement('canvas')
  canvas.width  = imgEl.naturalWidth  || imgEl.width
  canvas.height = imgEl.naturalHeight || imgEl.height
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(imgEl, 0, 0, canvas.width, canvas.height)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fm: any = await loadMediaPipe()

  return new Promise((resolve) => {
    let resolved = false

    fm.onResults((results: { multiFaceLandmarks?: MPLandmark[][] }) => {
      if (resolved) return
      resolved = true
      const lm = results.multiFaceLandmarks?.[0]
      resolve(lm ?? null)
    })

    // Send frame — MediaPipe expects an HTMLImageElement or HTMLVideoElement
    fm.send({ image: canvas }).catch(() => {
      if (!resolved) { resolved = true; resolve(null) }
    })

    // Timeout guard — 8 s
    setTimeout(() => {
      if (!resolved) { resolved = true; resolve(null) }
    }, 8000)
  })
}

// ─── Maths helpers ────────────────────────────────────────────────────────────

function dist(a: MPLandmark, b: MPLandmark, W: number, H: number) {
  return Math.sqrt(((a.x - b.x) * W) ** 2 + ((a.y - b.y) * H) ** 2)
}

// ─── Derive labels from geometry ──────────────────────────────────────────────

function deriveFaceShape(
  widthRatio: number,
  jawTaper: number,
): LandmarkMetrics['derivedFaceShape'] {
  // widthRatio: face_w / face_h  (0.65 narrow, 0.90 wide/round)
  // jawTaper:   jaw_w / cheek_w  (0.6 heart, 1.0 square)
  if (widthRatio < 0.70)                            return 'oblong'
  if (widthRatio > 0.86)                            return 'round'
  if (jawTaper < 0.68)                              return 'heart'
  if (jawTaper > 0.92 && widthRatio > 0.78)        return 'square'
  if (widthRatio < 0.78 && jawTaper > 0.75)        return 'diamond'
  return 'oval'
}

function deriveEyeShape(
  openness: number,
  tiltRatio: number, // +ve = outer corner higher (upturned), -ve = lower (downturned)
): LandmarkMetrics['derivedEyeShape'] {
  if (openness < 0.28)  return 'hooded'
  if (openness > 0.48)  return 'round'
  if (tiltRatio > 0.05) return 'upturned'
  if (tiltRatio < -0.05) return 'downturned'
  // Monolid heuristic: very similar openness between inner and outer half
  if (openness < 0.36)  return 'monolid'
  return 'almond'
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Run MediaPipe FaceMesh on a base64 data-URL image.
 * Returns rich `LandmarkMetrics`; falls back gracefully on failure.
 */
export async function extractLandmarkMetrics(
  imageSrc: string,
): Promise<LandmarkMetrics> {
  const FALLBACK: LandmarkMetrics = {
    faceWidthRatio: 0.72, eyeSpacingRatio: 0.38, noseWidthRatio: 0.26,
    lipWidthRatio: 0.40, lipUpperHeightRatio: 0.048, lipLowerHeightRatio: 0.058,
    eyeOpennessRatio: 0.38, browArchRatio: 0.12, jawTaperRatio: 0.78,
    derivedFaceShape: 'oval', derivedEyeShape: 'almond',
    faceWidthPx: 300, faceHeightPx: 420, eyeSpacingPx: 114,
    landmarksDetected: false,
  }

  try {
    // 1. Decode image into an HTMLImageElement
    const imgEl = await loadImage(imageSrc)
    const W = imgEl.naturalWidth || imgEl.width
    const H = imgEl.naturalHeight || imgEl.height

    // 2. Run MediaPipe
    const lm = await detectLandmarks(imgEl)
    // Cache raw landmarks for AvatarViewer mesh deformation
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (lm) (window as any).__vibefit_last_landmarks__ = lm
    if (!lm || lm.length < 400) return FALLBACK

    // 3. Harvest key landmarks (normalised 0–1)
    const forehead  = lm[10]
    const chin      = lm[152]
    const jawL      = lm[234]
    const jawR      = lm[454]

    // Eyes
    const eyeLInner = lm[133]  // left eye inner corner (from viewer's POV)
    const eyeLOuter = lm[33]
    const eyeRInner = lm[362]
    const eyeROuter = lm[263]
    const eyeLTop   = lm[159]
    const eyeLBot   = lm[145]
    const eyeRTop   = lm[386]
    const eyeRBot   = lm[374]

    // Nose
    const noseTip   = lm[1]
    const alaL      = lm[98]
    const alaR      = lm[327]

    // Lips
    const lipTopC   = lm[13]
    const lipBotC   = lm[14]
    const lipCorL   = lm[61]
    const lipCorR   = lm[291]

    // Brows
    const browLPeak = lm[70]
    const browRPeak = lm[300]
    const browLInner = lm[107]
    const browRInner = lm[336]

    // 4. Compute distances in PIXELS
    const faceH       = dist(forehead, chin, W, H)
    const faceW       = dist(jawL, jawR, W, H)

    // Jaw width at chin level (narrower = tapered)
    const chinL       = lm[172]
    const chinR       = lm[397]
    const jawLowerW   = dist(chinL, chinR, W, H)
    const jawTaper    = faceW > 0 ? jawLowerW / faceW : 0.78

    // Eye separation: inner corner of left to inner corner of right
    const eyeSep      = dist(eyeLInner, eyeRInner, W, H)

    // Eye openness (average of both eyes)
    const eyeLOpen    = dist(eyeLTop, eyeLBot, W, H)
    const eyeROpen    = dist(eyeRTop, eyeRBot, W, H)
    const eyeW_L      = dist(eyeLInner, eyeLOuter, W, H)
    const eyeW_R      = dist(eyeRInner, eyeROuter, W, H)
    const eyeOpenness = eyeW_L + eyeW_R > 0
      ? (eyeLOpen + eyeROpen) / (eyeW_L + eyeW_R)
      : 0.38

    // Brow arch: how much higher the peak is vs the inner brow
    const browLArch   = (browLInner.y - browLPeak.y) * H   // positive = peak higher
    const browRArch   = (browRInner.y - browRPeak.y) * H
    const browArch    = faceH > 0 ? (browLArch + browRArch) / 2 / faceH : 0.12

    // Eye tilt: outer corner y vs inner corner y (upturned if outer is higher)
    const eyeLTilt    = (eyeLInner.y - eyeLOuter.y)        // MediaPipe y grows downward
    const eyeRTilt    = (eyeROuter.y - eyeRInner.y)
    const eyeTilt     = (eyeLTilt + eyeRTilt) / 2

    // Nose width
    const noseW       = dist(alaL, alaR, W, H)

    // Lip dimensions
    const lipW        = dist(lipCorL, lipCorR, W, H)
    const lipUpperH   = Math.abs((lipTopC.y - noseTip.y) * H) * 0.60  // philtrum fraction
    const lipLowerH   = Math.abs((lipBotC.y - lipTopC.y) * H)

    // 5. Derive ratios
    const faceWidthRatio     = faceH > 0 ? faceW / faceH : 0.72
    const eyeSpacingRatio    = faceW > 0 ? eyeSep / faceW : 0.38
    const noseWidthRatio     = faceW > 0 ? noseW / faceW  : 0.26
    const lipWidthRatio      = faceW > 0 ? lipW / faceW   : 0.40
    const lipUpperHeightRatio = faceH > 0 ? lipUpperH / faceH : 0.048
    const lipLowerHeightRatio = faceH > 0 ? lipLowerH / faceH : 0.058

    const derivedFaceShape = deriveFaceShape(faceWidthRatio, jawTaper)
    const derivedEyeShape  = deriveEyeShape(eyeOpenness, eyeTilt)

    return {
      faceWidthRatio,
      eyeSpacingRatio,
      noseWidthRatio,
      lipWidthRatio,
      lipUpperHeightRatio,
      lipLowerHeightRatio,
      eyeOpennessRatio: eyeOpenness,
      browArchRatio: browArch,
      jawTaperRatio: jawTaper,
      derivedFaceShape,
      derivedEyeShape,
      faceWidthPx: faceW,
      faceHeightPx: faceH,
      eyeSpacingPx: eyeSep,
      landmarksDetected: true,
    }
  } catch (err) {
    console.warn('[VibeFit] Landmark extraction failed, using fallback:', err)
    return FALLBACK
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload  = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

/**
 * Convert landmark metrics into Three.js-ready avatar parameters.
 * These are multiplicative modifiers on top of the base head geometry.
 */
export interface AvatarGeometryParams {
  /** Eye separation X offset in world units */
  eyeSpX: number
  /** Eye openness scale Y */
  eyeOpenH: number
  /** Nose body width scale */
  nBW: number
  /** Nose tip radius */
  nTip: number
  /** Lip width scale */
  lW: number
  /** Upper lip height scale */
  ulH: number
  /** Lower lip height scale */
  llH: number
  /** Brow arch rotation amount */
  bArch: number
  /** Face shape key for the FACE table in AvatarViewer */
  faceShape: string
  /** Eye shape key */
  eyeShape: string
}

export function landmarksToAvatarParams(m: LandmarkMetrics): AvatarGeometryParams {
  // Eye separation: normalise against 0.38 baseline (average face)
  const eyeSpX = 0.210 * (m.eyeSpacingRatio / 0.38)

  // Eye openness: map [0.20–0.55] → [0.55–1.40] avatar Y scale
  const eyeOpenH = Math.max(0.55, Math.min(1.50,
    0.55 + (m.eyeOpennessRatio - 0.20) / (0.55 - 0.20) * (1.50 - 0.55),
  ))

  // Nose width: map [0.18–0.38] → [0.50–0.95]
  const nBW = Math.max(0.50, Math.min(0.95,
    0.50 + (m.noseWidthRatio - 0.18) / (0.38 - 0.18) * (0.95 - 0.50),
  ))
  const nTip = 0.088 + (m.noseWidthRatio - 0.22) * 0.18

  // Lip width: map [0.28–0.58] → [0.80–1.40]
  const lW = Math.max(0.80, Math.min(1.40,
    0.80 + (m.lipWidthRatio - 0.28) / (0.58 - 0.28) * (1.40 - 0.80),
  ))

  // Lip heights: map ratio → scale (baseline ~0.048 upper, 0.058 lower)
  const ulH = Math.max(0.24, Math.min(0.64,
    0.24 + (m.lipUpperHeightRatio - 0.025) / (0.075 - 0.025) * (0.64 - 0.24),
  ))
  const llH = Math.max(0.28, Math.min(0.76,
    0.28 + (m.lipLowerHeightRatio - 0.030) / (0.090 - 0.030) * (0.76 - 0.28),
  ))

  // Brow arch: positive = arched, 0 = flat
  const bArch = Math.max(0.02, Math.min(0.28, m.browArchRatio * 2.0))

  return {
    eyeSpX, eyeOpenH, nBW, nTip: Math.max(0.072, Math.min(0.130, nTip)),
    lW, ulH, llH, bArch,
    faceShape: m.derivedFaceShape,
    eyeShape:  m.derivedEyeShape,
  }
}