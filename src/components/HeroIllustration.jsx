import { useEffect, useMemo, useRef } from 'react'
import { Canvas } from '@react-three/fiber'
import * as THREE from 'three'
import { gsap } from 'gsap'
import styles from './HeroIllustration.module.css'

const SKIN = '#e0a077'
const VEIN = '#b8102c'
const VEIN_GLOW = '#e63950'

// Arm cross-section radius at each distance along the arm, from wrist (0) to just above the elbow (~4.9).
// Widens gradually toward the elbow bulge — this is what makes the revolved shape read as a forearm
// rather than a plain tapered cylinder.
const ARM_PROFILE = [
  [0.40, 0.00], [0.44, 0.15], [0.49, 0.55], [0.54, 1.15],
  [0.57, 1.85], [0.59, 2.50], [0.61, 3.05], [0.65, 3.55],
  [0.73, 4.00], [0.80, 4.32], [0.77, 4.55], [0.70, 4.78], [0.68, 4.92],
]

// Median cubital vein path, riding just under the surface across the inner elbow (antecubital area).
const VEIN_PATH = [
  [2.55, 0.53, 0.06], [2.95, 0.55, -0.03], [3.35, 0.585, 0.05],
  [3.72, 0.62, -0.04], [4.05, 0.70, 0.03], [4.28, 0.74, -0.01],
]

// Needle insertion site — a point directly on the vein path above.
const NEEDLE_TARGET = VEIN_PATH[3]
// Rotation (radians) of the needle around the arm's long axis: controls the insertion angle.
// Tweak this first if the needle looks wrong relative to the vein.
const NEEDLE_TILT = 0.68

function useGlowTexture() {
  return useMemo(() => {
    const size = 128
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = size
    const ctx = canvas.getContext('2d')
    const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
    grad.addColorStop(0, 'rgba(255,235,235,1)')
    grad.addColorStop(0.35, 'rgba(230,57,80,0.55)')
    grad.addColorStop(1, 'rgba(200,16,46,0)')
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, size, size)
    const tex = new THREE.CanvasTexture(canvas)
    tex.needsUpdate = true
    return tex
  }, [])
}

function Arm() {
  const groupRef = useRef(null)
  const needleRef = useRef(null)
  const glowRef = useRef(null)
  const pulseRef = useRef(null)
  const glowTex = useGlowTexture()

  const armGeo = useMemo(() => {
    const pts = ARM_PROFILE.map(([r, h]) => new THREE.Vector2(r, h))
    const geo = new THREE.LatheGeometry(pts, 56)
    geo.rotateZ(-Math.PI / 2) // lay the revolve axis along local X (wrist -> elbow)
    geo.computeVertexNormals()
    return geo
  }, [])

  const veinCurve = useMemo(
    () => new THREE.CatmullRomCurve3(VEIN_PATH.map(([x, y, z]) => new THREE.Vector3(x, y, z))),
    []
  )

  useEffect(() => {
    const needle = needleRef.current
    const glow = glowRef.current
    const pulse = pulseRef.current
    const group = groupRef.current

    gsap.fromTo(needle.position, { y: 0.85 }, { y: -0.05, duration: 1.5, delay: 0.5, ease: 'power2.out' })

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduce) return

    gsap.to(group.position, { y: '+=0.12', duration: 4.6, ease: 'sine.inOut', repeat: -1, yoyo: true })
    gsap.to(group.rotation, { z: '+=0.02', duration: 5.2, ease: 'sine.inOut', repeat: -1, yoyo: true })

    gsap.to(glow.scale, { x: 1.6, y: 1.6, z: 1.6, duration: 1.7, ease: 'sine.inOut', repeat: -1, yoyo: true, delay: 2 })
    gsap.to(glow.material, { opacity: 0.85, duration: 1.7, ease: 'sine.inOut', repeat: -1, yoyo: true, delay: 2 })

    const p = { t: 0 }
    gsap.to(p, {
      t: 1, duration: 2.6, ease: 'power1.inOut', repeat: -1, delay: 2.2,
      onUpdate: () => {
        pulse.position.copy(veinCurve.getPointAt(p.t))
        pulse.material.opacity = Math.sin(p.t * Math.PI) * 0.9
      },
    })
  }, [veinCurve])

  return (
    <group ref={groupRef} position={[-3.55, -0.35, 0]} rotation={[0.08, 0.35, -0.12]}>
      <mesh geometry={armGeo}>
        <meshPhysicalMaterial color={SKIN} roughness={0.55} clearcoat={0.25} clearcoatRoughness={0.4} />
      </mesh>

      {/* vein core */}
      <mesh>
        <tubeGeometry args={[veinCurve, 64, 0.05, 10, false]} />
        <meshStandardMaterial color={VEIN} emissive={VEIN} emissiveIntensity={0.6} roughness={0.4} transparent opacity={0.92} />
      </mesh>
      {/* vein glow, sitting just above the skin surface */}
      <mesh>
        <tubeGeometry args={[veinCurve, 64, 0.09, 10, false]} />
        <meshBasicMaterial color={VEIN_GLOW} transparent opacity={0.18} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>

      {/* pulse travelling along the vein */}
      <sprite ref={pulseRef} scale={[0.5, 0.5, 0.5]}>
        <spriteMaterial map={glowTex} transparent opacity={0} depthWrite={false} blending={THREE.AdditiveBlending} />
      </sprite>

      {/* glow at the insertion point */}
      <sprite ref={glowRef} position={NEEDLE_TARGET} scale={[0.7, 0.7, 0.7]}>
        <spriteMaterial map={glowTex} transparent opacity={0.4} depthWrite={false} blending={THREE.AdditiveBlending} />
      </sprite>

      {/* needle, angled along the vein direction */}
      <group position={NEEDLE_TARGET} rotation={[0, 0, NEEDLE_TILT]}>
        <group ref={needleRef}>
          <mesh position={[0, 0.11, 0]} rotation={[Math.PI, 0, 0]}>
            <coneGeometry args={[0.028, 0.22, 12]} />
            <meshStandardMaterial color="#cfd8e3" metalness={0.85} roughness={0.2} />
          </mesh>
          <mesh position={[0, 0.92, 0]}>
            <cylinderGeometry args={[0.028, 0.028, 1.4, 12]} />
            <meshStandardMaterial color="#cfd8e3" metalness={0.85} roughness={0.25} />
          </mesh>
          <mesh position={[0, 1.77, 0]}>
            <cylinderGeometry args={[0.09, 0.07, 0.3, 12]} />
            <meshStandardMaterial color="#c8102e" roughness={0.4} />
          </mesh>
        </group>
      </group>
    </group>
  )
}

export default function HeroIllustration() {
  return (
    <div className={styles.wrap} aria-hidden="true">
      <Canvas camera={{ position: [0, 0.4, 7], fov: 30 }} gl={{ antialias: true, alpha: true }} dpr={[1, 2]}>
        <fog attach="fog" args={['#fdf1ee', 6, 14]} />
        <ambientLight intensity={0.6} color="#fff5f2" />
        <directionalLight position={[4, 6, 5]} intensity={1.1} color="#fff8f4" />
        <directionalLight position={[-5, -2, -3]} intensity={0.35} color="#e6394f" />
        <Arm />
      </Canvas>
    </div>
  )
}
