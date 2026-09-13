import React from "react";
import ReactDOM from "react-dom/client";
import AdminApp from "./AdminApp.jsx";
import { applyTheme, getInitialTheme } from "../theme";
import "../styles.css";

applyTheme(getInitialTheme());

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <AdminApp />
  </React.StrictMode>
);
