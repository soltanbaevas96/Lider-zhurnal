import React, { useState, useMemo } from 'react'
import { ChevronUp, ChevronDown, ChevronLeft, ChevronRight, Search } from 'lucide-react'

// Плотная таблица: колонки, данные, сортировка, пагинация.
// columns: [{ key, label, num?, width?, render?(row), sortable?(default true), sortValue?(row) }]
export default function DataTable({ columns, rows, onRowClick, pageSize = 25, initialSort, rightAlignHead }) {
  const [sort, setSort] = useState(initialSort || { key: null, dir: 'asc' })
  const [page, setPage] = useState(0)

  const sorted = useMemo(() => {
    if (!sort.key) return rows
    const col = columns.find((c) => c.key === sort.key)
    const val = col?.sortValue || ((r) => r[sort.key])
    const arr = [...rows].sort((a, b) => {
      const x = val(a), y = val(b)
      if (typeof x === 'number' && typeof y === 'number') return x - y
      return String(x ?? '').localeCompare(String(y ?? ''), 'ru')
    })
    return sort.dir === 'desc' ? arr.reverse() : arr
  }, [rows, sort, columns])

  const pages = Math.ceil(sorted.length / pageSize)
  const pageRows = sorted.slice(page * pageSize, page * pageSize + pageSize)

  // если страница вышла за пределы после фильтрации — сброс
  if (page > 0 && page >= pages) setPage(0)

  const toggleSort = (key) => {
    setSort((s) => s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' })
  }

  return (
    <div className="dt-wrap">
      <div className="dt-scroll">
        <table className="dt">
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c.key} className={c.sortable !== false ? 'sortable' : ''}
                  style={{ width: c.width, textAlign: c.num ? 'right' : 'left' }}
                  onClick={c.sortable !== false ? () => toggleSort(c.key) : undefined}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, flexDirection: c.num ? 'row-reverse' : 'row' }}>
                    {c.label}
                    {sort.key === c.key && (sort.dir === 'asc' ? <ChevronUp size={13} /> : <ChevronDown size={13} />)}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageRows.map((r, i) => (
              <tr key={r.id ?? i} onClick={onRowClick ? () => onRowClick(r) : undefined}>
                {columns.map((c) => (
                  <td key={c.key} className={c.num ? 'num' : ''} style={{ width: c.width }}>
                    {c.render ? c.render(r) : r[c.key]}
                  </td>
                ))}
              </tr>
            ))}
            {pageRows.length === 0 && (
              <tr><td colSpan={columns.length} style={{ textAlign: 'center', padding: 30, color: '#9aa0c0' }}>Ничего не найдено</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {pages > 1 && (
        <div className="pager">
          <button disabled={page === 0} onClick={() => setPage((p) => p - 1)}><ChevronLeft size={15} /></button>
          {pageWindow(page, pages).map((p, idx) => p === '…'
            ? <span key={idx} style={{ color: '#9aa0c0', padding: '0 4px' }}>…</span>
            : <button key={idx} className={p === page ? 'on' : ''} onClick={() => setPage(p)}>{p + 1}</button>
          )}
          <button disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)}><ChevronRight size={15} /></button>
          <span style={{ marginLeft: 10, fontSize: 12.5, color: '#9aa0c0' }}>{sorted.length} записей</span>
        </div>
      )}
      {pages <= 1 && sorted.length > 0 && (
        <div style={{ padding: '9px 12px', fontSize: 12, color: '#9aa0c0', borderTop: '1px solid #f0f1f7' }}>{sorted.length} записей</div>
      )}
    </div>
  )
}

// окно страниц: 0 1 2 … 9
function pageWindow(cur, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i)
  const out = []
  const push = (x) => out.push(x)
  push(0)
  if (cur > 2) push('…')
  for (let p = Math.max(1, cur - 1); p <= Math.min(total - 2, cur + 1); p++) push(p)
  if (cur < total - 3) push('…')
  push(total - 1)
  return out
}
