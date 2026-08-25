// SplineLite – Framer Code Component (vanilla three.js, no r3f/drei)
// Paste into: Framer > Assets > Code > + New Component
// Framer auto-installs "three" when it sees the import below.

import { useRef, useState, useCallback, useEffect } from "react"
import * as THREE from "https://esm.sh/three@0.160.0"
import { GLTFLoader } from "https://esm.sh/three@0.160.0/examples/jsm/loaders/GLTFLoader.js"
import { OrbitControls } from "https://esm.sh/three@0.160.0/examples/jsm/controls/OrbitControls.js"
import { addPropertyControls, ControlType } from "framer"

// ─── Lighting presets (lightweight – no HDRI environment maps) ─────────────
const LIGHT_PRESETS: Record<string, { amb: string; ambI: number; dir: string; dirI: number }> = {
    none: { amb: "#ffffff", ambI: 0.4, dir: "#ffffff", dirI: 0.5 },
    studio: { amb: "#ffffff", ambI: 0.6, dir: "#ffffff", dirI: 1.2 },
    sunset: { amb: "#ffcda0", ambI: 0.5, dir: "#ff9a5a", dirI: 1.4 },
    night: { amb: "#3355aa", ambI: 0.25, dir: "#6f9fff", dirI: 0.5 },
    warm: { amb: "#ffe9c7", ambI: 0.55, dir: "#fff2d9", dirI: 1.1 },
    cool: { amb: "#cfe9ff", ambI: 0.55, dir: "#eaf6ff", dirI: 1.1 },
}

export default function SplineLite({
    modelFile,
    autoRotate = true,
    autoRotateSpeed = 1.5,
    lighting = "studio",
    bgColor = "#111111",
    transparentBackground = false,
    enableZoom = true,
    enablePan = false,
    rotateSpeed = 1,
    dampingFactor = 0.08,
    minDistance = 0.5,
    maxDistance = 30,
    fov = 45,
}) {
    const containerRef = useRef<HTMLDivElement>(null)
    const fileInputRef = useRef<HTMLInputElement>(null)
    const rendererRef = useRef<THREE.WebGLRenderer | null>(null)
    const sceneRef = useRef<THREE.Scene | null>(null)
    const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
    const controlsRef = useRef<any>(null)
    const modelGroupRef = useRef<THREE.Group | null>(null)
    const lightsRef = useRef<{ amb?: THREE.AmbientLight; dir?: THREE.DirectionalLight }>({})
    const frameIdRef = useRef<number | null>(null)
    const blobUrlRef = useRef<string | null>(null)

    const [hasModel, setHasModel] = useState(false)
    const [dragging, setDragging] = useState(false)
    const [error, setError] = useState<string | null>(null)

    // ── One-time three.js setup ──────────────────────────────────────────
    useEffect(() => {
        const container = containerRef.current
        if (!container) return

        const scene = new THREE.Scene()
        sceneRef.current = scene

        const camera = new THREE.PerspectiveCamera(fov, 1, 0.01, 5000)
        camera.position.set(0, 0, 5)
        cameraRef.current = camera

        const renderer = new THREE.WebGLRenderer({
            antialias: true,
            alpha: true,
            powerPreference: "low-power", // easier on weak GPUs
        })
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5))
        if ("outputColorSpace" in renderer) {
            ;(renderer as any).outputColorSpace = THREE.SRGBColorSpace
        }
        container.appendChild(renderer.domElement)
        rendererRef.current = renderer
        renderer.setClearColor(0x000000, 0) // start transparent; color set by effect below

        const amb = new THREE.AmbientLight(0xffffff, 0.5)
        scene.add(amb)
        const dir = new THREE.DirectionalLight(0xffffff, 1)
        dir.position.set(5, 10, 7)
        scene.add(dir)
        lightsRef.current = { amb, dir }

        const controls = new OrbitControls(camera, renderer.domElement)
        controls.enableDamping = true
        controlsRef.current = controls

        const modelGroup = new THREE.Group()
        scene.add(modelGroup)
        modelGroupRef.current = modelGroup

        const resize = () => {
            const w = container.clientWidth || 1
            const h = container.clientHeight || 1
            camera.aspect = w / h
            camera.updateProjectionMatrix()
            renderer.setSize(w, h)
        }
        resize()
        const ro = new ResizeObserver(resize)
        ro.observe(container)

        let running = true
        const animate = () => {
            if (!running) return
            frameIdRef.current = requestAnimationFrame(animate)
            controls.update()
            renderer.render(scene, camera)
        }
        animate()

        return () => {
            running = false
            if (frameIdRef.current) cancelAnimationFrame(frameIdRef.current)
            ro.disconnect()
            controls.dispose()
            renderer.dispose()
            if (renderer.domElement.parentNode) {
                renderer.domElement.parentNode.removeChild(renderer.domElement)
            }
            if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    // ── Background color ─────────────────────────────────────────────────
    useEffect(() => {
        if (!sceneRef.current) return
        sceneRef.current.background = transparentBackground ? null : new THREE.Color(bgColor)
    }, [bgColor, transparentBackground])

    // ── Lighting preset ──────────────────────────────────────────────────
    useEffect(() => {
        const preset = LIGHT_PRESETS[lighting] || LIGHT_PRESETS.studio
        const { amb, dir } = lightsRef.current
        if (amb) {
            amb.color.set(preset.amb)
            amb.intensity = preset.ambI
        }
        if (dir) {
            dir.color.set(preset.dir)
            dir.intensity = preset.dirI
        }
    }, [lighting])

    // ── Controls settings ────────────────────────────────────────────────
    useEffect(() => {
        const controls = controlsRef.current
        if (!controls) return
        controls.autoRotate = autoRotate
        controls.autoRotateSpeed = autoRotateSpeed
        controls.enableZoom = enableZoom
        controls.enablePan = enablePan
        controls.rotateSpeed = rotateSpeed
        controls.dampingFactor = dampingFactor
        controls.minDistance = minDistance
        controls.maxDistance = maxDistance
    }, [autoRotate, autoRotateSpeed, enableZoom, enablePan, rotateSpeed, dampingFactor, minDistance, maxDistance])

    // ── FOV ───────────────────────────────────────────────────────────────
    useEffect(() => {
        if (cameraRef.current) {
            cameraRef.current.fov = fov
            cameraRef.current.updateProjectionMatrix()
        }
    }, [fov])

    // ── Model loading ────────────────────────────────────────────────────
    const loadModel = useCallback((url: string) => {
        const loader = new GLTFLoader()
        loader.load(
            url,
            (gltf) => {
                const group = modelGroupRef.current
                if (!group) return
                while (group.children.length) group.remove(group.children[0])

                const model = gltf.scene
                const box = new THREE.Box3().setFromObject(model)
                const size = new THREE.Vector3()
                box.getSize(size)
                const center = new THREE.Vector3()
                box.getCenter(center)
                model.position.sub(center)
                const maxDim = Math.max(size.x, size.y, size.z) || 1
                model.scale.setScalar(2 / maxDim)
                group.add(model)

                const camera = cameraRef.current
                const controls = controlsRef.current
                if (camera) camera.position.set(0, 0, 4)
                if (controls) {
                    controls.target.set(0, 0, 0)
                    controls.update()
                }

                setHasModel(true)
                setError(null)
            },
            undefined,
            (err) => {
                console.error(err)
                setError("Couldn't load this model")
            }
        )
    }, [])

    // ── Load model chosen via the sidebar File control ──────────────────
    useEffect(() => {
        if (modelFile) {
            loadModel(modelFile)
        } else {
            const group = modelGroupRef.current
            if (group) while (group.children.length) group.remove(group.children[0])
            setHasModel(false)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [modelFile])

    const loadFile = useCallback(
        (file: File | undefined | null) => {
            if (!file) return
            const ext = file.name.split(".").pop()?.toLowerCase()
            if (ext !== "glb" && ext !== "gltf") {
                setError("Only .glb / .gltf files supported")
                return
            }
            setError(null)
            if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current)
            const url = URL.createObjectURL(file)
            blobUrlRef.current = url
            loadModel(url)
        },
        [loadModel]
    )

    const handleDrop = useCallback(
        (e: React.DragEvent) => {
            e.preventDefault()
            setDragging(false)
            loadFile(e.dataTransfer.files && e.dataTransfer.files[0])
        },
        [loadFile]
    )

    const handleFileInputChange = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
            loadFile(e.target.files && e.target.files[0])
            e.target.value = "" // allow re-selecting the same file later
        },
        [loadFile]
    )

    const clearModel = useCallback(() => {
        const group = modelGroupRef.current
        if (group) while (group.children.length) group.remove(group.children[0])
        if (blobUrlRef.current) {
            URL.revokeObjectURL(blobUrlRef.current)
            blobUrlRef.current = null
        }
        setHasModel(false)
    }, [])

    return (
        <div
            onDrop={handleDrop}
            onDragOver={(e) => {
                e.preventDefault()
                setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            style={{
                width: "100%",
                height: "100%",
                position: "relative",
                overflow: "hidden",
                borderRadius: "inherit",
                background: transparentBackground ? "transparent" : bgColor,
            }}
        >
            <div ref={containerRef} style={{ width: "100%", height: "100%", background: "transparent" }} />

            <input
                ref={fileInputRef}
                type="file"
                accept=".glb,.gltf"
                onChange={handleFileInputChange}
                style={{ display: "none" }}
            />

            {!hasModel && (
                <div
                    onClick={() => fileInputRef.current?.click()}
                    style={{
                        position: "absolute",
                        inset: 0,
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "white",
                        border: dragging ? "2px dashed #ffffff" : "2px dashed #444",
                        borderRadius: "inherit",
                        gap: 8,
                        cursor: "pointer",
                        userSelect: "none",
                    }}
                >
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5" opacity={0.7}>
                        <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                        <polyline points="17 8 12 3 7 8" />
                        <line x1="12" y1="3" x2="12" y2="15" />
                    </svg>
                    <span style={{ fontSize: 15, opacity: 0.9, fontFamily: "sans-serif" }}>
                        {dragging ? "Release to load" : "Click or drop a .glb file"}
                    </span>
                    {error && (
                        <span style={{ fontSize: 12, color: "#ff7070", fontFamily: "sans-serif" }}>{error}</span>
                    )}
                </div>
            )}

            {hasModel && (
                <div style={{ position: "absolute", top: 10, right: 10, display: "flex", gap: 6, zIndex: 20 }}>
                    <button
                        onClick={() => fileInputRef.current?.click()}
                        style={{
                            background: "rgba(0,0,0,0.55)",
                            color: "white",
                            border: "1px solid rgba(255,255,255,0.15)",
                            borderRadius: 6,
                            padding: "4px 10px",
                            cursor: "pointer",
                            fontSize: 12,
                            fontFamily: "sans-serif",
                        }}
                    >
                        ⤴ Replace
                    </button>
                    <button
                        onClick={clearModel}
                        style={{
                            background: "rgba(0,0,0,0.55)",
                            color: "white",
                            border: "1px solid rgba(255,255,255,0.15)",
                            borderRadius: 6,
                            padding: "4px 10px",
                            cursor: "pointer",
                            fontSize: 12,
                            fontFamily: "sans-serif",
                        }}
                    >
                        ✕ Clear
                    </button>
                </div>
            )}

            {dragging && hasModel && (
                <div
                    style={{
                        position: "absolute",
                        inset: 0,
                        background: "rgba(0,0,0,0.6)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "white",
                        fontSize: 16,
                        fontFamily: "sans-serif",
                        zIndex: 30,
                        pointerEvents: "none",
                        border: "2px dashed white",
                        borderRadius: "inherit",
                    }}
                >
                    Drop to replace model
                </div>
            )}
        </div>
    )
}

// ─── Framer Property Controls ────────────────────────────────────────────────
addPropertyControls(SplineLite, {
    modelFile: {
        type: ControlType.File,
        title: "Model (.glb)",
        allowedFileTypes: ["glb", "gltf"],
    },
    autoRotate: { type: ControlType.Boolean, title: "Auto Rotate", defaultValue: true },
    autoRotateSpeed: {
        type: ControlType.Number,
        title: "Rotate Speed",
        defaultValue: 1.5,
        min: 0,
        max: 10,
        step: 0.1,
    },
    lighting: {
        type: ControlType.Enum,
        title: "Lighting",
        options: ["none", "studio", "sunset", "night", "warm", "cool"],
        defaultValue: "studio",
    },
    bgColor: { type: ControlType.Color, title: "Background", defaultValue: "#111111" },
    transparentBackground: { type: ControlType.Boolean, title: "Transparent Background", defaultValue: false },
    enableZoom: { type: ControlType.Boolean, title: "Scroll to Zoom", defaultValue: true },
    enablePan: { type: ControlType.Boolean, title: "Pan (right-click drag)", defaultValue: false },
    rotateSpeed: {
        type: ControlType.Number,
        title: "Mouse Rotate Speed",
        defaultValue: 1,
        min: 0.1,
        max: 5,
        step: 0.1,
    },
    dampingFactor: {
        type: ControlType.Number,
        title: "Inertia",
        defaultValue: 0.08,
        min: 0.01,
        max: 1,
        step: 0.01,
    },
    fov: { type: ControlType.Number, title: "FOV", defaultValue: 45, min: 10, max: 120, step: 1 },
    minDistance: {
        type: ControlType.Number,
        title: "Min Zoom Distance",
        defaultValue: 0.5,
        min: 0.1,
        max: 50,
        step: 0.1,
    },
    maxDistance: {
        type: ControlType.Number,
        title: "Max Zoom Distance",
        defaultValue: 30,
        min: 1,
        max: 500,
        step: 1,
    },
})
