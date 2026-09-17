import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";
import { initTheme } from "./theme";

// 渲染前同步落地配色，避免首帧闪一下默认值。
initTheme();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
