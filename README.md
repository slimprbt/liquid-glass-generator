# 🌊 Liquid Glass Generator

*A real-time WebGL shader implementation for creating authentic liquid glass effects*

[![Deployed on Vercel](https://img.shields.io/badge/Deployed%20on-Vercel-black?style=for-the-badge&logo=vercel)](https://vercel.com/johnas/v0-liquid-glass-generator)
[![Built with v0](https://img.shields.io/badge/Built%20with-v0.dev-black?style=for-the-badge)](https://v0.dev/chat/projects/RIunPoehfXW)
[![WebGL](https://img.shields.io/badge/WebGL-Powered-blue?style=for-the-badge&logo=webgl)](https://www.khronos.org/webgl/)
[![Next.js](https://img.shields.io/badge/Next.js-15-black?style=for-the-badge&logo=next.js)](https://nextjs.org/)

### Try here
[Public Demo](https://v0-liquid-glass-generator.vercel.app)

## ✨ Features

### 🔬 **Real Physics Simulation**
- **Authentic refraction** using Snell's law and mathematical optics
- **Dynamic distortion** with real-time background warping
- **Edge detection** for realistic glass boundaries
- **Curvature modeling** for 3D glass surface simulation

### 🎮 **Interactive Controls**
- **Refractive Index** - From air (1.0) to diamond (2.4)
- **Blur Radius** - Control background blur intensity
- **Distortion Strength** - Adjust refraction magnitude
- **Curvature** - Shape the glass surface geometry
- **Edge Sharpness** - Fine-tune boundary definition
- **Glow & Shadow** - Realistic lighting effects

### 📱 **Mobile Optimized**
- **Touch-friendly interface** with auto-animation
- **Responsive design** that works on all devices
- **Optimized performance** for mobile WebGL
- **Gesture-free experience** on smaller screens

### 🎨 **Material Presets**
- **Pure Water** - Crystal clear with subtle refraction
- **Dense Glass** - Heavy optical distortion
- **Liquid Crystal** - Smooth, flowing appearance

### 💻 **Developer Tools**
- **CSS Export** - Get CSS approximations for production use
- **Real-time preview** with instant parameter updates
- **WebGL shader source** included for customization
- **Copy-paste ready** code snippets

## 🛠️ Technology Stack

- **Next.js 15** - React framework with App Router
- **WebGL** - Hardware-accelerated graphics rendering
- **GLSL Shaders** - Custom fragment and vertex shaders
- **TypeScript** - Type-safe development
- **Tailwind CSS** - Utility-first styling
- **Radix UI** - Accessible component primitives

## 📖 How It Works

### WebGL Shader Pipeline

1. **Background Texture Generation** - Creates complex test patterns
2. **Vertex Processing** - Sets up screen-space quad
3. **Fragment Shader Magic** - Applies physics-based refraction
4. **Real-time Rendering** - 60fps interactive updates

### Physics Implementation

```glsl
// Snell's Law Implementation
float eta = 1.0 / u_refractiveIndex;
vec2 refractVec = refract(incident, normal, eta);

// Curvature-based distortion
float curvature = pow(r, u_curvature);
vec2 domeNormal = normalize(local) * curvature;
