import { busCarriage, busCarriageLabel } from "./busCarriage";
import type { TransitLeg } from "./routing";

export default function BusCarriageDetails({ leg }: { leg: TransitLeg }) {
  const rule = busCarriage(leg);
  if (!rule) return null;
  return <div className={`bus-carriage bus-carriage-${rule.permission}`}>
    <strong>{busCarriageLabel(rule)}</strong>
    <p>{rule.operator} · standard, unfolded bicycle</p>
    <ul>{rule.instructions.map(instruction => <li key={instruction}>{instruction}</li>)}</ul>
    <dl>
      <div><dt>Reservation</dt><dd>{rule.reservation === "check-service" ? "Check this service" : rule.reservation === "not-applicable" ? "Not applicable" : "Requirement unverified"}</dd></div>
      <div><dt>Bike ticket</dt><dd>{rule.ticket === "required" ? "Ticket or pass required" : rule.ticket === "check-fare" ? "Check route fare" : rule.ticket === "not-applicable" ? "Not applicable" : "Requirement unverified"}</dd></div>
      <div><dt>Bike spaces</dt><dd>Live availability unknown · no space reserved by this app</dd></div>
    </dl>
    {rule.source && <p className="bus-source"><a href={rule.source.url} target="_blank" rel="noreferrer">{rule.source.title}</a>
      {" "}· reviewed {rule.source.checked}. Operator guidance; this departure is not individually verified.</p>}
  </div>;
}
