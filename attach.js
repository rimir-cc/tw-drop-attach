/*\
title: $:/plugins/rimir/drop-attach/attach.js
type: application/javascript
module-type: library

What a dropped or pasted file becomes, apart from the browser event handling in
layer.js: which files are attached, the new tiddler's title and fields, where it
opens. Everything configurable is read from the config tiddlers here.

\*/

"use strict";

var CONFIG = "$:/config/rimir/drop-attach/",
	ACTION_TAG = "$:/tags/rimir/drop-attach/action",
	TARGET_TAG = "$:/tags/rimir/drop-attach/target",
	FILE_FIELD = "drop-attach.file",
	FALLBACK_TYPE = "application/octet-stream",
	MB = 1024 * 1024;

exports.ACTION_TAG = ACTION_TAG;
exports.TARGET_TAG = TARGET_TAG;
exports.FILE_FIELD = FILE_FIELD;

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

// Whether the new tiddler opens in the story (the open filter keeps it)
exports.opens = function(wiki, title) {
	var filter = config(wiki, "open-filter", "");
	return !!filter && wiki.filterTiddlers(filter, null, wiki.makeTiddlerIterator([title])).length > 0;
};

// The story list with `titles` moved right after `anchor` (at the end without it)
exports.insertAfter = function(list, anchor, titles) {
	var rest = list.filter(function(t) { return titles.indexOf(t) === -1; }),
		at = rest.indexOf(anchor);
	at = at === -1 ? rest.length : at + 1;
	return rest.slice(0, at).concat(titles, rest.slice(at));
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
