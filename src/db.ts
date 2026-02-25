// src/db.ts

// src/db.ts
// 軽量な IndexedDB ラッパー
// このファイルはブラウザの IndexedDB を使って "people" オブジェクトストアを管理します。
// 概要:
// - openDB(): データベースを開き、必要なら onupgradeneeded で object store を作成する
// - addPerson(name): トランザクション (readwrite) を使って新規レコードを追加する
// - getAllPeople(): object store から全レコードを取得する
//
// 実装ノート:
// - IndexedDB の API はイベントベース（onsuccess/onerror）なので、Promise でラップして await しやすくしている
// - データベースのバージョン管理（ここでは 1）により schema の変更時に onupgradeneeded が呼ばれる
// - object store は keyPath: "id" と autoIncrement: true を持つため、追加時に id を自動付与する

export type Person = {
  // object store のレコードの形。autoIncrement により id は自動生成されるが、型としては number を持つ
  id: number;
  name: string;
};

let db: IDBDatabase | null = null;

/**
 * データベースを開く。
 * - 既に開かれていればその DB を返す（キャッシュはこの実装では行っていないが、`db` に保存することで再利用している）
 * - 初回またはバージョン違いの場合、onupgradeneeded でスキーマ（object store）を作成する
 *
 * 注意点:
 * - indexedDB.open(name, version) の version を上げると onupgradeneeded が呼ばれ、スキーマ変更を行える
 * - 複数のタブで同じ DB に対して upgrade が走ると一時的にブロッキングが発生する可能性がある
 */
export async function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("SampleDB", 1);

    // データベースのスキーマを作る / 更新するハンドラ
    req.onupgradeneeded = (event) => {
      const database = (event.target as IDBOpenDBRequest).result;

      // object store 作成: "people"
      // keyPath: "id" を指定するとオブジェクトの `id` プロパティがキーとして使われる
      // autoIncrement: true にするとキーは自動的にインクリメントされる
      if (!database.objectStoreNames.contains("people")) {
        database.createObjectStore("people", { keyPath: "id", autoIncrement: true });
      }
    };

    // 成功時に db をキャッシュして返す
    req.onsuccess = () => {
      db = req.result;
      resolve(db);
    };

    // 開けなかった場合はエラーで reject
    req.onerror = () => reject(req.error);
  });
}

/**
 * 名前を持つ Person を追加する
 * - トランザクションを開始して書き込み（readwrite）を行う
 * - トランザクション完了で resolve、トランザクションエラーで reject
 *
 * エッジケース / 注意:
 * - `db` が未初期化（openDB を呼んでいない）なら即座に reject する
 * - store.add() は成功時に自動的に id を付与する（autoIncrement が有効なため）
 */
export function addPerson(name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!db) return reject("DB not opened");

    // トランザクションを作る。書き込みなので "readwrite"
    const tx = db.transaction("people", "readwrite");
    const store = tx.objectStore("people");

    // add は非同期（成功/失敗はトランザクションのイベントで受け取ることが一般的）
    store.add({ name });

    // トランザクション全体が完了したら resolve
    tx.oncomplete = () => resolve();
    // トランザクションでエラーが起きたら reject（詳細は tx.error を参照）
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * 全ての Person を取得する
 * - getAll() を使って全レコードを取得
 * - データ量が多い場合はカーソルを使う方法（store.openCursor()）の方が良い
 */
export function getAllPeople(): Promise<Person[]> {
  return new Promise((resolve, reject) => {
    if (!db) return reject("DB not opened");

    const tx = db.transaction("people", "readonly");
    const store = tx.objectStore("people");

    const req = store.getAll();

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * 指定 id のレコードを削除する
 * - delete は指定したキーのレコードを削除する
 * - トランザクション完了で resolve、エラーで reject
 */
export function deletePerson(id: number): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!db) return reject("DB not opened");

    const tx = db.transaction("people", "readwrite");
    const store = tx.objectStore("people");

    store.delete(id);

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Person レコードを更新（または存在しなければ追加）する
 * - put を使うとキーが一致すれば更新、なければ追加される（upsert）
 * - 引数は完全な Person 型を想定（少なくとも id を含むこと）
 */
export function updatePerson(person: Person): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!db) return reject("DB not opened");

    const tx = db.transaction("people", "readwrite");
    const store = tx.objectStore("people");

    store.put(person);

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
