// IndexedDBを操作するモジュール
// - データベース名: "NominationToolDB"
// - バージョン: 2
// - オブジェクトストア:
//   - "classes": { id, name, items(カンマ区切り文字列), createdAt, updatedAt }
//   - "nominations": { id, classId, itemName, createdAt }

// 主要な関数
// openDB()…IndexedDB「NominationToolDB」を開く。初回時にスキーマ（classes, nominations）を作成
// _executeTransaction()…トランザクション実行のヘルパー関数。readwrite/readonlyモード対応

// クラス関連の操作
// 関数名	役割
// addClass(classData)	新しいクラスを追加。タイムスタンプ自動付与
// updateClass(id, updates)	クラスを更新。updatedAtを自動更新
// deleteClass(id)	クラスを削除
// getAllClasses()	全クラスを取得
// findClassById(id)	IDでクラスを検索
// findClassesByName(name)	名前でクラスを検索（インデックス利用）

// ノミネーション関連の操作
// 関数名	役割
// addNomination(nominationData)	ノミネーションを追加。createdAt自動付与
// updateNomination(id, updates)	ノミネーションを更新
// deleteNomination(id)	ノミネーションを削除
// getAllNominations()	全ノミネーションを取得
// findNominationsByClassId(classId)	クラスIDでノミネーションを検索
// findNominationsByDate(date)	日付でノミネーションを検索

const DB_NAME = "NominationToolDB";
const DB_VERSION = 2;
const STORE_CLASSES = "classes";
const STORE_NOMINATIONS = "nominations";

export type Class = {
  id: number;
  name: string;
  items: string[]; // カンマ区切りの文字列 (例)"aaa,bbb,ccc" "aaa,bbb"など
  createdAt: string;
  updatedAt: string;
};

export type Nominations = {
  id: number;
  classId: number;
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

      let classStore: IDBObjectStore;
      if (!database.objectStoreNames.contains(STORE_CLASSES)) {
        classStore = database.createObjectStore(STORE_CLASSES, {
          keyPath: "id",
          autoIncrement: true,
        });
        // 新規作成時は最初からユニークインデックスを作成
        classStore.createIndex("name", "name", { unique: true });
      } else {
        classStore = transaction.objectStore(STORE_CLASSES);

        // v1 → v2 アップグレード時、既存のインデックスを削除して再作成
        if (oldVersion < 2 && classStore.indexNames.contains("name")) {
          classStore.deleteIndex("name");
          classStore.createIndex("name", "name", { unique: true });
        }
      }

      if (!database.objectStoreNames.contains(STORE_NOMINATIONS)) {
        const nominationStore = database.createObjectStore(STORE_NOMINATIONS, {
          keyPath: "id",
          autoIncrement: true,
        });
        nominationStore.createIndex("classId", "classId", { unique: false });
        nominationStore.createIndex("createdAt", "createdAt", {
          unique: false,
        });
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

// =============クラス関連の操作=============
// クラスの追加
export async function addClass(
  classData: Omit<Class, "id" | "createdAt" | "updatedAt">,
) {
  const now = new Date().toISOString();
  const classWithTimestamps = {
    ...classData,
    createdAt: now,
    updatedAt: now,
  };

  return _executeTransaction(STORE_CLASSES, "readwrite", (store) => {
    return store.add(classWithTimestamps);
  });
}

// クラスの更新
export async function updateClass(id: number, updates: Partial<Class>) {
  if (!db) db = await openDB();
  return new Promise<void>((resolve, reject) => {
    const transaction = db!.transaction([STORE_CLASSES], "readwrite");
    const store = transaction.objectStore(STORE_CLASSES);
    const request = store.get(id);

    request.onsuccess = () => {
      const existingClass = request.result;
      if (existingClass) {
        const now = new Date().toISOString();
        Object.assign(existingClass, { ...updates, updatedAt: now });
        store.put(existingClass);
      }
    };

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(new Error("Transaction aborted"));
  });
}

// クラスの削除
export async function deleteClass(id: number) {
  await deleteNominationsByClassId(id);
  return _executeTransaction(STORE_CLASSES, "readwrite", (store) => {
    return store.delete(id);
  });
}

// 全クラスの取得
export async function getAllClasses(): Promise<Class[]> {
  return _executeTransaction(STORE_CLASSES, "readonly", (store) => {
    return store.getAll();
  }) as Promise<Class[]>;
}

// クラスIDでクラスを検索
export async function findClassById(id: number): Promise<Class | undefined> {
  return _executeTransaction(STORE_CLASSES, "readonly", (store) => {
    return store.get(id);
  }) as Promise<Class | undefined>;
}

// クラス名でクラスを検索
export async function findClassesByName(name: string): Promise<Class[]> {
  return _executeTransaction(STORE_CLASSES, "readonly", (store) => {
    const index = store.index("name");
    const request = index.getAll(IDBKeyRange.only(name));
    return request;
  }) as Promise<Class[]>;
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

// クラス名でノミネーションを検索
export async function findNominationsByClassId(
  classId: number,
): Promise<Nominations[]> {
  return _executeTransaction(STORE_NOMINATIONS, "readonly", (store) => {
    const index = store.index("classId");
    const request = index.getAll(IDBKeyRange.only(classId));
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
// クラスIDでノミネーションを一括削除
export async function deleteNominationsByClassId(classId: number) {
  if (!db) {
    db = await openDB();
  }

  return new Promise<void>((resolve, reject) => {
    const transaction = db!.transaction([STORE_NOMINATIONS], "readwrite");
    const store = transaction.objectStore(STORE_NOMINATIONS);
    const index = store.index("classId");
    const request = index.openKeyCursor(IDBKeyRange.only(classId));

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
