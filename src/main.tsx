import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { PinchZoomWrapper } from "./PinchZoomWrapper";
import "./index.css";
import { registerServiceWorker } from "./pwa";

registerServiceWorker();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <BrowserRouter>
      <PinchZoomWrapper>
        <App />
      </PinchZoomWrapper>
    </BrowserRouter>
  </React.StrictMode>,
);

