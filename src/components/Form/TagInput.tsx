import { useState } from 'react';
import styles from './Form.module.css';

interface TagInputProps {
  id: string;
  values: readonly string[];
  onChange: (values: string[]) => void;
  suggestions?: readonly string[];
  placeholder?: string;
  maxSuggestions?: number;
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

/** Free-text chips with tap-to-add suggestions; used for exercise preferences. */
export function TagInput({
  id,
  values,
  onChange,
  suggestions = [],
  placeholder,
  maxSuggestions = 8,
}: TagInputProps) {
  const [text, setText] = useState('');
  const existing = new Set(values.map(normalize));
  const query = normalize(text);
  const visibleSuggestions = suggestions
    .filter((suggestion) => !existing.has(normalize(suggestion)))
    .filter((suggestion) => (query ? normalize(suggestion).includes(query) : true))
    .slice(0, maxSuggestions);

  function add(raw: string) {
    const cleaned = raw.trim().replace(/\s+/g, ' ');
    if (!cleaned || existing.has(normalize(cleaned)) || cleaned.length > 60) return;
    onChange([...values, cleaned]);
    setText('');
  }

  function remove(value: string) {
    onChange(values.filter((item) => item !== value));
  }

  return (
    <div className={styles.field}>
      {values.length > 0 ? (
        <div className={styles.tags}>
          {values.map((value) => (
            <span key={value} className={styles.tag}>
              {value}
              <button
                type="button"
                className={styles.tagRemove}
                aria-label={`Remove ${value}`}
                onClick={() => remove(value)}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      ) : null}
      <div className={styles.inputRow}>
        <input
          id={id}
          className={styles.input}
          type="text"
          value={text}
          placeholder={placeholder}
          autoComplete="off"
          enterKeyHint="done"
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              add(text);
            }
          }}
        />
        <button
          type="button"
          className={styles.addButton}
          disabled={!query}
          onClick={() => add(text)}
        >
          Add
        </button>
      </div>
      {visibleSuggestions.length > 0 ? (
        <div className={styles.suggestions} aria-label="Suggestions">
          {visibleSuggestions.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              className={styles.suggestion}
              onClick={() => add(suggestion)}
            >
              + {suggestion}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
