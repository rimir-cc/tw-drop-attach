/*\
title: $:/plugins/rimir/drop-attach/attach.js
type: application/javascript
module-type: library

What a dropped or pasted file becomes, apart from the browser event handling in
layer.js: which files are attached, the new tiddler's title and fields, the
after-upload actions, and the replaced fields when a file is dropped onto a
binary tiddler. Everything configurable is read from the config tiddlers here.

\*/

"use strict";

var CONFIG = "$:/config/rimir/drop-attach/",
	ACTION_TAG = "$:/tags/rimir/drop-attach/action",
	TARGET_TAG = "$:/tags/rimir/drop-attach/target",
	FILE_FIELD = "drop-attach.file",
	UPDATE_FIELD = "tw-desk-update-of",
	FALLBACK_TYPE = "application/octet-stream",
	MB = 1024 * 1024;

exports.ACTION_TAG = ACTION_TAG;
exports.TARGET_TAG = TARGET_TAG;
exports.FILE_FIELD = FILE_FIELD;
exports.UPDATE_FIELD = UPDATE_FIELD;

function config(wiki, name, fallback) {
	var text = wiki.getTiddlerText(CONFIG + name, "");
	return text.trim() ? text.trim() : fallback;
}

/*
The tiddler type a file is attached as, or null when it is no binary file (text,
Markdown, JSON, .tid …: those go to TiddlyWiki's normal import). The type comes
from the file, else from its extension. Types TiddlyWiki stores as base64 are
attached; a type TiddlyWiki does not know at all is attached as
application/octet-stream.
*/
exports.typeOf = function(name, type) {
	if(!type) {
		var ext = /\.[^.]+$/.exec(name || "");
		type = ext && $tw.config.fileExtensionInfo[ext[0].toLowerCase()] ? $tw.config.fileExtensionInfo[ext[0].toLowerCase()].type : "";
	}
	var info = type && $tw.config.contentTypeInfo[type];
	if(info) {
		return info.encoding === "base64" ? type : null;
	}
	return type.indexOf("text/") === 0 ? null : FALLBACK_TYPE;
};

exports.maxBytes = function(wiki) {
	var mb = parseFloat(config(wiki, "max-size", "30"));
	return (isNaN(mb) || mb <= 0 ? 30 : mb) * MB;
};

// Runs a config filter with the given variables; the first result, or ""
function first(wiki, name, fallback, variables) {
	var widget = $tw.rootWidget.makeFakeWidgetWithVariables(variables);
	return wiki.filterTiddlers(config(wiki, name, fallback), widget)[0] || "";
}

// The name of a pasted file: clipboard images all come as "image.png"
exports.pastedName = function(wiki, type) {
	var info = $tw.config.contentTypeInfo[type],
		ext = (info && info.extension || "").replace(/^\./, "");
	return first(wiki, "paste-name", "[<now YYYY0MM0DD-0hh0mm0ss>addprefix[pasted-]addsuffix[.]addsuffix<ext>]", {ext: ext, type: type}) ||
		"pasted" + (ext ? "." + ext : "");
};

// The new tiddler's title: the title filter, made unique before the extension
exports.titleFor = function(wiki, vars) {
	var title = first(wiki, "title-filter", "[<target>addsuffix[/]addsuffix<filename>]", vars) || vars.filename;
	return exports.uniqueTitle(wiki, title);
};

exports.uniqueTitle = function(wiki, title) {
	if(!wiki.tiddlerExists(title)) {
		return title;
	}
	var m = /^(.*?)(\.[^./]*)?$/.exec(title),
		base = m[1],
		ext = m[2] || "",
		i = 1;
	while(wiki.tiddlerExists(base + "-" + i + ext)) {
		i++;
	}
	return base + "-" + i + ext;
};

exports.fields = function(wiki, title, type, base64, filename) {
	var fields = {title: title, type: type, text: base64};
	fields[FILE_FIELD] = filename;
	return $tw.utils.extend({}, wiki.getCreationFields(), fields, wiki.getModificationFields());
};

/*
Whether a drop onto `title` replaces its content instead of attaching a new
tiddler: an existing non-system tiddler whose content is binary, i.e. it has
_canonical_uri or a type TiddlyWiki stores as base64.
*/
exports.isReplaceTarget = function(wiki, title) {
	var tiddler = title && !wiki.isSystemTiddler(title) && wiki.getTiddler(title);
	if(!tiddler) {
		return false;
	}
	var info = $tw.config.contentTypeInfo[tiddler.fields.type];
	return !!tiddler.fields._canonical_uri || !!(info && info.encoding === "base64");
};

/*
The fields of `tiddler` with its content replaced by a new version: base64 text
and the file's type; all other fields stay. The new version is embedded, so
_canonical_uri goes. When it pointed into files/, TW Desk gets the marker
UPDATE_FIELD with that path, so on the next stop it overwrites that file instead
of adding a second one; a marker from an earlier replace stays as it is.
*/
exports.replaceFields = function(wiki, tiddler, type, base64, filename) {
	var old = tiddler.fields,
		uri = old._canonical_uri || "",
		fields = {type: type, text: base64, _canonical_uri: undefined};
	if(!old[UPDATE_FIELD] && uri.indexOf("files/") === 0) {
		fields[UPDATE_FIELD] = uri;
	}
	if(old[FILE_FIELD]) {
		fields[FILE_FIELD] = filename;
	}
	return new $tw.Tiddler(tiddler, fields, wiki.getModificationFields());
};

// The after-upload action tiddlers, in tag order
exports.actions = function(wiki) {
	return wiki.filterTiddlers("[all[shadows+tiddlers]tag[" + ACTION_TAG + "]!is[draft]]").map(function(title) {
		return wiki.getTiddlerText(title, "");
	}).filter(function(text) { return text.trim(); });
};

// Drop target kinds: tiddlers with a CSS `selector` and the `title-attribute` that holds the title
exports.targetSpecs = function(wiki) {
	return wiki.filterTiddlers("[all[shadows+tiddlers]tag[" + TARGET_TAG + "]!is[draft]]").map(function(title) {
		var fields = wiki.getTiddler(title).fields;
		return {selector: fields.selector, attribute: fields["title-attribute"]};
	}).filter(function(spec) { return spec.selector && spec.attribute; });
};

exports.sizeLabel = function(bytes) {
	return bytes >= MB ? (bytes / MB).toFixed(1) + " MB" : bytes >= 1024 ? Math.round(bytes / 1024) + " KB" : Math.round(bytes) + " bytes";
};
