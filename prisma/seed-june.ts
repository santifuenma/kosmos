// ─────────────────────────────────────────────────────────────────────────────
// seed-june.ts — datos de demostración para junio 2026 (días 1–9).
//
// Genera intenciones + sesiones cerradas + trades + violaciones para el
// usuario sanfuenmayor@gmail.com, coherentes con la fórmula real del ICO
// usada en /api/session/close:
//
//   Rs  = Ts × C_activas + Ts × R_trade + R_session   (= Ts×10 + 4 aquí)
//   ICO = 1 − Vs / Rs   (redondeado a 4 decimales)
//
// Ejecutar:  npx tsx prisma/seed-june.ts
// ─────────────────────────────────────────────────────────────────────────────

import { prisma } from '../src/lib/prisma'

// Cada violación se refiere a un code del catálogo; el prefijo distingue
// regla conductual (rule:) de condición de entrada (cond:).
type Violation = `rule:${string}` | `cond:${string}`

type TradeSpec = {
  time: string // "HH:mm" UTC dentro del horario 09:00–11:30
  direction: 'LONG' | 'SHORT'
  result: 'WIN' | 'LOSS' | 'BREAKEVEN'
  asset: string
  pnl: number
  violations?: Violation[]
  notes?: string
}

type DaySpec = {
  day: number // día de junio 2026
  emotionalState: 'NEUTRAL' | 'ANXIOUS' | 'CONFIDENT' | 'FRUSTRATED' | 'TIRED'
  notes?: string
  trades: TradeSpec[]
  sessionViolations?: string[] // codes de reglas PER_SESSION
}

const DAYS: DaySpec[] = [
  {
    day: 1,
    emotionalState: 'NEUTRAL',
    notes: 'Apertura de mes. Plan: solo zonas de demanda claras en QQQ y SPY.',
    trades: [
      { time: '09:24', direction: 'LONG', result: 'WIN', asset: 'QQQ', pnl: 120 },
      {
        time: '10:11', direction: 'LONG', result: 'LOSS', asset: 'SPY', pnl: -80,
        violations: ['cond:VOLUME_CONFIRM'],
        notes: 'Entré sin confirmación de volumen, la zona era buena pero precipitado.',
      },
      { time: '11:02', direction: 'SHORT', result: 'WIN', asset: 'TSLA', pnl: 95 },
    ],
    // Vs=1, Ts=3, Rs=34 → ICO 0.9706
  },
  {
    day: 2,
    emotionalState: 'CONFIDENT',
    notes: 'Buen día ayer. Mismas zonas, sin cambios en el plan.',
    trades: [
      { time: '09:41', direction: 'LONG', result: 'WIN', asset: 'NVDA', pnl: 150 },
      { time: '10:34', direction: 'SHORT', result: 'BREAKEVEN', asset: 'QQQ', pnl: 0 },
    ],
    // Vs=0, Ts=2, Rs=24 → ICO 1.0
  },
  {
    day: 3,
    emotionalState: 'NEUTRAL',
    notes: 'Día de noticias a las 14:30, cierro antes del mediodía como siempre.',
    trades: [
      { time: '09:18', direction: 'LONG', result: 'WIN', asset: 'SPY', pnl: 110 },
      { time: '09:57', direction: 'LONG', result: 'LOSS', asset: 'AMD', pnl: -70 },
      {
        time: '10:26', direction: 'SHORT', result: 'WIN', asset: 'QQQ', pnl: 60,
        violations: ['rule:NO_EARLY_EXIT'],
        notes: 'Cerré a mitad de objetivo por nervios. El precio llegó al target.',
      },
      {
        time: '11:10', direction: 'LONG', result: 'LOSS', asset: 'TSLA', pnl: -90,
        violations: ['cond:SR_LEVEL'],
      },
    ],
    // Vs=2, Ts=4, Rs=44 → ICO 0.9545
  },
  {
    day: 4,
    emotionalState: 'ANXIOUS',
    notes: 'Mal descanso. Dudas con la dirección del mercado, gap bajista en futuros.',
    trades: [
      {
        time: '09:12', direction: 'LONG', result: 'LOSS', asset: 'QQQ', pnl: -140,
        violations: ['rule:NO_IMPULSE_ENTRY', 'cond:TREND_CONFIRM', 'cond:VOLUME_CONFIRM'],
        notes: 'Entrada impulsiva nada más abrir, contra tendencia y sin volumen.',
      },
      {
        time: '09:31', direction: 'LONG', result: 'LOSS', asset: 'QQQ', pnl: -180,
        violations: [
          'rule:NO_IMPULSE_ENTRY',
          'rule:CONDITIONS_MET',
          'cond:PATTERN_FORMED',
          'cond:RR_ACCEPTABLE',
        ],
        notes: 'Quise recuperar lo del primer trade inmediatamente. Sin setup.',
      },
    ],
    sessionViolations: ['NO_REVENGE_TRADE', 'STRATEGY_FOLLOWED'],
    // Vs=7+2=9, Ts=2, Rs=24 → ICO 0.625
  },
  {
    day: 5,
    emotionalState: 'TIRED',
    notes: 'Después del desastre de ayer: máximo 1-2 trades, solo setup perfecto.',
    trades: [
      {
        time: '10:05', direction: 'SHORT', result: 'WIN', asset: 'SPY', pnl: 40,
        violations: ['rule:NO_EARLY_EXIT'],
        notes: 'Setup válido pero cerré antes de tiempo. Día de recuperar confianza.',
      },
    ],
    // Vs=1, Ts=1, Rs=14 → ICO 0.9286
  },
  {
    day: 8,
    emotionalState: 'NEUTRAL',
    notes: 'Semana nueva. El viernes fue mejor, vuelvo al plan normal.',
    trades: [
      { time: '09:22', direction: 'LONG', result: 'WIN', asset: 'AAPL', pnl: 85 },
      {
        time: '10:08', direction: 'LONG', result: 'WIN', asset: 'NVDA', pnl: 130,
        violations: ['cond:INDICATOR_SIGNAL'],
        notes: 'El RSI no acompañaba pero la zona era muy fuerte. Salió bien igualmente.',
      },
      { time: '11:15', direction: 'SHORT', result: 'LOSS', asset: 'QQQ', pnl: -60 },
    ],
    // Vs=2, Ts=3, Rs=34 → ICO 0.9412
  },
  {
    day: 9,
    emotionalState: 'NEUTRAL',
    notes: 'Mercado lateral, esperaré rupturas claras.',
    trades: [
      {
        time: '09:35', direction: 'SHORT', result: 'LOSS', asset: 'TSLA', pnl: -95,
        violations: ['rule:NO_SL_MODIFY', 'cond:RR_ACCEPTABLE'],
        notes: 'Moví el stop dos veces. El ratio ya no tenía sentido al entrar.',
      },
      { time: '10:19', direction: 'LONG', result: 'WIN', asset: 'SPY', pnl: 75 },
      {
        time: '11:08', direction: 'LONG', result: 'LOSS', asset: 'AMD', pnl: -110,
        violations: [
          'rule:NO_IMPULSE_ENTRY',
          'rule:CONDITIONS_MET',
          'cond:VOLUME_CONFIRM',
          'cond:TREND_CONFIRM',
        ],
        notes: 'Forcé la entrada en lateral. Exactamente lo que dije que no haría.',
      },
    ],
    sessionViolations: ['STRATEGY_FOLLOWED'],
    // Vs=6+1=7, Ts=3, Rs=34 → ICO 0.7941
  },
]

// ── Helpers ──────────────────────────────────────────────────────────────────

function utc(day: number, time = '00:00'): Date {
  const [h, m] = time.split(':').map(Number)
  return new Date(Date.UTC(2026, 5, day, h, m)) // mes 5 = junio
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000
}

async function main() {
  const user = await prisma.user.findUnique({
    where: { email: 'sanfuenmayor@gmail.com' },
  })
  if (!user) throw new Error('Usuario no encontrado')

  const strategy = await prisma.strategy.findUnique({
    where: { userId: user.id },
    include: {
      conditions: { where: { isActive: true }, include: { condition: true } },
      rules: { where: { isActive: true }, include: { rule: true } },
    },
  })
  if (!strategy) throw new Error('Estrategia no encontrada')

  // Mapas code → id del catálogo para resolver las violaciones declaradas arriba
  const condByCode = new Map(strategy.conditions.map((c) => [c.condition.code, c.conditionId]))
  const ruleByCode = new Map(strategy.rules.map((r) => [r.rule.code, r.ruleId]))

  // Denominador del ICO según la estrategia activa (debe dar 6, 4 y 4)
  const C = strategy.conditions.length
  const Rt = strategy.rules.filter((r) => r.rule.scope === 'PER_TRADE').length
  const Rsess = strategy.rules.filter((r) => r.rule.scope === 'PER_SESSION').length
  console.log(`Estrategia: C_activas=${C} R_trade=${Rt} R_session=${Rsess}`)

  for (const spec of DAYS) {
    const date = utc(spec.day)

    // Idempotencia: si ya existe intención ese día, saltamos
    const existing = await prisma.dailyIntention.findUnique({
      where: { userId_date: { userId: user.id, date } },
    })
    if (existing) {
      console.log(`· ${date.toISOString().slice(0, 10)} ya tiene datos — saltado`)
      continue
    }

    const Ts = spec.trades.length
    const Rs = Ts * C + Ts * Rt + Rsess
    const Vs =
      spec.trades.reduce((s, t) => s + (t.violations?.length ?? 0), 0) +
      (spec.sessionViolations?.length ?? 0)
    const ico = round4(Rs === 0 ? 1 : Math.max(0, Math.min(1, 1 - Vs / Rs)))

    await prisma.$transaction(async (tx) => {
      const intention = await tx.dailyIntention.create({
        data: {
          userId: user.id,
          strategyId: strategy.id,
          date,
          maxTrades: strategy.maxTrades,
          tradingHoursStart: strategy.tradingHoursStart,
          tradingHoursEnd: strategy.tradingHoursEnd,
          emotionalState: spec.emotionalState,
          notes: spec.notes ?? null,
          confirmedAt: utc(spec.day, '08:47'),
          createdAt: utc(spec.day, '08:45'),
        },
      })

      const lastTradeTime = spec.trades[spec.trades.length - 1]?.time ?? '11:00'
      const session = await tx.session.create({
        data: {
          userId: user.id,
          intentionId: intention.id,
          date,
          status: 'CLOSED',
          icoScore: ico,
          createdAt: utc(spec.day, '08:58'),
          // Cierre poco después del último trade, dentro de un margen natural
          closedAt: new Date(utc(spec.day, lastTradeTime).getTime() + 28 * 60_000),
        },
      })

      for (const t of spec.trades) {
        const trade = await tx.trade.create({
          data: {
            sessionId: session.id,
            timestamp: utc(spec.day, t.time),
            createdAt: utc(spec.day, t.time),
            direction: t.direction,
            result: t.result,
            asset: t.asset,
            pnlAmount: t.pnl,
            notes: t.notes ?? null,
          },
        })

        for (const v of t.violations ?? []) {
          const [kind, code] = v.split(':') as ['rule' | 'cond', string]
          if (kind === 'rule') {
            const ruleId = ruleByCode.get(code)
            if (!ruleId) throw new Error(`Regla desconocida: ${code}`)
            await tx.tradeViolation.create({
              data: {
                tradeId: trade.id,
                ruleId,
                type: 'RULE_VIOLATION',
                createdAt: utc(spec.day, t.time),
              },
            })
          } else {
            const conditionId = condByCode.get(code)
            if (!conditionId) throw new Error(`Condición desconocida: ${code}`)
            await tx.tradeViolation.create({
              data: {
                tradeId: trade.id,
                conditionId,
                type: 'CONDITION_VIOLATION',
                createdAt: utc(spec.day, t.time),
              },
            })
          }
        }
      }

      for (const code of spec.sessionViolations ?? []) {
        const ruleId = ruleByCode.get(code)
        if (!ruleId) throw new Error(`Regla de sesión desconocida: ${code}`)
        await tx.sessionViolation.create({
          data: {
            sessionId: session.id,
            ruleId,
            createdAt: session.closedAt!,
          },
        })
      }
    })

    const pnl = spec.trades.reduce((s, t) => s + t.pnl, 0)
    console.log(
      `✓ ${date.toISOString().slice(0, 10)} — ${Ts} trades · Vs=${Vs}/Rs=${Rs} · ICO=${ico} · PnL=${pnl >= 0 ? '+' : ''}${pnl}`,
    )
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
