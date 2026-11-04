/*\
title: $:/plugins/rimir/drop-attach/layer.js
type: application/javascript
module-type: widget

<$drop-attach-layer> — rendered once from the PageTemplate. It owns the
page-wide listeners of rimir/drop-attach:

* a file dragged over a drop target (story tiddler, stream row, any tiddler
  tagged $:/tags/rimir/drop-attach/target) highlights it (`da-dragover`), and
  dropping attaches the files to it. Drag events inside a target are stopped in
  the capture phase, so TiddlyWiki's page dropzone neither shows its overlay nor
  opens $:/Import. Outside targets nothing is intercepted.
* a click inside a target selects it as the paste target
  ($:/temp/rimir/drop-attach/target); styles-target marks it
* pasting files, while not typing in an input or editor, attaches them to the
  selected target if it is on screen; otherwise a notice says to select one
* files that are no binary (text, JSON, .tid …) go to the normal import

What a file becomes (type, title, fields, actions, opening) is in attach.js.

\*/

"use strict";

var Widget = require("$:/core/modules/widgets/widget.js").widget;
var attach = require("$:/plugins/rimir/drop-attach/attach.js");

var TARGET = "$:/temp/rimir/drop-attach/target",
	NOTIFICATION = "$:/plugins/rimir/drop-attach/notification",
	STORY = "$:/StoryList",
	FRAME = ".tc-tiddler-frame[data-tiddler-title]",
	GENERIC_PASTE_NAME = /^image\.\w+$/;

var DropAttachLayerWidget = function(parseTreeNode, options) {
	this.initialise(parseTreeNode, options);
};

DropAttachLayerWidget.prototype = Object.create(Widget.prototype);

DropAttachLayerWidget.prototype.render = function(parent, nextSibling) {
	this.parentDomNode = parent;
	this.computeAttributes();
	this.execute();
	if($tw.browser && this.document.addEventListener) {
		this.bind();
	}
};

DropAttachLayerWidget.prototype.bind = function() {
	var self = this,
		doc = this.document;
	this.listeners = [
		[doc, "dragenter", function(e) { self.onDrag(e); }],
		[doc, "dragover", function(e) { self.onDrag(e); }],
		[doc, "dragleave", function(e) { self.onDragLeave(e); }],
		[doc, "drop", function(e) { self.onDrop(e); }],
		[doc, "click", function(e) { self.onClick(e); }],
		[doc, "paste", function(e) { self.onPaste(e); }]
	];
	this.listeners.forEach(function(l) {
		l[0].addEventListener(l[1], l[2], true);
	});
};

DropAttachLayerWidget.prototype.destroy = function(options) {
	(this.listeners || []).forEach(function(l) {
		l[0].removeEventListener(l[1], l[2], true);
	});
	this.listeners = [];
	Widget.prototype.destroy.call(this, options);
};

DropAttachLayerWidget.prototype.refresh = function() {
	return false;
};

// ---------- targets ----------

// The innermost target element at or around `el`, or null
DropAttachLayerWidget.prototype.targetAt = function(el) {
	var selector = attach.targetSpecs(this.wiki).map(function(spec) { return spec.selector; }).join(", ");
	return selector && el && el.closest ? el.closest(selector) : null;
};

DropAttachLayerWidget.prototype.titleOf = function(el) {
	var spec = attach.targetSpecs(this.wiki).filter(function(s) { return el.matches(s.selector); })[0];
	return spec ? el.getAttribute(spec.attribute) : null;
};

// The story tiddler around a target: the new tiddler opens after it
DropAttachLayerWidget.prototype.anchorOf = function(el) {
	var frame = el.closest(FRAME);
	return frame ? frame.getAttribute("data-tiddler-title") : null;
};

// A visible element that stands for `title`
DropAttachLayerWidget.prototype.visibleTarget = function(title) {
	var self = this,
		selector = attach.targetSpecs(this.wiki).map(function(spec) { return spec.selector; }).join(", ");
	return Array.prototype.filter.call(selector ? this.document.querySelectorAll(selector) : [], function(el) {
		return self.titleOf(el) === title && el.getClientRects().length > 0;
	})[0] || null;
};

// ---------- drag and drop ----------

function isFileDrag(e) {
	return !!e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types || [], "Files") !== -1;
}

DropAttachLayerWidget.prototype.highlight = function(el) {
	if(this.over && this.over !== el) {
		this.over.classList.remove("da-dragover");
	}
	this.over = el;
	if(el) {
		el.classList.add("da-dragover");
	}
};

DropAttachLayerWidget.prototype.onDrag = function(e) {
	if(!isFileDrag(e)) {
		return;
	}
	var target = this.targetAt(e.target);
	this.highlight(target);
	if(target) {
		e.preventDefault();
		e.stopPropagation();
		e.dataTransfer.dropEffect = "copy";
	}
};

DropAttachLayerWidget.prototype.onDragLeave = function(e) {
	if(!isFileDrag(e)) {
		return;
	}
	var target = this.targetAt(e.target);
	if(target) {
		e.stopPropagation();
		// Leaving the window, or into something that is not this target
		if(!e.relatedTarget || !target.contains(e.relatedTarget)) {
			this.highlight(null);
		}
	}
};

DropAttachLayerWidget.prototype.onDrop = function(e) {
	if(!isFileDrag(e)) {
		return;
	}
	var target = this.targetAt(e.target);
	this.highlight(null);
	if(!target) {
		return;
	}
	e.preventDefault();
	e.stopPropagation();
	this.attachFiles(e.dataTransfer.files, this.titleOf(target), this.anchorOf(target), "drop", e);
};

// ---------- select and paste ----------

DropAttachLayerWidget.prototype.onClick = function(e) {
	var target = this.targetAt(e.target),
		title = target && this.titleOf(target);
	if(title && this.wiki.getTiddlerText(TARGET, "") !== title) {
		this.wiki.addTiddler({title: TARGET, text: title});
	}
};

// A text editor takes pasted files itself (TiddlyWiki's editor imports them).
// A one-line input (e.g. the sidebar search, which has focus after loading)
// cannot, so a file pasted there is attached.
function isEditor(el) {
	return !!el && (el.isContentEditable || el.tagName === "TEXTAREA");
}

DropAttachLayerWidget.prototype.onPaste = function(e) {
	var files = e.clipboardData && e.clipboardData.files;
	if(!files || !files.length || isEditor(e.target) || isEditor(this.document.activeElement)) {
		return;
	}
	e.preventDefault();
	e.stopPropagation();
	var title = this.wiki.getTiddlerText(TARGET, ""),
		el = title && this.visibleTarget(title);
	if(!el) {
		this.notify("Nothing to paste into yet: click a tiddler to select it, then paste again.");
		return;
	}
	this.attachFiles(files, title, this.anchorOf(el), "paste", e);
};

// ---------- attaching ----------

DropAttachLayerWidget.prototype.attachFiles = function(fileList, target, anchor, source, event) {
	var self = this,
		wiki = this.wiki,
		max = attach.maxBytes(wiki),
		binary = [],
		other = [],
		messages = [];
	Array.prototype.forEach.call(fileList, function(file) {
		var type = attach.typeOf(file.name, file.type);
		if(!type) {
			other.push(file);
		} else if(file.size > max) {
			messages.push(file.name + " is too big (" + attach.sizeLabel(file.size) + ", limit " + attach.sizeLabel(max) + ").");
		} else {
			binary.push({file: file, type: type});
		}
	});
	if(other.length) {
		wiki.readFiles(other, {callback: function(fieldsArray) {
			self.dispatchEvent({type: "tm-import-tiddlers", param: JSON.stringify(fieldsArray)});
		}});
	}
	if(!binary.length) {
		if(messages.length) {
			this.notify(messages.join(" "));
		}
		return;
	}
	var pending = binary.length;
	binary.forEach(function(item) {
		var reader = new FileReader();
		reader.onload = function() {
			item.base64 = String(reader.result).split(",")[1] || "";
			if(--pending === 0) {
				self.create(binary, target, anchor, source, event, messages);
			}
		};
		reader.onerror = function() {
			item.failed = true;
			messages.push(item.file.name + " could not be read.");
			if(--pending === 0) {
				self.create(binary, target, anchor, source, event, messages);
			}
		};
		reader.readAsDataURL(item.file);
	});
};

// One tiddler per file, in drop order, then the after-upload actions
DropAttachLayerWidget.prototype.create = function(items, target, anchor, source, event, messages) {
	var self = this,
		wiki = this.wiki,
		actions = attach.actions(wiki),
		created = [];
	items.filter(function(item) { return !item.failed; }).forEach(function(item) {
		var file = item.file,
			filename = source === "paste" && (!file.name || GENERIC_PASTE_NAME.test(file.name)) ? attach.pastedName(wiki, item.type) : file.name,
			vars = {target: target, filename: filename, type: item.type, source: source, size: String(file.size)},
			title = attach.titleFor(wiki, vars);
		wiki.addTiddler(attach.fields(wiki, title, item.type, item.base64, filename));
		vars["new"] = title;
		actions.forEach(function(text) {
			self.invokeActionString(text, self, event, vars);
		});
		created.push({title: title, filename: filename});
	});
	var opening = created.map(function(c) { return c.title; }).filter(function(title) { return attach.opens(wiki, title); });
	if(opening.length) {
		wiki.addTiddler(new $tw.Tiddler(wiki.getTiddler(STORY), {title: STORY,
			list: attach.insertAfter(wiki.getTiddlerList(STORY), anchor, opening)}));
	}
	if(created.length) {
		messages.unshift("Attached " + created.map(function(c) { return c.filename; }).join(", ") + " to " + this.captionOf(target) + ".");
	}
	this.notify(messages.join(" "));
};

DropAttachLayerWidget.prototype.captionOf = function(title) {
	var tiddler = this.wiki.getTiddler(title);
	return (tiddler && tiddler.fields.caption) || title;
};

DropAttachLayerWidget.prototype.notify = function(message) {
	if(message) {
		$tw.notifier.display(NOTIFICATION, {variables: {"drop-attach-message": message}});
	}
};

exports["drop-attach-layer"] = DropAttachLayerWidget;
