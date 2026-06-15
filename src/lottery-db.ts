/**
 * IndexedDBを操作するモジュール
 *
 * データベース仕様:
 * - データベース名: "NominationToolDB"
 * - バージョン: 3
 * - オブジェクトストア:
 *   - "groups": グループの管理
 *   - "nominations": 抽選履歴の管理
 */

const DB_NAME = "NominationToolDB";
const DB_VERSION = 3;
const STORE_GROUPS = "groups";
const STORE_NOMINATIONS = "nominations";

/**
 * グループ型定義
 * @typedef {Object} Group
 * @property {number} id - グループのID（自動採番）
 * @property {string} name - グループ名（ユニーク）
 * @property {string[]} items - グループに属する項目リスト
 * @property {string} [lotteryMessage] - 抽選後に表示するメッセージ
 * @property {string} createdAt - 作成日時（ISO 8601形式）
 * @property {string} updatedAt - 更新日時（ISO 8601形式）
 */
export type Group = {
  id: number;
  name: string;
  items: string[];
  lotteryMessage?: string;
  createdAt: string;
  updatedAt: string;
};

/**
 * ノミネーション型定義（抽選履歴）
 * @typedef {Object} Nominations
 * @property {number} id - ノミネーションID（自動採番）
 * @property {number} groupId - 所属するグループのID
 * @property {string} itemName - 抽選された項目名
 * @property {string} createdAt - 抽選日時（ISO 8601形式）
 */
export type Nominations = {
  id: number;
  groupId: number;
  itemName: string;
  createdAt: string;
};

let db: IDBDatabase | null = null;

/**
 * IndexedDBを開く（初回時はスキーマを自動作成）
 *
 * 初回インストール時にgroupsとnominationsのオブジェクトストアを作成します。
 * v2からv3へのマイグレーションにも対応しています。
 *
 * @returns {Promise<IDBDatabase>} 開かれたデータベースのインスタンス
 * @throws {Error} データベース接続に失敗した場合
 */
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
            nominationStore.createIndex("groupId", "groupId", {
              unique: false,
            });
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
        nominationStore.createIndex("createdAt", "createdAt", {
          unique: false,
        });
      }
    };
  });
}

/**
 * トランザクションを実行するヘルパー関数
 *
 * IndexedDBの読み取り・書き込みトランザクションを統一的に実行します。
 *
 * @private
 * @param {string} storeName - オブジェクトストア名
 * @param {IDBTransactionMode} [mode] - トランザクションモード（"readonly"または"readwrite"）
 * @param {Function} callback - ストアで実行するコールバック関数
 * @returns {Promise<unknown>} トランザクション完了時の結果
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

/**
 * 新しいグループを追加
 *
 * グループにタイムスタンプ（createdAt, updatedAt）を自動付与します。
 *
 * @param {Omit<Group, 'id' | 'createdAt' | 'updatedAt'>} groupData - グループデータ
 * @returns {Promise<IDBValidKey>} 作成されたグループのID
 */
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

/**
 * グループを更新
 *
 * updatedAtを自動更新します。id, createdAtの変更は無視されます。
 *
 * @param {number} id - グループID
 * @param {Partial<Omit<Group, 'id' | 'createdAt' | 'updatedAt'>>} updates - 更新内容
 * @returns {Promise<void>}
 */
export async function updateGroup(
  id: number,
  updates: Partial<Omit<Group, "id" | "createdAt" | "updatedAt">>,
) {
  if (!db) db = await openDB();
  return new Promise<void>((resolve, reject) => {
    const transaction = db!.transaction([STORE_GROUPS], "readwrite");
    const store = transaction.objectStore(STORE_GROUPS);
    const request = store.get(id);

    request.onsuccess = () => {
      const existingGroup = request.result;
      if (existingGroup) {
        const now = new Date().toISOString();

        // 不変フィールドの実行時フィルタリング
        const filteredUpdates = { ...updates };
        if ("id" in filteredUpdates) delete (filteredUpdates as any).id;
        if ("createdAt" in filteredUpdates)
          delete (filteredUpdates as any).createdAt;

        Object.assign(existingGroup, filteredUpdates, { updatedAt: now });
        store.put(existingGroup);
      }
    };

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(new Error("Transaction aborted"));
  });
}

// グループと関連するノミネーションの削除

/**
 * グループを削除（関連するノミネーションも削除）
 *
 * グループを削除する際に、そのグループに紐づくすべてのノミネーション（抽選履歴）も削除します。
 *
 * @param {number} id - グループID
 * @returns {Promise<void>}
 */
export async function deleteGroup(id: number) {
  if (!db) db = await openDB();

  return new Promise<void>((resolve, reject) => {
    const transaction = db!.transaction(
      [STORE_GROUPS, STORE_NOMINATIONS],
      "readwrite",
    );
    const groupStore = transaction.objectStore(STORE_GROUPS);
    const nominationStore = transaction.objectStore(STORE_NOMINATIONS);
    const cursorRequest = nominationStore
      .index("groupId")
      .openKeyCursor(IDBKeyRange.only(id));

    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result;
      if (cursor) {
        nominationStore.delete(cursor.primaryKey);
        cursor.continue();
        return;
      }

      groupStore.delete(id);
    };

    cursorRequest.onerror = () => reject(cursorRequest.error);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(new Error("Transaction aborted"));
  });
}

// 全グループの取得

/**
 * すべてのグループを取得
 *
 * @returns {Promise<Group[]>} すべてのグループの配列
 */
export async function getAllGroups(): Promise<Group[]> {
  return _executeTransaction(STORE_GROUPS, "readonly", (store) => {
    return store.getAll();
  }) as Promise<Group[]>;
}

// グループIDでグループを検索

/**
 * グループをIDで検索
 *
 * @param {number} id - グループID
 * @returns {Promise<Group|undefined>} 見つかったグループ、見つからない場合はundefined
 */
export async function findGroupById(id: number): Promise<Group | undefined> {
  return _executeTransaction(STORE_GROUPS, "readonly", (store) => {
    return store.get(id);
  }) as Promise<Group | undefined>;
}

// グループ名でグループを検索

/**
 * グループを名前で検索（インデックス利用）
 *
 * グループ名はユニークなため、結果は最大1件です。
 *
 * @param {string} name - グループ名
 * @returns {Promise<Group[]>} マッチしたグループの配列
 */
export async function findGroupsByName(name: string): Promise<Group[]> {
  return _executeTransaction(STORE_GROUPS, "readonly", (store) => {
    const index = store.index("name");
    const request = index.getAll(IDBKeyRange.only(name));
    return request;
  }) as Promise<Group[]>;
}

// =============ノミネーション関連の操作=============

/**
 * ノミネーション（抽選履歴）を追加
 *
 * createdAtを自動付与します。
 *
 * @param {Omit<Nominations, 'id' | 'createdAt'>} nominationData - ノミネーションデータ
 * @returns {Promise<IDBValidKey>} 作成されたノミネーションのID
 */
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

/**
 * ノミネーションを更新
 *
 * id, createdAtの変更は無視されます。
 *
 * @param {number} id - ノミネーションID
 * @param {Partial<Omit<Nominations, 'id' | 'createdAt'>>} updates - 更新内容
 * @returns {Promise<void>}
 */
export async function updateNomination(
  id: number,
  updates: Partial<Omit<Nominations, "id" | "createdAt">>,
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

        // 不変フィールドの実行時フィルタリング
        const filteredUpdates = { ...updates };
        if ("id" in filteredUpdates) delete (filteredUpdates as any).id;
        if ("createdAt" in filteredUpdates)
          delete (filteredUpdates as any).createdAt;

        Object.assign(existingNomination, filteredUpdates);
        store.put(existingNomination);
      }
    };

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(new Error("Transaction aborted"));
  });
}

// ノミネーションの削除

/**
 * ノミネーションを削除
 *
 * @param {number} id - ノミネーションID
 * @returns {Promise<IDBValidKey>} 削除したキー
 */
export async function deleteNomination(id: number) {
  return _executeTransaction(STORE_NOMINATIONS, "readwrite", (store) => {
    return store.delete(id);
  });
}

// 全ノミネーションの取得

/**
 * すべてのノミネーションを取得
 *
 * @returns {Promise<Nominations[]>} すべてのノミネーションの配列
 */
export async function getAllNominations(): Promise<Nominations[]> {
  return _executeTransaction(STORE_NOMINATIONS, "readonly", (store) => {
    return store.getAll();
  }) as Promise<Nominations[]>;
}

// グループIDでノミネーションを検索

/**
 * グループIDでノミネーションを検索
 *
 * 指定されたグループに紐づくすべての抽選履歴を取得します。
 *
 * @param {number} groupId - グループID
 * @returns {Promise<Nominations[]>} マッチしたノミネーションの配列
 */
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

/**
 * 日付でノミネーションを検索
 *
 * 指定された日付（YYYY-MM-DD形式）の全抽選履歴を取得します。
 *
 * @param {string} date - 検索日付（YYYY-MM-DD形式）
 * @returns {Promise<Nominations[]>} マッチしたノミネーションの配列
 */
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

/**
 * グループIDでノミネーションを一括削除
 *
 * 指定されたグループに紐づくすべての抽選履歴を削除します。
 *
 * @param {number} groupId - グループID
 * @returns {Promise<void>}
 */
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
