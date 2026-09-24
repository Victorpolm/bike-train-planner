import { useEffect, useRef, useState } from "react";
import { carriageForLeg, withTripInfoRule } from "./bicycleCarriage";
import { checkOjpTripInfo } from "./ojpClient";
import type { BicycleEvidence } from "./bicyclePermission";
import type { OjpDetails } from "./ojp";
import type { TransitLeg } from "./routing";

export type EvidenceUpdate = (leg: TransitLeg, evidence: BicycleEvidence) => void;
const requirement = (value: string) => value === "required" ? "Required" : value === "not-required" ? "Not required" : "Unknown — check with the operator";

export default function BicycleCarriageDetails({ leg, onEvidence }: { leg: TransitLeg; onEvidence?: EvidenceUpdate }) {
  const [detail, setDetail] = useState<OjpDetails | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "checked" | "failed">("idle");
  const latest = useRef({ leg, onEvidence }); latest.current = { leg, onEvidence };
  const ref = leg.ojp;
  const key = ref ? JSON.stringify([ref.journeyRef, ref.operatingDay, ref.fromRef, ref.toRef, ref.departure, ref.arrival]) : "";
  useEffect(() => {
    let active = true;
    setDetail(null);
    if (!ref) { setStatus("idle"); return; }
    setStatus("loading");
    void checkOjpTripInfo(ref).then(result => {
      if (!active) return;
      setDetail(result); setStatus("checked");
      const { leg: current, onEvidence: update } = latest.current;
      if (current.bicycleEvidence) update?.(current, withTripInfoRule(current.bicycleEvidence, result.rule, result.checked));
    }, () => { if (active) setStatus("failed"); });
    return () => { active = false; };
    // The dated segment, rather than a freshly rendered object, identifies the request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const displayLeg = detail && leg.bicycleEvidence
    ? { ...leg, bicycleEvidence: withTripInfoRule(leg.bicycleEvidence, detail.rule, detail.checked) } : leg;
  const rule = carriageForLeg(displayLeg), prohibited = rule.permission === "prohibited";
  const notes = [...new Set([...(leg.ojp?.attributes ?? []), ...detail?.rule.attributes ?? []]
    .filter(a => /^A__V[NRB]$/.test(a.code) || /velo|bicycl|fahrr|vélo|biciclett/i.test(a.text)).map(a => a.text))];
  return <div className={`bicycle-carriage permission-${rule.permission}`}>
    <strong>{prohibited ? "Bicycles not allowed" : rule.permission === "confirmed" ? "Bicycles allowed · conditions apply" : "Bicycle permission unknown"}</strong>
    {prohibited ? <p>This service appears only in the all-public-transport comparison. Choose another service to travel with your bicycle.</p> : <>
      <dl>
        <div><dt>Bike ticket or pass</dt><dd>{requirement(rule.bikeTicket)}</dd></div>
        <div><dt>Bike-space reservation</dt><dd>{requirement(rule.bikeReservation)}</dd></div>
      </dl>
      {rule.bikeTicket === "required" && <p>Have a valid bicycle ticket or pass as well as your own travel ticket. Check the operator’s fare exemptions.</p>}
      {rule.bikeReservation === "required" && <p className="reservation-required">Reserve a bicycle space before boarding. A bike ticket alone does not include this reservation.</p>}
    </>}
    {rule.evidence?.conditions.map(note => <p key={note}>{note}</p>)}
    {rule.evidence?.basis === "ojp-filter" && <p>OJP returned this dated service with bicycle transport enabled. Missing ticket or reservation information remains unknown.</p>}
    {rule.evidence && <p className="carriage-source"><a href={rule.evidence.source.url} target="_blank" rel="noreferrer">{rule.evidence.source.title}</a> · checked {new Date(rule.evidence.source.checked).toLocaleDateString("en-GB")}</p>}
    {!prohibited && rule.ticketSource && <p className="carriage-source">Ticket guidance: <a href={rule.ticketSource.url} target="_blank" rel="noreferrer">{rule.ticketSource.title}</a> · reviewed {rule.ticketSource.checked}</p>}
    {!prohibited && rule.bookingUrl && <p><a href={rule.bookingUrl} target="_blank" rel="noreferrer">Open operator tickets and reservations ↗</a></p>}
    {notes.length > 0 && <details><summary>Original provider notes</summary><ul>{notes.map(note => <li key={note}>{note}</li>)}</ul></details>}
    {rule.guidance.length > 0 && rule.policySource && <details><summary>General operator guidance</summary><ul>{rule.guidance.map(note => <li key={note}>{note}</li>)}</ul><a href={rule.policySource.url} target="_blank" rel="noreferrer">{rule.policySource.title}</a></details>}
    <p className="carriage-check" role="status">{status === "loading" ? "Checking this service’s detailed conditions…" : status === "checked" ? "Service details checked for your boarded segment." : status === "failed" ? "Detailed conditions could not be refreshed. The available timetable information is shown above." : "Check unknown requirements with the operator before travelling."}</p>
  </div>;
}
