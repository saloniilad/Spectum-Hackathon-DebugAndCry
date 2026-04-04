import React, { useRef, useState, useCallback, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAppStore } from '../store/AppStore'
import { extractFacialFeatures } from '../utils/facialAnalysis'
import type { FacialFeatures } from '../types'

const FaceCapture: React.FC = () => {
  const { setFacialFeatures, setStep } = useAppStore()
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [capturedImage, setCapturedImage] = useState<string | null>(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [features, setFeatures] = useState<FacialFeatures | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [mode, setMode] = useState<'choose' | 'camera' | 'preview'>('choose')

  const startCamera = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: 'user' },
      })
      setStream(mediaStream)
      if (videoRef.current) videoRef.current.srcObject = mediaStream
      setMode('camera')
    } catch {
      setError('Camera access denied. Please upload a photo instead.')
    }
  }

  const stopCamera = useCallback(() => {
    stream?.getTracks().forEach(t => t.stop())
    setStream(null)
  }, [stream])

  useEffect(() => () => { stream?.getTracks().forEach(t => t.stop()) }, [stream])

  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return
    const ctx = canvasRef.current.getContext('2d')!
    canvasRef.current.width = videoRef.current.videoWidth
    canvasRef.current.height = videoRef.current.videoHeight
    ctx.drawImage(videoRef.current, 0, 0)
    const dataUrl = canvasRef.current.toDataURL('image/jpeg', 0.9)
    setCapturedImage(dataUrl)
    stopCamera()
    setMode('preview')
    analyzeImage(dataUrl)
  }

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string
      setCapturedImage(dataUrl)
      setMode('preview')
      analyzeImage(dataUrl)
    }
    reader.readAsDataURL(file)
  }

  const analyzeImage = async (imageSrc: string) => {
    setAnalyzing(true)
    try {
      await new Promise(r => setTimeout(r, 800))
      const extracted = await extractFacialFeatures(imageSrc)
      setFeatures(extracted)
    } catch {
      setError('Failed to analyze image. Please try again.')
    } finally {
      setAnalyzing(false)
    }
  }

  const proceed = () => {
    if (features) { setFacialFeatures(features); setStep('body-metrics') }
  }

  const reset = () => {
    setCapturedImage(null); setFeatures(null); setAnalyzing(false)
    setError(null); setMode('choose')
  }

  return (
    <div className="face-capture">
      <AnimatePresence mode="wait">
        {mode === 'choose' && (
          <motion.div key="choose"
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}>
            <div className="step-label">STEP 01</div>
            <h2 className="panel-title">Facial Scan</h2>
            <p className="panel-desc">Let us analyze your face to create a personalized avatar that looks just like you.</p>
            {error && <div className="error-msg">{error}</div>}
            <div className="capture-options">
              <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                className="capture-btn primary" onClick={startCamera}>
                <span className="btn-icon">◉</span><span>Use Camera</span>
              </motion.button>
              <div className="or-divider">or</div>
              <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                className="capture-btn secondary" onClick={() => fileInputRef.current?.click()}>
                <span className="btn-icon">↑</span><span>Upload Photo</span>
              </motion.button>
              <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFileUpload} />
            </div>
            <p className="privacy-note">🔒 Images are processed locally and never stored</p>
          </motion.div>
        )}

        {mode === 'camera' && (
          <motion.div key="camera" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="camera-panel">
            <div className="camera-frame">
              <video ref={videoRef} autoPlay playsInline muted className="camera-feed" />
              <div className="face-guide">
                <div className="guide-oval" />
                <p className="guide-text">Center your face</p>
              </div>
            </div>
            <canvas ref={canvasRef} style={{ display: 'none' }} />
            <div className="camera-controls">
              <motion.button whileTap={{ scale: 0.9 }} className="shutter-btn" onClick={capturePhoto}>
                <span className="shutter-inner" />
              </motion.button>
              <button className="cancel-btn" onClick={reset}>Cancel</button>
            </div>
          </motion.div>
        )}

        {mode === 'preview' && (
          <motion.div key="preview"
            initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
            className="preview-panel">
            <div className="preview-image-wrap">
              {capturedImage && <img src={capturedImage} alt="Captured" className="preview-img" />}
              {analyzing && (
                <div className="analyzing-overlay">
                  <div className="scan-line" />
                  <div className="analyzing-text">
                    <div className="dot-pulse"><span /><span /><span /></div>
                    <span>Analyzing facial features...</span>
                  </div>
                </div>
              )}
            </div>
            {features && !analyzing && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="features-result">
                <div className="features-grid">
                  <div className="feature-tag">
                    <div className="feature-swatch" style={{ background: features.skinToneHex }} />
                    <div><div className="feature-label">Skin</div><div className="feature-value">{features.skinTone}</div></div>
                  </div>
                  <div className="feature-tag">
                    <div className="feature-icon">👁</div>
                    <div><div className="feature-label">Eyes</div><div className="feature-value">{features.eyeShape}</div></div>
                  </div>
                  <div className="feature-tag">
                    <div className="feature-icon">⬡</div>
                    <div><div className="feature-label">Face</div><div className="feature-value">{features.faceShape}</div></div>
                  </div>
                  <div className="feature-tag">
                    <div className="feature-icon">👄</div>
                    <div><div className="feature-label">Lips</div><div className="feature-value">{features.lipShape}</div></div>
                  </div>
                </div>
                <div className="preview-actions">
                  <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
                    className="proceed-btn" onClick={proceed}>Continue →</motion.button>
                  <button className="retake-btn" onClick={reset}>Retake</button>
                </div>
              </motion.div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default FaceCapture
