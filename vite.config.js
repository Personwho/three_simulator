import {
    defineConfig
} from 'vite';
import { resolve } from 'path'
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
    base: './',
    plugins: [
        tailwindcss(),
    ],
    server: {
        cors: true, // 允許開發環境的 CORS
    },
    preview: {
        cors: true, // 允許預覽環境的 CORS
    },
    build: {
        outDir: 'build',
        emptyOutDir: true,
        manifest: true,

        rollupOptions: {
            input: {
                main: resolve(__dirname, 'index.html'), // 將 index.html 設為主要入口
            },
            output: {
                entryFileNames: 'js/[name].js',
                chunkFileNames: 'js/[name].js',
                assetFileNames: ({ name }) => {
                    if (name?.endsWith('.css')) {
                        return 'css/[name].[ext]'
                    }
                    return '[name].[ext]'
                },
            },
        },
    },
})
