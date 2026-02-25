import { useEffect, useState } from "react";
import { addPerson, getAllPeople, deletePerson, updatePerson, openDB } from "./db";
import type { Person } from "./db";

export default function App() {
  const [name, setName] = useState("");
  const [people, setPeople] = useState<Person[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState("");

  const load = async () => {
    const data = await getAllPeople();
    setPeople(data);
  };

  useEffect(() => {
    let mounted = true; // マウントチェック用

    const safeLoad = async () => {
      // DB を開いてから読み込む（openDB は複数回呼んでも問題ない）
      await openDB();
      const data = await getAllPeople();
      if (mounted) setPeople(data); // アンマウント済みなら setState しない
    };

    safeLoad();

    return () => {
      mounted = false;
    };
  }, []);

  const add = async () => {
    if (!name.trim()) return;
    await addPerson(name);
    setName("");
    await load();
  };

  const startEdit = (p: Person) => {
    setEditingId(p.id);
    setEditingName(p.name);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditingName("");
  };

  const saveEdit = async () => {
    if (editingId == null) return;
    if (!editingName.trim()) return;
    await updatePerson({ id: editingId, name: editingName });
    cancelEdit();
    await load();
  };

  const remove = async (id: number) => {
    await deletePerson(id);
    // 編集中のアイテムを削除した場合は編集状態を解除
    if (editingId === id) cancelEdit();
    await load();
  };

  return (
    <div style={{ padding: 20, fontFamily: "sans-serif" }}>
      <h1>IndexedDB Sample</h1>

      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="名前を入力"
        style={{ padding: 6 }}
      />
      <button onClick={add} style={{ marginLeft: 8 }}>
        保存
      </button>

      <h2>保存された一覧</h2>
      <ul>
        {people.map((p) => (
          <li key={p.id} style={{ marginBottom: 8 }}>
            {editingId === p.id ? (
              <>
                <input
                  value={editingName}
                  onChange={(e) => setEditingName(e.target.value)}
                  style={{ padding: 6 }}
                />
                <button onClick={saveEdit} style={{ marginLeft: 8 }}>
                  保存
                </button>
                <button onClick={cancelEdit} style={{ marginLeft: 8 }}>
                  キャンセル
                </button>
              </>
            ) : (
              <>
                <span>{p.name}</span>
                <button onClick={() => startEdit(p)} style={{ marginLeft: 8 }}>
                  編集
                </button>
                <button onClick={() => remove(p.id)} style={{ marginLeft: 8 }}>
                  削除
                </button>
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
