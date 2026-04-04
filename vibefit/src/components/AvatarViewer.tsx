/**
 * AvatarViewer.tsx — UPDATED FOR REALISM & PRECISION FIT
 *
 * Improvements:
 *  1. Uses CapsuleGeometry for smoother, more organic body shapes.
 *  2. Dynamic Z-offset based on body thickness to prevent "floating" or "clipping".
 *  3. Enhanced materials for a more natural (less toy-like) finish.
 *  4. Adjusted anchors to match refined body proportions.
 *  5. GLB scale applied before positioning (correct bounding-box math).
 *  6. Face mesh uses oval alpha mask instead of a floating rectangle.
 *  7. Cache stores raw/unpositioned model so clones are position-neutral.
 */
import React, { useRef, useEffect, useState, useCallback } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { useAppStore } from '../store/AppStore'
import { extractLandmarkMetrics, landmarksToAvatarParams } from '../utils/faceLandmarks'
import type { AvatarGeometryParams } from '../utils/faceLandmarks'
import type { ClothingItem, FacialFeatures, BodyMetrics } from '../types'

interface Props { wornItems: ClothingItem[] }
interface RawLM { x: number; y: number; z: number }

// ─── Size multiplier ──────────────────────────────────────────────────────────
const SIZE_SCALE: Record<'S' | 'M' | 'L', number> = { S: 0.90, M: 1.0, L: 1.12 }

// ─── Anchor centres match refined Capsule-based body proportions (sy=1) ──────
// tops:    chest capsule at 1.40, adjusted centre 1.25
// bottoms: hips at 0.92, legs to ~0.04 → centre 0.55
// shoes:   foot spheres at 0.04
// accessories: neck top ~1.54
const BODY_ANCHORS: Record<ClothingItem['category'], {
  centerY: number   // world-Y of the clothing centre (at sy=1)
  halfH: number     // half the clothing height (world units, at M size, sy=1)
  zOffset: number
  pad: number       // Extra scale padding to prevent clipping
}> = {
  tops:        { centerY: 1.25,  halfH: 0.28,  zOffset: 0.02,  pad: 1.05 },
  bottoms:     { centerY: 0.55,  halfH: 0.38,  zOffset: 0.015, pad: 1.04 },
  shoes:       { centerY: 0.05,  halfH: 0.06,  zOffset: 0.04,  pad: 1.02 },
  accessories: { centerY: 1.54,  halfH: 0.08,  zOffset: 0.05,  pad: 1.00 },
}

// ─── Material helpers ──────────────────────────────────────────────────────────
function mat(hex: string, rough = 0.6, metal = 0.05, opacity = 1) {
  const m = new THREE.MeshStandardMaterial({
    color: new THREE.Color(hex),
    roughness: rough,
    metalness: metal,
    envMapIntensity: 1.0,
  })
  if (opacity < 1) { m.transparent = true; m.opacity = opacity }
  return m
}
function blend(a: string, b: string, t: number): string {
  return '#' + new THREE.Color(a).lerp(new THREE.Color(b), t).getHexString()
}

const IRIS: Record<string, string> = {
  brown: '#5C3317', 'dark brown': '#2A0E05', hazel: '#7A5C1E',
  green: '#2D6A4F', blue: '#1A4A8A', grey: '#4A5568', black: '#0F0806',
}
const HAIR_HEX: Record<string, string> = {
  black: '#0A0806', 'dark brown': '#1E0E06', brown: '#4A2010',
  auburn: '#6B2010', blonde: '#B08020', red: '#801808', grey: '#707070', white: '#C8C8C8',
}
const DEFAULT_GEOM: AvatarGeometryParams = {
  eyeSpX: 0.210, eyeOpenH: 1.00, nBW: 0.66, nTip: 0.096,
  lW: 1.04, ulH: 0.40, llH: 0.48, bArch: 0.12,
  faceShape: 'oval', eyeShape: 'almond',
}
const FACE_SHAPE: Record<string, { sx: number; sy: number; jawX: number; chinW: number }> = {
  oval:    { sx: 0.92, sy: 1.05, jawX: 0.78, chinW: 0.38 },
  round:   { sx: 1.02, sy: 0.94, jawX: 0.96, chinW: 0.52 },
  square:  { sx: 0.98, sy: 0.96, jawX: 1.02, chinW: 0.54 },
  heart:   { sx: 0.95, sy: 1.02, jawX: 0.70, chinW: 0.30 },
  oblong:  { sx: 0.83, sy: 1.18, jawX: 0.76, chinW: 0.36 },
  diamond: { sx: 0.89, sy: 1.04, jawX: 0.74, chinW: 0.34 },
}

function getSkinMaterial(hex: string) {
  return new THREE.MeshStandardMaterial({
    color: new THREE.Color(hex),
    roughness: 0.85,
    metalness: 0.02,
    bumpScale: 0.002,
  })
}

// ══════════════════════════════════════════════════════════════════════════════
// GLB LOADER — Fixed positioning: scale first, then place centre on anchor
// ══════════════════════════════════════════════════════════════════════════════

// Cache stores the raw, unscaled, unpositioned gltf.scene clone
const _glbRawCache = new Map<string, THREE.Group>()

async function loadGLB(
  path: string,
  category: ClothingItem['category'],
  size: 'S' | 'M' | 'L',
  color: string,
  sy: number,
  sx: number
): Promise<THREE.Group> {
  // Get or load the raw model
  let rawModel: THREE.Group

  if (_glbRawCache.has(path)) {
    rawModel = _glbRawCache.get(path)!.clone(true)
  } else {
    rawModel = await new Promise<THREE.Group>((resolve, reject) => {
      new GLTFLoader().load(
        path,
        (gltf) => {
          const m = gltf.scene
          // Store a clean copy before any transforms
          _glbRawCache.set(path, m.clone(true))
          resolve(m)
        },
        undefined,
        (err) => { console.warn('[VibeFit] GLB load failed:', path, err); reject(err) }
      )
    })
  }

  // ── FIX 3: Force forward direction — prevents sideways/backward models ───────
  rawModel.rotation.set(0, 0, 0)

  // ── Step 1: Get bounding box AFTER resetting rotation ────────────────────────
  const rawBox = new THREE.Box3().setFromObject(rawModel)
  const rawSize = rawBox.getSize(new THREE.Vector3())
  const rawMin  = rawBox.min.clone()

  // ── FIX 4: Anti-giant clamp — some GLBs are enormous ────────────────────────
  const MAX_RAW_HEIGHT = 20
  if (rawSize.y > MAX_RAW_HEIGHT) {
    const preclamp = MAX_RAW_HEIGHT / rawSize.y
    rawModel.scale.multiplyScalar(preclamp)
    rawBox.setFromObject(rawModel)
    rawBox.getSize(rawSize)
    rawMin.copy(rawBox.min)
  }

  // ── FIX 1: ALIGN TO BOTTOM — move model so its BOTTOM sits at Y=0 ───────────
  // Regardless of where pivot is (feet/chest/center), bottom is now at Y=0
  rawModel.position.set(
    -(rawBox.min.x + rawSize.x / 2),
    -rawMin.y,
    -(rawBox.min.z + rawSize.z / 2)
  )

  // ── Step 2: Compute target scale ─────────────────────────────────────────────
  const anchor = BODY_ANCHORS[category]
  const sizeMultiplier = SIZE_SCALE[size]

  const targetH = anchor.halfH * 2 * sy * sizeMultiplier
  const fitScaleY = rawSize.y > 0 ? targetH / rawSize.y : 1
  const fitScaleX = fitScaleY * sx * sizeMultiplier * anchor.pad
  const fitScaleZ = fitScaleY * sx * sizeMultiplier * anchor.pad

  rawModel.scale.set(fitScaleX, fitScaleY, fitScaleZ)

  // ── FIX 2: BOTTOM-BASED POSITIONING — place model bottom at region start ─────
  // finalY = bottom edge of the clothing zone so model grows upward correctly
  const finalY = (anchor.centerY - anchor.halfH) * sy

  rawModel.position.set(0, finalY, anchor.zOffset * sx)

  // ── Per-category fine-tune offsets ───────────────────────────────────────────
  if (category === 'tops')        rawModel.position.y += 0.05 * sy
  if (category === 'bottoms')     rawModel.position.y -= 0.03 * sy
  if (category === 'shoes')       rawModel.position.y -= 0.01 * sy
  if (category === 'accessories') rawModel.position.y += 0.02 * sy

  // ── Step 4: Shadows and tint ────────────────────────────────────────────────
  rawModel.traverse(c => {
    if (c instanceof THREE.Mesh) {
      c.castShadow = true
      c.receiveShadow = true
    }
  })

  tintGLB(rawModel, color)
  return rawModel
}

/** Tint all mesh materials in a GLB to the clothing color */
function tintGLB(model: THREE.Object3D, colorHex: string) {
  const c = new THREE.Color(colorHex)
  model.traverse(obj => {
    if (!(obj instanceof THREE.Mesh)) return
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material]
    mats.forEach(m => {
      if (m instanceof THREE.MeshStandardMaterial || m instanceof THREE.MeshPhysicalMaterial) {
        m.color.lerp(c, 0.60)
      }
    })
  })
}

// ══════════════════════════════════════════════════════════════════════════════
// FACE TEXTURE — oval-masked face crop applied to the avatar head
// ══════════════════════════════════════════════════════════════════════════════

async function cropFaceTexture(imageSrc: string, lms: RawLM[]): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      const W = img.naturalWidth, H = img.naturalHeight
      const HULL = [10,338,297,332,284,251,389,356,454,323,361,288,397,365,379,378,400,377,152,148,176,149,150,136,172,58,132,93,234,127,162,21,54,103,67,109]
      let minX = 1, maxX = 0, minY = 1, maxY = 0
      for (const idx of HULL) {
        if (!lms[idx]) continue
        minX = Math.min(minX, lms[idx].x); maxX = Math.max(maxX, lms[idx].x)
        minY = Math.min(minY, lms[idx].y); maxY = Math.max(maxY, lms[idx].y)
      }
      const padX = (maxX - minX) * 0.18
      const padTop = (maxY - minY) * 0.22
      const padBot = (maxY - minY) * 0.06
      const cx1 = Math.max(0, minX - padX), cx2 = Math.min(1, maxX + padX)
      const cy1 = Math.max(0, minY - padTop), cy2 = Math.min(1, maxY + padBot)
      const SIZE = 512
      const canvas = document.createElement('canvas')
      canvas.width = SIZE; canvas.height = SIZE
      const ctx = canvas.getContext('2d')!

      // Draw oval clip mask so the face texture is an oval, not a rectangle
      ctx.clearRect(0, 0, SIZE, SIZE)
      ctx.save()
      ctx.beginPath()
      // Oval: slightly wider than tall
      ctx.ellipse(SIZE / 2, SIZE / 2, SIZE * 0.48, SIZE * 0.50, 0, 0, Math.PI * 2)
      ctx.closePath()
      ctx.clip()
      ctx.drawImage(img, cx1 * W, cy1 * H, (cx2 - cx1) * W, (cy2 - cy1) * H, 0, 0, SIZE, SIZE)
      ctx.restore()

      resolve(canvas.toDataURL('image/png', 0.95))
    }
    img.onerror = () => resolve(imageSrc)
    img.src = imageSrc
  })
}

async function buildFaceMesh(lms: RawLM[], imageSrc: string): Promise<THREE.Mesh> {
  const faceTexDataUrl = await cropFaceTexture(imageSrc, lms)
  const HULL = [10,338,297,332,284,251,389,356,454,323,361,288,397,365,379,378,400,377,152,148,176,149,150,136,172,58,132,93,234,127,162,21,54,103,67,109]
  let minX = 1, maxX = 0, minY = 1, maxY = 0
  for (const idx of HULL) {
    if (!lms[idx]) continue
    minX = Math.min(minX, lms[idx].x); maxX = Math.max(maxX, lms[idx].x)
    minY = Math.min(minY, lms[idx].y); maxY = Math.max(maxY, lms[idx].y)
  }
  const padX = (maxX - minX) * 0.18, padTop = (maxY - minY) * 0.22, padBot = (maxY - minY) * 0.06
  const faceMinX = Math.max(0, minX - padX), faceMaxX = Math.min(1, maxX + padX)
  const faceMinY = Math.max(0, minY - padTop), faceMaxY = Math.min(1, maxY + padBot)
  const faceW = faceMaxX - faceMinX, faceH = faceMaxY - faceMinY

  // Use a subdivided plane for depth deformation
  const geo = new THREE.PlaneGeometry(1.05, 1.30, 56, 56)
  const pos = geo.attributes.position as THREE.BufferAttribute
  const uvAttr = geo.attributes.uv as THREE.BufferAttribute

  for (let i = 0; i < pos.count; i++) {
    const px = pos.getX(i), py = pos.getY(i)
    const normX = (px / 1.05) + 0.5, normY = (py / 1.30) + 0.5
    const lmX = faceMinX + normX * faceW, lmY = faceMinY + (1 - normY) * faceH
    let closest = lms[1], minDist = Infinity
    for (let j = 0; j < lms.length; j++) {
      const dx = lms[j].x - lmX, dy = lms[j].y - lmY
      const d = dx * dx + dy * dy
      if (d < minDist) { minDist = d; closest = lms[j] }
    }
    pos.setZ(i, -closest.z * 0.5 - ((normX - 0.5) ** 2) * 0.3 - ((normY - 0.5) ** 2) * 0.2)
    uvAttr.setXY(i, normX, normY)
  }
  pos.needsUpdate = true; uvAttr.needsUpdate = true; geo.computeVertexNormals()

  const texture = await new Promise<THREE.Texture>((resolve) => {
    new THREE.TextureLoader().load(faceTexDataUrl, (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace
      tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping
      tex.minFilter = THREE.LinearMipmapLinearFilter
      tex.magFilter = THREE.LinearFilter
      tex.generateMipmaps = true
      resolve(tex)
    })
  })

  return new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
    map: texture,
    roughness: 0.62,
    metalness: 0.0,
    side: THREE.FrontSide,
    transparent: true,   // allows the oval alpha to show
    alphaTest: 0.05,
  }))
}

function lmW(lm: RawLM, FW = 1.05, FH = 1.35, DS = 0.45) {
  return { x: (lm.x - 0.5) * FW, y: (0.5 - lm.y) * FH, z: -lm.z * DS + 0.03 }
}

// ══════════════════════════════════════════════════════════════════════════════
// HEAD ASSEMBLY
// ══════════════════════════════════════════════════════════════════════════════

async function buildHead(f: FacialFeatures, geom: AvatarGeometryParams, rawLM: RawLM[] | null): Promise<THREE.Group> {
  const g = new THREE.Group()
  const fs = FACE_SHAPE[geom.faceShape ?? f.faceShape ?? 'oval'] ?? FACE_SHAPE.oval
  const isFem = !f.gender || f.gender === 'feminine'
  const skinM = getSkinMaterial(f.skinToneHex)
  const hairHex = HAIR_HEX[f.hairColor ?? 'black'] ?? HAIR_HEX.black
  const hairM = mat(hairHex, 0.88, 0.02)

  const skull = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 48), skinM.clone())
  skull.scale.set(fs.sx * 0.50, fs.sy * 0.54, 0.48); skull.position.set(0, 0.06, -0.10); g.add(skull)

  const jaw = new THREE.Mesh(new THREE.SphereGeometry(0.46, 32, 24), skinM.clone())
  jaw.scale.set(fs.jawX * 0.90, 0.84, 0.68); jaw.position.set(0, -0.40, -0.04); g.add(jaw)

  const chin = new THREE.Mesh(new THREE.SphereGeometry(0.18, 24, 18), skinM.clone())
  chin.scale.set(fs.chinW * 1.0, 0.32, 0.52); chin.position.set(0, -0.62, 0.06); g.add(chin)

  for (const s of [-1, 1] as const) {
    const earG = new THREE.Group()
    earG.position.set(s * fs.sx * 0.50, -0.02, -0.06)
    const eo = new THREE.Mesh(new THREE.SphereGeometry(0.115, 18, 16), skinM.clone())
    eo.scale.set(0.24, 0.70, 0.38); earG.add(eo)
    const ec = new THREE.Mesh(new THREE.SphereGeometry(0.060, 12, 10), mat(blend(f.skinToneHex, '#882000', 0.12), 0.70))
    ec.scale.set(0.20, 0.46, 0.18); ec.position.set(s * -0.006, 0, 0.028); earG.add(ec)
    const elobe = new THREE.Mesh(new THREE.SphereGeometry(0.040, 12, 10), skinM.clone())
    elobe.position.set(0, -0.095, 0.004); earG.add(elobe)
    if (isFem) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.024, 0.004, 8, 20), mat('#D4A020', 0.18, 0.92))
      ring.position.set(0, -0.120, 0.006); ring.rotation.y = Math.PI / 2; earG.add(ring)
    }
    g.add(earG)
  }

  const neckR = isFem ? 0.178 : 0.225
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(neckR, neckR + 0.032, 0.42, 20), skinM.clone())
  neck.position.set(0, -0.80, 0); g.add(neck)

  if (f.hasHair !== false) {
    const cap = new THREE.Mesh(new THREE.SphereGeometry(1.05, 40, 30, 0, Math.PI * 2, 0, Math.PI * 0.44), hairM)
    cap.scale.set(fs.sx * 0.525, fs.sy * 0.560, 0.500); cap.position.set(0, 0.20, -0.09); g.add(cap)
    for (const s of [-1, 1] as const) {
      const sv = new THREE.Mesh(new THREE.SphereGeometry(0.24, 18, 16), hairM)
      sv.scale.set(0.34, 0.80, 0.30); sv.position.set(s * fs.sx * 0.505, 0.06, -0.24); g.add(sv)
    }
    if (isFem) {
      const bk = new THREE.Mesh(new THREE.SphereGeometry(0.50, 24, 20), hairM)
      bk.scale.set(0.75, 1.65, 0.42); bk.position.set(0, -0.48, -0.32); g.add(bk)
      for (const s of [-1, 1] as const) {
        const sl = new THREE.Mesh(new THREE.CylinderGeometry(0.070, 0.042, 0.84, 12), hairM)
        sl.position.set(s * fs.sx * 0.52, -0.84, -0.36); sl.rotation.z = s * 0.07; g.add(sl)
      }
    } else {
      const bk = new THREE.Mesh(new THREE.SphereGeometry(0.32, 18, 14), hairM)
      bk.scale.set(0.82, 0.80, 0.44); bk.position.set(0, -0.06, -0.24); g.add(bk)
    }
  }

  if (f.hasBindi) {
    const bd = new THREE.Mesh(new THREE.CircleGeometry(0.024, 24),
      new THREE.MeshStandardMaterial({ color: '#CC1020', roughness: 0.26, metalness: 0.48 }))
    bd.position.set(0, 0.34, 0.58); g.add(bd)
  }

  if (rawLM && rawLM.length >= 400) {
    const faceMesh = await buildFaceMesh(rawLM, f.capturedImage)
    // Position the face mesh so it sits flush on the front of the skull geometry
    faceMesh.position.set(0, 0.02, 0.52)
    faceMesh.scale.set(1.18, 1.48, 1.12)
    g.add(faceMesh)

    const eyePairs: [number, number][] = [[133, 33], [362, 263]]
    for (const [innerIdx, outerIdx] of eyePairs) {
      const inner = lmW(rawLM[innerIdx]), outer = lmW(rawLM[outerIdx])
      const ew = Math.abs(outer.x - inner.x)
      const cl = new THREE.Mesh(new THREE.CircleGeometry(ew * 0.10, 8),
        new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.04, transparent: true, opacity: 0.55 }))
      cl.position.set((inner.x + outer.x) * 0.5 + ew * 0.12, (inner.y + outer.y) * 0.5 + ew * 0.12, 0.30)
      g.add(cl)
    }
  } else {
    buildParametricFace(g, f, geom, fs)
  }
  return g
}

function buildParametricFace(g: THREE.Group, f: FacialFeatures, geom: AvatarGeometryParams, fs: { sx: number; sy: number; jawX: number; chinW: number }) {
  const isFem = !f.gender || f.gender === 'feminine'
  const skinM = getSkinMaterial(f.skinToneHex)
  const iriM = mat(IRIS[f.eyeColor ?? 'brown'] ?? IRIS.brown, 0.16, 0.10)
  const pupM = mat('#030201', 0.95)
  const lipHex = f.lipColor ?? blend(f.skinToneHex, '#C02848', isFem ? 0.48 : 0.20)
  const lipM = mat(lipHex, 0.42)
  const browHex = f.eyebrowColor ?? blend(f.skinToneHex, '#060200', 0.85)
  const browM = mat(browHex, 0.84)
  const eyeSpX = Math.max(0.15, Math.min(0.25, geom.eyeSpX))
  const openH = Math.max(0.65, Math.min(1.30, geom.eyeOpenH))
  const eyeTilt = geom.eyeShape === 'upturned' ? 0.15 : geom.eyeShape === 'downturned' ? -0.10 : 0.05

  for (const s of [-1, 1] as const) {
    const ck = new THREE.Mesh(new THREE.SphereGeometry(0.20, 18, 16), skinM.clone())
    ck.scale.set(0.65, 0.40, 0.36); ck.position.set(s * fs.sx * 0.35, -0.07, 0.32); g.add(ck)
  }
  for (const s of [-1, 1] as const) {
    const eg = new THREE.Group()
    eg.position.set(s * eyeSpX, 0.05, 0.48); eg.rotation.z = s * eyeTilt * 0.14
    const sc = new THREE.Mesh(new THREE.SphereGeometry(0.068, 28, 22), mat('#EDE8E2', 0.28))
    sc.scale.set(1, openH * 0.70, 0.52); eg.add(sc)
    const ir = new THREE.Mesh(new THREE.CircleGeometry(0.040, 36), iriM)
    ir.position.set(0, 0, 0.068); eg.add(ir)
    const pu = new THREE.Mesh(new THREE.CircleGeometry(0.019, 28), pupM)
    pu.position.set(0, 0, 0.070); eg.add(pu)
    const cl = new THREE.Mesh(new THREE.CircleGeometry(0.007, 10), mat('#ffffff', 0.04, 0.1))
    cl.position.set(0.011, 0.011, 0.072); eg.add(cl)
    const lid = new THREE.Mesh(new THREE.SphereGeometry(0.072, 28, 12, 0, Math.PI * 2, 0, Math.PI * 0.44), skinM.clone())
    lid.scale.set(1.10, openH * 0.72, 0.52); eg.add(lid)
    g.add(eg)
  }
  const bThick = f.eyebrowShape === 'bushy' ? 0.042 : f.eyebrowShape === 'thin' ? 0.016 : isFem ? 0.024 : 0.034
  for (const s of [-1, 1] as const) {
    const bg = new THREE.Group()
    bg.position.set(s * eyeSpX, 0.21, 0.48)
    const bMain = new THREE.Mesh(new THREE.SphereGeometry(0.086, 18, 10), browM)
    bMain.scale.set(1.08, bThick / 0.024, 0.32); bMain.rotation.z = s * Math.max(0.02, Math.min(0.22, geom.bArch))
    bg.add(bMain); g.add(bg)
  }
  const nBW = Math.max(0.44, Math.min(0.90, geom.nBW))
  const ng = new THREE.Group(); ng.position.set(0, -0.17, 0.42)
  const bridge = new THREE.Mesh(new THREE.CylinderGeometry(nBW * 0.036, nBW * 0.046, 0.21, 14), skinM.clone())
  bridge.position.set(0, 0.11, 0); ng.add(bridge)
  const tip = new THREE.Mesh(new THREE.SphereGeometry(geom.nTip, 16, 14), skinM.clone())
  tip.scale.set(nBW, 0.63, 0.68); ng.add(tip)
  for (const s of [-1, 1] as const) {
    const ns = new THREE.Mesh(new THREE.SphereGeometry(geom.nTip * 0.48, 12, 10), mat(blend(f.skinToneHex, '#000', 0.08), 0.78))
    ns.scale.set(0.68, 0.42, 0.36); ns.position.set(s * nBW * 0.062, -0.040, 0.006); ng.add(ns)
  }
  g.add(ng)
  const lW = Math.max(0.78, Math.min(1.28, geom.lW))
  const mg = new THREE.Group(); mg.position.set(0, -0.36, 0.43)
  const ul = new THREE.Mesh(new THREE.SphereGeometry(0.095, 24, 12), lipM)
  ul.scale.set(lW, Math.max(0.20, geom.ulH), 0.32); ul.position.set(0, 0.024, 0); mg.add(ul)
  const ll = new THREE.Mesh(new THREE.SphereGeometry(0.095, 24, 12), lipM)
  ll.scale.set(lW * 0.92, Math.max(0.24, geom.llH), 0.36); ll.position.set(0, -0.034, 0.002); mg.add(ll)
  g.add(mg)
}

// ══════════════════════════════════════════════════════════════════════════════
// BODY
// ══════════════════════════════════════════════════════════════════════════════

async function buildAvatar(
  f: FacialFeatures,
  metrics: BodyMetrics | null,
  scale: [number, number, number],
  geom: AvatarGeometryParams,
  rawLM: RawLM[] | null
): Promise<THREE.Group> {
  const root = new THREE.Group()
  const [sx, sy] = scale
  const isFem = !f.gender || f.gender === 'feminine'
  const skinM = getSkinMaterial(f.skinToneHex)
  function sk() { return skinM.clone() }

  // Head
  const headG = await buildHead(f, geom, rawLM)
  headG.scale.setScalar(0.21)
  headG.position.set(0, 1.74 * sy, 0)
  root.add(headG)

  // Neck
  const neck = new THREE.Mesh(new THREE.CapsuleGeometry(0.05 * sx, 0.08 * sy, 4, 12), sk())
  neck.position.set(0, 1.62 * sy, 0)
  root.add(neck)

  // Upper Torso (Chest) — centre at 1.40 * sy
  const chest = new THREE.Mesh(new THREE.CapsuleGeometry(0.14 * sx, 0.22 * sy, 8, 16), sk())
  chest.scale.set(1, 1, 0.8)
  chest.position.set(0, 1.40 * sy, 0)
  root.add(chest)

  if (isFem) {
    for (const s of [-1, 1] as const) {
      const breast = new THREE.Mesh(new THREE.CapsuleGeometry(0.055 * sx, 0.04 * sy, 6, 12), sk())
      breast.scale.set(1, 1, 0.75)
      breast.position.set(s * 0.075 * sx, 1.30 * sy, 0.03)
      root.add(breast)
    }
  }

  // Abdomen/Waist — centre at 1.15 * sy
  const waist = new THREE.Mesh(new THREE.CapsuleGeometry(0.11 * sx, 0.18 * sy, 8, 16), sk())
  waist.position.set(0, 1.15 * sy, 0)
  root.add(waist)

  // Hips — centre at 0.92 * sy
  const hips = new THREE.Mesh(new THREE.CapsuleGeometry(isFem ? 0.15 * sx : 0.13 * sx, 0.15 * sy, 8, 16), sk())
  hips.position.set(0, 0.92 * sy, 0)
  root.add(hips)

  // Pelvis connector
  const pelvis = new THREE.Mesh(new THREE.CapsuleGeometry(0.12 * sx, 0.10 * sy, 6, 14), sk())
  pelvis.position.set(0, 0.775 * sy, 0)
  root.add(pelvis)

  // Arms
  for (const s of [-1, 1] as const) {
    const shoulderX = s * 0.18 * sx

    // Shoulder cap
    const scap = new THREE.Mesh(new THREE.CapsuleGeometry(0.045 * sx, 0.02 * sy, 4, 10), sk())
    scap.position.set(shoulderX, 1.46 * sy, 0)
    root.add(scap)

    // Upper arm
    const uarm = new THREE.Mesh(new THREE.CapsuleGeometry(isFem ? 0.036 * sx : 0.044 * sx, 0.20 * sy, 4, 10), sk())
    uarm.position.set(shoulderX, 1.33 * sy, 0)
    uarm.rotation.z = s * 0.10
    root.add(uarm)

    // Elbow
    const elbow = new THREE.Mesh(new THREE.CapsuleGeometry(isFem ? 0.032 * sx : 0.040 * sx, 0.01 * sy, 4, 10), sk())
    elbow.position.set(s * 0.20 * sx, 1.18 * sy, 0)
    root.add(elbow)

    // Forearm
    const farm = new THREE.Mesh(new THREE.CapsuleGeometry(isFem ? 0.028 * sx : 0.034 * sx, 0.20 * sy, 4, 10), sk())
    farm.position.set(s * 0.21 * sx, 1.06 * sy, 0)
    farm.rotation.z = s * 0.14
    root.add(farm)

    // Hand
    const hand = new THREE.Mesh(new THREE.CapsuleGeometry(0.028 * sx, 0.05 * sy, 4, 10), sk())
    hand.scale.set(0.85, 1, 0.55)
    hand.position.set(s * 0.23 * sx, 0.90 * sy, 0)
    root.add(hand)
  }

  // Legs
  for (const s of [-1, 1] as const) {
    const lgX = s * 0.085 * sx

    // Thigh
    const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(isFem ? 0.072 * sx : 0.065 * sx, 0.28 * sy, 4, 12), sk())
    thigh.position.set(lgX, 0.62 * sy, 0)
    root.add(thigh)

    // Knee
    const knee = new THREE.Mesh(new THREE.CapsuleGeometry(isFem ? 0.060 * sx : 0.055 * sx, 0.01 * sy, 4, 10), sk())
    knee.position.set(lgX, 0.46 * sy, 0.004)
    root.add(knee)

    // Lower leg / calf
    const calf = new THREE.Mesh(new THREE.CapsuleGeometry(isFem ? 0.050 * sx : 0.046 * sx, 0.26 * sy, 4, 12), sk())
    calf.position.set(lgX, 0.29 * sy, 0)
    root.add(calf)

    // Ankle
    const ankle = new THREE.Mesh(new THREE.CapsuleGeometry(0.036 * sx, 0.04 * sy, 4, 10), sk())
    ankle.position.set(lgX, 0.11 * sy, 0)
    root.add(ankle)

    // Foot
    const foot = new THREE.Mesh(new THREE.SphereGeometry(0.044, 16, 12), sk())
    foot.scale.set(sx * 0.70, sy * 0.26, sx * 1.35)
    foot.position.set(lgX, 0.04 * sy, 0.034)
    root.add(foot)
  }

  root.traverse(c => { if (c instanceof THREE.Mesh) { c.castShadow = true; c.receiveShadow = true } })
  return root
}

// ══════════════════════════════════════════════════════════════════════════════
// PROCEDURAL CLOTHING FALLBACK (if GLB fails to load)
// Positions match buildAvatar() body geometry exactly
// ══════════════════════════════════════════════════════════════════════════════

function buildProceduralClothing(item: ClothingItem, sy: number, sx: number): THREE.Group {
  const g = new THREE.Group()
  const m = mat(item.color, 0.78, 0.02)

  if (item.category === 'tops') {
    // Cover chest (1.40) down to waist (1.15) and up to collar (1.51)
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.152 * sx, 0.122 * sx, 0.50 * sy, 22), m)
    body.position.set(0, 1.25 * sy, 0); g.add(body)
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.062 * sx, 0.066 * sx, 0.036 * sy, 18), m)
    collar.position.set(0, 1.50 * sy, 0); g.add(collar)
    for (const s of [-1, 1] as const) {
      const sl = new THREE.Mesh(new THREE.CylinderGeometry(0.040 * sx, 0.034 * sx, 0.30 * sy, 14), m)
      sl.position.set(s * 0.185 * sx, 1.34 * sy, 0); sl.rotation.z = s * 0.18; g.add(sl)
    }
  } else if (item.category === 'bottoms') {
    // Cover hips (0.92) down to ankles (0.11)
    const wb = new THREE.Mesh(new THREE.CylinderGeometry(0.158 * sx, 0.136 * sx, 0.12 * sy, 20), m)
    wb.position.set(0, 0.86 * sy, 0); g.add(wb)
    for (const s of [-1, 1] as const) {
      const lg = new THREE.Mesh(new THREE.CylinderGeometry(0.074 * sx, 0.052 * sx, 0.60 * sy, 16), m)
      lg.position.set(s * 0.086 * sx, 0.51 * sy, 0); g.add(lg)
    }
  } else if (item.category === 'shoes') {
    // Foot spheres at 0.04 * sy
    for (const s of [-1, 1] as const) {
      const sh = new THREE.Mesh(new THREE.SphereGeometry(0.052, 16, 12), m)
      sh.scale.set(sx * 0.74, sy * 0.28, sx * 1.42); sh.position.set(s * 0.086 * sx, 0.05 * sy, 0.038); g.add(sh)
      const sole = new THREE.Mesh(new THREE.SphereGeometry(0.052, 16, 12), mat('#111111', 0.90))
      sole.scale.set(sx * 0.74, sy * 0.10, sx * 1.42); sole.position.set(s * 0.086 * sx, 0.018 * sy, 0.038); g.add(sole)
    }
  } else {
    // Accessories — necklace ring at neck base
    const acc = new THREE.Mesh(new THREE.TorusGeometry(0.060 * sx, 0.012, 12, 32), m)
    acc.rotation.x = Math.PI / 2.2; acc.position.set(0, 1.54 * sy, 0.025); g.add(acc)
  }
  g.traverse(c => { if (c instanceof THREE.Mesh) c.castShadow = true })
  return g
}

// ══════════════════════════════════════════════════════════════════════════════
// REACT COMPONENT
// ══════════════════════════════════════════════════════════════════════════════

const AvatarViewer: React.FC<Props> = ({ wornItems }) => {
  const mountRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<THREE.Scene | undefined>(undefined)
  const rendererRef = useRef<THREE.WebGLRenderer | undefined>(undefined)
  const cameraRef = useRef<THREE.PerspectiveCamera | undefined>(undefined)
  const controlsRef = useRef<InstanceType<typeof OrbitControls> | undefined>(undefined)
  const clothingRefs = useRef<Map<string, THREE.Group>>(new Map())
  const frameRef = useRef<number | undefined>(undefined)
  const bodyGroupRef = useRef<THREE.Group | undefined>(undefined)

  const { facialFeatures, bodyMetrics, getActiveSize } = useAppStore()
  const [loading, setLoading] = useState(true)
  const [geomParams, setGeomParams] = useState<AvatarGeometryParams>(DEFAULT_GEOM)
  const [rawLandmarks, setRawLandmarks] = useState<RawLM[] | null>(null)
  const [landmarkStatus, setLandmarkStatus] = useState<'pending' | 'detected' | 'fallback'>('pending')
  const [loadingItem, setLoadingItem] = useState<string | null>(null)

  const getBodyScale = useCallback((): [number, number, number] => {
    if (!bodyMetrics) return [1, 1, 1]
    const hs = bodyMetrics.height / 170
    const bmi = bodyMetrics.weight / ((bodyMetrics.height / 100) ** 2)
    const w = bmi < 18.5 ? 0.88 : bmi < 25 ? 1.0 : bmi < 30 ? 1.13 : 1.27
    const bt: Record<string, [number, number, number]> = {
      hourglass: [1.00, 1.0, 0.95], pear: [0.92, 1.0, 1.09],
      apple: [1.06, 1.0, 1.05], rectangle: [1.00, 1.0, 1.00],
      'inverted-triangle': [1.09, 1.0, 0.91],
    }
    const b = bt[bodyMetrics.bodyType] ?? [1, 1, 1]
    return [w * b[0], hs * b[1], w * b[2]]
  }, [bodyMetrics])

  // Landmark pipeline
  useEffect(() => {
    if (!facialFeatures?.capturedImage) return
    setLandmarkStatus('pending')
    extractLandmarkMetrics(facialFeatures.capturedImage).then(metrics => {
      const params = landmarksToAvatarParams(metrics)
      setGeomParams(params)
      setLandmarkStatus(metrics.landmarksDetected ? 'detected' : 'fallback')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cached = (window as any).__vibefit_last_landmarks__ as RawLM[] | undefined
      if (cached && cached.length >= 400) setRawLandmarks(cached)
    }).catch(() => setLandmarkStatus('fallback'))
  }, [facialFeatures?.capturedImage])

  // Three.js scene init
  useEffect(() => {
    if (!mountRef.current) return
    const container = mountRef.current

    const scene = new THREE.Scene()
    scene.background = null
    sceneRef.current = scene

    const camera = new THREE.PerspectiveCamera(40, container.clientWidth / container.clientHeight, 0.01, 100)
    camera.position.set(0, 1.55, 3.4)
    cameraRef.current = camera

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setSize(container.clientWidth, container.clientHeight)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.15
    container.appendChild(renderer.domElement)
    rendererRef.current = renderer

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.target.set(0, 1.05, 0)
    controls.enableDamping = true
    controls.dampingFactor = 0.06
    controls.minDistance = 1.0
    controls.maxDistance = 6.0
    controls.minPolarAngle = Math.PI * 0.05
    controls.maxPolarAngle = Math.PI * 0.88
    controls.update()
    controlsRef.current = controls

    scene.add(new THREE.AmbientLight(0xfff5e8, 0.75))
    const key = new THREE.DirectionalLight(0xfff8f0, 1.50)
    key.position.set(1.8, 5, 3.5); key.castShadow = true
    key.shadow.mapSize.set(2048, 2048); key.shadow.bias = -0.001; scene.add(key)
    const fill = new THREE.DirectionalLight(0xddeeff, 0.45)
    fill.position.set(-2.5, 2, -1); scene.add(fill)
    const rim = new THREE.DirectionalLight(0xffffff, 0.65)
    rim.position.set(0, 3.5, -3); scene.add(rim)
    const under = new THREE.DirectionalLight(0xffe0d0, 0.22)
    under.position.set(0, -1.5, 2); scene.add(under)

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(8, 8),
      new THREE.MeshStandardMaterial({ color: 0x1a1a2e, roughness: 0.9, transparent: true, opacity: 0.6 })
    )
    ground.rotation.x = -Math.PI / 2; ground.position.y = -0.02; ground.receiveShadow = true; scene.add(ground)

    setTimeout(() => setLoading(false), 200)

    const animate = () => {
      frameRef.current = requestAnimationFrame(animate)
      controls.update()
      renderer.render(scene, camera)
    }
    animate()

    const onResize = () => {
      camera.aspect = container.clientWidth / container.clientHeight
      camera.updateProjectionMatrix()
      renderer.setSize(container.clientWidth, container.clientHeight)
    }
    window.addEventListener('resize', onResize)

    return () => {
      window.removeEventListener('resize', onResize)
      if (frameRef.current) cancelAnimationFrame(frameRef.current)
      renderer.dispose()
      if (container.contains(renderer.domElement)) container.removeChild(renderer.domElement)
    }
  }, [])

  // Rebuild body
  useEffect(() => {
    if (!sceneRef.current || !facialFeatures) return
    const scene = sceneRef.current
    if (bodyGroupRef.current) {
      scene.remove(bodyGroupRef.current)
      bodyGroupRef.current.traverse(c => {
        if (c instanceof THREE.Mesh) {
          c.geometry.dispose()
          if (Array.isArray(c.material)) c.material.forEach(m => m.dispose())
          else c.material.dispose()
        }
      })
      bodyGroupRef.current = undefined
    }
    buildAvatar(facialFeatures, bodyMetrics, getBodyScale(), geomParams, rawLandmarks).then(body => {
      if (!sceneRef.current) return
      scene.add(body)
      bodyGroupRef.current = body
    })
  }, [facialFeatures, bodyMetrics, geomParams, rawLandmarks, getBodyScale])

  // ── CLOTHING SYNC with GLB loading ─────────────────────────────────────────
  useEffect(() => {
    if (!sceneRef.current) return
    const scene = sceneRef.current
    const [sx, sy] = getBodyScale()
    const live = new Set(wornItems.map(i => i.id))

    // Remove items no longer worn
    clothingRefs.current.forEach((obj, id) => {
      if (!live.has(id)) {
        scene.remove(obj)
        obj.traverse(c => {
          if (c instanceof THREE.Mesh) {
            c.geometry.dispose()
            if (Array.isArray(c.material)) c.material.forEach(m => m.dispose())
            else c.material.dispose()
          }
        })
        clothingRefs.current.delete(id)
      }
    })

    // Add/update worn items
    for (const item of wornItems) {
      const activeSize = getActiveSize(item.id)
      const sizeTag = `${item.id}::${activeSize}`

      if (clothingRefs.current.has(item.id)) {
        const existing = clothingRefs.current.get(item.id)!
        const currentTag = (existing as any).__sizeTag
        if (currentTag === sizeTag) {
          // Same size — just re-tint
          tintGLB(existing, item.color)
          continue
        }
        // Size changed — remove and reload
        scene.remove(existing)
        clothingRefs.current.delete(item.id)
      }

      // Load GLB or use procedural fallback
      if (item.glbPath) {
        setLoadingItem(item.name)
        loadGLB(item.glbPath, item.category, activeSize, item.color, sy, sx)
          .then(model => {
            if (!sceneRef.current) return
            ;(model as any).__sizeTag = sizeTag
            scene.add(model)
            clothingRefs.current.set(item.id, model)
            setLoadingItem(null)
          })
          .catch(() => {
            const fallback = buildProceduralClothing(item, sy, sx)
            ;(fallback as any).__sizeTag = sizeTag
            scene.add(fallback)
            clothingRefs.current.set(item.id, fallback)
            setLoadingItem(null)
          })
      } else {
        const proc = buildProceduralClothing(item, sy, sx)
        ;(proc as any).__sizeTag = sizeTag
        scene.add(proc)
        clothingRefs.current.set(item.id, proc)
      }
    }
  }, [wornItems, getBodyScale, getActiveSize])

  return (
    <div className="avatar-viewer-wrap">
      {loading && (
        <div className="avatar-loading">
          <div className="avatar-loading-ring" />
          <p>Building your avatar…</p>
        </div>
      )}
      {loadingItem && (
        <div className="clothing-loading-toast">
          <div className="clothing-spinner" />
          <span>Fitting {loadingItem}…</span>
        </div>
      )}
      <div
        ref={mountRef}
        className="avatar-canvas"
        style={{ opacity: loading ? 0 : 1, transition: 'opacity 0.5s ease' }}
      />
      {!loading && landmarkStatus !== 'pending' && (
        <div className="landmark-badge" data-status={landmarkStatus}>
          {landmarkStatus === 'detected'
            ? '⬡ 468-point face mesh active'
            : '⬡ Standard avatar mode'}
        </div>
      )}
      <div className="avatar-controls-hint">
        <span>🖱 Drag to rotate</span>
        <span>⟳ Scroll to zoom</span>
      </div>
    </div>
  )
}

export default AvatarViewer