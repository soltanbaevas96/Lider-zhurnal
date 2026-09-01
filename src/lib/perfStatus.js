// ---------------------------------------------------------------------
// Единая система статусов «здоровья» преподавателя/группы — один
// источник истины для Дашборда и Аналитики (п.36, 50, 52 ТЗ по
// объединению Дашборд/Сводка/Аналитика). Раньше эти пороги были
// продублированы внутри AdminCabinet.jsx («Сводка») — теперь оттуда
// вынесены сюда, чтобы Дашборд и Аналитика красили одни и те же цифры
// одинаково и не расходились в оценке «норма/внимание/проблема».
//
// ВАЖНО: это НЕ то же самое, что персистентный флаг риска ученика
// (student_events / recalc_risk_flags, вкладка «Риски») — тот статус
// официальный, хранится в БД и считается отдельной, не подлежащей
// изменению здесь бизнес-логикой. Здесь — только визуальная оценка
// показателей преподавателя/группы для Дашборда/Аналитики.
// ---------------------------------------------------------------------

export const PERF_THRESHOLDS = {
  teacherPlanNorm: 90, teacherPlanWarn: 75,
  teacherAttNorm: 85, teacherAttWarn: 75,
  groupAttNorm: 85, groupAttWarn: 75,
  studentAttWarn: 75, studentAttCritical: 60,
  fillNorm: 70, fillWarn: 50,
}

export const STATUS_META = {
  ok:        { label: 'Норма',      color: '#0f9d58', bg: '#e2f5ea', dot: '🟢' },
  attention: { label: 'Внимание',   color: '#d97706', bg: '#fef3c7', dot: '🟡' },
  problem:   { label: 'Проблема',   color: '#dc2626', bg: '#fee2e2', dot: '🔴' },
  unknown:   { label: 'Нет данных', color: '#9aa0c0', bg: '#f0f1f7', dot: '⚪' },
}

export function teacherStatus(planPct, attPct) {
  if (planPct == null && attPct == null) return 'unknown'
  const p = planPct ?? 100, a = attPct ?? 100
  if (p < PERF_THRESHOLDS.teacherPlanWarn || a < PERF_THRESHOLDS.teacherAttWarn) return 'problem'
  if (p < PERF_THRESHOLDS.teacherPlanNorm || a < PERF_THRESHOLDS.teacherAttNorm) return 'attention'
  return 'ok'
}

export function groupStatus(attPct) {
  if (attPct == null) return 'unknown'
  if (attPct < PERF_THRESHOLDS.groupAttWarn) return 'problem'
  if (attPct < PERF_THRESHOLDS.groupAttNorm) return 'attention'
  return 'ok'
}

export function studentAttStatus(pct) {
  if (pct == null) return 'unknown'
  if (pct < PERF_THRESHOLDS.studentAttCritical) return 'problem'
  if (pct < PERF_THRESHOLDS.studentAttWarn) return 'attention'
  return 'ok'
}

export function fillStatus(fillPct) {
  if (fillPct == null) return 'unknown'
  if (fillPct < PERF_THRESHOLDS.fillWarn) return 'problem'
  if (fillPct < PERF_THRESHOLDS.fillNorm) return 'attention'
  return 'ok'
}

// Цвет для процентных значений вне таблиц-статусов (мини-индикаторы,
// прогресс-бары) — та же шкала, что и groupStatus/teacherStatus, просто
// сразу отдаёт готовый hex-цвет.
export function pctColor(pct) {
  const s = groupStatus(pct)
  return STATUS_META[s].color
}

export function statusRank(s) { return { problem: 0, attention: 1, unknown: 2, ok: 3 }[s] ?? 2 }
