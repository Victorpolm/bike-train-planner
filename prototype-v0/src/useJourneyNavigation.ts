import { useEffect, useMemo, useRef, useState } from "react";
import { LocationWatch, ScreenAwake, idleLocation, usableFix, type AwakeState } from "./locationTracking.ts";
import { advanceProgress, navigationTrip, remainingPath, type NavigationInput, type NavigationTrip, type RouteProgress } from "./navigation.ts";

type Following = { trip: NavigationTrip; index: number; onboard: boolean; progress: RouteProgress | null };
export function useJourneyNavigation(selectionKey: string) {
  const [following, setFollowing] = useState<Following | null>(null);
  const [location, setLocation] = useState(idleLocation);
  const [now, setNow] = useState(Date.now);
  const [notice, setNotice] = useState("");
  const [keepAwake, setKeepAwake] = useState(false);
  const [awake, setAwake] = useState<AwakeState>("off");
  const [followingMap, setFollowingMap] = useState(true);
  const [recenter, setRecenter] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const watch = useRef<LocationWatch | null>(null);
  const wake = useRef<ScreenAwake | null>(null);
  const activeTrip = useRef<NavigationTrip | null>(null);
  const key = following?.trip.key;
  function stop(message = "Journey following stopped.") {
    activeTrip.current = null;
    watch.current?.stop(); wake.current?.disable();
    setFollowing(null); setKeepAwake(false); setNotice(message);
  }
  useEffect(() => {
    if (key && key !== selectionKey) stop("Following stopped because the selected journey changed. Press Start to follow this route.");
  }, [key, selectionKey]);
  useEffect(() => {
    if (!key) return;
    const tracker = new LocationWatch(window.isSecureContext ? navigator.geolocation : undefined, state => {
      setLocation(state); const time = Date.now(); setNow(time);
      if (state.fix) setFollowing(old => old && old.trip.key === key ? { ...old,
        progress: advanceProgress(old.trip.stages[old.index], state.fix!, old.progress, time) } : old);
    });
    watch.current = tracker;
    tracker.start();
    const visibility = () => document.visibilityState === "hidden" ? tracker.pause() : tracker.resume();
    visibility();
    document.addEventListener("visibilitychange", visibility);
    const pageHide = () => tracker.pause();
    window.addEventListener("pagehide", pageHide);
    window.addEventListener("pageshow", visibility);
    const timer = window.setInterval(() => { if (document.visibilityState !== "hidden") setNow(Date.now()); }, 2000);
    return () => {
      tracker.stop(false); watch.current = null; clearInterval(timer);
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("pagehide", pageHide); window.removeEventListener("pageshow", visibility);
    };
  }, [key, attempt]);
  useEffect(() => {
    if (!key || !keepAwake) return;
    const lock = new ScreenAwake(navigator.wakeLock ? () => navigator.wakeLock.request("screen") : undefined, setAwake);
    wake.current = lock;
    const visibility = () => document.visibilityState === "hidden" ? lock.disable() : void lock.enable();
    visibility();
    document.addEventListener("visibilitychange", visibility);
    const pageHide = () => lock.disable();
    window.addEventListener("pagehide", pageHide); window.addEventListener("pageshow", visibility);
    return () => {
      lock.disable(); wake.current = null; document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("pagehide", pageHide); window.removeEventListener("pageshow", visibility);
    };
  }, [key, keepAwake]);
  const path = useMemo(() => remainingPath(following?.trip.stages[following.index], following?.progress ?? null),
    [following?.trip, following?.index, following?.progress]);
  return {
    following, location, now, notice, keepAwake, setKeepAwake, awake,
    map: { active: !!following, fix: location.fix, fresh: usableFix(location.fix, now), path, following: followingMap,
      recenter, onPan: () => setFollowingMap(false) },
    recenter: () => { setFollowingMap(true); setRecenter(n => n + 1); },
    retry: () => setAttempt(n => n + 1),
    start: (input: NavigationInput, stage = 0) => {
      const trip = navigationTrip(input);
      if (!trip.stages.length) { setNotice("No route sections are available to follow yet."); return; }
      watch.current?.stop(); wake.current?.disable();
      activeTrip.current = trip;
      setFollowing({ trip, index: Number.isInteger(stage) && stage >= 0 && stage < trip.stages.length ? stage : 0, onboard: false, progress: null }); setAttempt(n => n + 1);
      setLocation(idleLocation()); setNotice(""); setNow(Date.now()); setFollowingMap(true); setRecenter(n => n + 1);
    },
    stop,
    isFollowing: (expected: NavigationTrip) => activeTrip.current === expected,
    setStage: (index: number) => setFollowing(old => old && index >= 0 && index < old.trip.stages.length
      ? { ...old, index, onboard: false, progress: null } : old),
    confirm: () => {
      if (!following) return;
      if (following.trip.stages[following.index].mode === "transit" && !following.onboard)
        setFollowing(old => old ? { ...old, onboard: true } : old);
      else if (following.index + 1 === following.trip.stages.length) stop("Journey completed. Location tracking is off.");
      else setFollowing(old => old ? { ...old, index: old.index + 1, onboard: false, progress: null } : old);
    },
  };
}
export type JourneyNavigation = ReturnType<typeof useJourneyNavigation>;
