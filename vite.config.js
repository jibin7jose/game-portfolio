import { defineConfig } from 'vite';

export default defineConfig({
    assetsInclude: ['**/*.glb', '**/*.gltf'],
    server: {
        port: 5173,
        open: true,
    },
    build: {
        target: 'esnext',
        outDir: 'dist',
    },
});
