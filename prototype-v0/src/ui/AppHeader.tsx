import type { ReactNode } from "react";
import PrivacyNotice from "../PrivacyNotice";

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
      <div className="header-actions">
        <PrivacyNotice />
        {profile}
      </div>
    </header>
  );
}
