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

	describe("opening", function() {

		it("counts PDFs as images in is[image] (TiddlyWiki core), so the docs warn", function() {
			add({title: "K/b.pdf", type: "application/pdf"});
			expect($tw.wiki.filterTiddlers("[[K/b.pdf]is[image]]")).toEqual(["K/b.pdf"]);
		});

		it("never opens by default", function() {
			add({title: "K/a.pdf", type: "application/pdf"});
			expect(attach.opens($tw.wiki, "K/a.pdf")).toBe(false);
		});

		it("opens what the open filter keeps", function() {
			add({title: CONFIG + "open-filter", text: "[all[]] :filter[get[type]prefix[image/]]"});
			add({title: "K/a.png", type: "image/png"});
			add({title: "K/a.pdf", type: "application/pdf"});
			expect(attach.opens($tw.wiki, "K/a.png")).toBe(true);
			expect(attach.opens($tw.wiki, "K/a.pdf")).toBe(false);
		});

		it("puts the new tiddlers right after the anchor, else at the end", function() {
			expect(attach.insertAfter(["A", "K", "B"], "K", ["n1", "n2"])).toEqual(["A", "K", "n1", "n2", "B"]);
			expect(attach.insertAfter(["A", "n1", "K"], "K", ["n1"])).toEqual(["A", "K", "n1"]);
			expect(attach.insertAfter(["A"], null, ["n1"])).toEqual(["A", "n1"]);
		});
	});

	describe("configuration", function() {

		it("lists the action tiddlers, skipping empty ones", function() {
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
