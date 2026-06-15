import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";
import tailwindcss from "@tailwindcss/vite";

// https://vite.dev/config/
export default defineConfig(() => {
  // ① コマンドから渡された環境変数をチェック
  const isLocalBuild = process.env.BUILD_TARGET === "local";
  return {
    // ② リポジトリ名に合わせてbaseを変更する（先頭と末尾の / を忘れないように注意！）
    base: isLocalBuild ? "./" : "/lottery-app/",
    plugins: [
      react(),
      tailwindcss(),
      // ③ isLocalBuild が true の時だけ単一ファイル化プラグインをオンにする
      ...(isLocalBuild ? [viteSingleFile()] : []),
    ],
    server: {
      port: 3000,
      strictPort: false,
      open: true,
    },
    build: {
      outDir: isLocalBuild ? "dist-local" : "dist",
      target: "esnext",
      assetsInlineLimit: 100000000,
      chunkSizeWarningLimit: 100000000,
    },
  };
});
