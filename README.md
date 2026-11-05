# Drop attach

Drop or paste binary files onto a TiddlyWiki tiddler. The file is stored in the wiki as base64 and becomes a tiddler right away; your own action tiddlers decide how it is linked.

## Features

- **Drop onto a tiddler** — drag a binary file (PDF, image, office document, archive, …) onto a tiddler in the story or a stream row; it becomes a tiddler immediately — no `$:/Import` dialog, no server. Several files at once work too.
- **Paste** — click a tiddler to select it (a thin bar on its left edge marks it), then paste a file or screenshot. Without a selected tiddler a notice asks you to select one.
- **Your actions** — what happens after the upload — link to the drop target via `parent`, more fields, anything — are action tiddlers in your wiki, with `<target>`, `<new>`, `<filename>`, `<type>`, `<size>`, `<source>`. The plugin ships one: appending the line below.
- **Shown in the target** — a line showing the attachment is appended to the end of the tiddler you dropped on: a plain transclusion `<$transclude $tiddler=…/>`. Keep, move or delete it; switch it off in the settings.
- **New version** — drop one file onto a binary tiddler (an image, a PDF, …, embedded or with `_canonical_uri`) and, after you confirm, it replaces that tiddler's content; title, tags, caption and other fields stay. Works with TW Desk's `files/` folder (marker `tw-desk-update-of`).
- **Only binaries** — text files (`.md`, `.json`, `.tid`, …) go to TiddlyWiki's normal import; dropping outside tiddlers behaves as before.
- **Configurable** — title pattern, size limit (30 MB), pasted file names, extra file types, drop targets.
- **Extract later** — a command line turns attachments into external files with `_canonical_uri`.

## Prerequisites

- TiddlyWiki 5.4.0 or later
- Optional: `sq/streams` (stream rows as drop targets), [rimir/doc-template](https://github.com/rimir-cc/tw-doc-template) (branded docs)

## Quick Start

1. Install the plugin and reload.
2. To link uploads to the tiddler you drop on, create this tiddler:

   ```
   title: $:/config/rimir/drop-attach/actions/link-parent
   tags: $:/tags/rimir/drop-attach/action
   
   <$action-setfield $tiddler=<<new>> parent=<<target>>/>
   ```

3. Drag a PDF from your file manager onto a tiddler.
4. To paste: click a tiddler, then Ctrl+V.

## Extracting files later

```
tiddlywiki <wiki> \
  --save "[has[drop-attach.file]]" "[encodeuricomponent[]addprefix[files/]]" \
  --setfield "[has[drop-attach.file]]" _canonical_uri "$:/plugins/rimir/drop-attach/templates/canonical-uri" text/plain \
  --setfield "[has[drop-attach.file]]" text "" text/plain \
  --render "$:/core/save/all" index.html text/plain
```

## License

MIT — see [LICENSE.md](LICENSE.md).
