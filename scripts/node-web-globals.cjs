const { File } = require("node:buffer");

if (typeof globalThis.File === "undefined") {
	globalThis.File = File;
}

if (typeof String.prototype.toWellFormed !== "function") {
	String.prototype.toWellFormed = function toWellFormed() {
		return String(this);
	};
}

if (typeof String.prototype.isWellFormed !== "function") {
	String.prototype.isWellFormed = function isWellFormed() {
		return true;
	};
}
