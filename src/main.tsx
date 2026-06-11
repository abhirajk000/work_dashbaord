import React from "react";
import ReactDOM from "react-dom/client";
import ProductivityDashboard from "../productivity-dashboard";
import { registerServiceWorker } from "./lib/web-push-client";
import "./index.css";

void registerServiceWorker();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ProductivityDashboard />
  </React.StrictMode>
);
