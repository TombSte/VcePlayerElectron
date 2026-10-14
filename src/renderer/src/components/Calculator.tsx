import { useState } from 'react'

export default function Calculator({ onClose }: { onClose: () => void }): JSX.Element {
  const [display, setDisplay] = useState('0')
  const [pending, setPending] = useState<{ value: number; op: string } | null>(null)
  const [fresh, setFresh] = useState(true)

  const inputDigit = (digit: string): void => {
    setDisplay((current) => {
      if (fresh) {
        setFresh(false)
        return digit
      }
      return current === '0' ? digit : current + digit
    })
  }

  const apply = (a: number, b: number, op: string): number => {
    switch (op) {
      case '+':
        return a + b
      case '-':
        return a - b
      case '*':
        return a * b
      case '/':
        return b === 0 ? NaN : a / b
      default:
        return b
    }
  }

  const chooseOp = (op: string): void => {
    const value = Number(display)
    if (pending) {
      const result = apply(pending.value, value, pending.op)
      setDisplay(String(result))
      setPending({ value: result, op })
    } else {
      setPending({ value, op })
    }
    setFresh(true)
  }

  const equals = (): void => {
    if (!pending) return
    const result = apply(pending.value, Number(display), pending.op)
    setDisplay(String(result))
    setPending(null)
    setFresh(true)
  }

  const clear = (): void => {
    setDisplay('0')
    setPending(null)
    setFresh(true)
  }

  const keys = ['7', '8', '9', '/', '4', '5', '6', '*', '1', '2', '3', '-', '0', '.', '=', '+']

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal small calculator" onClick={(e) => e.stopPropagation()}>
        <header>Calculator</header>
        <div className="body">
          <div className="display">{display}</div>
          <div className="keys">
            <button className="btn" onClick={clear}>
              C
            </button>
            {keys.map((key) => (
              <button
                className="btn"
                key={key}
                onClick={() => {
                  if (['+', '-', '*', '/'].includes(key)) chooseOp(key)
                  else if (key === '=') equals()
                  else if (key === '.') inputDigit('.')
                  else inputDigit(key)
                }}
              >
                {key}
              </button>
            ))}
          </div>
        </div>
        <footer>
          <button className="btn" onClick={onClose}>
            Close
          </button>
        </footer>
      </div>
    </div>
  )
}
