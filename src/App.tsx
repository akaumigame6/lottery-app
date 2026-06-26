import { useState, useEffect, useMemo } from "react";
import { STATUS, EVENTS, ACTIONS, useJoyride } from "react-joyride";
import type { Step, Props, Events } from "react-joyride";
import ManagePanel from "./components/ManagePanel";
import LotteryPanel from "./components/LotteryPanel";
import { getAllGroups, insertDummyData } from "./lottery-db";

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
  const [isDrawing, setIsDrawing] = useState(false);

  // チュートリアル用の状態
  const [runTour, setRunTour] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);

  const baseProps = useMemo(
    () =>
      ({
        continuous: true,
        options: {
          buttons: ["back", "close", "primary", "skip"],
          showProgress: true,
          skipScroll: true,
          primaryColor: "#4f46e5",
          zIndex: 1000,
        },
        locale: {
          back: "戻る",
          close: "閉じる",
          last: "完了",
          next: "次へ",
          skip: "スキップ",
        },
      }) satisfies Omit<Props, "steps">,
    [],
  );

  const { Tour } = useJoyride({
    ...baseProps,
    run: runTour,
    stepIndex,
    steps: [
      // ===== 1. ナビゲーション説明 =====
      {
        target: ".tour-app-title",
        content:
          "LOTTERY APP へようこそ！このアプリは、グループ内から人をランダムに抽選できます。簡単な使い方をご案内します。",
        skipBeacon: true,
        placement: "bottom",
      },
      {
        target: ".tour-tabs",
        content:
          "このタブで画面を切り替えます。まずは「グループ管理」から、抽選したい名簿を登録しましょう。",
        skipBeacon: true,
        placement: "bottom",
      },

      // ===== 2. グループ管理セクション詳細 =====
      {
        target: ".tour-manage-tab",
        content: "「グループ管理」をクリックして移動します。",
        skipBeacon: true,
        placement: "bottom",
      },
      {
        target: ".tour-manage-form",
        content:
          "こちらが新しいグループを作成するフォームです。グループ名と名簿を入力します。",
        skipBeacon: true,
        placement: "left",
      },
      {
        target: ".tour-manage-group-name-section",
        content:
          "まずグループ名を入力します。例えば「営業部」「開発チームA」など、何でもいいです。",
        skipBeacon: true,
        placement: "top",
      },
      {
        target: ".tour-manage-members-section",
        content:
          "次に、抽選の対象となる人の名前を、1行に1人ずつ入力します。Excelから名前をコピーして貼り付けることもできます。",
        skipBeacon: true,
        placement: "top",
      },
      {
        target: ".tour-manage-save",
        content: "入力が完了したら、このボタンを押して保存します。",
        skipBeacon: true,
        placement: "top",
      },
      {
        target: ".tour-manage-sidebar",
        content:
          "保存したグループはここのリストに表示されます。既存のグループをクリックすると、編集することができます。",
        skipBeacon: true,
        placement: "right",
      },

      // ===== 3. 抽選セクション詳細 =====
      {
        target: ".tour-lottery-tab",
        content: "グループ管理が終わったら、「抽選」タブに移動します。",
        skipBeacon: true,
        placement: "bottom",
      },
      {
        target: ".tour-lottery-group-select",
        content: "このドロップダウンから、抽選したいグループを選択します。",
        skipBeacon: true,
        placement: "bottom",
      },
      {
        target: ".tour-lottery-mode-section",
        content:
          "ここで抽選のモードを選べます。「ランダム」は毎回ランダムに、「一巡モード」は全員が1回ずつ抽選されるまで繰り返します。",
        skipBeacon: true,
        placement: "bottom",
      },
      {
        target: ".tour-draw-button",
        content: "最後にこのボタンを押すと、抽選がスタートします！",
        skipBeacon: true,
        placement: "top",
      },
      {
        target: ".tour-lottery-result",
        content:
          "ここに抽選の結果が表示されます。大きく画面に表示されるので、みんなに見えやすいです。",
        skipBeacon: true,
        placement: "bottom",
        overlayClickAction: "replay",
      },
    ],
    onEvent: (data) => {
      const { status, action, index, type } = data;

      if (([STATUS.FINISHED, STATUS.SKIPPED] as string[]).includes(status)) {
        setRunTour(false);
        setStepIndex(0);
        localStorage.setItem("tutorialCompleted", "true");
        setActiveTab("lottery"); // 終了時はLotteryタブに戻す
      } else if (
        ([EVENTS.STEP_AFTER, EVENTS.TARGET_NOT_FOUND] as Events[]).includes(
          type as Events,
        )
      ) {
        const isPrevious = action === ACTIONS.PREV;
        const nextStepIndex = index + (isPrevious ? -1 : 1);

        // --- タブを跨ぐための制御 ---
        // Step 1 -> 2 (Manageタブへ)
        if (index === 1 && !isPrevious) {
          setActiveTab("manage");
        }
        // Step 2 -> 1 (Lotteryタブへ戻る)
        else if (index === 2 && isPrevious) {
          setActiveTab("lottery");
        }
        // Step 7 -> 8 (Manageタブのまま)
        // Step 8 -> 9 (Lotteryタブへ進む)
        else if (index === 8 && !isPrevious) {
          setActiveTab("lottery");
        }
        // Step 9 -> 8 (Manageタブへ戻る)
        else if (index === 9 && isPrevious) {
          setActiveTab("manage");
        }

        setStepIndex(nextStepIndex);
      }
    },
  });

  // 初回起動時のダミーデータ挿入＆ツアー開始ロジック
  useEffect(() => {
    const checkTutorialStatus = async () => {
      const hasSeenTutorial = localStorage.getItem("tutorialCompleted");
      if (!hasSeenTutorial) {
        // 初回訪問時
        const groups = await getAllGroups();
        if (groups.length === 0) {
          await insertDummyData();
          // ダミーデータ挿入後、LotteryPanel を再マウントさせて
          // グループ一覧を確実に反映してからツアーを開始する
          setActiveTab("manage");
          setTimeout(() => {
            setActiveTab("lottery");
            setRunTour(true);
          }, 100);
          return;
        }
        setRunTour(true);
      }
    };
    checkTutorialStatus();
  }, []);

  // 手動でチュートリアルを開始する関数
  const startTutorialManually = async () => {
    const groups = await getAllGroups();
    // もしグループが0件なら、チュートリアルのためにダミーデータを再挿入する
    if (groups.length === 0) {
      await insertDummyData();
      setActiveTab("manage");
      setTimeout(() => setActiveTab("lottery"), 100);
    }
    setStepIndex(0);
    setRunTour(true);
  };

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
            <button
              onClick={() => setActiveTab("lottery")}
              className="tour-app-title"
            >
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

            <div className="flex items-center gap-4">
              {/* チュートリアル再開ボタン */}
              <button
                onClick={startTutorialManually}
                className="text-sm font-bold text-slate-400 hover:text-indigo-500 transition-colors flex items-center gap-1"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="12" cy="12" r="10"></circle>
                  <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path>
                  <line x1="12" y1="17" x2="12.01" y2="17"></line>
                </svg>
                使い方
              </button>

              <div className="tour-tabs flex gap-1 bg-slate-100 p-1 rounded-xl">
                <button
                  onClick={() => setActiveTab("lottery")}
                  disabled={isDrawing}
                  className={`tour-lottery-tab px-6 py-2 rounded-lg text-sm font-bold transition-all ${
                    activeTab === "lottery"
                      ? "bg-white text-indigo-600 shadow-sm"
                      : "text-slate-500 hover:text-slate-700"
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  抽選
                </button>
                <button
                  onClick={() => setActiveTab("manage")}
                  disabled={isDrawing}
                  className={`tour-manage-tab px-6 py-2 rounded-lg text-sm font-bold transition-all ${
                    activeTab === "manage"
                      ? "bg-white text-indigo-600 shadow-sm"
                      : "text-slate-500 hover:text-slate-700"
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  グループ管理
                </button>
              </div>
            </div>
          </div>
        </div>
      </nav>

      {/* React Joyride コンポーネント (v3) */}
      {Tour}

      {/* メインコンテンツ */}
      <main className="py-8">
        {activeTab === "lottery" ? (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <LotteryPanel isDrawing={isDrawing} setIsDrawing={setIsDrawing} />
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
