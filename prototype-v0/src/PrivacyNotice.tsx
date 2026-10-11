import { useEffect, useRef, useState } from "react";
import {
  PRIVACY_OPERATOR,
  PRIVACY_RECIPIENTS,
  PRIVACY_REVIEW_DATE,
  clearLocalPersonalData,
} from "./privacy";
import { FACILITY_REUSE_NOTICE, EXPERIMENTAL_FARE_NOTICE } from "./sourcePolicy";

export default function PrivacyNotice() {
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [confirmErase, setConfirmErase] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (open) dialog.current?.showModal();
    else dialog.current?.close();
  }, [open]);
  return (
    <>
      <button
        ref={trigger}
        type="button"
        className="privacy-link"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
      >
        Privacy, sources & use
      </button>
      <dialog
        ref={dialog}
        className="privacy-notice"
        aria-labelledby="privacy-title"
        onClose={() => {
          setOpen(false);
          setConfirmErase(false);
          trigger.current?.focus();
        }}
      >
        <div className="detour-heading">
          <h2 id="privacy-title">Privacy, sources & use</h2>
          <button type="button" onClick={() => setOpen(false)}>
            Close
          </button>
        </div>
        <p>Private beta · reviewed {PRIVACY_REVIEW_DATE}.</p>
        <h3>Who operates Re.route</h3>
        {PRIVACY_OPERATOR.name && PRIVACY_OPERATOR.contact ? (
          <p>
            {PRIVACY_OPERATOR.name} · {PRIVACY_OPERATOR.contact}
          </p>
        ) : (
          <p className="notice">
            The legal operator name and privacy contact have not yet been supplied. This notice
            records the current private prototype’s behaviour; it is incomplete for an external
            launch. Access remains limited to the owner.
          </p>
        )}
        <h3>Your location and journeys</h3>
        <p>
          Re.route uses places, travel times, bicycle preferences and optionally your location to
          plan journeys. “From your location” requests one reading. “Start” follows your location
          while the app is visible; Stop ends tracking. No continuous GPS history is recorded by
          application code. Choosing a GPS origin or recalculating sends that point to routing
          services. Displaying the map sends the visible map area to the tile service.
        </p>
        <p>
          Traveller profiles (including a name, optional age, passes and cycling pace), saved
          journeys and a parked-bicycle location stay in this browser’s local storage until you
          delete them or clear site data. Explicitly saved journeys may contain endpoints obtained
          from GPS, exact travel times, route geometry and facility stops. Profiles are not uploaded
          as a profile database. Downloaded correction reports contain selected services/stops and
          anything you type; nothing is sent automatically.
        </p>
        <h3>Recipients and purposes</h3>
        <div className="privacy-table">
          <table>
            <thead>
              <tr>
                <th>Recipient</th>
                <th>Information and purpose</th>
              </tr>
            </thead>
            <tbody>
              {PRIVACY_RECIPIENTS.map((r) => (
                <tr key={r.name}>
                  <td>{r.name}</td>
                  <td>
                    {r.data} {r.purpose}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <h3>Storage, logs and countries</h3>
        <p>
          The app has no advertising or analytics integration. Hosting and sign-in services still
          process requests and may set cookies. A hosting-log sample showed request URLs, IP-related
          fields, browser headers, cookies and signed-in account identifier/name/email header
          fields. Application diagnostics contain operational error categories, not request bodies
          or GPS traces. This does not mean the hosting platform records no personal information.
        </p>
        <p>
          Journey and routing caches are held in browser/server memory and expire for reuse after
          short periods (typically seconds to 30 minutes); memory entries can remain until eviction
          or process exit. Public map datasets are also cached in this browser, reused for 24 hours
          (30 minutes for official parking) and shown as older data for at most seven days; stored
          records can remain until replacement or clearing site data. Quota storage contains
          provider-key hashes and hourly counters, not journey endpoints; old counters are cleaned
          when the key is next used and key-clock rows currently have no automatic expiry.
        </p>
        <p>
          <strong>Unconfirmed before external access:</strong> the hosting providers’ log/backup
          retention, exact processing countries, subprocessors and any necessary
          international-transfer safeguards. The named services are operated by Swiss and
          international providers; Re.route cannot currently promise that all processing stays in
          Switzerland. Provider retention is not controlled by deleting browser data.
        </p>
        <p>
          Provider-specific information:{" "}
          <a href="https://brouter.de/privacypolicy.html" target="_blank" rel="noreferrer">
            BRouter
          </a>{" "}
          states that coordinates and IP addresses are logged for two weeks, plus ten days in
          backups.{" "}
          <a href="https://transport.opendata.ch/privacy.html" target="_blank" rel="noreferrer">
            Transport API
          </a>{" "}
          states Swiss hosting, 30-day request URL/IP logs and 35-day unlinked station/connection
          statistics. Other providers’ retention and processing countries still need confirmation.
        </p>
        <h3>Your choices and rights</h3>
        <p>
          You can enter places manually, decline/revoke browser location permission, stop
          navigation, and delete local profiles, saved journeys or parked-bicycle details. Depending
          on the applicable law, you may request information/access, correction, deletion and other
          applicable rights from the operator, and contact the Swiss Federal Data Protection and
          Information Commissioner. A public contact must be supplied before others are invited.
          Deliberate EU expansion requires a separate GDPR assessment.
        </p>
        {!confirmErase ? (
          <button type="button" onClick={() => setConfirmErase(true)}>
            Delete this device’s saved personal data…
          </button>
        ) : (
          <div>
            <p>
              This removes saved profiles, journeys and parked-bicycle information from this
              browser. Download anything you need first.
            </p>
            <button
              type="button"
              onClick={() => {
                try {
                  clearLocalPersonalData(localStorage);
                  window.location.reload();
                } catch {
                  setError(
                    "Your browser could not remove all stored data. Use the browser’s site-data settings.",
                  );
                }
              }}
            >
              Delete and reload
            </button>{" "}
            <button type="button" onClick={() => setConfirmErase(false)}>
              Keep my data
            </button>
          </div>
        )}
        {error && <p role="alert">{error}</p>}
        <h3>What the results mean</h3>
        <p>
          Journey times, paths and facility details depend on incomplete or changing source data.
          Check current signs, operating conditions and operator information. Bicycle permission is
          separate from available space and a confirmed reservation; Re.route does not sell tickets
          or reserve bicycle spaces. Mapped traffic exposure, surface and comfort are descriptions,
          not a safety guarantee. Official route sections are attributed and linked; Re.route is not
          endorsed by SwitzerlandMobility, swisstopo or transport operators.
        </p>
        <p>
          {EXPERIMENTAL_FARE_NOTICE} Reviewed published tariffs may still appear with their source
          and validity dates.
        </p>
        <p>{FACILITY_REUSE_NOTICE}</p>
        <p>
          Public terms and liability wording still require review by Swiss counsel. This prototype
          notice does not waive rights or exclude liability that cannot lawfully be excluded.
        </p>
        <h3>Data and software licences</h3>
        <p>
          © OpenStreetMap contributors ·{" "}
          <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
            ODbL and attribution
          </a>
          . swissTLM3D: © swisstopo. Official cycling routes: Bundesamt für Strassen, Kanton,
          Stiftung SchweizMobil. Third-party data and service terms remain separate from the app’s
          software.
        </p>
        <p>
          <a href="/data-source-register.html" target="_blank" rel="noreferrer">
            Source-by-source licence register
          </a>{" "}
          ·{" "}
          <a href="/third-party-notices.txt" target="_blank" rel="noreferrer">
            Third-party software notices
          </a>
          . No project-wide software reuse licence has yet been selected for Re.route; public source
          visibility alone grants no additional licence.
        </p>
      </dialog>
    </>
  );
}
