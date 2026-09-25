# Recording rides for cycling-time calibration

Use a GPS cycling computer, watch or the cycling activity recorder you already have. No new device or paid subscription is needed for the first sample. We need **recorded activities with timestamps**, not a downloaded route to follow.

1. Select an outdoor cycling activity and wait for a GPS position before starting. If available, select one-second recording; a point every 1–5 seconds is useful. Keep location recording enabled while the screen is locked.
2. Start recording when you start riding and stop at the end. For calibration, turn automatic pause off if convenient: we can separate stops from riding. If you leave it on, say so. Record each continuous bicycle ride separately from train travel.
3. Ride normally. Include some flat road and familiar climbs. Do not ride faster or choose a dangerous descent for the test. Three to five ordinary rides are a useful first batch, ideally with repeated flat and uphill sections; they do not establish a universal speed model.
4. Save the activity and export **GPX with track points, time and elevation**. Keep the original FIT file too if your device offers it: power and barometric elevation can help later. A GPX planned route with no times cannot calibrate speed.
5. Attach the files here. Keep recordings private. You may trim the start/end around home or work while retaining timestamps on the remaining track. Do not put personal GPX files in the GitHub repository.

For Garmin Connect on the web: open **Activities → All Activities → the ride → settings gear → Export to GPX**. This follows [Garmin's export instructions](https://support.garmin.com/en-US/?faq=qzf6fPRX2r6kxlwI3zFh9A), checked 25 September 2026. For another recorder, use its recorded-activity export; share its name if you need exact steps.

Include this short note with each ride:

| Information | Example |
| --- | --- |
| Bicycle | City / touring / road / mountain / electric |
| Effort | Easy / usual / sustained effort |
| Electric assistance | Off / eco / normal / high; changed during ride? |
| Extra load | None / panniers / approximate extra kilograms |
| Conditions | Strong wind, wet road, traffic or long stops |
| Recorder | Device/app; automatic pause on/off; barometric elevation if known |

Rider and bicycle mass are optional calibration inputs, not required for the first upload. Do not send account credentials.

## What the existing analysis tool does

```bash
python3 tools/analyse_gpx.py /private/path/recorded-ride.gpx --output /private/path/ride-summary.json
```

It reports moving time and speeds in seven slope groups using windows of at least 100 metres. Stops, large recording gaps and implausibly fast links are separated. The JSON contains no coordinates, dates or track names. This is a diagnostic report: it does not upload the ride, infer fitness, fit a new profile automatically or erase the existing default.

Next, compare these observations with the current City/Relaxed/Regular/Sportive/Electric model and hold back some rides for validation. Wind, surface, traffic, elevation noise and assistance settings can explain differences that should not be encoded as a blanket slope discount.
