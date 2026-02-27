import { useState } from 'react';

interface UsernameModalProps {
  onSubmit: (username: string) => void;
}

export function UsernameModal({ onSubmit }: UsernameModalProps) {
  const [username, setUsername] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const trimmed = username.trim();
    if (!trimmed) {
      setError('Please enter a username');
      return;
    }
    if (trimmed.length < 3) {
      setError('Username must be at least 3 characters');
      return;
    }
    if (trimmed.length > 20) {
      setError('Username must be 20 characters or less');
      return;
    }
    
    onSubmit(trimmed);
  };

  return (
    <div className="modal-overlay">
      <div className="modal">
        <h2>Welcome to Tic-Tac-Toe</h2>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem', textAlign: 'center' }}>
          Enter a username to start playing
        </p>
        <form onSubmit={handleSubmit}>
          <input
            type="text"
            className="modal-input"
            placeholder="Your username"
            value={username}
            onChange={(e) => {
              setUsername(e.target.value);
              setError('');
            }}
            autoFocus
          />
          {error && (
            <p style={{ color: 'var(--danger)', fontSize: '0.875rem', marginBottom: '1rem' }}>
              {error}
            </p>
          )}
          <button type="submit" className="btn btn-primary" disabled={!username.trim()}>
            Start Playing
          </button>
        </form>
      </div>
    </div>
  );
}
