import styles from './Form.module.css';

interface TextAreaProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  maxLength?: number;
}

export function TextArea({ id, value, onChange, placeholder, maxLength }: TextAreaProps) {
  return (
    <textarea
      id={id}
      className={styles.textarea}
      value={value}
      placeholder={placeholder}
      maxLength={maxLength}
      rows={3}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}
