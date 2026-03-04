/*\
created: 20260302000000000
title: $:/plugins/NoteStreams/WikiSage/tiddler-operations.js
tags:
type: application/javascript
module-type: library

Tiddler search, CRUD, export, and reference operations for WikiSage
\*/

"use strict";

class TiddlerOperations {

    constructor(cacheService) {
        this.cacheService = cacheService;
    }

    getAllTiddlerTitles() {
        return $tw.wiki.getTiddlers();
    }

    searchTiddlerContent(query, excludeTags) {
        excludeTags = excludeTags || [];
        try {
            const cacheKey = `${query}:${excludeTags.sort().join(',')}`;

            if (this.cacheService) {
                const cachedResults = this.cacheService.cache.results.get(cacheKey);
                const timestamp = this.cacheService.cache.timestamp.get(cacheKey);

                if (cachedResults && timestamp &&
                    (Date.now() - timestamp <= this.cacheService.config.maxAge)) {
                    return cachedResults;
                }
            }

            const results = [];
            const queryLower = query.toLowerCase();

            $tw.wiki.each((tiddler, title) => {
                const tiddlerTags = tiddler.fields.tags || [];
                if (excludeTags.length > 0 && tiddlerTags.some(tag => excludeTags.includes(tag))) {
                    return;
                }

                const titleLower = title.toLowerCase();
                const textLower = (tiddler.fields.text || "").toLowerCase();
                const tags = tiddlerTags;
                const aliases = this.parseAliases(tiddler.fields.aliases);

                if (titleLower.includes(queryLower) ||
                    this.isSimilar(titleLower, queryLower) ||
                    aliases.some(alias => alias.toLowerCase().includes(queryLower) ||
                        this.isSimilar(alias.toLowerCase(), queryLower)) ||
                    tags.some(tag => tag.toLowerCase().includes(queryLower) ||
                        this.isSimilar(tag.toLowerCase(), queryLower))) {
                    results.push({
                        title: title,
                        excerpt: tiddler.fields.text ? tiddler.fields.text.substring(0, 100) + "..." : "No content",
                        matchType: "title, alias, or tag"
                    });
                } else if (textLower.includes(queryLower) || this.containsSimilar(textLower, queryLower)) {
                    results.push({
                        title: title,
                        excerpt: this.findRelevantExcerpt(tiddler.fields.text, query),
                        matchType: "content"
                    });
                } else {
                    for (const [field, value] of Object.entries(tiddler.fields)) {
                        if (field !== "text" && field !== "tags" && typeof value === "string") {
                            const valueLower = value.toLowerCase();
                            if (valueLower.includes(queryLower) || this.isSimilar(valueLower, queryLower)) {
                                results.push({
                                    title: title,
                                    excerpt: `${field}: ${value}`,
                                    matchType: `field: ${field}`
                                });
                                break;
                            }
                        }
                    }
                }
            });

            if (this.cacheService) {
                this.cacheService.cache.results.set(cacheKey, results);
                this.cacheService.cache.timestamp.set(cacheKey, Date.now());
                this.cacheService.cache.metadata.set(cacheKey, {
                    size: JSON.stringify(results).length,
                    compressed: false,
                    query: query,
                    excludeTags: excludeTags
                });
            }

            return results;
        } catch (error) {
            console.error("Error in searchTiddlerContent:", error);
            return [];
        }
    }

    searchTiddlersByTag(tag) {
        const results = [];
        const tagLower = tag.toLowerCase();

        $tw.wiki.each((tiddler, title) => {
            const tags = tiddler.fields.tags || [];
            if (tags.some(t => t.toLowerCase() === tagLower || this.isSimilar(t.toLowerCase(), tagLower))) {
                results.push({
                    title: title,
                    excerpt: tiddler.fields.text ? tiddler.fields.text.substring(0, 100) + "..." : "No content",
                    matchType: "tag"
                });
            }
        });

        return results;
    }

    searchTiddlersByField(fieldName, fieldValue) {
        const results = [];
        const fieldValueLower = fieldValue.toLowerCase();

        $tw.wiki.each((tiddler, title) => {
            const field = tiddler.fields[fieldName];
            if (field) {
                const fieldLower = (typeof field === "string") ? field.toLowerCase() : String(field).toLowerCase();
                if (fieldLower.includes(fieldValueLower) || this.isSimilar(fieldLower, fieldValueLower)) {
                    results.push({
                        title: title,
                        excerpt: `${fieldName}: ${field}`,
                        matchType: `field: ${fieldName}`
                    });
                }
            }
        });

        return results;
    }

    getTiddlerContent(title) {
        let content = $tw.wiki.getTiddlerText(title);
        if (content) return content;

        let foundTiddler = null;
        $tw.wiki.each((tiddler, tiddlerTitle) => {
            if (foundTiddler) return;
            const aliases = this.parseAliases(tiddler.fields.aliases);
            if (aliases.some(alias => this.isSimilar(alias.toLowerCase(), title.toLowerCase()))) {
                foundTiddler = tiddler;
            }
        });

        if (foundTiddler) {
            return foundTiddler.fields.text || `The tiddler with alias "${title}" exists but has no content.`;
        }

        return `The tiddler "${title}" does not exist and no matching alias was found.`;
    }

    getTiddlerFields(title) {
        const tiddler = $tw.wiki.getTiddler(title);
        if (!tiddler) {
            return {
                success: false,
                error: `Tiddler "${title}" does not exist`
            };
        }

        return {
            success: true,
            fields: { ...tiddler.fields }
        };
    }

    getTiddlerState(title) {
        const tiddler = $tw.wiki.getTiddler(title);
        if (!tiddler) return null;

        return {
            fields: { ...tiddler.fields }
        };
    }

    openTiddler(title) {
        $tw.wiki.addToStory(title);
        return `Opened tiddler "${title}"`;
    }

    closeTiddler(title) {
        const storyTiddler = "$:/StoryList";
        const storyList = $tw.wiki.getTiddlerList(storyTiddler);
        const newStoryList = storyList.filter(item => item !== title);
        $tw.wiki.setText(storyTiddler, "list", null, newStoryList);
        return `Closed tiddler "${title}"`;
    }

    exportTiddlers(exportFilter, baseFilename, format) {
        baseFilename = baseFilename || "tiddlers";
        format = format || "JSON";

        const exporterTemplates = {
            "JSON": "$:/core/templates/exporters/JsonFile",
            "CSV": "$:/core/templates/exporters/CsvFile",
            "HTML": "$:/core/templates/exporters/StaticRiver",
            "TID": "$:/core/templates/exporters/TidFile"
        };

        const exporterTemplate = exporterTemplates[format.toUpperCase()];
        if (!exporterTemplate) {
            throw new Error(`Invalid export format: ${format}`);
        }

        const exporter = $tw.wiki.getTiddler(exporterTemplate);
        if (!exporter) {
            throw new Error(`Exporter template not found: ${exporterTemplate}`);
        }

        const tiddlers = $tw.wiki.filterTiddlers(exportFilter);
        if (!tiddlers || tiddlers.length === 0) {
            throw new Error(`No tiddlers match the filter: ${exportFilter}`);
        }

        if (format.toUpperCase() === "TID" && tiddlers.length > 1) {
            throw new Error("TID format can only export one tiddler at a time");
        }

        const exportData = $tw.wiki.renderTiddler("text/plain", exporterTemplate, {
            variables: { exportFilter }
        });

        // Create a Blob and trigger download
        const blob = new Blob([exportData], { type: "text/plain" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${baseFilename}${exporter.fields.extension}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        return `Successfully exported ${tiddlers.length} tiddler(s) in ${format} format`;
    }

    // System references (notes)

    addSystemReference(note) {
        const noteTiddler = "$:/ChatGPTNotes";
        let existingNotes = $tw.wiki.getTiddlerText(noteTiddler) || "";
        const noteId = Date.now().toString();
        const newNote = `\n- ${noteId}: ${new Date().toISOString()}: ${note}`;
        const updatedNotes = existingNotes + newNote;
        $tw.wiki.setText(noteTiddler, "text", null, updatedNotes);
        console.log("Note added:", note);
        return noteId;
    }

    getSystemReference() {
        const noteTiddler = "$:/ChatGPTNotes";
        const notes = $tw.wiki.getTiddlerText(noteTiddler) || "No notes available.";
        console.log("Retrieved notes:", notes);
        return notes;
    }

    reviseSystemReference(noteId, revisedNote) {
        const noteTiddler = "$:/ChatGPTNotes";
        let existingNotes = $tw.wiki.getTiddlerText(noteTiddler) || "";
        const noteLines = existingNotes.split('\n');
        const updatedNotes = noteLines.map(line => {
            if (line.startsWith(`- ${noteId}:`)) {
                return `- ${noteId}: ${new Date().toISOString()}: ${revisedNote} (Revised)`;
            }
            return line;
        }).join('\n');
        $tw.wiki.setText(noteTiddler, "text", null, updatedNotes);
        console.log("Note revised:", revisedNote);
    }

    // Dependency tracking

    async findDependencies(title) {
        const dependencies = new Set();
        const tiddler = $tw.wiki.getTiddler(title);

        if (tiddler) {
            (tiddler.fields.tags || []).forEach(tag => dependencies.add(tag));
            const links = $tw.wiki.getTiddlerLinks(title);
            links.forEach(link => dependencies.add(link));
            const backlinks = $tw.wiki.getTiddlerBacklinks(title);
            backlinks.forEach(backlink => dependencies.add(backlink));
        }

        return Array.from(dependencies);
    }

    async updateReferences(tiddlerTitle, action, params) {
        const tiddler = $tw.wiki.getTiddler(tiddlerTitle);
        if (!tiddler) return;

        let text = tiddler.fields.text || "";
        let modified = false;

        if (action === 'renameTiddler') {
            const oldTitle = params.oldTitle;
            const newTitle = params.newTitle;
            const linkRegex = new RegExp(`\\[\\[${oldTitle}\\]\\]`, 'g');
            if (text.match(linkRegex)) {
                text = text.replace(linkRegex, `[[${newTitle}]]`);
                modified = true;
            }
        }

        if (modified) {
            $tw.wiki.addTiddler(new $tw.Tiddler(
                tiddler,
                { text: text }
            ));
        }
    }

    // String similarity helpers

    parseAliases(aliasesString) {
        if (!aliasesString) return [];
        return aliasesString.match(/\[\[([^\]]+)\]\]|(\S+)/g)
            .map(alias => alias.replace(/^\[\[|\]\]$/g, ''));
    }

    isSimilar(str1, str2, threshold) {
        threshold = threshold || 0.8;
        const length = Math.max(str1.length, str2.length);
        const distance = this.levenshteinDistance(str1, str2);
        return (length - distance) / length >= threshold;
    }

    levenshteinDistance(str1, str2) {
        const m = str1.length;
        const n = str2.length;
        const dp = Array(m + 1).fill().map(() => Array(n + 1).fill(0));

        for (let i = 0; i <= m; i++) dp[i][0] = i;
        for (let j = 0; j <= n; j++) dp[0][j] = j;

        for (let i = 1; i <= m; i++) {
            for (let j = 1; j <= n; j++) {
                if (str1[i - 1] === str2[j - 1]) {
                    dp[i][j] = dp[i - 1][j - 1];
                } else {
                    dp[i][j] = Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]) + 1;
                }
            }
        }

        return dp[m][n];
    }

    containsSimilar(content, query) {
        const words = content.split(/\s+/);
        const queryWords = query.split(/\s+/);
        return queryWords.some(qWord =>
            words.some(word => this.isSimilar(word, qWord))
        );
    }

    findRelevantExcerpt(text, query) {
        const index = text.toLowerCase().indexOf(query.toLowerCase());
        if (index === -1) return text.substring(0, 100) + "...";

        const start = Math.max(0, index - 50);
        const end = Math.min(text.length, index + query.length + 50);
        return (start > 0 ? "..." : "") + text.substring(start, end) + (end < text.length ? "..." : "");
    }
}

exports.TiddlerOperations = TiddlerOperations;
