// IndexedDBを操作するモジュール
// - データベース名: "NominationToolDB"
// - バージョン: 3
// - オブジェクトストア:
//   - "groups": { id, name, items(カンマ区切り文字列), createdAt, updatedAt }
//   - "nominations": { id, groupId, itemName, createdAt }

// 主要な関数
// openDB()…IndexedDB「NominationToolDB」を開く。初回時にスキーマ（groups, nominations）を作成
// _executeTransaction()…トランザクション実行のヘルパー関数。readwrite/readonlyモード対応

// グループ関連の操作
// 関数名	役割
// addGroup(groupData)	新しいグループを追加。タイムスタンプ自動付与
// updateGroup(id, updates)	グループを更新。updatedAtを自動更新
// deleteGroup(id)	グループを削除
// getAllGroups()	全グループを取得
// findGroupById(id)	IDでグループを検索
// findGroupsByName(name)	名前でグループを検索（インデックス利用）

// ノミネーション関連の操作
// 関数名	役割
// addNomination(nominationData)	ノミネーションを追加。createdAt自動付与
// updateNomination(id, updates)	ノミネーションを更新
// deleteNomination(id)	ノミネーションを削除
// getAllNominations()	全ノミネーションを取得
// findNominationsByGroupId(groupId)	グループIDでノミネーションを検索
// findNominationsByDate(date)	日付でノミネーションを検索

const DB_NAME = "NominationToolDB";
const DB_VERSION = 3;
const STORE_GROUPS = "groups";
const STORE_NOMINATIONS = "nominations";

export type Group = {
  id: number;
  name: string;
  items: string[]; // カンマ区切りの文字列 (例)"aaa,bbb,ccc" "aaa,bbb"など
  lotteryMessage?: string; // 抽選後のメッセージ
  createdAt: string;
  updatedAt: string;
};

export type Nominations = {
  id: number;
  groupId: number;
  itemName: string;
  createdAt: string;
};

let db: IDBDatabase | null = null;

export async function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    // 成功時に db をキャッシュして返す
    req.onsuccess = () => {
      db = req.result;
      resolve(db);
    };

    // 開けなかった場合はエラーで reject
    req.onerror = () => reject(req.error);

    // データベースのスキーマを作る / 更新するハンドラ
    req.onupgradeneeded = (event) => {
      const database = (event.target as IDBOpenDBRequest).result;
      const transaction = (event.target as IDBOpenDBRequest).transaction!;
      const oldVersion = event.oldVersion;

      // ====== 1. groups ストアの作成 ======
      let groupStore: IDBObjectStore;
      if (!database.objectStoreNames.contains(STORE_GROUPS)) {
        groupStore = database.createObjectStore(STORE_GROUPS, {
          keyPath: "id",
          autoIncrement: true,
        });
        groupStore.createIndex("name", "name", { unique: true });
      } else {
        groupStore = transaction.objectStore(STORE_GROUPS);
      }

      // ====== 2. v2からv3へのマイグレーション（データ移行） ======
      if (oldVersion > 0 && oldVersion < 3) {
        // (A) classes ストアのデータを groups ストアにコピー
        if (database.objectStoreNames.contains("classes")) {
          const oldClassStore = transaction.objectStore("classes");
          oldClassStore.openCursor().onsuccess = (e) => {
            const cursor = (e.target as IDBRequest<IDBCursorWithValue>).result;
            if (cursor) {
              groupStore.add(cursor.value);
              cursor.continue();
            }
          };
        }

        // (B) nominations ストアの classId を groupId に置換し、インデックスを張り替える
        if (database.objectStoreNames.contains(STORE_NOMINATIONS)) {
          const nominationStore = transaction.objectStore(STORE_NOMINATIONS);
          
          if (nominationStore.indexNames.contains("classId")) {
            nominationStore.deleteIndex("classId");
          }
          if (!nominationStore.indexNames.contains("groupId")) {
            nominationStore.createIndex("groupId", "groupId", { unique: false });
          }

          nominationStore.openCursor().onsuccess = (e) => {
            const cursor = (e.target as IDBRequest<IDBCursorWithValue>).result;
            if (cursor) {
              const record = cursor.value;
              if (record.classId !== undefined) {
                record.groupId = record.classId;
                delete record.classId;
                cursor.update(record);
              }
              cursor.continue();
            }
          };
        }
      }

      // ====== 3. nominations ストアの新規作成 (初回インストール時) ======
      if (!database.objectStoreNames.contains(STORE_NOMINATIONS)) {
        const nominationStore = database.createObjectStore(STORE_NOMINATIONS, {
          keyPath: "id",
          autoIncrement: true,
        });
        nominationStore.createIndex("groupId", "groupId", { unique: false });
        nominationStore.createIndex("createdAt", "createdAt", { unique: false });
      }
    };
  });
}

/**
 * トランザクションを実行するヘルパー関数
 */
async function _executeTransaction(
  storeName: string,
  mode: IDBTransactionMode | undefined,
  callback: (store: IDBObjectStore) => IDBRequest,
) {
  if (!db) {
    db = await openDB(); // DBが開かれていない場合は開く
  }

  return new Promise((resolve, reject) => {
    const transaction = db!.transaction([storeName], mode ?? "readonly");
    const store = transaction.objectStore(storeName);

    const request = callback(store);
    let result: unknown;
    request.onsuccess = () => {
      result = request.result;
    };
    transaction.oncomplete = () => resolve(result);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("Transaction aborted"));
    request.onerror = () => reject(request.error);
  });
}

// =============グループ関連の操作=============
// グループの追加
export async function addGroup(
  groupData: Omit<Group, "id" | "createdAt" | "updatedAt">,
) {
  const now = new Date().toISOString();
  const groupWithTimestamps = {
    ...groupData,
    createdAt: now,
    updatedAt: now,
  };

  return _executeTransaction(STORE_GROUPS, "readwrite", (store) => {
    return store.add(groupWithTimestamps);
  });
}

// グループの更新
export async function updateGroup(id: number, updates: Partial<Group>) {
  if (!db) db = await openDB();
  return new Promise<void>((resolve, reject) => {
    const transaction = db!.transaction([STORE_GROUPS], "readwrite");
    const store = transaction.objectStore(STORE_GROUPS);
    const request = store.get(id);

    request.onsuccess = () => {
      const existingGroup = request.result;
      if (existingGroup) {
        const now = new Date().toISOString();
        Object.assign(existingGroup, { ...updates, updatedAt: now });
        store.put(existingGroup);
      }
    };

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(new Error("Transaction aborted"));
  });
}

// グループの削除
export async function deleteGroup(id: number) {
  await deleteNominationsByGroupId(id);
  return _executeTransaction(STORE_GROUPS, "readwrite", (store) => {
    return store.delete(id);
  });
}

// 全グループの取得
export async function getAllGroups(): Promise<Group[]> {
  return _executeTransaction(STORE_GROUPS, "readonly", (store) => {
    return store.getAll();
  }) as Promise<Group[]>;
}

// グループIDでグループを検索
export async function findGroupById(id: number): Promise<Group | undefined> {
  return _executeTransaction(STORE_GROUPS, "readonly", (store) => {
    return store.get(id);
  }) as Promise<Group | undefined>;
}

// グループ名でグループを検索
export async function findGroupsByName(name: string): Promise<Group[]> {
  return _executeTransaction(STORE_GROUPS, "readonly", (store) => {
    const index = store.index("name");
    const request = index.getAll(IDBKeyRange.only(name));
    return request;
  }) as Promise<Group[]>;
}

// =============ノミネーション関連の操作=============
// ノミネーションの追加
export async function addNomination(
  nominationData: Omit<Nominations, "id" | "createdAt">,
) {
  const now = new Date().toISOString();
  const nominationWithTimestamp = {
    ...nominationData,
    createdAt: now,
  };

  return _executeTransaction(STORE_NOMINATIONS, "readwrite", (store) => {
    return store.add(nominationWithTimestamp);
  });
}
// ノミネーションの更新
export async function updateNomination(
  id: number,
  updates: Partial<Nominations>,
) {
  if (!db) db = await openDB();
  return new Promise<void>((resolve, reject) => {
    const transaction = db!.transaction([STORE_NOMINATIONS], "readwrite");
    const store = transaction.objectStore(STORE_NOMINATIONS);
    const request = store.get(id);

    request.onsuccess = () => {
      const existingNomination = request.result;
      if (existingNomination) {
        const now = new Date().toISOString();
        Object.assign(existingNomination, { ...updates, updatedAt: now });
        store.put(existingNomination);
      }
    };

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(new Error("Transaction aborted"));
  });
}

// ノミネーションの削除
export async function deleteNomination(id: number) {
  return _executeTransaction(STORE_NOMINATIONS, "readwrite", (store) => {
    return store.delete(id);
  });
}

// 全ノミネーションの取得
export async function getAllNominations(): Promise<Nominations[]> {
  return _executeTransaction(STORE_NOMINATIONS, "readonly", (store) => {
    return store.getAll();
  }) as Promise<Nominations[]>;
}

// グループIDでノミネーションを検索
export async function findNominationsByGroupId(
  groupId: number,
): Promise<Nominations[]> {
  return _executeTransaction(STORE_NOMINATIONS, "readonly", (store) => {
    const index = store.index("groupId");
    const request = index.getAll(IDBKeyRange.only(groupId));
    return request;
  }) as Promise<Nominations[]>;
}

// 日付でノミネーションを検索
export async function findNominationsByDate(
  date: string,
): Promise<Nominations[]> {
  return _executeTransaction(STORE_NOMINATIONS, "readonly", (store) => {
    const index = store.index("createdAt");
    // その日の開始〜終了時刻の範囲を指定
    const startOfDay = `${date}T00:00:00.000Z`;
    const endOfDay = `${date}T23:59:59.999Z`;
    const range = IDBKeyRange.bound(startOfDay, endOfDay);
    const request = index.getAll(range);
    return request;
  }) as Promise<Nominations[]>;
}
// グループIDでノミネーションを一括削除
export async function deleteNominationsByGroupId(groupId: number) {
  if (!db) {
    db = await openDB();
  }

  return new Promise<void>((resolve, reject) => {
    const transaction = db!.transaction([STORE_NOMINATIONS], "readwrite");
    const store = transaction.objectStore(STORE_NOMINATIONS);
    const index = store.index("groupId");
    const request = index.openKeyCursor(IDBKeyRange.only(groupId));

    request.onsuccess = () => {
      const cursor = request.result;
      if (cursor) {
        store.delete(cursor.primaryKey);
        cursor.continue();
      }
    };
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(new Error("Transaction aborted"));
  });
}
