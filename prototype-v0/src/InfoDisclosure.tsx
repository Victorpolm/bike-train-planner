import type { ReactNode } from "react";
export default function InfoDisclosure({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <details
      className="info-disclosure"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.currentTarget.open = false;
          e.currentTarget.querySelector("summary")?.focus();
          e.stopPropagation();
        }
      }}
    >
      <summary aria-label={label}>
        <span className="info-icon" aria-hidden="true">
          ?
        </span>
        <span>{label}</span>
      </summary>
      <div className="info-content">{children}</div>
    </details>
  );
}
