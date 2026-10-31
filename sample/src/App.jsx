import { useState, useEffect, useRef } from 'react'
import './App.css'

const FUNCS = ['sin⁻¹', 'cos⁻¹', 'tan⁻¹', 'sin', 'cos', 'tan', 'ln', 'log', '√']
const BIN_OPS = ['+', '−', '×', '÷', '^']
const LEX = /(\d+\.?\d*|\.\d+|sin⁻¹|cos⁻¹|tan⁻¹|sin|cos|tan|ln|log|√|Ans|π|e|[+−×÷^!%²()])/y

// Does this token end a value (so an operator or ")" can follow it)?
const VALUE_END = (t) => t !== undefined && (t === 'Ans' || /[\d.)πe!%²]$/.test(t))

function lex(src) {
  const out = []
  LEX.lastIndex = 0
  while (LEX.lastIndex < src.length) {
    const m = LEX.exec(src)
    if (!m) throw new Error('Syntax error')
    out.push(m[1])
  }
  return out
}

// Recursive-descent parser: no eval(). Supports precedence, parentheses
// (auto-closed at the end), implicit multiplication like 2π or 3(4+1).
function evaluate(src, { deg, ans }) {
  const toks = lex(src)
  let i = 0
  const peek = () => toks[i]
  const next = () => toks[i++]
  const startsValue = (t) =>
    t !== undefined && (/^[\d.]/.test(t) || t === '(' || FUNCS.includes(t) || ['π', 'e', 'Ans'].includes(t))
  const toRad = (x) => (deg ? (x * Math.PI) / 180 : x)
  const fromRad = (x) => (deg ? (x * 180) / Math.PI : x)
  const tidy = (x) => (Math.abs(x) < 1e-12 ? 0 : x)
  const domain = () => { throw new Error('Domain error') }

  function apply(fn, x) {
    switch (fn) {
      case 'sin': return tidy(Math.sin(toRad(x)))
      case 'cos': return tidy(Math.cos(toRad(x)))
      case 'tan':
        if (Math.abs(Math.cos(toRad(x))) < 1e-12) throw new Error('Undefined')
        return tidy(Math.tan(toRad(x)))
      case 'sin⁻¹': if (Math.abs(x) > 1) domain(); return fromRad(Math.asin(x))
      case 'cos⁻¹': if (Math.abs(x) > 1) domain(); return fromRad(Math.acos(x))
      case 'tan⁻¹': return fromRad(Math.atan(x))
      case 'ln': if (x <= 0) domain(); return Math.log(x)
      case 'log': if (x <= 0) domain(); return Math.log10(x)
      case '√': if (x < 0) domain(); return Math.sqrt(x)
      default: throw new Error('Syntax error')
    }
  }

  function factorial(x) {
    if (x < 0 || !Number.isInteger(x)) domain()
    if (x > 170) throw new Error('Number too large')
    let r = 1
    for (let k = 2; k <= x; k++) r *= k
    return r
  }

  function closeParen() {
    if (peek() === ')') next()
    else if (peek() !== undefined) throw new Error('Syntax error')
  }

  function primary() {
    const t = next()
    if (t === undefined) throw new Error('Incomplete')
    if (/^[\d.]/.test(t)) return parseFloat(t)
    if (t === 'π') return Math.PI
    if (t === 'e') return Math.E
    if (t === 'Ans') return ans
    if (t === '(') { const v = expr(); closeParen(); return v }
    if (FUNCS.includes(t)) {
      if (next() !== '(') throw new Error('Syntax error')
      const v = expr()
      closeParen()
      return apply(t, v)
    }
    throw new Error('Syntax error')
  }

  function postfix() {
    let v = primary()
    for (;;) {
      const t = peek()
      if (t === '!') { next(); v = factorial(v) }
      else if (t === '%') { next(); v /= 100 }
      else if (t === '²') { next(); v *= v }
      else return v
    }
  }

  function power() {
    const base = postfix()
    if (peek() === '^') { next(); return Math.pow(base, unary()) } // right-associative
    return base
  }

  function unary() {
    if (peek() === '−') { next(); return -unary() }
    if (peek() === '+') { next(); return unary() }
    return power()
  }

  function term() {
    let v = unary()
    for (;;) {
      const t = peek()
      if (t === '×') { next(); v *= unary() }
      else if (t === '÷') {
        next()
        const d = unary()
        if (d === 0) throw new Error("Can't divide by zero")
        v /= d
      } else if (startsValue(t)) v *= unary() // implicit multiplication
      else return v
    }
  }

  function expr() {
    let v = term()
    while (peek() === '+' || peek() === '−') {
      v = next() === '+' ? v + term() : v - term()
    }
    return v
  }

  const v = expr()
  if (i < toks.length) throw new Error('Syntax error')
  if (Number.isNaN(v)) throw new Error('Domain error')
  if (!Number.isFinite(v)) throw new Error('Number too large')
  return parseFloat(v.toPrecision(12))
}

const fmt = (v) => {
  if (Object.is(v, -0)) v = 0
  return Math.abs(v) >= 1e15 || (v !== 0 && Math.abs(v) < 1e-9)
    ? v.toExponential(8).replace(/\.?0+e/, 'e')
    : v.toLocaleString(undefined, { maximumFractionDigits: 10 })
}

const displayText = (tokens) =>
  tokens
    .map((x, i) => (['+', '−', '×', '÷'].includes(x) && VALUE_END(tokens[i - 1]) ? ` ${x} ` : x))
    .join('')

const openParens = (src) => (src.match(/\(/g) || []).length - (src.match(/\)/g) || []).length

const PAD = [
  { l: 'AC', v: 'AC', c: 'fn' }, { l: '⌫', v: '⌫', c: 'fn' }, { l: '%', v: '%', c: 'fn' }, { l: '÷', v: '÷', c: 'op' },
  { l: '7', v: '7' }, { l: '8', v: '8' }, { l: '9', v: '9' }, { l: '×', v: '×', c: 'op' },
  { l: '4', v: '4' }, { l: '5', v: '5' }, { l: '6', v: '6' }, { l: '−', v: '−', c: 'op' },
  { l: '1', v: '1' }, { l: '2', v: '2' }, { l: '3', v: '3' }, { l: '+', v: '+', c: 'op' },
  { l: 'Ans', v: 'Ans', c: 'fn' }, { l: '0', v: '0' }, { l: '.', v: '.' }, { l: '=', v: '=', c: 'eq' },
]

const INV_FUNCS = ['sin⁻¹(', 'cos⁻¹(', 'tan⁻¹(', 'e^(', '10^(']

function App() {
  const [tokens, setTokens] = useState([])
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')
  const [deg, setDeg] = useState(true)
  const [inv, setInv] = useState(false)
  const [ans, setAns] = useState(0)
  const [history, setHistory] = useState([])

  const src = tokens.join('')
  const ghost = ')'.repeat(Math.max(0, openParens(src)))

  function press(k) {
    setError('')
    if (k === 'AC') { setTokens([]); setDone(false); return }
    if (k === 'DEG') { setDeg((d) => !d); return }
    if (k === 'INV') { setInv((v) => !v); return }
    if (k === '⌫') { setTokens(done ? [] : tokens.slice(0, -1)); setDone(false); return }

    if (k === '=') {
      if (!tokens.length || done) return
      try {
        const value = evaluate(src, { deg, ans })
        setHistory((h) => [{ id: Date.now(), expr: displayText(tokens) + ghost, value }, ...h].slice(0, 50))
        setAns(value)
        setDone(true)
      } catch (e) {
        setError(e.message === 'Incomplete' ? 'Incomplete expression' : e.message)
      }
      return
    }

    // After "=", operators continue from Ans; anything else starts fresh
    const continues = ['+', '−', '×', '÷', '^', '²', '!', '%'].includes(k)
    let t = done ? (continues ? ['Ans'] : []) : [...tokens]
    const last = t[t.length - 1]

    if (/^\d$/.test(k)) {
      t.push(k)
    } else if (k === '.') {
      let j = t.length - 1
      let num = ''
      while (j >= 0 && /^[\d.]+$/.test(t[j])) { num = t[j] + num; j-- }
      if (num.includes('.')) return
      t.push(num ? '.' : '0.')
    } else if (k === '−') {
      if (last === '+' || last === '−') t[t.length - 1] = '−'
      else t.push('−')
    } else if (['+', '×', '÷', '^'].includes(k)) {
      if (!t.length) t = ['Ans', k]
      else if (BIN_OPS.includes(last)) {
        if (!VALUE_END(t[t.length - 2])) return
        t[t.length - 1] = k
      } else if (last.endsWith('(')) return
      else t.push(k)
    } else if (['²', '!', '%'].includes(k)) {
      if (!VALUE_END(last)) return
      t.push(k)
    } else if (k === ')') {
      if (openParens(t.join('')) <= 0 || !VALUE_END(last)) return
      t.push(k)
    } else {
      t.push(k) // (, π, e, Ans, sin(, √(, e^( ...
    }

    if (INV_FUNCS.includes(k)) setInv(false)
    setTokens(t)
    setDone(false)
  }

  function insertValue(v) {
    let chunk
    if (/e/.test(String(v))) { setAns(v); chunk = ['Ans'] }
    else chunk = v < 0 ? ['−', String(-v)] : [String(v)]
    const append = !done && tokens.length > 0 && !VALUE_END(tokens[tokens.length - 1])
    setTokens(append ? [...tokens, ...chunk] : chunk)
    setDone(false)
    setError('')
  }

  // Keyboard support
  const pressRef = useRef(press)
  pressRef.current = press
  useEffect(() => {
    const map = {
      '+': '+', '-': '−', '*': '×', '/': '÷', '^': '^', '(': '(', ')': ')',
      '!': '!', '%': '%', '.': '.', Enter: '=', '=': '=',
      Backspace: '⌫', Escape: 'AC', Delete: 'AC',
    }
    const onKey = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return
      const k = /^\d$/.test(e.key) ? e.key : map[e.key]
      if (!k) return
      e.preventDefault()
      pressRef.current(k)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Live preview while typing
  let preview = null
  if (!done && tokens.length) {
    try {
      const v = evaluate(src, { deg, ans })
      if (lex(src).length > 1) preview = v
    } catch { /* incomplete expression, no preview */ }
  }

  const sciKeys = [
    { l: deg ? 'Deg' : 'Rad', v: 'DEG', c: 'toggle' },
    { l: 'Inv', v: 'INV', c: inv ? 'toggle on' : 'toggle' },
    { l: '(', v: '(' }, { l: ')', v: ')' }, { l: 'x!', v: '!' },
    ...(inv
      ? [
          { l: 'sin⁻¹', v: 'sin⁻¹(' }, { l: 'cos⁻¹', v: 'cos⁻¹(' }, { l: 'tan⁻¹', v: 'tan⁻¹(' },
          { l: 'eˣ', v: 'e^(' }, { l: '10ˣ', v: '10^(' },
        ]
      : [
          { l: 'sin', v: 'sin(' }, { l: 'cos', v: 'cos(' }, { l: 'tan', v: 'tan(' },
          { l: 'ln', v: 'ln(' }, { l: 'log', v: 'log(' },
        ]),
    { l: '√', v: '√(' }, { l: 'x²', v: '²' }, { l: 'xʸ', v: '^' }, { l: 'π', v: 'π' }, { l: 'e', v: 'e' },
  ]

  return (
    <>
      <div className="wrap">
        <section className="calc">
          <div className="screen">
            <div className="status">
              <span>{deg ? 'DEG' : 'RAD'}</span>
              {inv && <span>INV</span>}
            </div>
            <div className={`expr ${done ? 'small' : ''}`}>
              {displayText(tokens) || '0'}
              {ghost && <span className="ghost">{ghost}</span>}
              {done && ' ='}
            </div>
            <div className={`result ${error ? 'err' : done ? '' : 'preview'}`}>
              {error || (done ? fmt(ans) : preview !== null ? `= ${fmt(preview)}` : '\u00a0')}
            </div>
          </div>

          <div className="sci">
            {sciKeys.map((k, i) => (
              <button key={k.v + i} className={`key sm ${k.c || ''}`} onClick={() => press(k.v)}>
                {k.l}
              </button>
            ))}
          </div>

          <div className="keys">
            {PAD.map((k) => (
              <button key={k.v} className={`key ${k.c || ''}`} onClick={() => press(k.v)}>
                {k.l}
              </button>
            ))}
          </div>
        </section>

        <aside className="tape">
          <div className="tape-head">
            <h2>History</h2>
            <button className="linkbtn" disabled={!history.length} onClick={() => setHistory([])}>
              Clear
            </button>
          </div>
          {history.length ? (
            <ul>
              {history.map((e) => (
                <li key={e.id}>
                  <button onClick={() => insertValue(e.value)} title="Use this result">
                    <span className="e-expr">{e.expr}</span>
                    <span className="e-res">= {fmt(e.value)}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="empty">Press = and calculations appear here.</p>
          )}
        </aside>
      </div>
    </>
  )
}

export default App