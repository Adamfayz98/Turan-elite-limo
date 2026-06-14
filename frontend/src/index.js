import React from "react";
import ReactDOM from "react-dom/client";
import "@/index.css";
import App from "@/App";
import { installErrorReporter } from "@/lib/errorReporter";
import { installTranslateResilientDomPatches } from "@/lib/translatePatch";

// Make React 18 reconciler resilient to Google Translate / browser-extension
// DOM mutations. Must run BEFORE ReactDOM.createRoot. Fixes the
// "Failed to execute 'removeChild' on 'Node'" crash that was hitting mobile
// Android Chrome users who auto-translated the booking page.
installTranslateResilientDomPatches();

// Auto-email the admin on any uncaught JS error or unhandled promise rejection.
installErrorReporter();

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
