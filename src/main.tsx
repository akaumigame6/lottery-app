import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import { openDB } from "./db";

async function init() {
  await openDB(); // ★ DB初期化：アプリ起動前に1回だけ動く
  console.log("IndexedDB ready.");

  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}

init(); // ★ アプリ全体の唯一のエントリポイント
