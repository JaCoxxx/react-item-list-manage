const fs = require("node:fs");
const path = require("node:path");
const { execSync } = require("node:child_process");

const d1StateDir = path.join(
	process.cwd(),
	".wrangler",
	"state",
	"v3",
	"d1",
	"miniflare-D1DatabaseObject"
);

const hasLocalDatabase =
	fs.existsSync(d1StateDir) &&
	fs.readdirSync(d1StateDir).some((fileName) => fileName.endsWith(".sqlite"));

if (hasLocalDatabase) {
	console.log("Local D1 already exists, skipping initialization.");
	process.exit(0);
}

console.log("Local D1 not found, initializing schema and seed data...");

execSync("npm run d1:init:local", {
	stdio: "inherit",
});
