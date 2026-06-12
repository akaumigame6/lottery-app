import { useState, useEffect } from "react";
import ManagePanel from "./components/ManagePanel";
import LotteryPanel from "./components/LotteryPanel";

/**
 * App: アプリケーションのメインエントリーポイント
 *
 * 機能:
 * - ナビゲーション（抽選 / クラス管理）
 * - 全体的なレイアウトテンプレート
 * - モダンなヘッダーデザイン
 */
export default function App() {
  const [activeTab, setActiveTab] = useState<"lottery" | "manage">("lottery");

  // タブの切り替えごとにトップに戻す
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [activeTab]);

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900">
      {/* ヘッダー・ナビゲーション */}
      <nav className="bg-white border-b border-slate-200 sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4">
          <div className="flex justify-between items-center h-16">
            <button onClick={() => setActiveTab("lottery")}>
              <div className="flex items-center gap-2">
                <img
                  src={`${import.meta.env.BASE_URL}LotteyApp_icon_2.svg`}
                  alt="LOTTERY APP Icon"
                  className="w-8 h-8"
                />
                <span className="font-black text-xl tracking-tight bg-clip-text text-transparent bg-gradient-to-b from-indigo-600 to-violet-600">
                  LOTTERY APP
                </span>
              </div>
            </button>

            <div className="flex gap-1 bg-slate-100 p-1 rounded-xl">
              <button
                onClick={() => setActiveTab("lottery")}
                className={`px-6 py-2 rounded-lg text-sm font-bold transition-all ${
                  activeTab === "lottery"
                    ? "bg-white text-indigo-600 shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                抽選
              </button>
              <button
                onClick={() => setActiveTab("manage")}
                className={`px-6 py-2 rounded-lg text-sm font-bold transition-all ${
                  activeTab === "manage"
                    ? "bg-white text-indigo-600 shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                グループ管理
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* メインコンテンツ */}
      <main className="py-8">
        {activeTab === "lottery" ? (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <LotteryPanel />
          </div>
        ) : (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <ManagePanel />
          </div>
        )}
      </main>

      {/* フッター */}
      <footer className="mt-auto py-8 text-center text-slate-400 text-sm">
        <p>&copy; 2026 LOTTERY APP Prototype. Built with IndexedDB & React.</p>
      </footer>
    </div>
  );
}
