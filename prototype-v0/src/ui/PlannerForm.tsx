import type { FormEvent, ReactNode } from "react";
import { PLANNER_COPY, PLANNER_MODULES, type PlannerModule } from "./plannerLayout";

export default function PlannerForm({
  sections,
  loading,
  locating = false,
  onSubmit,
}: {
  sections: Record<PlannerModule, ReactNode>;
  loading: boolean;
  locating?: boolean;
  onSubmit: (event: FormEvent) => void;
}) {
  return (
    <>
      <div className="intro">
        <h1>{PLANNER_COPY.title}</h1>
        <p>{PLANNER_COPY.subtitle}</p>
      </div>
      <form className="search-form" onSubmit={onSubmit}>
        {PLANNER_MODULES.map((id) => (
          <div className={`planner-module planner-module-${id}`} key={id} data-planner-module={id}>
            {sections[id]}
          </div>
        ))}
        <button className="search-button" type="submit" disabled={loading || locating}>
          {locating
            ? "Finding your location…"
            : loading
              ? PLANNER_COPY.searching
              : PLANNER_COPY.submit}
        </button>
      </form>
    </>
  );
}
