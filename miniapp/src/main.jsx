import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import { applyTheme, getInitialTheme } from "./theme";
import "./styles.css";

// Render'dan oldin qo'llanadi — aks holda birinchi kadrda eski (light/dark)
// tema miltillab ko'rinib ketishi mumkin edi.
applyTheme(getInitialTheme());

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
