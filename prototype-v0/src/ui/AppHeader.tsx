import type { ReactNode } from "react";

export default function AppHeader({ profile }: { profile: ReactNode }) {
  return (
    <header className="app-header">
      <a className="brand" href="#top" aria-label="Re.route home">
        <span className="brand-mark" aria-hidden="true">
          Re.
        </span>
        <span>
          <strong>Re.route</strong>
          <small>Bike + public transport</small>
        </span>
      </a>
      <div className="header-actions">{profile}</div>
    </header>
  );
}
