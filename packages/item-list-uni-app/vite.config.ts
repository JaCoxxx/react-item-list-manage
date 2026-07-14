import path from "node:path";
import { defineConfig, loadEnv } from "vite";
import uni from "@dcloudio/vite-plugin-uni";

export default defineConfig(({ mode }) => {
	const env = loadEnv(mode, process.cwd(), "");
	const proxyTarget = env.VITE_API_PROXY_TARGET || "http://localhost:5173";

	return {
		plugins: [uni()],
		resolve: {
			alias: {
				"@": path.resolve(__dirname, "src"),
			},
		},
		server: {
			proxy: {
				"/api": {
					target: proxyTarget,
					changeOrigin: true,
				},
			},
		},
	};
});
