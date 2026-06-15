'use client'

// ─────────────────────────────────────────────────────────────────────────────
// LiquidBackground — fondo WebGL con shader de fluido iridiscente.
//
// Optimizaciones de memoria/GPU:
//   - DPR limitado a 1.5 (menos píxeles que renderizar)
//   - mediump en vez de highp (la mitad de memoria por variable en GPU)
//   - Renderiza a 30 fps (skip frame) en vez de 60
//   - Pausa completamente si la pestaña no es visible
//   - powerPreference: 'low-power' → usa GPU integrada
//   - Sin depth/stencil/antialias buffers
//   - Cleanup agresivo en unmount (loseContext + removeChild)
//   - Resize con debounce para no realocar buffers en cada pixel
//
// Solo se usa en la página de login. No afecta al resto de la app.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef } from 'react'
import { Renderer, Program, Mesh, Triangle } from 'ogl'
import './LiquidBackground.css'

const vertex = /* glsl */ `
  attribute vec2 position;
  attribute vec2 uv;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position, 0.0, 1.0);
  }
`

// mediump es suficiente para este efecto visual — usa la mitad de
// memoria por variable que highp en la mayoría de GPUs móviles.
const fragment = /* glsl */ `
  precision mediump float;

  uniform float uTime;
  uniform vec2 uResolution;

  varying vec2 vUv;

  // ── Simplex noise 3D ───────────────────────────────────────────────────

  vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 permute(vec4 x) { return mod289(((x * 34.0) + 10.0) * x); }
  vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

  float snoise(vec3 v) {
    const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);

    vec3 i = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);

    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);

    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;

    i = mod289(i);
    vec4 p = permute(permute(permute(
      i.z + vec4(0.0, i1.z, i2.z, 1.0))
      + i.y + vec4(0.0, i1.y, i2.y, 1.0))
      + i.x + vec4(0.0, i1.x, i2.x, 1.0));

    float n_ = 0.142857142857;
    vec3 ns = n_ * D.wyz - D.xzx;

    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);

    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);

    vec4 x = x_ * ns.x + ns.yyyy;
    vec4 y = y_ * ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);

    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);

    vec4 s0 = floor(b0) * 2.0 + 1.0;
    vec4 s1 = floor(b1) * 2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));

    vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;

    vec3 p0 = vec3(a0.xy, h.x);
    vec3 p1 = vec3(a0.zw, h.y);
    vec3 p2 = vec3(a1.xy, h.z);
    vec3 p3 = vec3(a1.zw, h.w);

    vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
    p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;

    vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
    m = m * m;
    return 42.0 * dot(m * m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
  }

  void main() {
    vec2 uv = vUv;
    float aspect = uResolution.x / uResolution.y;
    vec2 pos = (uv - 0.5) * vec2(aspect, 1.0);

    float t = uTime;

    // ── Colores sacados de la referencia ────────────────────────
    vec3 teal     = vec3(0.07, 0.48, 0.63);  // #127AA0
    vec3 lavender = vec3(0.50, 0.45, 0.72);  // lavanda centro
    vec3 violet   = vec3(0.45, 0.30, 0.68);  // violeta derecha
    vec3 pink     = vec3(0.88, 0.15, 0.52);  // rosa intenso vibrante
    vec3 pinkDeep = vec3(0.58, 0.08, 0.40);  // núcleo oscuro del blob

    // ── Gradiente base: teal izquierda → violeta derecha ─────────
    float n1 = snoise(vec3(pos * 0.8, t * 0.04));
    float n2 = snoise(vec3(pos * 1.2 + 5.0, t * 0.03));
    float warped_x = uv.x + n1 * 0.05;

    vec3 color = mix(teal, lavender, smoothstep(0.0, 0.50, warped_x));
    color = mix(color, violet, smoothstep(0.40, 0.95, warped_x));

    // ── Blob magenta — una mancha grande que fluye internamente ─
    vec2 blobCenter = vec2(0.16, 0.0);

    vec2 toBlobCenter = pos - blobCenter;
    toBlobCenter.x *= 0.55;
    toBlobCenter.y *= 0.75;

    vec2 innerWarp = vec2(
      snoise(vec3(pos * 1.5, t * 0.06)),
      snoise(vec3(pos * 1.5 + 8.0, t * 0.05))
    );
    toBlobCenter += innerWarp * 0.08;

    float dist = length(toBlobCenter);

    float blobMask = 1.0 - smoothstep(0.08, 0.58, dist);

    vec3 pinkLight = vec3(0.92, 0.75, 0.85);
    vec3 blobColor = mix(pinkLight, pink, smoothstep(0.45, 0.20, dist));
    blobColor = mix(blobColor, pinkDeep, smoothstep(0.15, 0.0, dist));
    color = mix(color, blobColor, blobMask * 0.80);

    // ── Morado distribuido por el gradiente ──────────────────────
    vec3 deepViolet = vec3(0.42, 0.10, 0.65);
    float violetNoise = snoise(vec3(pos * 1.2 + 15.0, t * 0.035));
    violetNoise = violetNoise * 0.5 + 0.5;
    float violetMask = smoothstep(0.45, 0.72, violetNoise);
    violetMask *= smoothstep(0.25, 0.55, uv.x);
    color = mix(color, deepViolet, violetMask * 0.35);

    // ── Blob azul — lado izquierdo ──────────────────────────────
    vec3 softBlue = vec3(0.08, 0.42, 0.58);
    vec3 softBlueCore = vec3(0.05, 0.34, 0.48);

    vec2 blueCenter = vec2(-0.28, 0.05);
    vec2 toBlueCenter = pos - blueCenter;
    toBlueCenter.x *= 0.65;
    toBlueCenter.y *= 0.85;

    vec2 blueWarp = vec2(
      snoise(vec3(pos * 1.5 + 20.0, t * 0.055)),
      snoise(vec3(pos * 1.5 + 28.0, t * 0.045))
    );
    toBlueCenter += blueWarp * 0.08;

    float blueDist = length(toBlueCenter);
    float blueMask = 1.0 - smoothstep(0.08, 0.48, blueDist);

    vec3 blueColor = mix(softBlue, softBlueCore, smoothstep(0.18, 0.0, blueDist));
    color = mix(color, blueColor, blueMask * 0.65);

    // ── Blobs blancos — manchas suaves y grandes entre los blobs ─
    vec3 white = vec3(0.82, 0.82, 0.90);

    float w1 = snoise(vec3(pos * 1.2 + 40.0, t * 0.04));
    float w2 = snoise(vec3(pos * 1.0 + 50.0, t * 0.035));

    float whiteMask = smoothstep(0.25, 0.65, w1) * 0.10
                    + smoothstep(0.30, 0.70, w2) * 0.08;

    color = mix(color, white, whiteMask);

    gl_FragColor = vec4(color, 1.0);
  }
`

export default function LiquidBackground() {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    // ── Detectar prefers-reduced-motion ────────────────────────────────
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    let reducedMotion = motionQuery.matches

    function onMotionChange(e: MediaQueryListEvent) {
      reducedMotion = e.matches
    }
    motionQuery.addEventListener('change', onMotionChange)

    // ── Crear renderer OGL ────────────────────────────────────────────
    // Sin alpha/depth/stencil/antialias = menos buffers en VRAM
    const renderer = new Renderer({
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      powerPreference: 'low-power',
    })
    const gl = renderer.gl
    container.appendChild(gl.canvas)

    // ── Geometría fullscreen (un solo triángulo — 3 vértices, no 6) ───
    const geometry = new Triangle(gl)

    const program = new Program(gl, {
      vertex,
      fragment,
      uniforms: {
        uTime: { value: 0 },
        uResolution: { value: [window.innerWidth, window.innerHeight] },
      },
    })

    const mesh = new Mesh(gl, { geometry, program })

    // ── Resize con debounce (no realoca buffers cada pixel) ───────────
    let resizeTimer: ReturnType<typeof setTimeout>
    function resize() {
      // DPR limitado a 1.5 — reduce píxeles renderizados ~55% vs DPR 2
      // El blur del shader hace que no se note la diferencia
      const dpr = Math.min(window.devicePixelRatio, 1.5)
      renderer.setSize(window.innerWidth, window.innerHeight)
      gl.canvas.style.width = window.innerWidth + 'px'
      gl.canvas.style.height = window.innerHeight + 'px'
      renderer.dpr = dpr
      program.uniforms.uResolution.value = [
        window.innerWidth * dpr,
        window.innerHeight * dpr,
      ]
    }
    resize()

    function onResize() {
      clearTimeout(resizeTimer)
      resizeTimer = setTimeout(resize, 150)
    }
    window.addEventListener('resize', onResize)

    // ── Pausar cuando la pestaña no está visible ──────────────────────
    let visible = true
    function onVisibility() {
      visible = !document.hidden
    }
    document.addEventListener('visibilitychange', onVisibility)

    // ── Render loop a 30 fps (skip frames) ────────────────────────────
    // 30 fps es suficiente para movimiento tan lento — reduce carga
    // de GPU a la mitad vs 60 fps. La animación se ve igual de suave
    // porque el shader ya usa velocidades de 0.03–0.06.
    let raf: number
    const startTime = performance.now()
    let lastFrame = 0
    const FRAME_INTERVAL = 1000 / 30  // ~33ms entre frames

    function update(now: number) {
      raf = requestAnimationFrame(update)

      // No renderizar si la pestaña no está visible
      if (!visible) return

      // Skip frame si no han pasado 33ms
      if (now - lastFrame < FRAME_INTERVAL) return
      lastFrame = now

      const elapsed = (now - startTime) * 0.001
      program.uniforms.uTime.value = reducedMotion ? elapsed * 0.05 : elapsed

      renderer.render({ scene: mesh })
    }
    raf = requestAnimationFrame(update)

    // ── Cleanup agresivo ──────────────────────────────────────────────
    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(resizeTimer)
      window.removeEventListener('resize', onResize)
      document.removeEventListener('visibilitychange', onVisibility)
      motionQuery.removeEventListener('change', onMotionChange)

      // Liberar contexto WebGL y toda la VRAM asociada
      const ext = gl.getExtension('WEBGL_lose_context')
      if (ext) ext.loseContext()

      if (gl.canvas.parentNode) {
        gl.canvas.parentNode.removeChild(gl.canvas)
      }
    }
  }, [])

  return <div ref={containerRef} className="liquid-bg" aria-hidden="true" />
}
