import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App as AntdApp, ConfigProvider } from "antd";
import "antd/dist/reset.css";
import "./index.css";
import App from "./App.tsx";

createRoot(document.getElementById("root")!).render(
	<StrictMode>
		<ConfigProvider
			theme={{
				token: {
					colorPrimary: "#111111",
					colorInfo: "#111111",
					colorSuccess: "#262626",
					colorWarning: "#434343",
					colorError: "#000000",
					colorTextBase: "#111111",
					colorBgBase: "#ffffff",
					colorBorder: "#d9d9d9",
					colorSplit: "#e5e5e5",
					colorFillSecondary: "#f5f5f5",
					colorFillTertiary: "#fafafa",
					borderRadius: 10,
					boxShadow: "none",
				},
				components: {
					Button: {
						primaryShadow: "none",
					},
					Card: {
						headerBg: "#ffffff",
					},
				},
			}}
		>
			<AntdApp>
				<App />
			</AntdApp>
		</ConfigProvider>
	</StrictMode>,
);
