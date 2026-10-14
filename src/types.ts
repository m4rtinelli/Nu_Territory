export type Category = "bank" | "manager" | "nu" | "ideal"

export type Slide = {
  n: number
  type: "intro" | "text" | "destaques"
  title: string
  lead?: string
  paras?: string[]
  para?: string
  terms?: string[]
  termsLabel?: string
  pos?: string[]
  opp?: string[]
}

export type Brand = {
  id: string
  name: string
  full?: string
  tag?: string
  x: number
  y: number
  origin: "br" | "global"
  cat: Category
  /** asset manager that belongs to a bank group (e.g. Itaú Asset) */
  bankArm?: boolean
  range?: [number, number]
  slides?: Slide[]
}

export const CAT_LABEL: Record<Category, string> = {
  bank: "Banco",
  manager: "Gestora / plataforma",
  nu: "Ecossistema Nu",
  ideal: "Posição-alvo",
}

export const quadrant = (b: Pick<Brand, "x" | "y">) =>
  `${b.y >= 0 ? "Sofisticação" : "Acesso"} · ${b.x >= 0 ? "Simples" : "Complexo"}`
