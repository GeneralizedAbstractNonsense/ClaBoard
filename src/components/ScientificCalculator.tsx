import React, { useEffect, useRef, useState } from 'react';
import { Calculator, Minus, X } from 'lucide-react';

interface ScientificCalculatorProps {
  onClose: () => void;
}

const BUTTONS = [
  'sin', 'cos', 'tan', 'asin', 'acos', 'atan',
  'log', 'ln', 'sqrt', '(', ')', '^',
  '7', '8', '9', '/', 'pi', 'e',
  '4', '5', '6', '*', 'Backspace', 'C',
  '1', '2', '3', '-', 'abs', '!',
  '0', '.', '+', 'Ans', '=', '',
];

export const ScientificCalculator: React.FC<ScientificCalculatorProps> = ({ onClose }) => {
  const [expression, setExpression] = useState('');
  const [result, setResult] = useState('');
  const [history, setHistory] = useState<{ expression: string; result: string }[]>([]);
  const [minimized, setMinimized] = useState(false);
  const [angleMode, setAngleMode] = useState<'DEG' | 'RAD'>('DEG');
  const [displayMode, setDisplayMode] = useState<'DEC' | 'FRAC'>('DEC');
  const [position, setPosition] = useState({ x: Math.max(16, window.innerWidth - 360), y: 120 });
  const drag = useRef<{ offsetX: number; offsetY: number } | null>(null);
  const previousResult = useRef('');

  const formatResult = (value: number) => {
    const decimal = Number(value.toPrecision(12)).toString();
    if (displayMode === 'DEC' || !Number.isFinite(value)) return decimal;
    const sign = value < 0 ? -1 : 1;
    const target = Math.abs(value);
    let bestNumerator = Math.round(target);
    let bestDenominator = 1;
    let bestError = Math.abs(target - bestNumerator);
    for (let denominator = 1; denominator <= 10000; denominator++) {
      const numerator = Math.round(target * denominator);
      const error = Math.abs(target - numerator / denominator);
      if (error < bestError) {
        bestNumerator = numerator;
        bestDenominator = denominator;
        bestError = error;
      }
      if (error < 1e-12) break;
    }
    if (bestError > Math.max(1, target) * 1e-10) return decimal;
    let a = Math.abs(bestNumerator);
    let b = bestDenominator;
    while (b) [a, b] = [b, a % b];
    return `${sign * bestNumerator / a}/${bestDenominator / a}`;
  };

  useEffect(() => {
    const move = (event: PointerEvent) => {
      if (!drag.current) return;
      setPosition({
        x: Math.max(0, Math.min(window.innerWidth - 56, event.clientX - drag.current.offsetX)),
        y: Math.max(0, Math.min(window.innerHeight - 48, event.clientY - drag.current.offsetY)),
      });
    };
    const stop = () => { drag.current = null; };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
    };
  }, []);

  const append = (key: string) => {
    if (key === 'C') {
      setExpression('');
      setResult('');
      return;
    }
    if (key === 'Backspace') {
      setExpression((value) => value.slice(0, -1));
      return;
    }
    if (key === '=') {
      void calculate();
      return;
    }
    const value = key === 'Ans' ? previousResult.current
      : key === 'pi' ? 'pi'
        : ['sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'log', 'ln', 'sqrt', 'abs'].includes(key) ? `${key}(`
          : key;
    setExpression((current) => `${current}${value}`);
  };

  const calculate = async () => {
    if (!expression.trim()) return;
    try {
      const { evaluate } = await import('mathjs');
      const scale = angleMode === 'DEG' ? Math.PI / 180 : 1;
      const inverseScale = angleMode === 'DEG' ? 180 / Math.PI : 1;
      const evaluated = evaluate(expression, {
        pi: Math.PI,
        e: Math.E,
        sin: (value: number) => Math.sin(value * scale),
        cos: (value: number) => Math.cos(value * scale),
        tan: (value: number) => Math.tan(value * scale),
        asin: (value: number) => Math.asin(value) * inverseScale,
        acos: (value: number) => Math.acos(value) * inverseScale,
        atan: (value: number) => Math.atan(value) * inverseScale,
        log: (value: number) => Math.log10(value),
        ln: (value: number) => Math.log(value),
        sqrt: (value: number) => Math.sqrt(value),
        abs: (value: number) => Math.abs(value),
      });
      if (typeof evaluated !== 'number' || !Number.isFinite(evaluated)) {
        throw new Error('The result is not a finite number.');
      }
      const decimal = Number(evaluated.toPrecision(12)).toString();
      previousResult.current = decimal;
      const formatted = formatResult(evaluated);
      setResult(formatted);
      setHistory((items) => [{ expression, result: formatted }, ...items].slice(0, 5));
    } catch (error) {
      setResult(error instanceof Error ? error.message : 'Invalid expression');
    }
  };

  const startDrag = (event: React.PointerEvent<HTMLElement>) => {
    if ((event.target as HTMLElement).closest('button')) return;
    drag.current = {
      offsetX: event.clientX - position.x,
      offsetY: event.clientY - position.y,
    };
  };

  if (minimized) {
    return (
      <button
        className="calculator-pill"
        style={{ left: position.x, top: position.y }}
        onPointerDown={startDrag}
        onClick={() => setMinimized(false)}
        title="Restore scientific calculator"
      >
        <Calculator size={16} /> Calculator
      </button>
    );
  }

  return (
    <section className="scientific-calculator" style={{ left: position.x, top: position.y }}>
      <header className="calculator-titlebar" onPointerDown={startDrag}>
        <span><Calculator size={15} /> Scientific calculator</span>
        <div>
          <button onClick={() => setMinimized(true)} title="Minimize"><Minus size={14} /></button>
          <button onClick={onClose} title="Close"><X size={14} /></button>
        </div>
      </header>
      <div className="calculator-display">
        <div className="calculator-history">{history[0] ? `${history[0].expression} = ${history[0].result}` : 'sin(pi / 2)'}</div>
        <div className="calculator-modes">
          <button onClick={() => setAngleMode((mode) => mode === 'DEG' ? 'RAD' : 'DEG')}>{angleMode}</button>
          <button onClick={() => setDisplayMode((mode) => mode === 'DEC' ? 'FRAC' : 'DEC')}>{displayMode}</button>
        </div>
        <input
          aria-label="Calculator expression"
          value={expression}
          onChange={(event) => setExpression(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') void calculate();
            if (event.key === 'Escape') setExpression('');
          }}
        />
        <output>{result}</output>
      </div>
      <div className="calculator-keys">
        {BUTTONS.map((key, index) => key
          ? <button
              key={`${key}-${index}`}
              className={key === '=' ? 'calculator-equals' : ''}
              onClick={() => append(key)}
            >
              {key === 'pi' ? 'π' : key === 'sqrt' ? '√' : key}
            </button>
          : <span key={`empty-${index}`} />)}
      </div>
      {history.length > 1 && (
        <div className="calculator-history-list">
          {history.slice(1).map((item, index) => <div key={`${item.expression}-${index}`}>{item.expression} = {item.result}</div>)}
        </div>
      )}
    </section>
  );
};
