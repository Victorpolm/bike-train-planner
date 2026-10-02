import type { ReactNode } from "react";

export default function AppHeader({ profile }: { profile: ReactNode }) {
  return (
    <header className="app-header">
      <a className="brand" href="#top" aria-label="Bike plus train home">
        <span className="brand-mark">
          B<span>+</span>T
        </span>
        <span>
          <strong>Bike + Train</strong>
          <small>Swiss route experiment</small>
        </span>
      </a>
      <div className="header-actions">{profile}</div>
    </header>
  );
}
