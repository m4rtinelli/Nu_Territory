import { useEffect, useMemo, useRef, useState } from "react"
import { ChevronLeft, ChevronRight, Search } from "lucide-react"
import brandsJson from "@/data/brands.json"
import { LOGOS } from "@/data/logos"
import type { Brand } from "@/types"
import { CAT_LABEL, quadrant } from "@/types"
import { PositioningScene, type Filter, type Layout, type Look, type Projection } from "@/scene/PositioningScene"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"

const BRANDS = brandsJson as Brand[]
const IDEAL = BRANDS.find((b) => b.cat === "ideal")!
const ORDER = BRANDS.filter((b) => b.cat !== "ideal").sort((a, b) => a.x - b.x || b.y - a.y).concat(IDEAL)
const dist = (b: Brand) => Math.hypot(b.x - IDEAL.x, b.y - IDEAL.y)
const RANKED = BRANDS.filter((b) => b.cat !== "ideal").sort((a, b) => dist(a) - dist(b)).map((b) => b.id)
const CAT_DOT: Record<Brand["cat"], string> = { bank: "bg-bank", manager: "bg-manager", nu: "bg-nu-light", ideal: "bg-foreground" }
const fmt = (v: number) => (v >= 0 ? "+" : "−") + Math.abs(v).toFixed(2)
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()

function useIsNarrow() {
  const [narrow, setNarrow] = useState(() => innerWidth < 720)
  useEffect(() => {
    const f = () => setNarrow(innerWidth < 720)
    addEventListener("resize", f)
    return () => removeEventListener("resize", f)
  }, [])
  return narrow
}

export default function App() {
  const stageRef = useRef<HTMLDivElement>(null)
  const labelsRef = useRef<HTMLDivElement>(null)
  const tipRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<PositioningScene | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [projection, setProjection] = useState<Projection>("3d")
  const [look, setLook] = useState<Look>("dots")
  const [layout, setLayout] = useState<Layout>("map")
  const [filter, setFilter] = useState<Filter>("all")
  const [searchOpen, setSearchOpen] = useState(false)
  const narrow = useIsNarrow()

  useEffect(() => {
    const s = new PositioningScene(stageRef.current!, labelsRef.current!, tipRef.current!, BRANDS, LOGOS, { onSelect: setSelected })
    sceneRef.current = s
    return () => s.dispose()
  }, [])
  useEffect(() => {
    sceneRef.current?.setPanelOffset(selected && !narrow ? 460 : 0)
    sceneRef.current?.select(selected)
  }, [selected, narrow])
  useEffect(() => sceneRef.current?.setProjection(projection), [projection])
  useEffect(() => sceneRef.current?.setLook(look), [look])
  useEffect(() => sceneRef.current?.setLayout(layout), [layout])
  useEffect(() => sceneRef.current?.setFilter(filter), [filter])

  const step = (dir: number) => {
    const i = selected ? ORDER.findIndex((b) => b.id === selected) : -1
    setSelected(ORDER[(i + dir + ORDER.length) % ORDER.length].id)
  }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("input, [cmdk-root]")) return
      if (e.key === "ArrowRight") step(1)
      if (e.key === "ArrowLeft") step(-1)
      if (e.key === "Escape") setSelected(null)
      if (e.key === "/" || (e.key === "k" && (e.metaKey || e.ctrlKey))) { e.preventDefault(); setSearchOpen(true) }
    }
    addEventListener("keydown", onKey)
    return () => removeEventListener("keydown", onKey)
  })

  const brand = useMemo(() => BRANDS.find((b) => b.id === selected) ?? null, [selected])

  return (
    <div className="relative h-full w-full">
      <div ref={stageRef} className="fixed inset-0 [&_canvas]:block [&_canvas]:h-full [&_canvas]:w-full" />
      <div ref={labelsRef} className="pointer-events-none fixed inset-0 overflow-hidden" />
      <div
        ref={tipRef}
        className="pointer-events-none fixed left-0 top-0 z-30 whitespace-nowrap rounded-md border bg-popover px-3 py-1.5 text-xs text-popover-foreground opacity-0 shadow-md transition-opacity"
      />

      <header
        className="pointer-events-none fixed left-0 top-0 z-10 max-w-xl"
        style={{
          paddingTop: "calc(24px + env(safe-area-inset-top, 0px))",
          paddingLeft: "max(28px, env(safe-area-inset-left, 0px))",
          paddingRight: "max(16px, env(safe-area-inset-right, 0px))",
        }}
      >
        <p className="text-[11px] uppercase tracking-[0.16em] text-nu-light">Competitive Positioning Framework</p>
        <h1 className="mt-2.5 text-balance font-display text-[clamp(24px,2.8vw,38px)] font-normal leading-[1.08] tracking-[-0.03em]">
          A Nu Asset pode ocupar a sofisticação com <span className="text-nu-light">simplicidade</span>
        </h1>
        <p className="mt-2 hidden max-w-[46ch] text-[13px] leading-relaxed text-muted-foreground md:block">
          Bancos vendem sofisticação por abundância e exclusividade. Quem simplifica fala com o varejo. Clique em qualquer marca para abrir o bench.
        </p>
      </header>

      <Legend look={look} hidden={!!selected || narrow} />

      <Dock
        projection={projection} setProjection={setProjection}
        look={look} setLook={setLook}
        layout={layout} setLayout={setLayout}
        filter={filter} setFilter={setFilter}
        searchOpen={searchOpen} setSearchOpen={setSearchOpen}
        onPick={(id) => { setSelected(id); setSearchOpen(false) }}
      />

      <p className="fixed bottom-[calc(26px+env(safe-area-inset-bottom,0px))] left-[max(28px,env(safe-area-inset-left,0px))] z-10 hidden text-[11px] text-muted-foreground/60 lg:block">
        {layout === "gallery" ? "Galeria ordenada de complexo para simples" : projection === "3d" ? "Arraste para girar · role para aproximar · ← → navega" : "Vista frontal, idêntica ao slide 149"}
      </p>

      <Sheet open={!!brand} onOpenChange={(o) => !o && setSelected(null)} modal={false}>
        <SheetContent
          side={narrow ? "bottom" : "right"}
          onInteractOutside={(e) => e.preventDefault()}
          onOpenAutoFocus={(e) => e.preventDefault()}
          className={cn(
            "glass flex flex-col gap-0 p-0",
            narrow ? "h-[80vh] rounded-t-2xl" : "w-[460px] sm:max-w-[460px]"
          )}
        >
          {brand && <BrandPanel brand={brand} onStep={step} />}
        </SheetContent>
      </Sheet>
    </div>
  )
}

function Legend({ look, hidden }: { look: Look; hidden: boolean }) {
  const items: [string, string][] = [["bg-bank", "Bancos"], ["bg-manager", "Gestoras e plataformas"], ["bg-nu-light", "Ecossistema Nu"]]
  return (
    <div
      className={cn("fixed z-10 grid gap-2 text-[11px] text-muted-foreground transition-opacity", hidden && "pointer-events-none opacity-0")}
      style={{ top: "calc(28px + env(safe-area-inset-top, 0px))", right: "max(28px, env(safe-area-inset-right, 0px))" }}
    >
      {look === "dots" ? (
        items.map(([c, t]) => (
          <span key={t} className="flex items-center gap-2"><i className={cn("h-2 w-2 rounded-full", c)} />{t}</span>
        ))
      ) : (
        <>
          <span className="flex items-center gap-2"><i className="h-3 w-3 rounded-[4px] border border-nu-light" />Ecossistema Nu</span>
          <span className="flex items-center gap-2"><i className="grid h-3 w-3 place-items-center rounded-[4px] bg-secondary text-[7px] font-normal text-foreground">A</i>Monograma: logo pendente</span>
        </>
      )}
      <span className="flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-full border border-foreground" />Posição ideal</span>
    </div>
  )
}

type DockProps = {
  projection: Projection; setProjection: (p: Projection) => void
  look: Look; setLook: (l: Look) => void
  layout: Layout; setLayout: (l: Layout) => void
  filter: Filter; setFilter: (f: Filter) => void
  searchOpen: boolean; setSearchOpen: (o: boolean) => void
  onPick: (id: string) => void
}

function Dock(p: DockProps) {
  const item = "h-8 rounded-full px-3.5 text-xs text-muted-foreground hover:bg-transparent hover:text-foreground data-[state=on]:bg-secondary data-[state=on]:text-foreground"
  const group = "glass rounded-full border p-[3px]"
  return (
    <div
      className="fixed left-1/2 z-20 flex max-w-[calc(100vw-32px)] -translate-x-1/2 items-center justify-center gap-2 max-md:w-[calc(100vw-32px)] max-md:justify-start max-md:overflow-x-auto max-md:[scrollbar-width:none] md:flex-wrap [&>*]:shrink-0"
      style={{ bottom: "calc(20px + env(safe-area-inset-bottom, 0px))" }}
    >
      <ToggleGroup type="single" value={p.look} onValueChange={(v) => v && p.setLook(v as Look)} className={group} aria-label="Aparência">
        <ToggleGroupItem value="dots" className={item}>Pontos</ToggleGroupItem>
        <ToggleGroupItem value="logos" className={item}>Logos</ToggleGroupItem>
      </ToggleGroup>
      {p.look === "logos" && (
        <ToggleGroup type="single" value={p.layout} onValueChange={(v) => v && p.setLayout(v as Layout)} className={group} aria-label="Arranjo">
          <ToggleGroupItem value="map" className={item}>Mapa</ToggleGroupItem>
          <ToggleGroupItem value="gallery" className={item}>Galeria</ToggleGroupItem>
        </ToggleGroup>
      )}
      {p.layout === "map" && (
        <ToggleGroup type="single" value={p.projection} onValueChange={(v) => v && p.setProjection(v as Projection)} className={group} aria-label="Vista">
          <ToggleGroupItem value="3d" className={item}>3D</ToggleGroupItem>
          <ToggleGroupItem value="2d" className={item}>Vista do slide</ToggleGroupItem>
        </ToggleGroup>
      )}
      <ToggleGroup type="single" value={p.filter} onValueChange={(v) => v && p.setFilter(v as Filter)} className={group} aria-label="Filtro">
        <ToggleGroupItem value="all" className={item}>Todos</ToggleGroupItem>
        <ToggleGroupItem value="bank" className={item}>Bancos</ToggleGroupItem>
        <ToggleGroupItem value="manager" className={item}>Gestoras</ToggleGroupItem>
      </ToggleGroup>
      <Popover open={p.searchOpen} onOpenChange={p.setSearchOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" className="glass h-[40px] gap-2 rounded-full px-4 text-xs font-normal text-muted-foreground">
            <Search /> Buscar marca <kbd className="ml-1 hidden rounded border bg-muted px-1.5 font-mono text-[10px] sm:inline">/</kbd>
          </Button>
        </PopoverTrigger>
        <PopoverContent side="top" align="end" className="w-72 p-0">
          <Command filter={(v, s) => (norm(v).includes(norm(s)) ? 1 : 0)}>
            <CommandInput placeholder="Buscar marca…" />
            <CommandList>
              <CommandEmpty>Nenhuma marca com esse nome.</CommandEmpty>
              <CommandGroup heading={`${ORDER.length} marcas, de complexo para simples`}>
                {ORDER.map((b) => (
                  <CommandItem key={b.id} value={`${b.name} ${b.full ?? ""} ${b.id}`} onSelect={() => p.onPick(b.id)}>
                    <LogoTile brand={b} className="h-6 w-6 rounded-[6px] text-[9px]" />
                    <span className="flex-1 truncate">{b.cat === "ideal" ? "Posição ideal" : b.name}</span>
                    <span className="text-[11px] text-muted-foreground">{CAT_LABEL[b.cat]}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  )
}

function LogoTile({ brand, className }: { brand: Brand; className?: string }) {
  const logo = LOGOS[brand.id]
  if (brand.cat === "ideal")
    return <span className={cn("grid shrink-0 place-items-center rounded-xl border border-foreground/60", className)}><i className="h-1/3 w-1/3 rounded-full bg-foreground" /></span>
  if (!logo) {
    const words = (brand.full || brand.name).replace(/\(.*?\)/g, "").split(/\s+/).filter(Boolean)
    const mono = brand.name.length <= 3 ? brand.name : words.slice(0, 2).map((w) => w[0]).join("").toUpperCase()
    return <span className={cn("grid shrink-0 place-items-center rounded-xl bg-secondary font-normal text-foreground", className)}>{mono}</span>
  }
  return (
    <span
      className={cn("grid shrink-0 place-items-center overflow-hidden rounded-xl", brand.cat === "nu" && "ring-1 ring-nu-light", className)}
      style={{ background: logo.bg }}
    >
      {/* inset relative to the tile itself (percentage padding would resolve against the parent's width) */}
      <img src={logo.src} alt={`Logo ${brand.name}`} className="object-contain" style={{ width: `${100 - logo.pad * 200}%`, height: `${100 - logo.pad * 200}%` }} />
    </span>
  )
}

function Meter({ label, value, ideal, lo, hi }: { label: string; value: number; ideal: number; lo: string; hi: string }) {
  return (
    <div className="grid gap-2">
      <div className="flex justify-between text-[11px] text-muted-foreground">
        <span>{label}</span>
        <b className="font-mono font-normal tabular-nums text-foreground">{fmt(value)}</b>
      </div>
      <div className="relative h-1 rounded-full bg-secondary">
        <span className="absolute -bottom-1 -top-1 left-1/2 w-px bg-foreground/20" />
        <span title="Posição ideal" className="absolute top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-foreground/60" style={{ left: `${((ideal + 1) / 2) * 100}%` }} />
        <span className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-nu-light shadow-[0_0_0_4px_hsl(var(--nu-light)/0.18)] transition-[left] duration-700" style={{ left: `${((value + 1) / 2) * 100}%` }} />
      </div>
      <div className="flex justify-between text-[10px] uppercase tracking-wider text-muted-foreground/60">
        <span>{lo}</span><span>{hi}</span>
      </div>
    </div>
  )
}

function Paras({ paras }: { paras?: string[] }) {
  return <>{(paras ?? []).map((t, i) => <p key={i} className="text-sm leading-relaxed text-foreground/85">{t}</p>)}</>
}

function SectionHead({ title, n }: { title: string; n: number }) {
  return (
    <div className="flex items-baseline justify-between">
      <h3 className="font-display text-[15px] font-normal tracking-tight">{title}</h3>
      <span className="font-mono text-[10px] text-muted-foreground/70">slide {n}</span>
    </div>
  )
}

function BrandPanel({ brand, onStep }: { brand: Brand; onStep: (d: number) => void }) {
  const viewport = useRef<HTMLDivElement>(null)
  useEffect(() => viewport.current?.scrollTo({ top: 0 }), [brand.id])
  const slides = brand.slides ?? []
  const intro = slides.find((s) => s.type === "intro")
  const para = slides.map((s) => s.para).find(Boolean)
  const isEtf = (t: string) => /\bE[TF]F/i.test(t)
  const reading = slides.filter((s) => s.type !== "destaques" && !isEtf(s.title) && ((s.paras?.length ?? 0) > 0 || s.terms))
  const etf = slides.filter((s) => s.type !== "destaques" && isEtf(s.title))
  const highlights = slides.filter((s) => s.type === "destaques")
  const tabs = [
    reading.length && { v: "leitura", t: "Leitura" },
    etf.length && { v: "etf", t: "ETFs" },
    highlights.length && { v: "destaques", t: "Destaques" },
  ].filter(Boolean) as { v: string; t: string }[]
  const idx = ORDER.findIndex((b) => b.id === brand.id)
  const range = brand.range ? (brand.range[0] === brand.range[1] ? `slide ${brand.range[0]}` : `slides ${brand.range[0]}–${brand.range[1]}`) : ""
  const rank = RANKED.indexOf(brand.id)
  const logo = LOGOS[brand.id]
  const sectionTitle = (s: (typeof slides)[number]) => {
    const t = norm(s.title)
    if (t === norm(brand.full ?? "") || t === norm(brand.name)) return s.type === "intro" ? "Leitura de marca" : "Posicionamento"
    return s.title
  }

  return (
    <>
      <div className="flex items-center justify-between gap-2 py-4 pl-7 pr-14">
        <span className="font-mono text-[11px] tabular-nums tracking-widest text-muted-foreground">
          {String(idx + 1).padStart(2, "0")} / {ORDER.length}
        </span>
        <div className="flex gap-1">
          <Button variant="secondary" size="icon" className="h-8 w-8 rounded-full" onClick={() => onStep(-1)} aria-label="Marca anterior"><ChevronLeft /></Button>
          <Button variant="secondary" size="icon" className="h-8 w-8 rounded-full" onClick={() => onStep(1)} aria-label="Próxima marca"><ChevronRight /></Button>
        </div>
      </div>
      <ScrollArea className="min-h-0 flex-1" viewportRef={viewport}>
        <div className="flex flex-col gap-6 px-7 pb-[calc(40px+env(safe-area-inset-bottom,0px))]">
          <SheetHeader className="gap-4 space-y-0">
            <div className="flex items-center gap-4">
              <LogoTile brand={brand} className="h-16 w-16 rounded-2xl text-lg" />
              <div className="flex min-w-0 flex-wrap gap-1.5">
                <Badge variant="secondary" className="font-normal"><i className={cn("h-1.5 w-1.5 rounded-full", CAT_DOT[brand.cat])} />{CAT_LABEL[brand.cat]}</Badge>
                {brand.cat !== "ideal" && <Badge variant="secondary" className="font-normal">{brand.origin === "global" ? "Global" : "Brasil"}</Badge>}
                {brand.cat !== "ideal" && <Badge variant="secondary" className="font-normal">{quadrant(brand)}</Badge>}
              </div>
            </div>
            <SheetTitle className="text-balance font-display text-[34px] font-normal leading-[1.04] tracking-[-0.03em]">{brand.full ?? brand.name}</SheetTitle>
            {intro?.lead ? (
              <SheetDescription className="text-pretty font-display text-lg leading-snug tracking-[-0.01em] text-foreground">{intro.lead}</SheetDescription>
            ) : (
              <SheetDescription className="sr-only">Detalhes da marca</SheetDescription>
            )}
          </SheetHeader>

          <Card className="bg-secondary/40 shadow-none">
            <CardContent className="grid gap-4 p-5">
              <Meter label="Complexidade" value={brand.x} ideal={IDEAL.x} lo="Complexo" hi="Simples" />
              <Meter label="Público" value={brand.y} ideal={IDEAL.y} lo="Acesso · varejo" hi="Sofisticação" />
              {brand.cat !== "ideal" && (
                <>
                  <Separator />
                  <div className="flex items-baseline justify-between text-xs text-muted-foreground">
                    <span>Distância até a posição ideal<br /><span className="text-muted-foreground/60">{rank + 1}ª mais próxima de {RANKED.length}</span></span>
                    <b className="font-mono text-xl font-normal tabular-nums text-foreground">{dist(brand).toFixed(2)}</b>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {para && (
            <Card className="border-nu-light/30 bg-gradient-to-br from-primary/30 to-primary/5 shadow-none">
              <CardContent className="grid gap-2 p-5">
                <p className="text-[11px] font-normal uppercase tracking-[0.14em] text-nu-light">Para a Nu Asset</p>
                <p className="text-sm leading-relaxed">{para}</p>
              </CardContent>
            </Card>
          )}

          {tabs.length > 0 && (
            <Tabs key={brand.id} defaultValue={tabs[0].v}>
              {tabs.length > 1 && (
                <TabsList className="w-full">
                  {tabs.map((t) => <TabsTrigger key={t.v} value={t.v} className="flex-1">{t.t}</TabsTrigger>)}
                </TabsList>
              )}
              <TabsContent value="leitura" className="mt-5 grid gap-7">
                {reading.map((s) => (
                  <section key={s.n} className="grid gap-3">
                    <SectionHead title={sectionTitle(s)} n={s.n} />
                    <Paras paras={s.paras} />
                    {s.terms && <Terms label={s.termsLabel} terms={s.terms} />}
                  </section>
                ))}
              </TabsContent>
              <TabsContent value="etf" className="mt-5 grid gap-7">
                {etf.map((s) => (
                  <section key={s.n} className="grid gap-3">
                    <SectionHead title={sectionTitle(s)} n={s.n} />
                    <Paras paras={s.paras} />
                    {s.terms && <Terms label={s.termsLabel} terms={s.terms} />}
                  </section>
                ))}
              </TabsContent>
              <TabsContent value="destaques" className="mt-5 grid gap-7">
                {highlights.map((s) => (
                  <section key={s.n} className="grid gap-3">
                    <SectionHead title="Destaques" n={s.n} />
                    <div className="grid gap-3 sm:grid-cols-2">
                      <HighlightList title="Positivos" tone="positive" items={s.pos ?? []} />
                      <HighlightList title="Oportunidades" tone="opportunity" items={s.opp ?? []} />
                    </div>
                  </section>
                ))}
              </TabsContent>
            </Tabs>
          )}

          <p className="text-[11px] leading-relaxed text-muted-foreground/60">
            Fonte: WIP Comms Planning, {range}. Posição no gráfico: slide 149.
            {logo ? ` Logo: ${logo.source}.` : brand.cat !== "ideal" ? " Logo oficial ainda não incluído." : ""}
          </p>
        </div>
      </ScrollArea>
    </>
  )
}

function Terms({ label, terms }: { label?: string; terms: string[] }) {
  return (
    <div className="grid gap-2">
      <p className="text-[11px] font-normal uppercase tracking-[0.12em] text-muted-foreground">{label ?? "Termos-chave"}</p>
      <div className="flex flex-wrap gap-1.5">{terms.map((t) => <Badge key={t} variant="outline" className="font-normal">{t}</Badge>)}</div>
    </div>
  )
}

function HighlightList({ title, tone, items }: { title: string; tone: "positive" | "opportunity"; items: string[] }) {
  return (
    <div className="grid min-w-0 content-start gap-2">
      <p className={cn("flex items-center gap-1.5 text-[11px] font-normal uppercase tracking-[0.1em]", tone === "positive" ? "text-positive" : "text-opportunity")}>
        <i className={cn("h-1.5 w-1.5 rounded-full", tone === "positive" ? "bg-positive" : "bg-opportunity")} />{title}
      </p>
      <ul className="grid gap-2">
        {items.map((t, i) => <li key={i} className="rounded-lg bg-secondary/50 px-3 py-2.5 text-[12.5px] leading-snug text-foreground/85">{t}</li>)}
      </ul>
    </div>
  )
}
