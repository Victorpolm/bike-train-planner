// Rearrange these entries to change the planner's reading/tab order.
// Keep each module once. Search state and routing stay in App.tsx.
export const PLANNER_MODULES = ["locations", "departure", "presets", "preferences"] as const;
export type PlannerModule = typeof PLANNER_MODULES[number];

export const PLANNER_COPY = {
  title: "Where are you going?",
  subtitle: "Explore by bike & public transport.",
  submit: "Find journeys",
  searching: "Finding journeys…",
};
