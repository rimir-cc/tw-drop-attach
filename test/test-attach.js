/*\
title: $:/plugins/rimir/drop-attach/test/test-attach.js
type: application/javascript
tags: [[$:/tags/test-spec]]

Tests for attach.js (what a file becomes) and the extra-types parser.

\*/
"use strict";

var attach = require("$:/plugins/rimir/drop-attach/attach.js"),
	startup = require("$:/plugins/rimir/drop-attach/startup.js");

var CONFIG = "$:/config/rimir/drop-attach/";

describe("drop-attach", function() {

	var added = [];

	function add(fields) {
		$tw.wiki.addTiddler(fields);
		added.push(fields.title);
	}

	afterEach(function() {
		added.forEach(function(title) { $tw.wiki.deleteTiddler(title); });
		added = [];
	});

	describe("which files are attached", function() {

		it("attaches types TiddlyWiki stores as base64", function() {
			expect(attach.typeOf("a.pdf", "application/pdf")).toBe("application/pdf");
			expect(attach.typeOf("a.png", "image/png")).toBe("image/png");
			expect(attach.typeOf("a.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"))
				.toBe("application/vnd.openxmlformats-officedocument.wordprocessingml.document");
		});

		it("takes the type from the extension when the file has none", function() {
			expect(attach.typeOf("scan.PDF", "")).toBe("application/pdf");
		});

		it("leaves text files to the normal import", function() {
			expect(attach.typeOf("notes.md", "text/markdown")).toBe(null);
			expect(attach.typeOf("data.json", "application/json")).toBe(null);
			expect(attach.typeOf("x.tid", "")).toBe(null);
			expect(attach.typeOf("x.csv", "text/csv")).toBe(null);
		});

		it("attaches unknown binary types as application/octet-stream", function() {
			expect(attach.typeOf("model.blend", "application/x-blender")).toBe("application/octet-stream");
			expect(attach.typeOf("blob", "")).toBe("application/octet-stream");
		});

		it("has a configurable size limit in MB, 30 by default", function() {
			expect(attach.maxBytes($tw.wiki)).toBe(30 * 1024 * 1024);
			add({title: CONFIG + "max-size", text: "2.5"});
			expect(attach.maxBytes($tw.wiki)).toBe(2.5 * 1024 * 1024);
			add({title: CONFIG + "max-size", text: "nonsense"});
			expect(attach.maxBytes($tw.wiki)).toBe(30 * 1024 * 1024);
		});
	});

	describe("the new tiddler", function() {

		it("is titled <target>/<filename> by default", function() {
			expect(attach.titleFor($tw.wiki, {target: "Kickoff", filename: "agenda.pdf"})).toBe("Kickoff/agenda.pdf");
		});

		it("gets a number before the extension when the title is taken", function() {
			add({title: "Kickoff/agenda.pdf"});
			add({title: "Kickoff/agenda-1.pdf"});
			expect(attach.titleFor($tw.wiki, {target: "Kickoff", filename: "agenda.pdf"})).toBe("Kickoff/agenda-2.pdf");
			add({title: "noext"});
			expect(attach.uniqueTitle($tw.wiki, "noext")).toBe("noext-1");
		});

		it("follows a configured title filter with all variables", function() {
			add({title: CONFIG + "title-filter", text: "[<source>addprefix[files/]addsuffix[/]addsuffix<filename>]"});
			expect(attach.titleFor($tw.wiki, {target: "Kickoff", filename: "a.png", source: "paste"})).toBe("files/paste/a.png");
		});

		it("holds the base64 text, the type and the original file name", function() {
			var fields = attach.fields($tw.wiki, "Kickoff/a.png", "image/png", "iVBORw0K", "a.png");
			expect(fields.text).toBe("iVBORw0K");
			expect(fields.type).toBe("image/png");
			expect(fields[attach.FILE_FIELD]).toBe("a.png");
			expect(fields.created).toBeDefined();
		});

		it("names pasted files by time, with the type's extension", function() {
			expect(attach.pastedName($tw.wiki, "image/png")).toMatch(/^pasted-\d{8}-\d{6}\.png$/);
		});
	});

	describe("dropping onto a binary tiddler", function() {

		function replace(title, type, base64, filename) {
			var tiddler = attach.replaceFields($tw.wiki, $tw.wiki.getTiddler(title), type, base64, filename);
			$tw.wiki.addTiddler(tiddler);
			return $tw.wiki.getTiddler(title).fields;
		}

		it("replaces tiddlers with base64 or _canonical_uri content, not text or system tiddlers", function() {
			add({title: "Img", type: "image/png", text: "iVBO"});
			add({title: "Ext", type: "application/pdf", _canonical_uri: "files/report.pdf"});
			add({title: "Txt", text: "x"});
			add({title: "$:/Img", type: "image/png", text: "iVBO"});
			expect(attach.isReplaceTarget($tw.wiki, "Img")).toBe(true);
			expect(attach.isReplaceTarget($tw.wiki, "Ext")).toBe(true);
			expect(attach.isReplaceTarget($tw.wiki, "Txt")).toBe(false);
			expect(attach.isReplaceTarget($tw.wiki, "$:/Img")).toBe(false);
			expect(attach.isReplaceTarget($tw.wiki, "Missing")).toBe(false);
		});

		it("replaces text and type of an embedded tiddler, keeps the other fields, sets no marker", function() {
			add({title: "Img", type: "image/png", text: "iVBO", tags: "Photo", caption: "Logo", created: new Date(2020, 0, 1), modified: new Date(2020, 0, 1), owner: "me"});
			var fields = replace("Img", "image/png", "NEW", "logo.png");
			expect(fields.text).toBe("NEW");
			expect(fields.tags).toEqual(["Photo"]);
			expect(fields.caption).toBe("Logo");
			expect(fields.owner).toBe("me");
			expect(fields.created.getFullYear()).toBe(2020);
			expect(fields.modified.getFullYear()).not.toBe(2020);
			expect(fields[attach.UPDATE_FIELD]).toBeUndefined();
		});

		it("embeds an externalized file and marks files/<name> for TW Desk", function() {
			add({title: "Report", type: "application/pdf", text: "", _canonical_uri: "files/report.pdf", tags: "Doc", caption: "Report"});
			var fields = replace("Report", "application/pdf", "JVBE", "report-v2.pdf");
			expect(fields.text).toBe("JVBE");
			expect(fields._canonical_uri).toBeUndefined();
			expect(fields[attach.UPDATE_FIELD]).toBe("files/report.pdf");
			expect(fields.tags).toEqual(["Doc"]);
			expect(fields.caption).toBe("Report");
		});

		it("keeps the marker of an earlier replace", function() {
			add({title: "Report", type: "application/pdf", _canonical_uri: "files/report.pdf"});
			replace("Report", "application/pdf", "V2", "r.pdf");
			var fields = replace("Report", "application/pdf", "V3", "r.pdf");
			expect(fields.text).toBe("V3");
			expect(fields[attach.UPDATE_FIELD]).toBe("files/report.pdf");
		});

		it("takes the new file's type", function() {
			add({title: "Pic", type: "image/png", _canonical_uri: "files/pic.png"});
			var fields = replace("Pic", attach.typeOf("pic.jpg", "image/jpeg"), "/9j/", "pic.jpg");
			expect(fields.type).toBe("image/jpeg");
			expect(fields[attach.UPDATE_FIELD]).toBe("files/pic.png");
		});

		it("drops an external _canonical_uri without a marker", function() {
			add({title: "Web", type: "image/png", _canonical_uri: "https://example.com/a.png"});
			var fields = replace("Web", "image/png", "iVBO", "a.png");
			expect(fields._canonical_uri).toBeUndefined();
			expect(fields[attach.UPDATE_FIELD]).toBeUndefined();
		});

		it("updates the stored file name only on tiddlers drop-attach made", function() {
			add({title: "Img", type: "image/png", text: "a", "drop-attach.file": "old.png"});
			add({title: "Other", type: "image/png", text: "a"});
			expect(replace("Img", "image/png", "b", "new.png")[attach.FILE_FIELD]).toBe("new.png");
			expect(replace("Other", "image/png", "b", "new.png")[attach.FILE_FIELD]).toBeUndefined();
		});
	});

	describe("the shipped append action", function() {

		var ACTION = "$:/plugins/rimir/drop-attach/actions/append-view";

		function run(target, newTitle) {
			$tw.rootWidget.invokeActionString($tw.wiki.getTiddlerText(ACTION), $tw.rootWidget, null, {target: target, "new": newTitle});
			return $tw.wiki.getTiddlerText(target);
		}

		it("appends a transclusion of the attachment after a blank line", function() {
			add({title: "K", text: "Notes\n\n"});
			expect(run("K", "K/a.pdf")).toBe('Notes\n\n<$transclude $tiddler="""K/a.pdf"""/>');
		});

		it("appends one line per file and starts an empty tiddler with it", function() {
			add({title: "K"});
			run("K", "K/a.pdf");
			expect(run("K", "K/b.png")).toBe('<$transclude $tiddler="""K/a.pdf"""/>\n\n<$transclude $tiddler="""K/b.png"""/>');
		});

		it("leaves system tiddlers, non-wikitext targets and a switched-off setting alone", function() {
			add({title: "$:/K", text: "x"});
			expect(run("$:/K", "n")).toBe("x");
			add({title: "img.png", type: "image/png", text: "iVBO"});
			expect(run("img.png", "n")).toBe("iVBO");
			add({title: "K", text: "x"});
			add({title: CONFIG + "append", text: "no"});
			expect(run("K", "n")).toBe("x");
		});
	});

	describe("configuration", function() {

		it("lists the action tiddlers, skipping empty ones", function() {
			add({title: "$:/plugins/rimir/drop-attach/actions/append-view", tags: attach.ACTION_TAG, text: " "});
			add({title: "$:/test/da/act", tags: attach.ACTION_TAG, text: "<$action-setfield $tiddler=<<new>> parent=<<target>>/>"});
			add({title: "$:/test/da/empty", tags: attach.ACTION_TAG, text: " "});
			expect(attach.actions($tw.wiki)).toEqual(["<$action-setfield $tiddler=<<new>> parent=<<target>>/>"]);
		});

		it("ships drop targets for story tiddlers and stream rows", function() {
			var selectors = attach.targetSpecs($tw.wiki).map(function(s) { return s.selector; });
			expect(selectors).toContain(".tc-tiddler-frame.tc-tiddler-view-frame[data-tiddler-title]");
			expect(selectors).toContain(".stream-row[data-node-title]");
		});

		it("parses extra types, skipping comments and broken lines", function() {
			expect(startup.parse("# c\napplication/x-a .a\n\napplication/x-b b\nbroken\n")).toEqual([
				{type: "application/x-a", extension: ".a"},
				{type: "application/x-b", extension: ".b"}
			]);
		});

		it("registers the shipped extra types as base64", function() {
			expect(attach.typeOf("mail.msg", "")).toBe("application/vnd.ms-outlook");
		});
	});
});
