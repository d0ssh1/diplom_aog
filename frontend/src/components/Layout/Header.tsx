import React from 'react';
import styles from './Header.module.css';

interface HeaderProps {
  username?: string;
}

export const Header: React.FC<HeaderProps> = ({ username }) => {
  return (
    <header className={styles.header}>
      <span className={styles.brand}>PROJECT_DIPLOM</span>
      {username && <span className={styles.user}>{username}</span>}
    </header>
  );
};
