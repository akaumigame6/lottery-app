import { useEffect, useState } from "react";
import * as lotteryDB from "../lottery-db";
import type { Group } from "../lottery-db";

/**
 * ManagePanel: グループ名簿を管理するためのコンポーネント
 *
 * 機能:
 * - グループの作成・一覧表示
 * - グループ名の編集
 * - メンバーの一括登録（テキストエリア方式: 1行1名）
 * - グループの削除
 *
 * デザインコンセプト:
 * - クリーンでモダンな配色
 * - インタラクティブなホバー効果
 * - グラスモルフィズム要素を取り入れたプレミアムな外観
 */
export default function ManagePanel() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // 編集用の一時的な状態
  const [editName, setEditName] = useState("");
  const [editItemsText, setEditItemsText] = useState("");
  const [editLotteryMessage, setEditLotteryMessage] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // 初回読み込み
  useEffect(() => {
    loadGroups();
  }, []);

  // グループが選択されたときに、編集用テキストを同期する
  useEffect(() => {
    if (selectedGroupId) {
      const selected = groups.find((g) => g.id === selectedGroupId);
      if (selected) {
        setEditName(selected.name);
        setEditItemsText(selected.items.join("\n"));
        setEditLotteryMessage(selected.lotteryMessage ?? "");
        setIsEditing(true);
      }
    } else {
      // 新規作成モード
      setEditName("");
      setEditItemsText("");
      setEditLotteryMessage("");
      setIsEditing(false);
    }
  }, [selectedGroupId, groups]);

  // IndexedDBからグループ一覧を取得
  const loadGroups = async () => {
    try {
      setIsLoading(true);
      await lotteryDB.openDB();
      const data = await lotteryDB.getAllGroups();
      setGroups(data);
    } catch (error) {
      console.error("データの読み込みに失敗しました:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // 保存（新規または更新）
  const handleSave = async () => {
    if (isSaving) return; // 二重保存防止
    if (!editName.trim()) {
      alert("グループ名を入力してください");
      return;
    }

    const items = editItemsText
      .split("\n")
      .map((s) => s.trim())
      .filter((s) => s !== "");

    try {
      setIsSaving(true);
      if (isEditing && selectedGroupId !== null) {
        // 更新
        await lotteryDB.updateGroup(selectedGroupId, {
          name: editName,
          items: items,
          lotteryMessage: editLotteryMessage,
        });
      } else {
        // 新規追加
        const newId = await lotteryDB.addGroup({
          name: editName,
          items: items,
          lotteryMessage: editLotteryMessage,
        });
        // 成功したら新しく作成されたグループを選択状態にする（型キャストが必要な場合もあるが、DB側で返されるIDを使用）
        if (typeof newId === "number") {
          setSelectedGroupId(newId);
        }
      }
      await loadGroups();
      alert("保存しました");
    } catch (error) {
      console.error("保存に失敗しました:", error);
      // ConstraintError の場合は別のメッセージを表示
      if (error instanceof Error && error.name === "ConstraintError") {
        alert("グループ名が既に存在します。別のグループ名を入力してください");
      } else {
        alert("保存中にエラーが発生しました");
      }
    } finally {
      setIsSaving(false);
    }
  };

  // 削除
  const handleDelete = async (id: number) => {
    if (isSaving) return; // 二重操作防止
    if (!confirm("本当にこのグループを削除しますか？")) return;

    try {
      setIsSaving(true);
      await lotteryDB.deleteGroup(id);
      if (selectedGroupId === id) {
        setSelectedGroupId(null);
      }
      await loadGroups();
    } catch (error) {
      console.error("削除に失敗しました:", error);
    } finally {
      setIsSaving(false);
    }
  };

  // 新規追加モードへ
  const switchToNew = () => {
    setSelectedGroupId(null);
    setEditName("");
    setEditItemsText("");
    setEditLotteryMessage("");
    setIsEditing(false);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto p-6 bg-slate-50 min-h-screen">
      <div className="flex flex-col md:flex-row gap-8">
        {/* 左側：グループ一覧サイドバー */}
        <aside className="tour-manage-sidebar w-full md:w-1/3 bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-indigo-50/50">
            <h2 className="font-bold text-slate-800">グループ一覧</h2>
            <button
              onClick={switchToNew}
              className="text-xs bg-indigo-600 text-white px-2 py-1 rounded-md hover:bg-indigo-700 transition-colors"
            >
              新規作成
            </button>
          </div>
          <div className="divide-y divide-slate-100 max-h-[500px] overflow-y-auto">
            {groups.length === 0 ? (
              <p className="p-8 text-center text-slate-400 text-sm">
                登録されているグループはありません
              </p>
            ) : (
              groups.map((group) => (
                <div
                  key={group.id}
                  onClick={() => setSelectedGroupId(group.id)}
                  className={`group p-4 cursor-pointer transition-all flex justify-between items-center ${
                    selectedGroupId === group.id
                      ? "bg-indigo-50 border-r-4 border-indigo-600"
                      : "hover:bg-slate-50"
                  }`}
                >
                  <div>
                    <div className="font-medium text-slate-900">
                      {group.name}
                    </div>
                    <div className="text-xs text-slate-500">
                      {group.items.length} 名登録
                    </div>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(group.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 p-1.5 text-slate-400 hover:text-red-600 transition-all"
                    title="削除"
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
                      <path d="M3 6h18" />
                      <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                      <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                      <line x1="10" y1="11" x2="10" y2="17" />
                      <line x1="14" y1="11" x2="14" y2="17" />
                    </svg>
                  </button>
                </div>
              ))
            )}
          </div>
        </aside>

        {/* 右側：編集パネル */}
        <main className="tour-manage-form flex-1 bg-white rounded-2xl shadow-lg border border-slate-200 p-6 md:p-8">
          <header className="mb-6">
            <h1 className="text-2xl font-bold text-slate-900">
              {isEditing ? "グループの編集" : "新しいグループを作成"}
            </h1>
            <p className="text-slate-500 text-sm mt-1">
              グループ名と名簿を入力して保存ボタンを押してください。
            </p>
          </header>

          <div className="space-y-6">
            {/* グループ名入力 */}
            <div className="tour-manage-group-name-section">
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                グループ名
              </label>
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="例: 営業部, 開発チームA"
                className="tour-manage-group-name w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-4 focus:ring-indigo-100 focus:border-indigo-600 outline-none transition-all"
              />
            </div>

            {/* 抽選後メッセージ入力 */}
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                抽選後メッセージ (オプション)
              </label>
              <input
                type="text"
                value={editLotteryMessage}
                onChange={(e) => setEditLotteryMessage(e.target.value)}
                placeholder="例: おめでとうございます！"
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-4 focus:ring-indigo-100 focus:border-indigo-600 outline-none transition-all"
              />
              <p className="mt-2 text-xs text-slate-400">
                ヒント:
                未入力の場合は「おめでとうございます！」、半角・全角スペースのみの場合は何も表示しません。
              </p>
            </div>

            {/* 名簿入力（一括登録） */}
            <div className="tour-manage-members-section">
              <div className="flex justify-between items-end mb-2">
                <label className="block text-sm font-semibold text-slate-700">
                  名簿（1行に1人）
                </label>
                <span className="text-xs text-slate-400">
                  {editItemsText.split("\n").filter((s) => s.trim()).length} 名
                </span>
              </div>
              <textarea
                value={editItemsText}
                onChange={(e) => setEditItemsText(e.target.value)}
                placeholder="Excelなどから名前のリストをコピーして貼り付けてください。"
                rows={12}
                className="tour-manage-members w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-4 focus:ring-indigo-100 focus:border-indigo-600 outline-none transition-all resize-none font-mono text-sm leading-relaxed"
              />
              <p className="mt-2 text-xs text-slate-400">
                ヒント:
                各行が1つの抽選対象になります。空行は自動的に除外されます。
              </p>
            </div>

            {/* 操作ボタン */}
            <div className="flex justify-end gap-3 pt-4">
              {isEditing && (
                <button
                  onClick={switchToNew}
                  disabled={isSaving}
                  className="px-6 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-medium hover:bg-slate-50 transition-colors"
                >
                  キャンセル
                </button>
              )}
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="tour-manage-save px-8 py-2.5 rounded-xl bg-indigo-600 text-white font-bold shadow-md shadow-indigo-200 hover:bg-indigo-700 hover:shadow-lg hover:-translate-y-0.5 transition-all active:translate-y-0"
              >
                {isSaving
                  ? "保存中..."
                  : isEditing
                    ? "変更を保存"
                    : "作成して保存"}
              </button>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
