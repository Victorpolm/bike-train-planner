import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "leaflet/dist/leaflet.css";
import "./styles.css";
import "./ui/interface.css";
import App from "./App";
import { purgeRestrictedFacilityCache } from "./mapDataCache";

void purgeRestrictedFacilityCache();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
