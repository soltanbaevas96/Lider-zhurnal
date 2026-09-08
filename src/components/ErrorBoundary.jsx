import React from 'react'
import { AlertTriangle, RotateCw } from 'lucide-react'
import { C } from '../lib/utils'

// Защитная сетка на уровень ниже — НЕ замена исправления первопричины
// ошибки, а страховка на будущее: если где-то в дереве компонентов
// произойдёт необработанное исключение при рендере (например, снова
// забытый импорт), пользователь увидит понятное сообщение вместо
// белого экрана на весь кабинет (п.5,42 ТЗ по кабинету куратора).
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }
  static getDerivedStateFromError(error) {
    return { error }
  }
  componentDidCatch(error, info) {
    // Техническую ошибку — в консоль (п.35 ТЗ: логировать, не прятать молча).
    console.error('ErrorBoundary: необработанная ошибка в интерфейсе', error, info?.componentStack)
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 40, textAlign: 'center', background: '#fde8e8', border: '1px solid #f5b5b5', borderRadius: 14, margin: '20px 0' }}>
          <AlertTriangle size={26} color="#c2360b" style={{ marginBottom: 10 }} />
          <div style={{ fontSize: 15, fontWeight: 700, color: '#c2360b', marginBottom: 6 }}>Не удалось отобразить этот раздел</div>
          <div style={{ fontSize: 13, color: '#9a3412', marginBottom: 16, maxWidth: 440, marginLeft: 'auto', marginRight: 'auto' }}>
            Произошла техническая ошибка. Попробуйте ещё раз — если она повторится, сообщите завучу и опишите, что вы делали.
          </div>
          <button onClick={() => this.setState({ error: null })} className="rowflex"
            style={{ gap: 6, margin: '0 auto', padding: '9px 16px', background: '#c2360b', color: '#fff', borderRadius: 9, fontSize: 13, fontWeight: 700, border: 'none', cursor: 'pointer' }}>
            <RotateCw size={14} /> Попробовать снова
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
