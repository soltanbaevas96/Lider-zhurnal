import React from 'react'
import { Users, Clock, Paperclip, UserCheck, Pencil } from 'lucide-react'
import { C, lessonCount, fmtDate, nameOf } from '../lib/utils'
import { planUrl } from '../lib/api'

export default function LessonTable({ lessons, dict, showTeacher, onEdit }) {
  if (!lessons.length)
    return (
      <div style={{ background: C.card, border: `1px dashed ${C.line}`, borderRadius: 14, padding: 44, textAlign: 'center', color: C.slate, fontSize: 14 }}>
        За выбранный период уроков нет.
      </div>
    )

  const sorted = [...lessons].sort((a, b) =>
    b.lesson_date.localeCompare(a.lesson_date))

  const openPlan = async (path) => {
    const url = await planUrl(path)
    if (url) window.open(url, '_blank')
  }

  return (
    <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 14, overflow: 'hidden' }}>
      {sorted.map((l, i) => {
        const h = lessonCount(l)
        const cancelled = l.status === 'отменён'
        return (
          <div key={l.id} onClick={onEdit ? () => onEdit(l) : undefined}
            className="lrow rowflex" style={{ gap: 14, padding: '13px 16px', borderTop: i ? `1px solid ${C.line}` : 'none', opacity: cancelled ? 0.55 : 1, cursor: onEdit ? 'pointer' : 'default' }}>
            <div style={{ textAlign: 'center', minWidth: 44 }}>
              <div style={{ fontSize: 13, fontWeight: 800 }}>{fmtDate(l.lesson_date)}</div>
              <div style={{ fontSize: 11, color: C.slate }}>{h} ур.</div>
            </div>
            <div style={{ width: 1, alignSelf: 'stretch', background: C.line }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 14, textDecoration: cancelled ? 'line-through' : 'none', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.topic}</div>
              <div className="rowflex" style={{ fontSize: 12, color: C.slate, gap: 10, flexWrap: 'wrap', marginTop: 3 }}>
                {showTeacher && <span>{nameOf(dict.teachers, l.teacher_id)}</span>}
                <span className="rowflex" style={{ gap: 3 }}><Users size={12} /> {nameOf(dict.groups, l.group_id)} · {l.students}</span>
                <span className="rowflex" style={{ gap: 3 }}><Clock size={12} /> {h} {h === 1 ? 'урок' : 'урока'}</span>
                {l.assistant_id && <span className="rowflex" style={{ gap: 3, color: C.teal }}><UserCheck size={12} /> {nameOf(dict.assistants, l.assistant_id)}</span>}
              </div>
            </div>
            {cancelled
              ? <span style={{ fontSize: 11.5, color: C.slate, background: C.grey, padding: '4px 10px', borderRadius: 20, fontWeight: 600 }}>отменён</span>
              : l.plan_path
                ? <button onClick={(e) => { e.stopPropagation(); openPlan(l.plan_path) }} className="rowflex" style={{ gap: 4, fontSize: 11.5, color: C.ok, background: C.okSoft, padding: '4px 10px', borderRadius: 20, fontWeight: 600, cursor: 'pointer', border: 'none' }}><Paperclip size={11} /> план</button>
                : <span style={{ fontSize: 11.5, color: C.warn, background: C.warnSoft, padding: '4px 10px', borderRadius: 20, fontWeight: 600 }}>нет плана</span>}
            {onEdit && <Pencil size={15} color={C.faint} style={{ flexShrink: 0 }} />}
          </div>
        )
      })}
    </div>
  )
}
