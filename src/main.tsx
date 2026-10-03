import "@fontsource-variable/manrope";
import "@fontsource-variable/dm-sans";
import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./style.css";
import { isNative, registerOfflinePage } from "./mobile";
import { IS_DEMO } from "./api";
import { NativeService } from "./InstallApp";
registerOfflinePage();
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {isNative && !IS_DEMO ? <NativeService /> : <App />}
  </React.StrictMode>,
);
