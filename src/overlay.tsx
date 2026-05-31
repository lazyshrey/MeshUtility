import React from "react";
import ReactDOM from "react-dom/client";
import { OverlayApp } from "./components/PromptApp";
import "./styles-prompt.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <OverlayApp />
  </React.StrictMode>,
);
