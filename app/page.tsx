"use client"

import type React from "react"

import { useState, useCallback, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Slider } from "@/components/ui/slider"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Copy, Palette, Settings, Zap, Play, Pause } from "lucide-react"
import { toast } from "@/hooks/use-toast"

interface LiquidGlassConfig {
  // Shader uniforms
  refractiveIndex: number
  blurRadius: number
  distortionStrength: number
  curvature: number
  edgeSharpness: number
  glowIntensity: number
  shadowStrength: number
  size: [number, number]
  borderRadius: number
  backgroundColor: string
  accentColor: string
}

const presets = [
  {
    name: "Pure Water",
    config: {
      refractiveIndex: 1.33,
      blurRadius: 3.0,
      distortionStrength: 0.03,
      curvature: 1.0,
      edgeSharpness: 0.4,
      glowIntensity: 0.5,
      shadowStrength: 0.1,
      size: [300, 200] as [number, number],
      borderRadius: 20,
      backgroundColor: "#ffffff",
      accentColor: "#3b82f6",
    },
  },
  {
    name: "Dense Glass",
    config: {
      refractiveIndex: 1.8,
      blurRadius: 4.0,
      distortionStrength: 0.05,
      curvature: 1.2,
      edgeSharpness: 0.6,
      glowIntensity: 0.7,
      shadowStrength: 0.15,
      size: [320, 220] as [number, number],
      borderRadius: 16,
      backgroundColor: "#f8fafc",
      accentColor: "#6366f1",
    },
  },
  {
    name: "Liquid Crystal",
    config: {
      refractiveIndex: 1.5,
      blurRadius: 5.0,
      distortionStrength: 0.04,
      curvature: 0.8,
      edgeSharpness: 0.3,
      glowIntensity: 0.4,
      shadowStrength: 0.08,
      size: [280, 180] as [number, number],
      borderRadius: 32,
      backgroundColor: "#f0f9ff",
      accentColor: "#0ea5e9",
    },
  },
]

export default function LiquidGlassGenerator() {
  const [config, setConfig] = useState<LiquidGlassConfig>(presets[0].config)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const glRef = useRef<WebGLRenderingContext | null>(null)
  const programRef = useRef<WebGLProgram | null>(null)
  const backgroundTextureRef = useRef<WebGLTexture | null>(null)
  const animationRef = useRef<number>()
  const mouseRef = useRef([400, 300])
  const [isPlaying, setIsPlaying] = useState(true)
  const [isWebGLReady, setIsWebGLReady] = useState(false)
  const [isMobile, setIsMobile] = useState(false)

  const updateConfig = useCallback((key: keyof LiquidGlassConfig, value: number | string | [number, number]) => {
    setConfig((prev) => ({ ...prev, [key]: value }))
  }, [])

  // WebGL Shader Sources (exact replica from your code)
  const vertexShaderSource = `
    attribute vec2 a_position;
    varying vec2 v_uv;
    void main() {
        v_uv = vec2(a_position.x, -a_position.y) * 0.5 + 0.5;
        gl_Position = vec4(a_position, 0.0, 1.0);
    }
  `

  const fragmentShaderSource = `
    precision mediump float;
    uniform float u_dpr;
    uniform sampler2D u_background;
    uniform vec2 u_resolution;
    uniform vec2 u_mouse;
    uniform vec2 u_size;
    uniform float u_refractiveIndex;
    uniform float u_blurRadius;
    uniform float u_distortionStrength;
    uniform float u_curvature;
    uniform float u_edgeSharpness;
    uniform float u_glowIntensity;
    uniform float u_shadowStrength;
    uniform float u_borderRadius;
    varying vec2 v_uv;

    float cssPxUV() {
        return u_dpr / min(u_resolution.x, u_resolution.y);
    }

    float roundedBox(vec2 uv, vec2 center, vec2 size, float radius) {
        vec2 q = abs(uv - center) - size + radius;
        return length(max(q, 0.0)) - radius;
    }

    vec3 blurBackground(vec2 uv, vec2 resolution) {
        vec3 result = vec3(0.0);
        float total = 0.0;
        float radius = u_blurRadius;
        for (int x = -3; x <= 3; x++) {
            for (int y = -3; y <= 3; y++) {
                vec2 offset = vec2(float(x), float(y)) * 2.0 / resolution;
                float weight = exp(-(float(x * x + y * y)) / (2.0 * radius));
                result += texture2D(u_background, uv + offset).rgb * weight;
                total += weight;
            }
        }
        return result / total;
    }

    float roundedBoxSDF(vec2 p, vec2 b, float r) {
        vec2 d = abs(p) - b + vec2(r);
        return length(max(d, 0.0)) - r;
    }

    vec2 getNormal(vec2 uv, vec2 center, vec2 size, float radius) {
        vec2 eps = vec2(1.0) / u_resolution * 2.0;
        vec2 p = uv - center;

        float dx = (roundedBoxSDF(p + vec2(eps.x, 0.0), size, radius) - roundedBoxSDF(p - vec2(eps.x, 0.0), size, radius)) * 0.5;
        float dy = (roundedBoxSDF(p + vec2(0.0, eps.y), size, radius) - roundedBoxSDF(p - vec2(0.0, eps.y), size, radius)) * 0.5;

        vec2 gradient = vec2(dx, dy);

        // Smooth corners by blending with diagonal gradients
        float dxy1 = roundedBoxSDF(p + eps, size, radius);
        float dxy2 = roundedBoxSDF(p - eps, size, radius);
        vec2 diag = vec2(dxy1 - dxy2);

        gradient = mix(gradient, diag, 0.25);

        if (length(gradient) < 0.001) {
            return vec2(0.0);
        }
        return normalize(gradient);
    }

    void main() {
        vec2 pixelUV = (v_uv * u_resolution) / u_dpr;
        vec2 center = u_mouse;
        vec2 size = u_size * 0.5;

        vec2 local = (pixelUV - center) / size;
        local.y *= u_resolution.x / u_resolution.y;

        float radius = u_borderRadius;
        float dist = roundedBox(pixelUV, center, size, radius);

        if (dist > 1.0) {
            gl_FragColor = texture2D(u_background, v_uv);
            return;
        }

        // Radial curvature refraction (center-based)
        float r = clamp(length(local * 1.0), 0.0, 1.0);
        float curvature = pow(r, u_curvature);
        vec2 domeNormal = normalize(local) * curvature;
        float eta = 1.0 / u_refractiveIndex;
        vec2 incident = -domeNormal;
        vec2 refractVec = refract(incident, domeNormal, eta);
        vec2 curvedRefractUV = v_uv + refractVec * u_distortionStrength;

        // Edge contour refraction
        float contourFalloff = exp(-abs(dist) * u_edgeSharpness);
        vec2 normal = getNormal(pixelUV, center, size, radius);
        vec2 domeNormalContour = normal * pow(contourFalloff, 1.5);
        vec2 refractVecContour = refract(vec2(0.0), domeNormalContour, eta);
        vec2 uvContour = v_uv + refractVecContour * 0.35 * contourFalloff;

        // Blend based on distance from edge and radial distance
        float edgeWeight = smoothstep(0.0, 1.0, abs(dist));
        float radialWeight = smoothstep(0.5, 1.0, r);
        float combinedWeight = clamp((edgeWeight * 1.0) + (-radialWeight * 0.5), 0.0, 1.0);
        vec2 refractUV = mix(curvedRefractUV, uvContour, combinedWeight);

        vec3 refracted = texture2D(u_background, refractUV).rgb;
        vec3 blurred = blurBackground(refractUV, u_resolution);
        vec3 base = mix(refracted, blurred, 0.5);

        // Shadow
        float edgeFalloff = smoothstep(0.01, 0.0, dist);
        float verticalBand = 1.0 - smoothstep(-1.5, -0.2, local.y);
        float topShadow = edgeFalloff * verticalBand;
        vec3 shadowColor = vec3(0.0);
        base = mix(base, shadowColor, topShadow * u_shadowStrength);

        // Edge glow
        float edge = 1.0 - smoothstep(0.0, 0.03, dist * -2.0);
        vec3 glow = vec3(0.7);
        vec3 color = mix(base, glow, edge * u_glowIntensity);

        float alpha = 0.75;
        gl_FragColor = vec4(color, alpha);
    }
  `

  // Initialize WebGL
  const initWebGL = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const gl =
      canvas.getContext("webgl", { antialias: true, alpha: true }) ||
      canvas.getContext("experimental-webgl", { antialias: true, alpha: true })

    if (!gl) {
      console.error("WebGL not supported")
      return
    }

    glRef.current = gl

    // Compile shaders
    const compileShader = (type: number, source: string) => {
      const shader = gl.createShader(type)!
      gl.shaderSource(shader, source)
      gl.compileShader(shader)
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error("Shader compile error:", gl.getShaderInfoLog(shader))
        return null
      }
      return shader
    }

    const vertexShader = compileShader(gl.VERTEX_SHADER, vertexShaderSource)
    const fragmentShader = compileShader(gl.FRAGMENT_SHADER, fragmentShaderSource)

    if (!vertexShader || !fragmentShader) return

    // Create program
    const program = gl.createProgram()!
    gl.attachShader(program, vertexShader)
    gl.attachShader(program, fragmentShader)
    gl.linkProgram(program)

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error("Program link error:", gl.getProgramInfoLog(program))
      return
    }

    programRef.current = program
    // gl.useProgram(program) // Moving this line outside of initWebGL

    // Create vertex buffer
    const positionBuffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW)

    const positionLocation = gl.getAttribLocation(program, "a_position")
    gl.enableVertexAttribArray(positionLocation)
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0)

    // Create background texture with complex pattern
    createBackgroundTexture(gl)

    setIsWebGLReady(true)
  }, [])

  // Create complex background texture
  const createBackgroundTexture = (gl: WebGLRenderingContext) => {
    const canvas = document.createElement("canvas")
    canvas.width = 800
    canvas.height = 600
    const ctx = canvas.getContext("2d")!

    // Create complex background with gradients, text, and shapes
    const gradient = ctx.createLinearGradient(0, 0, 800, 600)
    gradient.addColorStop(0, "#1e3a8a")
    gradient.addColorStop(0.3, "#3730a3")
    gradient.addColorStop(0.6, "#7c2d12")
    gradient.addColorStop(1, "#be123c")
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, 800, 600)

    // Add geometric patterns
    ctx.strokeStyle = "rgba(255, 255, 255, 0.1)"
    ctx.lineWidth = 1
    for (let i = 0; i < 800; i += 40) {
      ctx.beginPath()
      ctx.moveTo(i, 0)
      ctx.lineTo(i, 600)
      ctx.stroke()
    }
    for (let i = 0; i < 600; i += 40) {
      ctx.beginPath()
      ctx.moveTo(0, i)
      ctx.lineTo(800, i)
      ctx.stroke()
    }

    // Add text elements
    ctx.fillStyle = "rgba(255, 255, 255, 0.3)"
    ctx.font = "24px monospace"
    ctx.fillText("LIQUID GLASS DISTORTION TEST", 50, 100)
    ctx.fillText("REFRACTIVE INDEX: 1.33 - 2.4", 50, 140)
    ctx.fillText("OPTICAL PHYSICS SIMULATION", 50, 180)

    ctx.font = "16px monospace"
    ctx.fillText("Background elements for distortion testing", 50, 220)
    ctx.fillText("Watch how text bends through liquid glass", 50, 250)
    ctx.fillText("Mathematical refraction in real-time", 50, 280)

    // Add colorful shapes
    const shapes = [
      { x: 600, y: 100, w: 80, h: 80, color: "#ef4444" },
      { x: 650, y: 200, w: 60, h: 60, color: "#22c55e" },
      { x: 580, y: 300, w: 100, h: 40, color: "#3b82f6" },
      { x: 620, y: 400, w: 70, h: 70, color: "#a855f7" },
      { x: 550, y: 500, w: 90, h: 50, color: "#f59e0b" },
    ]

    shapes.forEach((shape) => {
      ctx.fillStyle = shape.color
      ctx.fillRect(shape.x, shape.y, shape.w, shape.h)
      ctx.fillStyle = "rgba(255, 255, 255, 0.2)"
      ctx.fillRect(shape.x + 5, shape.y + 5, shape.w - 10, shape.h - 10)
    })

    // Add circular elements
    const circles = [
      { x: 150, y: 350, r: 40, color: "#06b6d4" },
      { x: 250, y: 450, r: 30, color: "#ec4899" },
      { x: 350, y: 380, r: 50, color: "#84cc16" },
    ]

    circles.forEach((circle) => {
      const circleGradient = ctx.createRadialGradient(circle.x, circle.y, 0, circle.x, circle.y, circle.r)
      circleGradient.addColorStop(0, circle.color)
      circleGradient.addColorStop(1, "transparent")
      ctx.fillStyle = circleGradient
      ctx.beginPath()
      ctx.arc(circle.x, circle.y, circle.r, 0, Math.PI * 2)
      ctx.fill()
    })

    // Create WebGL texture
    const texture = gl.createTexture()
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)

    backgroundTextureRef.current = texture
  }

  // Render loop
  const render = useCallback(() => {
    const canvas = canvasRef.current
    const gl = glRef.current
    const program = programRef.current

    if (!canvas || !gl || !program || !backgroundTextureRef.current) return

    const dpr = window.devicePixelRatio || 1
    canvas.width = canvas.clientWidth * dpr
    canvas.height = canvas.clientHeight * dpr
    gl.viewport(0, 0, canvas.width, canvas.height)

    gl.clear(gl.COLOR_BUFFER_BIT)

    // Set uniforms
    gl.uniform1f(gl.getUniformLocation(program, "u_dpr"), dpr)
    gl.uniform2f(gl.getUniformLocation(program, "u_resolution"), canvas.width, canvas.height)
    gl.uniform2f(gl.getUniformLocation(program, "u_mouse"), mouseRef.current[0] * dpr, mouseRef.current[1] * dpr)

    // Mobile-optimized size adjustments
    const mobileSize = isMobile ? [Math.min(config.size[0], 280), Math.min(config.size[1], 180)] : config.size

    gl.uniform2f(gl.getUniformLocation(program, "u_size"), mobileSize[0] * dpr, mobileSize[1] * dpr)
    gl.uniform1f(gl.getUniformLocation(program, "u_refractiveIndex"), config.refractiveIndex)
    gl.uniform1f(gl.getUniformLocation(program, "u_blurRadius"), config.blurRadius)
    gl.uniform1f(gl.getUniformLocation(program, "u_distortionStrength"), config.distortionStrength)
    gl.uniform1f(gl.getUniformLocation(program, "u_curvature"), config.curvature)
    gl.uniform1f(gl.getUniformLocation(program, "u_edgeSharpness"), config.edgeSharpness)
    gl.uniform1f(gl.getUniformLocation(program, "u_glowIntensity"), config.glowIntensity)
    gl.uniform1f(gl.getUniformLocation(program, "u_shadowStrength"), config.shadowStrength)
    gl.uniform1f(gl.getUniformLocation(program, "u_borderRadius"), config.borderRadius)

    // Bind texture
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, backgroundTextureRef.current)
    gl.uniform1i(gl.getUniformLocation(program, "u_background"), 0)

    gl.useProgram(program) // Use program here, before drawing

    // Draw
    gl.drawArrays(gl.TRIANGLES, 0, 6)

    if (isPlaying) {
      animationRef.current = requestAnimationFrame(render)
    }
  }, [config, isPlaying, isMobile])

  // Handle mouse movement and touch events
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    mouseRef.current = [e.clientX - rect.left, e.clientY - rect.top]
  }, [])

  const handleTouchMove = useCallback((e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault() // Prevent scrolling
    const canvas = canvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const touch = e.touches[0]
    if (touch) {
      mouseRef.current = [touch.clientX - rect.left, touch.clientY - rect.top]
    }
  }, [])

  // Auto-animate position on mobile
  const autoAnimateRef = useRef<number>()

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768)
    }

    checkMobile()
    window.addEventListener("resize", checkMobile)
    return () => window.removeEventListener("resize", checkMobile)
  }, [])

  // Auto-animate liquid glass position on mobile
  useEffect(() => {
    if (!isMobile || !isPlaying) return

    const animate = () => {
      const time = Date.now() * 0.001
      const canvas = canvasRef.current
      if (canvas) {
        const centerX = canvas.clientWidth / 2
        const centerY = canvas.clientHeight / 2
        const radiusX = Math.min(canvas.clientWidth * 0.3, 150)
        const radiusY = Math.min(canvas.clientHeight * 0.2, 100)

        mouseRef.current = [centerX + Math.cos(time * 0.5) * radiusX, centerY + Math.sin(time * 0.3) * radiusY]
      }

      if (isPlaying) {
        autoAnimateRef.current = requestAnimationFrame(animate)
      }
    }

    if (isMobile) {
      animate()
    }

    return () => {
      if (autoAnimateRef.current) {
        cancelAnimationFrame(autoAnimateRef.current)
      }
    }
  }, [isMobile, isPlaying])

  // Initialize WebGL on mount
  useEffect(() => {
    initWebGL()
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    }
  }, [initWebGL])

  // Start/stop animation
  useEffect(() => {
    if (isPlaying && isWebGLReady) {
      render()
    } else if (animationRef.current) {
      cancelAnimationFrame(animationRef.current)
    }
  }, [isPlaying, isWebGLReady, render])

  // Re-render when config changes
  useEffect(() => {
    if (isWebGLReady && !isPlaying) {
      render()
    }
  }, [config, isWebGLReady, isPlaying, render])

  const generateCSS = useCallback(() => {
    const eta = 1.0 / config.refractiveIndex
    return `/* Liquid Glass CSS - WebGL Shader Replica */
.liquid-glass {
  position: relative;
  background: rgba(${hexToRgb(config.backgroundColor)}, 0.1);
  backdrop-filter: 
    blur(${config.blurRadius}px) 
    saturate(${1 + (config.refractiveIndex - 1) * 0.5}) 
    contrast(${1 + config.edgeSharpness * 0.3});
  -webkit-backdrop-filter: 
    blur(${config.blurRadius}px) 
    saturate(${1 + (config.refractiveIndex - 1) * 0.5}) 
    contrast(${1 + config.edgeSharpness * 0.3});
  border-radius: ${config.borderRadius}px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow: 
    0 8px 32px rgba(0, 0, 0, ${config.shadowStrength}),
    inset 0 1px 0 rgba(255, 255, 255, ${config.glowIntensity * 0.6});
  overflow: hidden;
}

/* Refraction distortion layer */
.liquid-glass::before {
  content: '';
  position: absolute;
  inset: -20%;
  background: radial-gradient(
    ellipse ${100 + config.curvature * 50}% ${100 + config.curvature * 50}% at 50% 50%,
    rgba(${hexToRgb(config.accentColor)}, ${config.distortionStrength * 10}) 0%,
    transparent 70%
  );
  filter: blur(${config.distortionStrength * 200}px);
  animation: liquidRefract 8s ease-in-out infinite;
}

@keyframes liquidRefract {
  0%, 100% { transform: rotate(0deg) scale(1); }
  50% { transform: rotate(${config.curvature * 180}deg) scale(${1 + config.distortionStrength * 5}); }
}

/* WebGL Shader Parameters:
 * Refractive Index: ${config.refractiveIndex} (eta: ${eta.toFixed(3)})
 * Distortion Strength: ${config.distortionStrength}
 * Curvature: ${config.curvature}
 * Edge Sharpness: ${config.edgeSharpness}
 */`
  }, [config])

  const copyCSS = useCallback(() => {
    navigator.clipboard.writeText(generateCSS())
    toast({
      title: "CSS Copied!",
      description: "Liquid glass CSS has been copied to your clipboard.",
    })
  }, [generateCSS])

  const applyPreset = useCallback((preset: (typeof presets)[0]) => {
    setConfig(preset.config)
    toast({
      title: "Preset Applied!",
      description: `${preset.name} preset has been applied.`,
    })
  }, [])

  return (
    <div className="min-h-screen bg-gray-950 relative overflow-hidden">
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:50px_50px]"></div>

      <div className="relative z-10 container mx-auto px-4 py-8">
        <div className="text-center mb-8">
          <h1 className="text-4xl md:text-6xl font-bold text-white mb-4 flex items-center justify-center gap-3">
            <Zap className="w-8 h-8 md:w-12 md:h-12 text-blue-400" />
            True Liquid Glass Generator
          </h1>
          <p className="text-gray-400 text-lg md:text-xl max-w-3xl mx-auto">
            Real WebGL shader implementation with authentic mathematical refraction
          </p>
        </div>

        <div className="grid lg:grid-cols-2 gap-6 max-w-7xl mx-auto">
          {/* Controls */}
          <Card className="bg-gray-900/50 border-gray-800 backdrop-blur-sm order-2 lg:order-1">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <Settings className="w-5 h-5" />
                WebGL Shader Controls
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="physics" className="w-full">
                <TabsList className="grid w-full grid-cols-2 bg-gray-800">
                  <TabsTrigger
                    value="physics"
                    className="text-gray-300 data-[state=active]:bg-gray-700 data-[state=active]:text-white"
                  >
                    Physics
                  </TabsTrigger>
                  <TabsTrigger
                    value="presets"
                    className="text-gray-300 data-[state=active]:bg-gray-700 data-[state=active]:text-white"
                  >
                    Presets
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="physics" className="space-y-4 mt-6">
                  <div>
                    <Label className="text-gray-300 mb-2 block">
                      Refractive Index: {config.refractiveIndex.toFixed(2)} (η ={" "}
                      {(1 / config.refractiveIndex).toFixed(3)})
                    </Label>
                    <Slider
                      value={[config.refractiveIndex * 100]}
                      onValueChange={([value]) => updateConfig("refractiveIndex", value / 100)}
                      max={240}
                      min={100}
                      step={1}
                      className="w-full"
                    />
                    <div className="text-xs text-gray-500 mt-1">Air: 1.0, Water: 1.33, Glass: 1.5, Diamond: 2.4</div>
                  </div>

                  <div>
                    <Label className="text-gray-300 mb-2 block">Blur Radius: {config.blurRadius.toFixed(1)}</Label>
                    <Slider
                      value={[config.blurRadius * 10]}
                      onValueChange={([value]) => updateConfig("blurRadius", value / 10)}
                      max={100}
                      min={0}
                      step={1}
                      className="w-full"
                    />
                  </div>

                  <div>
                    <Label className="text-gray-300 mb-2 block">
                      Distortion Strength: {(config.distortionStrength * 1000).toFixed(0)}‰
                    </Label>
                    <Slider
                      value={[config.distortionStrength * 1000]}
                      onValueChange={([value]) => updateConfig("distortionStrength", value / 1000)}
                      max={100}
                      min={0}
                      step={1}
                      className="w-full"
                    />
                  </div>

                  <div>
                    <Label className="text-gray-300 mb-2 block">Curvature: {config.curvature.toFixed(2)}</Label>
                    <Slider
                      value={[config.curvature * 100]}
                      onValueChange={([value]) => updateConfig("curvature", value / 100)}
                      max={200}
                      min={0}
                      step={1}
                      className="w-full"
                    />
                  </div>

                  <div>
                    <Label className="text-gray-300 mb-2 block">
                      Edge Sharpness: {config.edgeSharpness.toFixed(2)}
                    </Label>
                    <Slider
                      value={[config.edgeSharpness * 100]}
                      onValueChange={([value]) => updateConfig("edgeSharpness", value / 100)}
                      max={100}
                      min={0}
                      step={1}
                      className="w-full"
                    />
                  </div>

                  <div>
                    <Label className="text-gray-300 mb-2 block">
                      Glow Intensity: {config.glowIntensity.toFixed(2)}
                    </Label>
                    <Slider
                      value={[config.glowIntensity * 100]}
                      onValueChange={([value]) => updateConfig("glowIntensity", value / 100)}
                      max={100}
                      min={0}
                      step={1}
                      className="w-full"
                    />
                  </div>

                  <div>
                    <Label className="text-gray-300 mb-2 block">
                      Shadow Strength: {config.shadowStrength.toFixed(2)}
                    </Label>
                    <Slider
                      value={[config.shadowStrength * 100]}
                      onValueChange={([value]) => updateConfig("shadowStrength", value / 100)}
                      max={50}
                      min={0}
                      step={1}
                      className="w-full"
                    />
                  </div>

                  <div>
                    <Label className="text-gray-300 mb-2 block">Border Radius: {config.borderRadius}px</Label>
                    <Slider
                      value={[config.borderRadius]}
                      onValueChange={([value]) => updateConfig("borderRadius", value)}
                      max={60}
                      min={0}
                      step={1}
                      className="w-full"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-gray-300 mb-2 block">Width: {config.size[0]}px</Label>
                      <Slider
                        value={[config.size[0]]}
                        onValueChange={([value]) => updateConfig("size", [value, config.size[1]])}
                        max={500}
                        min={200}
                        step={10}
                        className="w-full"
                      />
                    </div>
                    <div>
                      <Label className="text-gray-300 mb-2 block">Height: {config.size[1]}px</Label>
                      <Slider
                        value={[config.size[1]]}
                        onValueChange={([value]) => updateConfig("size", [config.size[0], value])}
                        max={400}
                        min={150}
                        step={10}
                        className="w-full"
                      />
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="presets" className="mt-6">
                  <div className="space-y-3">
                    {presets.map((preset, index) => (
                      <Button
                        key={index}
                        variant="outline"
                        className="w-full h-auto p-4 bg-gray-800 border-gray-700 text-white hover:bg-gray-700 text-left"
                        onClick={() => applyPreset(preset)}
                      >
                        <div>
                          <div className="font-semibold mb-1">{preset.name}</div>
                          <div className="text-xs text-gray-400">
                            η: {preset.config.refractiveIndex} • Distortion:{" "}
                            {(preset.config.distortionStrength * 1000).toFixed(0)}‰
                          </div>
                        </div>
                      </Button>
                    ))}
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>

          {/* WebGL Preview */}
          <div className="space-y-6 order-1 lg:order-2">
            <Card className="bg-gray-900/50 border-gray-800 backdrop-blur-sm">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-white flex items-center gap-2">
                  <Palette className="w-5 h-5" />
                  Real-Time WebGL Preview
                </CardTitle>
                <Button
                  size="sm"
                  onClick={() => setIsPlaying(!isPlaying)}
                  className="bg-gray-800 hover:bg-gray-700 text-white border-gray-700"
                >
                  {isPlaying ? <Pause className="w-4 h-4 mr-2" /> : <Play className="w-4 h-4 mr-2" />}
                  {isPlaying ? "Pause" : "Play"}
                </Button>
              </CardHeader>
              <CardContent>
                <div className="relative">
                  <canvas
                    ref={canvasRef}
                    onMouseMove={!isMobile ? handleMouseMove : undefined}
                    onTouchMove={isMobile ? handleTouchMove : undefined}
                    onTouchStart={isMobile ? handleTouchMove : undefined}
                    className={`w-full rounded-lg border border-gray-700 ${
                      isMobile ? "h-[400px] touch-none" : "h-[500px] cursor-crosshair"
                    }`}
                    style={{ background: "transparent" }}
                  />
                  {!isWebGLReady && (
                    <div className="absolute inset-0 flex items-center justify-center bg-gray-800 rounded-lg">
                      <div className="text-white">Initializing WebGL...</div>
                    </div>
                  )}
                  <div className="absolute bottom-4 left-4 text-white/70 text-xs font-mono bg-black/50 px-2 py-1 rounded">
                    {isMobile ? "Auto-animating liquid glass effect" : "Move mouse to control liquid glass position"}
                  </div>
                  <div className="absolute top-4 right-4 text-white/70 text-xs font-mono bg-black/50 px-2 py-1 rounded">
                    η: {config.refractiveIndex.toFixed(2)} | Distortion: {(config.distortionStrength * 1000).toFixed(0)}
                    ‰
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* CSS Output */}
            <Card className="bg-gray-900/50 border-gray-800 backdrop-blur-sm">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-white">CSS Approximation</CardTitle>
                <Button
                  size="sm"
                  onClick={copyCSS}
                  className="bg-gray-800 hover:bg-gray-700 text-white border-gray-700"
                >
                  <Copy className="w-4 h-4 mr-2" />
                  Copy CSS
                </Button>
              </CardHeader>
              <CardContent>
                <pre className="bg-gray-950/50 p-4 rounded-lg text-gray-300 text-xs overflow-x-auto whitespace-pre-wrap border border-gray-800 max-h-64">
                  {generateCSS()}
                </pre>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}

function hexToRgb(hex: string): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  if (!result) return "255, 255, 255"
  const r = Number.parseInt(result[1], 16)
  const g = Number.parseInt(result[2], 16)
  const b = Number.parseInt(result[3], 16)
  return `${r}, ${g}, ${b}`
}
