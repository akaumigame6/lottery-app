import { useEffect, useState, useRef } from "react";
import * as lotteryDB from "../lottery-db";
import type { Class, Nominations } from "../lottery-db";
import { drawRandom, drawRoundRobin } from "../lottery-logic";

/**
 * LotteryPanel (ManagePanel 統合デザイン版)
 *
 * 特徴:
 * - ManagePanel.tsx と同じクリーンでモダンな配色 (slate, indigo)
 * - 構造をシンプルに保ち、ユーザーが後から自由に書き換えられるように設計
 * - PC一画面での視認性を考慮したレイアウト
 */
export default function LotteryPanel() {
  const [classes, setClasses] = useState<Class[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<number | null>(null);

  const [mode, setMode] = useState<"random-no-save" | "round-robin">(
    "round-robin",
  );
  const [result, setResult] = useState<string | null>(null);
  const [nominations, setNominations] = useState<Nominations[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [shuffleName, setShuffleName] = useState("");
  const [isFullscreen, setIsFullscreen] = useState(false);

  const timerRef = useRef<number | null>(null);
  const finalizeTimerRef = useRef<number | null>(null);

  const localStorageKey = "Lottery-App";

  useEffect(() => {
    loadClasses();
    const handleKeydown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsFullscreen(false);
    };
    window.addEventListener("keydown", handleKeydown);
    return () => {
      window.removeEventListener("keydown", handleKeydown);
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      if (finalizeTimerRef.current !== null)
        clearTimeout(finalizeTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = isFullscreen ? "hidden" : "unset";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isFullscreen]);

  const loadClasses = async () => {
    await lotteryDB.openDB();
    try {
      const data = await lotteryDB.getAllClasses();
      setClasses(data);
      // localStorageから保存されているIDを読み込む
      const savedState = localStorage.getItem(localStorageKey);
      let savedId: number | null = null;
      if (savedState) {
        try {
          const parsed = JSON.parse(savedState);
          savedId = parsed.selectedClassId || null;
        } catch {}
      }
      // savedIdが有効なクラスIDなら使う、そうでなければ最初のクラスを選ぶ
      const validId = data.some((c) => c.id === savedId)
        ? savedId
        : data.length > 0
          ? data[0].id
          : null;
      setSelectedClassId(validId);
    } catch (error) {
      console.error("クラスの読み込みに失敗しました:", error);
    }
  };

  const loadNominations = async (classId: number) => {
    const data = await lotteryDB.findNominationsByClassId(classId);
    setNominations(
      data.sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      ),
    );
  };

  useEffect(() => {
    if (selectedClassId) {
      loadNominations(selectedClassId);
      setResult(null);
      localStorage.setItem(
        localStorageKey,
        JSON.stringify({ selectedClassId }),
      );
    }
  }, [selectedClassId]);

  const selectedClass = classes.find((c) => c.id === selectedClassId);
  const currentClassNominations = nominations.filter((n) =>
    selectedClass?.items.includes(n.itemName),
  );
  const isAllDrawn =
    selectedClass &&
    currentClassNominations.length >= selectedClass.items.length;

  const handleDraw = async () => {
    if (
      !selectedClass ||
      selectedClass.items.length === 0 ||
      (mode === "round-robin" && isAllDrawn)
    )
      return;

    setIsDrawing(true);
    setResult(null);

    let count = 0;
    const shuffle = () => {
      setShuffleName(
        selectedClass.items[
          Math.floor(Math.random() * selectedClass.items.length)
        ],
      );
      count++;
      if (count < 20) {
        timerRef.current = window.setTimeout(shuffle, 50);
      }
    };
    shuffle();

    finalizeTimerRef.current = window.setTimeout(async () => {
      let selected: string | null = null;
      if (mode === "random-no-save") {
        selected = drawRandom(selectedClass.items);
      } else {
        const drawnNames = nominations.map((n) => n.itemName);
        const res = drawRoundRobin(selectedClass.items, drawnNames);
        selected = res.selected;
        if (selected) {
          await lotteryDB.addNomination({
            classId: selectedClass.id,
            itemName: selected,
          });
          await loadNominations(selectedClass.id);
        }
      }
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      setResult(selected);
      setIsDrawing(false);
    }, 1000);
  };

  const handleClearHistory = async () => {
    if (!selectedClassId || !confirm("履歴をリセットしますか？")) return;
    await lotteryDB.deleteNominationsByClassId(selectedClassId);
    await loadNominations(selectedClassId);
    setResult(null);
  };

  return (
    <div className="max-w-5xl mx-auto p-6 bg-slate-50 min-h-screen space-y-6">
      {/* 1. 設定セクション (ManagePanel のヘッダースタイル) */}
      <section className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 flex flex-wrap items-end gap-6">
        <div className="flex-1 min-w-[200px]">
          <label className="block text-sm font-semibold text-slate-700 mb-2">
            グループ選択
          </label>
          <select
            value={selectedClassId || ""}
            onChange={(e) => {
              const val = e.target.value;
              const newId = val ? Number(val) : null;
              setSelectedClassId(newId);
            }}
            className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-4 focus:ring-indigo-100 focus:border-indigo-600 outline-none transition-all font-medium text-slate-900 bg-slate-50"
          >
            {classes.map((cls) => (
              <option key={cls.id} value={cls.id}>
                {cls.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex bg-slate-100 p-1 rounded-xl items-center h-[52px]">
          <button
            onClick={() => setMode("random-no-save")}
            className={`px-6 py-2.5 rounded-lg text-sm font-bold transition-all ${
              mode === "random-no-save"
                ? "bg-white text-indigo-600 shadow-sm"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            ランダム
          </button>
          <button
            onClick={() => setMode("round-robin")}
            className={`px-6 py-2.5 rounded-lg text-sm font-bold transition-all ${
              mode === "round-robin"
                ? "bg-white text-indigo-600 shadow-sm"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            一巡モード
          </button>
        </div>

        <button
          onClick={() => setIsFullscreen(true)}
          className="h-[52px] px-6 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-medium hover:bg-slate-50 transition-colors flex items-center gap-2"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
          </svg>
          全画面表示
        </button>
      </section>

      {/* 2. 抽選ステージ (ManagePanel のメインパネルに準拠したカード) */}
      <div
        className={`
        ${isFullscreen ? "fixed inset-0 z-50  flex flex-col" : "relative bg-white rounded-2xl shadow-lg border border-slate-200 aspect-video max-h-[500px] flex flex-col overflow-hidden mx-auto"}
      `}
      >
        <div
          className={`flex-1 flex flex-col items-center justify-center p-8 space-y-6 ${isFullscreen ? "bg-white " : "text-slate-900"}`}
        >
          <div className="text-center w-full">
            {(() => {
              // 1. タブ(セルごと)で分割して各変数に代入
              const rawText = isDrawing ? shuffleName : result || "";
              const parts = rawText.split("\t").map((p) => p.trim());
              const item1 = parts[0] || ""; // 2段目
              const item2 = parts[1] || ""; // 1段目
              const item3 = parts[2] || ""; // 3段目

              return (
                <div className="space-y-4">
                  {/* item1: 上段 (小さめ) */}
                  <div
                    className={`font-bold uppercase tracking-widest opacity-40 ${isFullscreen ? "text-6xl" : "text-4xl"} h-12`}
                  >
                    {isDrawing
                      ? "DRAWING..."
                      : item2 || selectedClass?.name || "STANDBY"}
                  </div>

                  {/* item2: 中段 (メイン: 特大) */}
                  <div
                    className={`font-black tracking-tight leading-none ${isFullscreen ? "text-[15rem]" : "text-8xl"} min-h-[1em]`}
                  >
                    {item1 || (isDrawing ? "" : "READY?")}
                  </div>

                  {/* item3: 下段 (メッセージ等) */}
                  <div
                    className={`font-bold text-indigo-600 flex items-center justify-center ${isFullscreen ? "text-4xl " : "text-xl"} h-10`}
                  >
                    {!isDrawing &&
                      (item3 || (result ? "おめでとうございます！" : ""))}
                  </div>
                </div>
              );
            })()}
          </div>
        </div>

        <div
          className={`p-8 flex justify-center border-t border-slate-100 bg-slate-50`}
        >
          {mode === "round-robin" && isAllDrawn && !isDrawing ? (
            <button
              onClick={handleClearHistory}
              className="px-12 py-4 rounded-xl bg-red-600 text-white font-bold shadow-md hover:bg-red-700 transition-all active:scale-95"
            >
              全員終了！履歴をリセット
            </button>
          ) : (
            <button
              onClick={handleDraw}
              disabled={isDrawing || (mode === "round-robin" && isAllDrawn)}
              className={`
                px-16 py-3 rounded-xl font-bold transition-all active:scale-95
                ${isFullscreen ? " bg-indigo-600 hover:bg-indigo-700 text-white text-3xl px-12 py-4 rounded-3xl shadow-2xl" : "bg-indigo-600 text-white text-2xl shadow-md shadow-indigo-100 hover:bg-indigo-700"}
                disabled:opacity-0 disabled:pointer-events-none
              `}
            >
              {isDrawing ? "抽選中..." : "抽選する"}
            </button>
          )}
        </div>

        {isFullscreen && (
          <button
            onClick={() => setIsFullscreen(false)}
            className="absolute top-8 right-8 text-slate-400 hover:text-slate-700 transition-colors"
            aria-label="全画面モードを終了"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="48"
              height="48"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        )}
      </div>

      {/* 3. 情報セクション (ManagePanel のサイドバー/リストスタイル) */}
      <div className="grid md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <h3 className="text-sm font-bold text-slate-500 uppercase mb-4 border-b border-slate-50 pb-2">
            現在の進捗
          </h3>
          <div className="flex justify-between items-end mb-2">
            <span className="text-4xl font-bold text-slate-900">
              {currentClassNominations.length}
              <small className="text-slate-400 text-lg ml-1">
                /{selectedClass?.items.length || 0}
              </small>
            </span>
            <span className="text-indigo-600 font-bold">
              {Math.round(
                (currentClassNominations.length /
                  (selectedClass?.items.length || 1)) *
                  100,
              )}
              %
            </span>
          </div>
          <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
            <div
              className="bg-indigo-600 h-full transition-all duration-700"
              style={{
                width: `${(currentClassNominations.length / (selectedClass?.items.length || 1)) * 100}%`,
              }}
            ></div>
          </div>
        </div>

        <div className="md:col-span-2 bg-white rounded-2xl shadow-sm border border-slate-200 flex flex-col overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
            <h3 className="text-sm font-bold text-slate-800 uppercase">
              当選履歴
            </h3>
            <button
              onClick={handleClearHistory}
              disabled={nominations.length === 0}
              className="text-[10px] font-bold text-red-500 hover:bg-red-50 px-3 py-1 rounded-full transition-colors"
            >
              履歴をクリア
            </button>
          </div>
          <div className="p-4 flex flex-wrap gap-2 overflow-y-auto max-h-[160px]">
            {nominations.length === 0 ? (
              <p className="w-full text-center py-8 text-slate-400 text-sm italic">
                履歴はありません
              </p>
            ) : (
              nominations.map((nom, i) => (
                <div
                  key={nom.id}
                  className="bg-slate-50 px-4 py-2 rounded-xl border border-slate-100 flex items-center gap-2"
                >
                  <span className="text-[10px] text-slate-400 font-bold">
                    #{nominations.length - i}
                  </span>
                  <span className="font-medium text-slate-700 text-sm">
                    {nom.itemName}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
