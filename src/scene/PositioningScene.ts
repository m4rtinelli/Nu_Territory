import * as THREE from "three"
import type { Brand, Category } from "@/types"
import { CAT_LABEL, quadrant } from "@/types"
import type { Logo } from "@/data/logos"

export type Projection = "3d" | "2d"
export type Look = "dots" | "logos"
export type Layout = "map" | "gallery"
export type Filter = "all" | "bank" | "manager"

type Callbacks = { onSelect: (id: string | null) => void }

type Node = {
  b: Brand
  map: THREE.Vector3
  gallery: THREE.Vector3
  z: number
  size: number
  group: THREE.Group
  dot?: THREE.Mesh
  glow?: THREE.Sprite
  card?: THREE.Mesh
  frame?: THREE.Mesh
  ring?: THREE.Mesh
  hit: THREE.Mesh
  stem: THREE.Line
  label: HTMLDivElement
  scale: number
}

// Chart proportions are those of the plot area on slide 149 (8,572,500 × 6,477,000 EMU).
const W = 10
const H = (W * 6477000) / 8572500
const DEPTH = 1.7
const MAP_CARD = 0.52
const GALLERY_CARD = 1.45
const HEX: Record<Category, number> = { bank: 0xd8cbee, manager: 0x9b4de0, nu: 0xb46cff, ideal: 0xffffff }
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z)
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))
const approach = (v: number, t: number, k: number) => (Math.abs(t - v) < 1e-4 ? t : v + (t - v) * k)
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!)

export class PositioningScene {
  private renderer: THREE.WebGLRenderer
  private scene = new THREE.Scene()
  private camera = new THREE.PerspectiveCamera(34, 1, 0.1, 120)
  private world = new THREE.Group()
  private nodes: Node[] = []
  private byId = new Map<string, Node>()
  private hits: THREE.Mesh[] = []
  private axes: { el: HTMLDivElement; p: THREE.Vector3; align: "l" | "c" | "r"; depth?: boolean; follow?: string }[] = []
  private chartMats: { mat: THREE.LineBasicMaterial; base: number; depth?: boolean }[] = []
  private gapLine: THREE.Line
  private gapGeo = new THREE.BufferGeometry()
  private ray = new THREE.Raycaster()
  private ndc = new THREE.Vector2()
  private tmp = new THREE.Vector3()

  // animated state: current value + target
  private rig = { theta: 0.42, phi: 0.2, r: 30, target: V(), tTheta: 0.42, tPhi: 0.2, tR: 20, tTarget: V() }
  private depthMorph = 1
  private tDepth = 1
  private lookMorph = 0
  private tLook = 0
  private layoutMorph = 0
  private tLayout = 0

  private projection: Projection = "3d"
  private layout: Layout = "map"
  private filter: Filter = "all"
  private selected: Node | null = null
  private hot: Node | null = null
  private raf = 0
  private dragging = false
  private reduce = matchMedia("(prefers-reduced-motion: reduce)").matches
  private lastT = 0
  private disposed = false
  private reported = false
  private panelPx = 0
  private disposers: (() => void)[] = []

  constructor(
    private host: HTMLElement,
    private labelsEl: HTMLElement,
    private tip: HTMLElement,
    brands: Brand[],
    private logos: Record<string, Logo>,
    private cb: Callbacks,
  ) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true })
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
    this.renderer.setClearColor(0x000000, 1)
    host.appendChild(this.renderer.domElement)
    this.scene.fog = new THREE.Fog(0x000000, 18, 40)
    this.scene.add(this.world)

    this.buildChart()
    this.buildNodes(brands)
    this.gapLine = new THREE.Line(
      this.gapGeo,
      new THREE.LineDashedMaterial({ color: 0xb46cff, dashSize: 0.14, gapSize: 0.1, transparent: true, opacity: 0.75 }),
    )
    this.world.add(this.gapLine)
    this.buildAxes()
    this.bindInput()
    this.resize()
    // Redraw whenever the browser may have discarded the last frame: resize (window or the viewer's
    // iframe), tab shown again, page restored from cache, or a lost WebGL context coming back.
    const onResize = () => this.resize()
    const redraw = () => { this.lastT = 0; this.invalidate() }
    const onVisible = () => { if (document.visibilityState === "visible") redraw() }
    const cvs = this.renderer.domElement
    const onLost = (e: Event) => e.preventDefault()
    addEventListener("resize", onResize)
    addEventListener("pageshow", redraw)
    document.addEventListener("visibilitychange", onVisible)
    cvs.addEventListener("webglcontextlost", onLost)
    cvs.addEventListener("webglcontextrestored", redraw)
    const ro = new ResizeObserver(onResize)
    ro.observe(host)
    this.disposers.push(() => {
      removeEventListener("resize", onResize)
      removeEventListener("pageshow", redraw)
      document.removeEventListener("visibilitychange", onVisible)
      cvs.removeEventListener("webglcontextlost", onLost)
      cvs.removeEventListener("webglcontextrestored", redraw)
      ro.disconnect()
    })
    this.invalidate()
  }

  // ---------- public API ----------
  setProjection(p: Projection) {
    this.projection = p
    this.tDepth = p === "3d" ? 1 : 0
    if (p === "2d") { this.rig.tTheta = 0; this.rig.tPhi = 0 }
    else if (this.layout === "map" && Math.abs(this.rig.tTheta) < 0.05 && Math.abs(this.rig.tPhi) < 0.05) { this.rig.tTheta = 0.42; this.rig.tPhi = 0.2 }
    this.invalidate()
  }
  setLook(l: Look) { this.tLook = l === "logos" ? 1 : 0; if (l === "dots") this.setLayout("map"); this.invalidate() }
  setLayout(l: Layout) {
    this.layout = l
    this.tLayout = l === "gallery" ? 1 : 0
    if (l === "gallery") { this.rig.tTheta = 0; this.rig.tPhi = 0.04 }
    else this.setProjection(this.projection)
    if (!this.selected) { this.rig.tTarget.set(0, 0, 0); this.rig.tR = this.baseR() }
    else this.focus(this.selected)
    this.invalidate()
  }
  setFilter(f: Filter) { this.filter = f; this.invalidate() }
  /** Width in px of a panel covering the right edge; the focused brand is centred in the space left of it. */
  setPanelOffset(px: number) { this.panelPx = px; if (this.selected) this.focus(this.selected); this.invalidate() }
  select(id: string | null) {
    const n = id ? this.byId.get(id) ?? null : null
    this.selected = n
    if (n) this.focus(n)
    else { this.rig.tTarget.set(0, 0, 0); this.rig.tR = this.baseR() }
    this.hideTip()
    this.invalidate()
  }
  dispose() {
    this.disposed = true
    cancelAnimationFrame(this.raf)
    this.disposers.forEach((d) => d())
    this.renderer.dispose()
    this.renderer.domElement.remove()
    this.labelsEl.innerHTML = ""
  }

  // ---------- build ----------
  private line(pts: THREE.Vector3[], color: number, base: number, depth = false) {
    const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: base })
    this.world.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), mat))
    this.chartMats.push({ mat, base, depth })
  }
  private buildChart() {
    const grid: THREE.Vector3[] = []
    for (let i = -4; i <= 4; i++) {
      const x = (i / 4) * (W / 2), y = (i / 4) * (H / 2)
      grid.push(V(x, -H / 2), V(x, H / 2), V(-W / 2, y), V(W / 2, y))
    }
    this.line(grid, 0x8a6bb0, 0.07)
    this.line([V(-W / 2, 0), V(W / 2, 0), V(0, -H / 2), V(0, H / 2)], 0xb08ae0, 0.45)
    const frame = (z: number) => {
      const c = [V(-W / 2, -H / 2, z), V(W / 2, -H / 2, z), V(W / 2, H / 2, z), V(-W / 2, H / 2, z)]
      return c.flatMap((p, i) => [p, c[(i + 1) % 4]])
    }
    this.line(frame(DEPTH).concat(frame(-DEPTH)), 0x6d4a9a, 0.28, true)
    this.line(
      [[-1, -1], [1, -1], [1, 1], [-1, 1]].flatMap(([a, b]) => [V((a * W) / 2, (b * H) / 2, -DEPTH), V((a * W) / 2, (b * H) / 2, DEPTH)]),
      0x6d4a9a, 0.16, true,
    )
  }

  private glowTexture() {
    const c = document.createElement("canvas"); c.width = c.height = 128
    const g = c.getContext("2d")!
    const r = g.createRadialGradient(64, 64, 0, 64, 64, 64)
    r.addColorStop(0, "rgba(255,255,255,1)"); r.addColorStop(0.25, "rgba(255,255,255,.35)"); r.addColorStop(1, "rgba(255,255,255,0)")
    g.fillStyle = r; g.fillRect(0, 0, 128, 128)
    return new THREE.CanvasTexture(c)
  }

  // Logo tile: rounded square, brand background, logo contained with padding. Monogram when no file exists.
  private cardTexture(b: Brand) {
    const S = 512, R = 88
    const c = document.createElement("canvas"); c.width = c.height = S
    const g = c.getContext("2d")!
    const tex = new THREE.CanvasTexture(c)
    tex.colorSpace = THREE.SRGBColorSpace
    tex.anisotropy = 4
    const rr = () => { g.beginPath(); g.roundRect(0, 0, S, S, R) }
    const finish = () => {
      rr(); g.lineWidth = 6; g.strokeStyle = b.cat === "nu" ? "rgba(180,108,255,.9)" : "rgba(255,255,255,.14)"; g.stroke()
      tex.needsUpdate = true; this.invalidate()
    }
    const logo = this.logos[b.id]
    if (logo) {
      rr(); g.fillStyle = logo.bg; g.fill()
      const img = new Image()
      img.onload = () => {
        g.save(); rr(); g.clip()
        const pad = logo.pad * S, box = S - pad * 2
        const ar = (img.naturalWidth || 1) / (img.naturalHeight || 1)
        const w = ar >= 1 ? box : box * ar, h = ar >= 1 ? box / ar : box
        g.drawImage(img, (S - w) / 2, (S - h) / 2, w, h)
        g.restore(); finish()
      }
      img.src = logo.src
    } else {
      rr(); g.fillStyle = b.cat === "nu" ? "#2a0c45" : "#141118"; g.fill()
      const words = (b.full || b.name).replace(/\(.*?\)/g, "").split(/\s+/).filter((w) => /^[A-ZÀ-Ú0-9]/i.test(w))
      const mono = b.name.length <= 3 ? b.name : words.slice(0, 2).map((w) => w[0]).join("").toUpperCase()
      const font = `400 ${mono.length > 2 ? 160 : 200}px "Nu Sans Text", -apple-system, "Helvetica Neue", Arial, sans-serif`
      const draw = () => {
        rr(); g.fillStyle = b.cat === "nu" ? "#2a0c45" : "#141118"; g.fill()
        g.fillStyle = "#f5f3f8"; g.textAlign = "center"; g.textBaseline = "middle"; g.font = font
        g.fillText(mono, S / 2, S / 2 + 8)
        finish()
      }
      draw()
      // redraw once the brand face has loaded so monograms use Nu Sans
      document.fonts?.load(font).then(draw, () => {})
    }
    return tex
  }

  private buildNodes(brands: Brand[]) {
    const sphere = new THREE.SphereGeometry(1, 32, 24)
    const hitGeo = new THREE.SphereGeometry(1, 8, 6)
    const hitMat = new THREE.MeshBasicMaterial({ visible: false })
    const plane = new THREE.PlaneGeometry(1, 1)
    const glowTex = this.glowTexture()

    // Gallery: three rows on a concave arc, ordered from complex to simple (the chart's x axis).
    const order = brands.filter((b) => b.cat !== "ideal").sort((a, b) => a.x - b.x || b.y - a.y)
    const cols = Math.ceil(order.length / 3), R = 12, step = 0.155
    const galleryPos = new Map<string, THREE.Vector3>()
    order.forEach((b, i) => {
      const col = Math.floor(i / 3), row = i % 3
      const a = (col - (cols - 1) / 2) * step
      galleryPos.set(b.id, V(R * Math.sin(a), (1 - row) * 1.85, R * (1 - Math.cos(a))))
    })

    for (const b of brands) {
      const isIdeal = b.cat === "ideal"
      const size = b.id === "Nubank (marca-mãe)" ? 0.3 : b.cat === "nu" ? 0.15 : 0.115
      const map = V((b.x * W) / 2, (b.y * H) / 2, 0)
      const group = new THREE.Group(); group.position.copy(map); this.world.add(group)
      const n: Node = {
        b, map, size, group, scale: 1,
        gallery: galleryPos.get(b.id) ?? V((b.x * W) / 2, (b.y * H) / 2, -6),
        z: b.origin === "global" ? -DEPTH : b.cat === "nu" || isIdeal ? DEPTH * 0.5 : DEPTH,
        hit: new THREE.Mesh(hitGeo, hitMat),
        stem: new THREE.Line(new THREE.BufferGeometry().setFromPoints([V(), V()]), new THREE.LineBasicMaterial({ color: HEX[b.cat], transparent: true, opacity: 0 })),
        label: document.createElement("div"),
      }
      if (isIdeal) {
        n.ring = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.53, 96), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, side: THREE.DoubleSide }))
        group.add(n.ring)
        n.dot = new THREE.Mesh(sphere, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true })); n.dot.scale.setScalar(0.07)
        group.add(n.dot)
        n.glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0x9b4de0, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending }))
        n.glow.scale.setScalar(2.6); group.add(n.glow)
      } else {
        n.dot = new THREE.Mesh(sphere, new THREE.MeshBasicMaterial({ color: HEX[b.cat], transparent: true }))
        n.dot.scale.setScalar(size); group.add(n.dot)
        n.glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: HEX[b.cat], transparent: true, opacity: b.cat === "nu" ? 0.6 : 0.28, depthWrite: false, blending: THREE.AdditiveBlending }))
        n.glow.scale.setScalar(size * (b.cat === "nu" ? 7 : 5)); group.add(n.glow)
        n.card = new THREE.Mesh(plane, new THREE.MeshBasicMaterial({ map: this.cardTexture(b), transparent: true, depthWrite: false }))
        n.card.renderOrder = 2
        n.frame = new THREE.Mesh(plane, new THREE.MeshBasicMaterial({ map: this.frameTexture(), transparent: true, depthWrite: false, opacity: 0 }))
        n.frame.renderOrder = 1
        group.add(n.frame, n.card)
      }
      n.hit.userData.node = n; group.add(n.hit); this.hits.push(n.hit)
      this.world.add(n.stem)
      n.label.className = "scene-label"
      n.label.dataset.cat = b.cat
      n.label.textContent = isIdeal ? "Nu Asset ideal" : b.id
      this.labelsEl.appendChild(n.label)
      this.nodes.push(n); this.byId.set(b.id, n)
    }
  }

  private frameTexture() {
    const S = 256, c = document.createElement("canvas"); c.width = c.height = S
    const g = c.getContext("2d")!
    g.beginPath(); g.roundRect(6, 6, S - 12, S - 12, 50); g.lineWidth = 8; g.strokeStyle = "#b46cff"; g.stroke()
    return new THREE.CanvasTexture(c)
  }

  private buildAxes() {
    const add = (t: string, p: THREE.Vector3, align: "l" | "c" | "r", extra: { depth?: boolean; follow?: string } = {}) => {
      const el = document.createElement("div"); el.className = "scene-axis"; el.textContent = t
      if (extra.depth) el.dataset.depth = "true"
      this.labelsEl.appendChild(el); this.axes.push({ el, p, align, ...extra })
    }
    add("← Complexo", V(-W / 2 - 0.1, 0), "r")
    add("Simples →", V(W / 2 + 0.1, 0), "l")
    add("Sofisticação · patrimônio", V(0, H / 2 + 0.25), "c")
    add("Acesso · varejo", V(0, -H / 2 - 0.25), "c")
    add("gap de mercado", V(0, 0.75), "c", { follow: "Nu Asset ideal" })
    add("Brasil", V(W / 2 + 0.1, -H / 2, DEPTH), "l", { depth: true })
    add("Global", V(W / 2 + 0.1, -H / 2, -DEPTH), "l", { depth: true })
  }

  // ---------- input ----------
  private bindInput() {
    const cvs = this.renderer.domElement
    cvs.style.touchAction = "none"
    const pointers = new Map<number, { x: number; y: number }>()
    let drag: { x: number; y: number } | null = null
    let pinch: { d: number; r: number } | null = null
    let moved = 0
    const on = <K extends keyof HTMLElementEventMap>(t: K, f: (e: HTMLElementEventMap[K]) => void, o?: AddEventListenerOptions) => {
      cvs.addEventListener(t, f as EventListener, o)
      this.disposers.push(() => cvs.removeEventListener(t, f as EventListener))
    }
    on("pointerdown", (e) => {
      cvs.setPointerCapture(e.pointerId); pointers.set(e.pointerId, { x: e.clientX, y: e.clientY }); moved = 0
      if (pointers.size === 1) drag = { x: e.clientX, y: e.clientY }
      if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), r: this.rig.tR }; drag = null }
    })
    on("pointermove", (e) => {
      if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (pinch && pointers.size === 2) {
        const [a, b] = [...pointers.values()]
        this.rig.tR = clamp((pinch.r * pinch.d) / Math.hypot(a.x - b.x, a.y - b.y), 5, 60); moved = 99; this.invalidate(); return
      }
      if (drag) {
        const dx = e.clientX - drag.x, dy = e.clientY - drag.y
        moved += Math.abs(dx) + Math.abs(dy); drag = { x: e.clientX, y: e.clientY }
        if (moved > 4) { this.dragging = true; cvs.style.cursor = "grabbing" }
        const orbit = this.projection === "3d" || this.layout === "gallery"
        if (orbit) {
          this.rig.tTheta = clamp(this.rig.tTheta - dx * 0.006, -1.3, 1.3)
          this.rig.tPhi = clamp(this.rig.tPhi + dy * 0.005, -1, 1)
        } else {
          const k = this.rig.r / 900; this.rig.tTarget.x -= dx * k; this.rig.tTarget.y += dy * k
        }
        this.hideTip(); this.invalidate()
      } else this.hover(e)
    })
    const end = (e: PointerEvent) => {
      pointers.delete(e.pointerId)
      if (pointers.size < 2) pinch = null
      if (drag && moved < 5) this.click(e)
      drag = null; this.dragging = false; cvs.style.cursor = ""
      this.invalidate()
    }
    on("pointerup", end)
    on("pointercancel", (e) => { pointers.delete(e.pointerId); drag = null; pinch = null; this.dragging = false })
    on("pointerleave", () => this.hideTip())
    on("wheel", (e) => { e.preventDefault(); this.rig.tR = clamp(this.rig.tR * Math.exp(e.deltaY * 0.0012), 5, 60); this.invalidate() }, { passive: false })
    on("dblclick", () => { this.rig.tTarget.set(0, 0, 0); this.rig.tR = this.baseR(); this.invalidate() })
  }

  private visible(n: Node) {
    return this.filter === "all" || n.b.cat === this.filter || n.b.cat === "nu" || n.b.cat === "ideal"
  }
  private pick(e: PointerEvent) {
    const r = this.renderer.domElement.getBoundingClientRect()
    this.ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
    this.ray.setFromCamera(this.ndc, this.camera)
    const hit = this.ray.intersectObjects(this.hits.filter((h) => this.visible(h.userData.node)), false)[0]
    return hit ? (hit.object.userData.node as Node) : null
  }
  private hover(e: PointerEvent) {
    const n = this.pick(e)
    if (n !== this.hot) { this.hot = n; this.invalidate() }
    this.renderer.domElement.style.cursor = n ? "pointer" : ""
    if (!n) return this.hideTip()
    this.tip.innerHTML = `<b class="block font-medium">${esc(n.b.name)}</b><span class="text-muted-foreground">${CAT_LABEL[n.b.cat]} · ${quadrant(n.b)}</span>`
    const tx = Math.min(e.clientX + 14, innerWidth - this.tip.offsetWidth - 12)
    this.tip.style.transform = `translate(${tx}px, ${e.clientY + 14}px)`
    this.tip.style.opacity = "1"
  }
  private hideTip() {
    this.tip.style.opacity = "0"
    if (this.hot) { this.hot = null; this.invalidate() }
  }
  private click(e: PointerEvent) {
    const n = this.pick(e)
    if (n) this.cb.onSelect(n.b.id)
    else if (this.selected) this.cb.onSelect(null)
  }

  // ---------- camera ----------
  private focus(n: Node) {
    const p = this.nodePosition(n, this.tDepth, this.tLayout)
    this.rig.tR = this.tLayout ? 13 : innerWidth < 720 ? 11 : 10
    const unitsPerPx = innerHeight ? (2 * this.rig.tR * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2))) / innerHeight : 0
    const shift = (this.panelPx / 2) * unitsPerPx
    const th = this.rig.tTheta
    this.rig.tTarget.set(p.x + Math.cos(th) * shift, p.y, p.z - Math.sin(th) * shift)
  }
  private baseR() {
    if (!innerWidth || !innerHeight) return 20
    const a = innerWidth / innerHeight, t = Math.tan(THREE.MathUtils.degToRad(17))
    const w = this.tLayout ? 20 : W + 3.2, h = this.tLayout ? 7.5 : H + 2.4
    return clamp(Math.max(h / 2 / t, w / 2 / t / a), 12, 60)
  }
  private resize() {
    if (!innerWidth || !innerHeight) return // hidden iframe: keep the last good size
    this.renderer.setSize(innerWidth, innerHeight, false)
    this.camera.aspect = innerWidth / innerHeight
    this.camera.updateProjectionMatrix()
    if (!this.selected) this.rig.tR = this.baseR()
    this.invalidate()
  }

  private nodePosition(n: Node, depth: number, layout: number) {
    return this.tmp.set(n.map.x, n.map.y, n.z * depth).lerp(n.gallery, layout).clone()
  }

  // ---------- render loop (on demand: stops when everything has settled) ----------
  // The scene repaints every animation frame while the page is visible. Nothing moves without input, so
  // it stays still, but the canvas is never left blank if the browser drops its last frame (this happened
  // on real GPUs when the blurred side panel closed over a render-on-demand canvas).
  invalidate() {
    if (!this.raf && !this.disposed) this.raf = requestAnimationFrame(() => this.tick())
  }
  private tick() {
    this.raf = 0
    try {
      this.frame()
    } catch (err) {
      if (!this.reported) { this.reported = true; console.error("[PositioningScene] frame failed", err) }
    }
    this.invalidate()
  }
  private frame() {
    // time-based easing, so the motion takes the same time on slow and fast devices
    const now = performance.now()
    const dt = this.lastT ? Math.min((now - this.lastT) / 1000, 0.1) : 1 / 60
    this.lastT = now
    const k = this.reduce ? 1 : 1 - Math.exp(-dt * 6.5)
    const ks = this.reduce ? 1 : 1 - Math.exp(-dt * 14)
    const r = this.rig
    r.theta = approach(r.theta, r.tTheta, k); r.phi = approach(r.phi, r.tPhi, k); r.r = approach(r.r, r.tR, k)
    r.target.lerp(r.tTarget, k); if (r.target.distanceTo(r.tTarget) < 1e-4) r.target.copy(r.tTarget)
    this.depthMorph = approach(this.depthMorph, this.tDepth, k)
    this.lookMorph = approach(this.lookMorph, this.tLook, k)
    this.layoutMorph = approach(this.layoutMorph, this.tLayout, k)

    // never let a bad value (e.g. a zero-size viewport) poison the eased camera for good
    const finite = [r.theta, r.phi, r.r, r.target.x, r.target.y, r.target.z, r.tTheta, r.tPhi, r.tR, r.tTarget.x, r.tTarget.y, r.tTarget.z].every(Number.isFinite)
    if (!finite) {
      r.theta = r.tTheta = this.layout === "gallery" || this.projection === "2d" ? 0 : 0.42
      r.phi = r.tPhi = this.layout === "gallery" ? 0.04 : this.projection === "2d" ? 0 : 0.2
      r.r = r.tR = this.baseR()
      r.target.set(0, 0, 0); r.tTarget.set(0, 0, 0)
    }

    const cam = this.camera
    cam.position.set(
      r.target.x + r.r * Math.sin(r.theta) * Math.cos(r.phi),
      r.target.y + r.r * Math.sin(r.phi),
      r.target.z + r.r * Math.cos(r.theta) * Math.cos(r.phi),
    )
    cam.lookAt(r.target)
    cam.updateMatrixWorld()
    ;(this.scene.fog as THREE.Fog).near = r.r - 2
    ;(this.scene.fog as THREE.Fog).far = r.r + 20

    const dm = this.depthMorph, lk = this.lookMorph, lm = this.layoutMorph
    const chartVis = 1 - lm
    this.chartMats.forEach((c) => { c.mat.opacity = c.base * chartVis * (c.depth ? dm : 1); c.mat.visible = c.mat.opacity > 0.004 })

    for (const n of this.nodes) {
      const vis = this.visible(n), active = this.selected === n || this.hot === n
      const pos = this.nodePosition(n, dm, lm)
      n.group.position.copy(pos)
      const target = (active ? (lk ? 1.18 : 1.5) : 1) * (vis ? 1 : 0.6)
      const ns = approach(n.scale, target, ks)
      n.scale = ns
      const p = n.stem.geometry.attributes.position as THREE.BufferAttribute
      p.setXYZ(0, n.map.x, n.map.y, 0); p.setXYZ(1, n.map.x, n.map.y, n.z * dm); p.needsUpdate = true
      const so = (vis ? 0.3 : 0.05) * dm * chartVis
      ;(n.stem.material as THREE.LineBasicMaterial).opacity = so
      n.stem.visible = so > 0.004

      if (n.b.cat === "ideal") {
        n.group.scale.setScalar(ns)
        n.ring!.quaternion.copy(cam.quaternion)
        const o = chartVis
        ;(n.ring!.material as THREE.MeshBasicMaterial).opacity = 0.8 * o
        ;(n.dot!.material as THREE.MeshBasicMaterial).opacity = o
        n.glow!.material.opacity = 0.5 * o
        n.group.visible = o > 0.004
        n.hit.scale.setScalar(o > 0.5 ? 0.6 : 0.0001)
      } else {
        const dotS = n.size * ns * (1 - lk)
        n.dot!.scale.setScalar(Math.max(dotS, 1e-4))
        ;(n.dot!.material as THREE.MeshBasicMaterial).opacity = vis ? 1 : 0.15
        n.glow!.scale.setScalar(n.size * (n.b.cat === "nu" ? 7 : 5) * ns * (1 - lk) + 1e-4)
        n.glow!.material.opacity = vis ? (active ? 0.6 : n.b.cat === "nu" ? 0.6 : 0.28) : 0.03
        const cardS = (MAP_CARD + (GALLERY_CARD - MAP_CARD) * lm) * ns * lk
        n.card!.scale.setScalar(Math.max(cardS, 1e-4))
        n.card!.quaternion.copy(cam.quaternion)
        ;(n.card!.material as THREE.MeshBasicMaterial).opacity = vis ? 1 : 0.2
        n.frame!.scale.setScalar(Math.max(cardS * 1.12, 1e-4))
        n.frame!.quaternion.copy(cam.quaternion)
        ;(n.frame!.material as THREE.MeshBasicMaterial).opacity = active ? lk : 0
        n.frame!.visible = active && lk > 0.01
        n.dot!.visible = n.glow!.visible = lk < 0.99
        n.card!.visible = lk > 0.01
        n.hit.scale.setScalar(Math.max(Math.max(0.28, n.size * 1.6) * (1 - lk), cardS * 0.62))
      }

      // labels: right of the mark on the map, centred under the card in the gallery
      const el = n.label
      el.dataset.dim = String(!vis)
      el.dataset.state = this.selected === n ? "sel" : this.hot === n ? "hot" : ""
      const dist = cam.position.distanceTo(pos)
      const pxPerUnit = innerHeight / 2 / (dist * Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)))
      const radius = n.b.cat === "ideal" ? 0.1 : Math.max(n.size * ns * (1 - lk), (cardS(n, lm, lk, ns)) / 2)
      if (lm > 0.5 && n.b.cat !== "ideal") this.project(pos, el, "c", 0, radius * pxPerUnit + 8)
      else this.project(pos, el, "l", 8 + radius * pxPerUnit, 0)
      el.style.opacity = n.b.cat === "ideal" ? String(chartVis) : ""
    }

    const a = this.byId.get("Nu Asset hoje")!.group.position, b = this.byId.get("Nu Asset ideal")!.group.position
    this.gapGeo.setFromPoints([a.clone(), b.clone()]); this.gapLine.computeLineDistances()
    ;(this.gapLine.material as THREE.LineDashedMaterial).opacity = 0.75 * chartVis
    this.gapLine.visible = chartVis > 0.004

    for (const ax of this.axes) {
      ax.el.style.opacity = String((ax.depth ? dm : 1) * chartVis)
      const p = ax.follow ? this.byId.get(ax.follow)!.group.position.clone().add(ax.p) : ax.p
      this.project(p, ax.el, ax.align, 0, 0)
    }

    this.renderer.render(this.scene, cam)

  }

  private project(v: THREE.Vector3, el: HTMLElement, align: "l" | "c" | "r", dx: number, dy: number) {
    this.tmp.copy(v).project(this.camera)
    if (this.tmp.z > 1) { el.style.transform = "translate(-9999px,0)"; return }
    const x = ((this.tmp.x + 1) / 2) * innerWidth, y = ((1 - this.tmp.y) / 2) * innerHeight
    const off = align === "r" ? -el.offsetWidth : align === "c" ? -el.offsetWidth / 2 : 0
    el.style.transform = `translate(${Math.round(x + off + dx)}px, ${Math.round(y - 7 + dy)}px)`
  }
}

function cardS(_n: Node, lm: number, lk: number, ns: number) {
  return (MAP_CARD + (GALLERY_CARD - MAP_CARD) * lm) * ns * lk
}
