// ─────────────────────────────────────────────────────────────────────────────
// gender.ts — concordancia gramatical de los textos dirigidos al usuario.
//
// El español marca el género en los adjetivos, así que cualquier texto que
// califique al trader ("Ansioso", "Bienvenido") tiene que concordar con lo que
// declaró al registrarse. Centralizamos aquí esas variantes para que las
// páginas no repitan diccionarios: antes los estados emocionales estaban
// duplicados en @/types y en historial, y ni siquiera coincidían entre sí
// ("Neutro" frente a "Neutral").
//
// OTHER y UNDISCLOSED comparten redacción. En vez de inventar terminaciones o
// usar barras, esos casos emplean sustantivos: "Ansiedad" en lugar de
// "Ansioso/a". Es gramaticalmente correcto, no marca género y ocupa lo mismo,
// que importa porque estas etiquetas van en badges y ejes de gráficos.
// ─────────────────────────────────────────────────────────────────────────────

import type { EmotionalState } from '@/types'

export type Gender = 'MALE' | 'FEMALE' | 'OTHER' | 'UNDISCLOSED'

// Opciones del formulario de registro, en el orden en que se muestran.
export const GENDER_OPTIONS: { value: Gender; label: string }[] = [
  { value: 'MALE',        label: 'Hombre' },
  { value: 'FEMALE',      label: 'Mujer' },
  { value: 'OTHER',       label: 'Otro' },
  { value: 'UNDISCLOSED', label: 'Prefiero no definirlo' },
]

const VALID_GENDERS = new Set<string>(GENDER_OPTIONS.map((o) => o.value))

// Valida un valor recibido del cliente o leído de la BD. Cualquier cosa
// inesperada cae en UNDISCLOSED, que es la variante sin marca de género y por
// tanto la única segura como respaldo.
export function parseGender(value: unknown): Gender {
  return typeof value === 'string' && VALID_GENDERS.has(value)
    ? (value as Gender)
    : 'UNDISCLOSED'
}

// Una forma por género. `neutral` cubre OTHER y UNDISCLOSED.
type GenderedText = {
  masculine: string
  feminine: string
  neutral: string
}

function resolve(forms: GenderedText, gender: Gender): string {
  if (gender === 'MALE') return forms.masculine
  if (gender === 'FEMALE') return forms.feminine
  return forms.neutral
}

// ── Estados emocionales ──────────────────────────────────────────────────────
// Fuente única de las etiquetas. Sustituye a EMOTIONAL_STATE_LABELS.

const EMOTIONAL_STATE_FORMS: Record<EmotionalState, GenderedText> = {
  NEUTRAL:    { masculine: 'Neutro',    feminine: 'Neutra',    neutral: 'Neutral' },
  ANXIOUS:    { masculine: 'Ansioso',   feminine: 'Ansiosa',   neutral: 'Ansiedad' },
  CONFIDENT:  { masculine: 'Confiado',  feminine: 'Confiada',  neutral: 'Confianza' },
  FRUSTRATED: { masculine: 'Frustrado', feminine: 'Frustrada', neutral: 'Frustración' },
  TIRED:      { masculine: 'Cansado',   feminine: 'Cansada',   neutral: 'Cansancio' },
}

export function emotionalStateLabel(state: EmotionalState, gender: Gender): string {
  return resolve(EMOTIONAL_STATE_FORMS[state], gender)
}

// Los cinco estados con su etiqueta ya concordada, en el orden del selector.
// Lo usan la pantalla de nueva sesión y el desglose del historial.
export function emotionalStateOptions(
  gender: Gender,
): { value: EmotionalState; label: string }[] {
  return (Object.keys(EMOTIONAL_STATE_FORMS) as EmotionalState[]).map((value) => ({
    value,
    label: emotionalStateLabel(value, gender),
  }))
}

// Locución para describir cómo se sentía el trader, pensada para encajar tras
// un verbo: "Comenzaste ___".
//
// No basta con insertar la etiqueta: con adjetivo la frase natural es
// "sintiéndote ansioso", pero con el sustantivo neutro eso daría "sintiéndote
// ansiedad", que no es español. La variante neutra cambia la preposición y
// resuelve "Comenzaste con ansiedad".
export function emotionalStateAsFeeling(state: EmotionalState, gender: Gender): string {
  const forms = EMOTIONAL_STATE_FORMS[state]
  if (gender === 'MALE') return `sintiéndote ${forms.masculine.toLowerCase()}`
  if (gender === 'FEMALE') return `sintiéndote ${forms.feminine.toLowerCase()}`
  // NEUTRAL es el único estado cuya forma neutra sigue siendo adjetivo.
  if (state === 'NEUTRAL') return 'con un estado neutral'
  return `con ${forms.neutral.toLowerCase()}`
}

// ── Bienvenida ───────────────────────────────────────────────────────────────
// En neutro se reformula el saludo entero: no existe forma sin marca de
// "bienvenido", así que se sustituye por una construcción con sustantivo.

const WELCOME_FORMS: GenderedText = {
  masculine: 'Bienvenido a',
  feminine:  'Bienvenida a',
  neutral:   'Te damos la bienvenida a',
}

export function welcomeLabel(gender: Gender): string {
  return resolve(WELCOME_FORMS, gender)
}
