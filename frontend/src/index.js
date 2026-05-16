import React from "react";
import ReactDOM from "react-dom/client";
import "@/index.css";
import App from "@/App";
import { installErrorReporter } from "@/lib/errorReporter";

// Auto-email the admin on any uncaught JS error or unhandled promise rejection.
installErrorReporter();

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
