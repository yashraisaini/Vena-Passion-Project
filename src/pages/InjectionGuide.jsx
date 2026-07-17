import { useEffect, useRef, useState } from 'react'
import * as tf from '@tensorflow/tfjs-core'
import '@tensorflow/tfjs-backend-webgl'
import * as handPoseDetection from '@tensorflow-models/hand-pose-detection'
import styles from './InjectionGuide.module.css'

// MediaPipe Hands' 21-keypoint skeleton, used to draw the tracked hand as a
// stick-figure overlay -- same hand-rolled canvas-drawing approach already
// used elsewhere in this app (vein-network background, PK charts).
const CONNECTIONS = [
  [0,1],[1,2],[2,3],[3,4],         // thumb
  [0,5],[5,6],[6,7],[7,8],         // index
  [5,9],[9,10],[10,11],[11,12],    // middle
  [9,13],[13,14],[14,15],[15,16],  // ring
  [13,17],[17,18],[18,19],[19,20], // pinky
  [0,17],                          // palm base
]

export default function InjectionGuide() {
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const streamRef = useRef(null)
  const detectorRef = useRef(null)
  const rafRef = useRef(null)

  const [status, setStatus] = useState('idle') // idle | loading-model | starting-camera | running | error
  const [error, setError] = useState('')
  const [handDetected, setHandDetected] = useState(false)

  useEffect(() => {
    return () => stopAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function start() {
    setError('')
    try {
      setStatus('loading-model')
      if (!detectorRef.current) {
        await tf.ready()
        detectorRef.current = await handPoseDetection.createDetector(
          handPoseDetection.SupportedModels.MediaPipeHands,
          { runtime: 'tfjs', modelType: 'lite', maxHands: 1 }
        )
      }

      setStatus('starting-camera')
      // Prefer the back camera (pointing at your own arm/hand) but fall
      // back gracefully to whatever camera is available -- `ideal` is a
      // soft preference, not a hard requirement.
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
      })
      streamRef.current = stream
      videoRef.current.srcObject = stream
      await videoRef.current.play()

      setStatus('running')
      loop()
    } catch (err) {
      setError(err?.message || 'Could not start the camera')
      setStatus('error')
      stopAll()
    }
  }

  function stopAll() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    rafRef.current = null
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
    setHandDetected(false)
    setStatus(prev => (prev === 'error' ? prev : 'idle'))
  }

  async function loop() {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas || !detectorRef.current || !streamRef.current) return

    if (video.videoWidth && (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight)) {
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
    }

    // Deliberately NOT mirrored, even if this falls back to a front-facing
    // webcam -- for angle guidance, left/right needs to match reality, not
    // feel like a flattering selfie mirror.
    const hands = await detectorRef.current.estimateHands(video, { flipHorizontal: false })
    setHandDetected(hands.length > 0)
    drawOverlay(canvas, hands)

    rafRef.current = requestAnimationFrame(loop)
  }

  function drawOverlay(canvas, hands) {
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    hands.forEach(hand => {
      const pts = hand.keypoints
      ctx.strokeStyle = '#c8102e'
      ctx.lineWidth = 3
      CONNECTIONS.forEach(([a, b]) => {
        const p1 = pts[a], p2 = pts[b]
        if (!p1 || !p2) return
        ctx.beginPath()
        ctx.moveTo(p1.x, p1.y)
        ctx.lineTo(p2.x, p2.y)
        ctx.stroke()
      })
      pts.forEach(p => {
        ctx.beginPath()
        ctx.arc(p.x, p.y, 4, 0, Math.PI * 2)
        ctx.fillStyle = '#fdf8f6'
        ctx.fill()
        ctx.strokeStyle = '#241412'
        ctx.lineWidth = 1
        ctx.stroke()
      })
    })
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Guided Infusion — Camera (Beta)</h1>
        <p className={styles.disclaimer}>
          Experimental visual aid only — it does not replace training from your care team. Video is
          processed entirely on your device; nothing is uploaded, sent to a server, or recorded.
        </p>
      </div>

      <div className={styles.stage}>
        <video ref={videoRef} className={styles.video} playsInline muted />
        <canvas ref={canvasRef} className={styles.canvas} />
        {status !== 'running' && (
          <div className={styles.overlay}>
            {status === 'idle' && <button className={styles.btnPrimary} onClick={start}>Start camera</button>}
            {status === 'loading-model' && <p>Loading hand-tracking model…</p>}
            {status === 'starting-camera' && <p>Requesting camera access…</p>}
            {status === 'error' && (
              <>
                <p className={styles.errorText}>{error}</p>
                <button className={styles.btnPrimary} onClick={start}>Try again</button>
              </>
            )}
          </div>
        )}
      </div>

      {status === 'running' && (
        <div className={styles.controls}>
          <span className={`${styles.statusDot} ${handDetected ? styles.statusOn : ''}`} />
          <span>{handDetected ? 'Hand detected' : 'No hand detected — center your hand in frame'}</span>
          <button className={styles.btnGhost} onClick={stopAll}>Stop camera</button>
        </div>
      )}
    </div>
  )
}
