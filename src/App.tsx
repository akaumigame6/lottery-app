import { useState } from "react";
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

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900">
      {/* ヘッダー・ナビゲーション */}
      <nav className="bg-white border-b border-slate-200 sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white shadow-indigo-200 shadow-lg">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>
              </div>
              <span className="font-black text-xl tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 to-violet-600">
                LOTTERY APP
              </span>
            </div>

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
                クラス管理
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
        <p>&copy; 2026 Lottery App Prototype. Built with IndexedDB & React.</p>
      </footer>
    </div>
  );
}
