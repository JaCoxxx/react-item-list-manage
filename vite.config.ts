import { File } from "node:buffer";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

if (typeof globalThis.File === "undefined") {
	globalThis.File = File;
}

const configDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(async () => {
	const [{ default: react }, { cloudflare }] = await Promise.all([
		import("@vitejs/plugin-react"),
		import("@cloudflare/vite-plugin"),
	]);
	const remoteBindingsEnabled =
		process.env.CF_REMOTE_BINDINGS === "1" ||
		process.env.CF_REMOTE_BINDINGS === "true";

	return {
		plugins: [react(), cloudflare({ remoteBindings: remoteBindingsEnabled })],
		resolve: {
			alias: {
				react: path.resolve(configDir, "node_modules/react"),
				"react-dom": path.resolve(configDir, "node_modules/react-dom"),
				"react/jsx-runtime": path.resolve(configDir, "node_modules/react/jsx-runtime.js"),
				"react/jsx-dev-runtime": path.resolve(
					configDir,
					"node_modules/react/jsx-dev-runtime.js",
				),
			},
			dedupe: ["react", "react-dom"],
		},
	};
});
