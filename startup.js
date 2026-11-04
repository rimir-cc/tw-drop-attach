/*\
title: $:/plugins/rimir/drop-attach/startup.js
type: application/javascript
module-type: startup

Registers the extra file types from $:/config/rimir/drop-attach/extra-types with
TiddlyWiki as base64 types, so files of those types are attached under their own
type (and, on a Node server, saved as real files with their own extension).
Runs in the browser and on the server; read once at startup.

\*/

"use strict";

exports.name = "rimir-drop-attach-types";
exports.after = ["load-modules"];
exports.synchronous = true;

var EXTRA_TYPES = "$:/config/rimir/drop-attach/extra-types";

// Lines "<mime type> <.extension>"; blank lines and `#` comments are skipped
exports.parse = function(text) {
	return (text || "").split(/\r?\n/).map(function(line) {
		return line.trim();
	}).filter(function(line) {
		return line && line.charAt(0) !== "#";
	}).map(function(line) {
		var parts = line.split(/\s+/),
			ext = parts[1] || "";
		return {type: parts[0], extension: ext && ext.charAt(0) !== "." ? "." + ext : ext};
	}).filter(function(entry) {
		return entry.type.indexOf("/") > 0 && entry.extension;
	});
};

exports.startup = function() {
	exports.parse($tw.wiki.getTiddlerText(EXTRA_TYPES, "")).forEach(function(entry) {
		if(!$tw.config.contentTypeInfo[entry.type]) {
			$tw.utils.registerFileType(entry.type, "base64", entry.extension);
		}
	});
};
