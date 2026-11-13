import React, { FormEvent, useState } from 'react';
import { ExternalLink } from 'lucide-react';

interface GraphDialogProps {
  onCancel: () => void;
  onCreate: (dimension: '2d' | '3d', expression: string) => void;
}

export const GraphDialog: React.FC<GraphDialogProps> = ({ onCancel, onCreate }) => {
  const [dimension, setDimension] = useState<'2d' | '3d'>('2d');
  const [expression, setExpression] = useState('sin(x)');
  const [error, setError] = useState('');
  const [isValidating, setIsValidating] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedExpression = expression.trim();
    if (!trimmedExpression) {
      setError('Enter a function to plot.');
      return;
    }

    try {
      setIsValidating(true);
      const { compile } = await import('mathjs');
      compile(trimmedExpression);
      setError('');
      onCreate(dimension, trimmedExpression);
    } catch (validationError) {
      setError(
        validationError instanceof Error
          ? validationError.message
          : 'The expression could not be parsed.'
      );
    } finally {
      setIsValidating(false);
    }
  };

  return (
    <div className="dialog-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onCancel();
    }}>
      <form className="graph-dialog" onSubmit={handleSubmit} role="dialog" aria-modal="true" aria-labelledby="graph-dialog-title">
        <h2 id="graph-dialog-title">Insert function graph</h2>
        <label className="dialog-field">
          <span>Graph type</span>
          <select
            value={dimension}
            onChange={(event) => setDimension(event.target.value as '2d' | '3d')}
          >
            <option value="2d">2D · y = f(x)</option>
            <option value="3d">3D · z = f(x, y)</option>
          </select>
        </label>
        <label className="dialog-field">
          <span>{dimension === '2d' ? 'y = f(x)' : 'z = f(x, y)'}</span>
          <input
            autoFocus
            value={expression}
            onChange={(event) => {
              setExpression(event.target.value);
              setError('');
            }}
            placeholder={dimension === '2d' ? 'sin(x)' : 'sin(sqrt(x^2 + y^2))'}
          />
        </label>
        <p className="dialog-hint">
          Use math notation such as sin, cos, tan, sqrt, abs, log and powers (^).
        </p>
        <nav className="graph-external-links" aria-label="External graphing calculators">
          <a href="https://www.desmos.com/calculator" target="_blank" rel="noopener noreferrer">
            <ExternalLink size={13} /> Desmos 2D
          </a>
          <a href="https://www.desmos.com/3d" target="_blank" rel="noopener noreferrer">
            <ExternalLink size={13} /> Desmos 3D
          </a>
        </nav>
        {error && <p className="dialog-error" role="alert">{error}</p>}
        <div className="dialog-actions">
          <button type="button" className="dialog-cancel" onClick={onCancel}>Cancel</button>
          <button type="submit" className="dialog-submit" disabled={isValidating}>
            {isValidating ? 'Checking…' : 'Insert graph'}
          </button>
        </div>
      </form>
    </div>
  );
};
