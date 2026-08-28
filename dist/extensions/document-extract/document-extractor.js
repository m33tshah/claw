import JSZip from "jszip";
import * as tar from "tar";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

//#region extensions/document-extract/document-extractor.ts
const MAX_EXTRACTED_TEXT_CHARS = 2e5;
const MAX_RENDER_DIMENSION = 1e4;
let pdfEnginePromise = null;

async function loadPdfEngine() {
	if (!pdfEnginePromise) pdfEnginePromise = import("clawpdf").then(({ createEngine }) => createEngine()).catch((err) => {
		pdfEnginePromise = null;
		throw new Error("Dependency clawpdf is required for PDF extraction", { cause: err });
	});
	return pdfEnginePromise;
}

function toDocumentImage(image) {
	return {
		type: "image",
		data: Buffer.from(image.bytes).toString("base64"),
		mimeType: image.mimeType
	};
}

function isPdfPasswordError(err) {
	return Boolean(err && typeof err === "object" && err.code === "password");
}

async function openPdfDocument(params) {
	try {
		return params.password ? await params.engine.open(params.input, { password: params.password }) : await params.engine.open(params.input);
	} catch (err) {
		if (isPdfPasswordError(err)) throw new Error("PDF requires a password or password is incorrect.", { cause: err });
		throw err;
	}
}

function formatBytes(bytes) {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function escapeMdCell(text) {
	if (!text) return "";
	return String(text).replace(/\|/g, "\\|").replace(/\r?\n/g, "<br>").trim();
}

function buildMarkdownTable(headers, rows) {
	if (!rows || rows.length === 0) return "";
	const numCols = Math.max(headers?.length || 0, ...rows.map((r) => r.length));
	if (numCols === 0) return "";
	const cleanHeaders = Array.from({ length: numCols }, (_, i) => headers?.[i] ? escapeMdCell(headers[i]) : `Column ${i + 1}`);
	const separator = Array.from({ length: numCols }, () => "---");
	let table = `| ${cleanHeaders.join(" | ")} |\n| ${separator.join(" | ")} |\n`;
	for (const row of rows) {
		const cleanRow = Array.from({ length: numCols }, (_, i) => escapeMdCell(row[i] ?? ""));
		table += `| ${cleanRow.join(" | ")} |\n`;
	}
	return table;
}

function extractXmlTagContents(xml, tagName) {
	const regex = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "g");
	const matches = [];
	let match;
	while ((match = regex.exec(xml)) !== null) {
		matches.push(match[1]);
	}
	return matches;
}

function extractPdfViaPython(buffer) {
	try {
		const pyScript = "import sys, pypdf, io; reader = pypdf.PdfReader(io.BytesIO(sys.stdin.buffer.read())); print('\\n--- Page Break ---\\n'.join(p.extract_text() or '' for p in reader.pages))";
		const output = execFileSync("python", ["-c", pyScript], {
			input: buffer,
			encoding: "utf8",
			timeout: 10000,
			stdio: ["pipe", "pipe", "ignore"]
		});
		return output.trim();
	} catch {
		return "";
	}
}

// 1. PDF Extractor
async function extractPdfContent(request) {
	let text = "";
	let pageCount = 1;
	try {
		const pdf = await openPdfDocument({
			engine: await loadPdfEngine(),
			input: new Uint8Array(request.buffer),
			...request.password ? { password: request.password } : {}
		});
		pageCount = pdf.pageCount;
		const pages = request.pageNumbers ? request.pageNumbers.filter((p) => Number.isInteger(p) && p >= 1 && p <= pdf.pageCount).slice(0, request.maxPages) : void 0;
		const pageSelection = pages ? { pages } : { maxPages: request.maxPages };
		const clawResult = await pdf.extract({
			mode: "text",
			...pageSelection,
			maxTextChars: MAX_EXTRACTED_TEXT_CHARS
		});
		text = clawResult.text || "";
		pdf.destroy();
	} catch {
	}

	if (!text.trim()) {
		text = extractPdfViaPython(request.buffer);
	}

	return {
		text: `[PDF Document | ${pageCount} pages | ${formatBytes(request.buffer.length)}]\n\n${text.trim() || "[No extractable text found in PDF]"}`.trim(),
		images: []
	};
}

// 2. DOCX Extractor
async function extractDocxContent(request) {
	const zip = await JSZip.loadAsync(request.buffer);
	const docXmlFile = zip.file("word/document.xml");
	if (!docXmlFile) throw new Error("Invalid DOCX: missing word/document.xml");
	const docXml = await docXmlFile.async("string");

	const lines = [];
	let wordCount = 0;
	let tableCount = 0;

	const blockRegex = /<(w:p|w:tbl)[^>]*>([\s\S]*?)<\/\1>/g;
	let blockMatch;

	while ((blockMatch = blockRegex.exec(docXml)) !== null) {
		const blockType = blockMatch[1];
		const blockContent = blockMatch[2];

		if (blockType === "w:p") {
			const styleMatch = /<w:pStyle\s+w:val="([^"]+)"/i.exec(blockContent);
			const style = styleMatch ? styleMatch[1].toLowerCase() : "";
			const isList = /<w:numPr>/i.test(blockContent);

			const textMatches = blockContent.match(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g) || [];
			const pText = textMatches.map((t) => t.replace(/<[^>]+>/g, "")).join("").trim();
			if (!pText) continue;

			wordCount += pText.split(/\s+/).filter(Boolean).length;

			if (style.includes("heading1") || style.includes("title")) {
				lines.push(`\n# ${pText}\n`);
			} else if (style.includes("heading2")) {
				lines.push(`\n## ${pText}\n`);
			} else if (style.includes("heading3")) {
				lines.push(`\n### ${pText}\n`);
			} else if (isList) {
				lines.push(`- ${pText}`);
			} else {
				lines.push(pText);
			}
		} else if (blockType === "w:tbl") {
			tableCount++;
			const rowMatches = blockContent.match(/<w:tr[\s\S]*?<\/w:tr>/g) || [];
			const tableRows = rowMatches.map((r) => {
				const cells = r.match(/<w:tc[\s\S]*?<\/w:tc>/g) || [];
				return cells.map((c) => {
					const texts = c.match(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g) || [];
					const val = texts.map((t) => t.replace(/<[^>]+>/g, "")).join(" ").trim();
					wordCount += val.split(/\s+/).filter(Boolean).length;
					return val;
				});
			});
			if (tableRows.length > 0) {
				lines.push(`\n${buildMarkdownTable(tableRows[0], tableRows.slice(1))}\n`);
			}
		}
	}

	const header = `[DOCX Document | ${wordCount} words | ${tableCount} tables | ${formatBytes(request.buffer.length)}]`;
	return {
		text: `${header}\n\n${lines.join("\n").trim()}`,
		images: []
	};
}

// 3. XLSX Extractor
async function extractXlsxContent(request) {
	const zip = await JSZip.loadAsync(request.buffer);
	const sharedStrings = [];
	const sstFile = zip.file("xl/sharedStrings.xml");
	if (sstFile) {
		const sstXml = await sstFile.async("string");
		const siMatches = extractXmlTagContents(sstXml, "si");
		for (const si of siMatches) {
			const texts = extractXmlTagContents(si, "t");
			sharedStrings.push(texts.join(""));
		}
	}

	const wbFile = zip.file("xl/workbook.xml");
	if (!wbFile) throw new Error("Invalid XLSX: missing xl/workbook.xml");
	const wbXml = await wbFile.async("string");

	const sheetRegex = /<sheet\s+[^>]*name="([^"]+)"[^>]*sheetId="([^"]+)"[^>]*r:id="([^"]+)"/g;
	const sheets = [];
	let sMatch;
	while ((sMatch = sheetRegex.exec(wbXml)) !== null) {
		sheets.push({ name: sMatch[1], sheetId: sMatch[2], rId: sMatch[3] });
	}

	if (sheets.length === 0) {
		const simpleSheetRegex = /<sheet\s+[^>]*name="([^"]+)"/g;
		let idx = 1;
		while ((sMatch = simpleSheetRegex.exec(wbXml)) !== null) {
			sheets.push({ name: sMatch[1], sheetId: String(idx), rId: `rId${idx}` });
			idx++;
		}
	}

	const sections = [];
	let totalRows = 0;

	for (let i = 0; i < sheets.length; i++) {
		const sheet = sheets[i];
		const sheetFile = zip.file(`xl/worksheets/sheet${i + 1}.xml`) || zip.file(`xl/worksheets/sheet${sheet.sheetId}.xml`);
		if (!sheetFile) continue;

		const sheetXml = await sheetFile.async("string");
		const rowMatches = extractXmlTagContents(sheetXml, "row");
		const grid = [];
		let maxColIdx = 0;

		for (const rowXml of rowMatches) {
			const cellRegex = /<c\s+r="([A-Z]+)(\d+)"(?:\s+t="([^"]+)")?[^>]*>(?:<v>([\s\S]*?)<\/v>|<is><t>([\s\S]*?)<\/t><\/is>)?<\/c>/g;
			let cMatch;
			const rowData = {};

			while ((cMatch = cellRegex.exec(rowXml)) !== null) {
				const colLetters = cMatch[1];
				const cellType = cMatch[3];
				const valRaw = cMatch[4] ?? cMatch[5] ?? "";

				let colIdx = 0;
				for (let k = 0; k < colLetters.length; k++) {
					colIdx = colIdx * 26 + (colLetters.charCodeAt(k) - 64);
				}
				colIdx -= 1;

				if (colIdx > maxColIdx) maxColIdx = colIdx;

				let cellValue = valRaw;
				if (cellType === "s") {
					const sstIdx = parseInt(valRaw, 10);
					cellValue = sharedStrings[sstIdx] ?? "";
				} else if (cellType === "b") {
					cellValue = valRaw === "1" ? "TRUE" : "FALSE";
				}
				rowData[colIdx] = cellValue.trim();
			}

			if (Object.keys(rowData).length > 0) {
				grid.push(rowData);
			}
		}

		if (grid.length > 0) {
			const colCount = maxColIdx + 1;
			totalRows += grid.length;
			const tableRows = grid.map((row) => Array.from({ length: colCount }, (_, c) => row[c] ?? ""));
			sections.push(`### Sheet: ${sheet.name} (${tableRows.length} rows, ${colCount} columns)\n\n${buildMarkdownTable(tableRows[0], tableRows.slice(1))}`);
		}
	}

	const header = `[XLSX Spreadsheet | ${sheets.length} sheets (${sheets.map((s) => s.name).join(", ")}) | ${totalRows} total rows | ${formatBytes(request.buffer.length)}]`;
	return {
		text: `${header}\n\n${sections.join("\n\n")}`,
		images: []
	};
}

// 4. PPTX Extractor
async function extractPptxContent(request) {
	const zip = await JSZip.loadAsync(request.buffer);
	const slidePaths = Object.keys(zip.files)
		.filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
		.sort((a, b) => {
			const numA = parseInt(a.match(/\d+/)[0], 10);
			const numB = parseInt(b.match(/\d+/)[0], 10);
			return numA - numB;
		});

	const slideSections = [];

	for (let idx = 0; idx < slidePaths.length; idx++) {
		const slidePath = slidePaths[idx];
		const slideXml = await zip.file(slidePath).async("string");
		const slideNum = idx + 1;
		const lines = [];

		const pMatches = extractXmlTagContents(slideXml, "a:p");
		for (const p of pMatches) {
			const tMatches = extractXmlTagContents(p, "a:t");
			const pText = tMatches.join("").trim();
			if (!pText) continue;
			lines.push(`- ${pText}`);
		}

		const notesFile = zip.file(`ppt/notesSlides/notesSlide${slideNum}.xml`);
		let notesText = "";
		if (notesFile) {
			const notesXml = await notesFile.async("string");
			const notesPMatches = extractXmlTagContents(notesXml, "a:p");
			const nTexts = notesPMatches.map((p) => extractXmlTagContents(p, "a:t").join("").trim()).filter(Boolean);
			if (nTexts.length > 0) {
				notesText = `\n> *Speaker Notes:* ${nTexts.join(" ")}`;
			}
		}

		slideSections.push(`### Slide ${slideNum}\n${lines.join("\n")}${notesText}`);
	}

	const header = `[PPTX Presentation | ${slidePaths.length} slides | ${formatBytes(request.buffer.length)}]`;
	return {
		text: `${header}\n\n${slideSections.join("\n\n")}`,
		images: []
	};
}

// 5. Tabular (CSV / TSV) Extractor
async function extractTabularContent(request) {
	const text = request.buffer.toString("utf8");
	const firstLines = text.split(/\r?\n/).slice(0, 5).filter(Boolean);
	let delimiter = ",";
	if (firstLines.length > 0) {
		const tabs = (firstLines[0].match(/\t/g) || []).length;
		const commas = (firstLines[0].match(/,/g) || []).length;
		const semis = (firstLines[0].match(/;/g) || []).length;
		if (tabs > commas && tabs > semis) delimiter = "\t";
		else if (semis > commas && semis > tabs) delimiter = ";";
	}

	const parseRow = (line) => {
		const cells = [];
		let current = "";
		let inQuotes = false;
		for (let i = 0; i < line.length; i++) {
			const c = line[i];
			if (c === '"') {
				if (inQuotes && line[i + 1] === '"') {
					current += '"';
					i++;
				} else {
					inQuotes = !inQuotes;
				}
			} else if (c === delimiter && !inQuotes) {
				cells.push(current.trim());
				current = "";
			} else {
				current += c;
			}
		}
		cells.push(current.trim());
		return cells;
	};

	const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
	const rows = lines.map(parseRow);
	if (rows.length === 0) return { text: `[Empty Tabular Data]`, images: [] };

	const headers = rows[0];
	const dataRows = rows.slice(1);
	const header = `[Tabular Data | Delimiter: ${delimiter === "\t" ? "TAB" : delimiter} | ${rows.length} rows, ${headers.length} columns | ${formatBytes(request.buffer.length)}]`;
	return {
		text: `${header}\n\n${buildMarkdownTable(headers, dataRows)}`,
		images: []
	};
}

// 6. JSON Extractor
async function extractJsonContent(request) {
	const text = request.buffer.toString("utf8");
	try {
		const data = JSON.parse(text);
		if (Array.isArray(data) && data.length > 0 && typeof data[0] === "object" && data[0] !== null) {
			const keys = Object.keys(data[0]);
			const sampleRows = data.slice(0, 50).map((item) => keys.map((k) => typeof item[k] === "object" ? JSON.stringify(item[k]) : String(item[k] ?? "")));
			const table = buildMarkdownTable(keys, sampleRows);
			return {
				text: `[JSON Array | ${data.length} records | ${keys.length} fields]\n\n${table}${data.length > 50 ? `\n\n*(Showing first 50 of ${data.length} records)*` : ""}`,
				images: []
			};
		}
		const formatted = JSON.stringify(data, null, 2);
		const topKeys = typeof data === "object" && data !== null ? Object.keys(data) : [];
		return {
			text: `[JSON Document | Keys: ${topKeys.join(", ")}]\n\`\`\`json\n${formatted}\n\`\`\``,
			images: []
		};
	} catch {
		return {
			text: `[JSON Payload | ${formatBytes(request.buffer.length)}]\n\`\`\`\n${text}\n\`\`\``,
			images: []
		};
	}
}

// 7. Archive Extractor (ZIP / TAR / GZ)
async function extractArchiveContent(request) {
	const mime = request.mimeType || "";
	const fileName = request.fileName || "";
	const isGzipOrTar = fileName.endsWith(".tar") || fileName.endsWith(".tar.gz") || fileName.endsWith(".tgz") || mime.includes("tar") || mime.includes("gzip") || (request.buffer[0] === 0x1f && request.buffer[1] === 0x8b);

	if (isGzipOrTar) {
		const tempPath = path.join(process.cwd(), `tmp_${Date.now()}_tar.tar.gz`);
		fs.writeFileSync(tempPath, request.buffer);
		const entries = [];
		let totalUncompressed = 0;
		try {
			await tar.t({
				file: tempPath,
				onentry: (entry) => {
					entries.push({ name: entry.path, size: entry.size || 0, isDir: entry.type === "Directory" });
					totalUncompressed += entry.size || 0;
				}
			});
		} finally {
			try { fs.unlinkSync(tempPath); } catch {}
		}
		const manifestLines = entries.map((e) => e.isDir ? `- 📁 \`${e.name}\`` : `- 📄 \`${e.name}\` (${formatBytes(e.size)})`);
		return {
			text: `[TAR Archive | ${entries.length} items | Uncompressed: ${formatBytes(totalUncompressed)} | Size: ${formatBytes(request.buffer.length)}]\n\n### Archive Contents\n${manifestLines.join("\n")}`,
			images: []
		};
	}

	const zip = await JSZip.loadAsync(request.buffer);
	const entries = [];
	let totalUncompressed = 0;
	const fileNames = Object.keys(zip.files).sort();

	for (const name of fileNames) {
		const entry = zip.files[name];
		if (!entry.dir) {
			const data = await entry.async("nodebuffer");
			totalUncompressed += data.length;
			entries.push({ name, size: data.length, isDir: false });
		} else {
			entries.push({ name, size: 0, isDir: true });
		}
	}

	const manifestLines = entries.map((e) => e.isDir ? `- 📁 \`${e.name}\`` : `- 📄 \`${e.name}\` (${formatBytes(e.size)})`);
	const previews = [];
	for (const e of entries.filter((e) => !e.isDir && e.size < 8192 && /\.(txt|md|json|csv|py|js|ts|html|css|yaml|yml)$/i.test(e.name)).slice(0, 5)) {
		const content = await zip.file(e.name).async("string");
		previews.push(`#### Preview: \`${e.name}\`\n\`\`\`\n${content.trim()}\n\`\`\``);
	}

	const header = `[ZIP Archive | ${entries.length} items (${entries.filter((e) => !e.isDir).length} files) | Uncompressed: ${formatBytes(totalUncompressed)} | Compressed: ${formatBytes(request.buffer.length)}]`;
	return {
		text: `${header}\n\n### Archive Contents\n${manifestLines.join("\n")}${previews.length > 0 ? `\n\n### File Previews\n${previews.join("\n\n")}` : ""}`,
		images: []
	};
}

// FACTORY EXPORTS FOR OPENCLAW PLUGIN SYSTEM

function createPdfDocumentExtractor() {
	return {
		id: "pdf",
		label: "PDF",
		mimeTypes: ["application/pdf"],
		autoDetectOrder: 10,
		extract: extractPdfContent
	};
}

function createDocxDocumentExtractor() {
	return {
		id: "docx",
		label: "Word Document",
		mimeTypes: [
			"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
			"application/msword",
			"application/docx"
		],
		autoDetectOrder: 20,
		extract: extractDocxContent
	};
}

function createXlsxDocumentExtractor() {
	return {
		id: "xlsx",
		label: "Excel Spreadsheet",
		mimeTypes: [
			"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
			"application/vnd.ms-excel",
			"application/xlsx"
		],
		autoDetectOrder: 30,
		extract: extractXlsxContent
	};
}

function createPptxDocumentExtractor() {
	return {
		id: "pptx",
		label: "PowerPoint Presentation",
		mimeTypes: [
			"application/vnd.openxmlformats-officedocument.presentationml.presentation",
			"application/vnd.ms-powerpoint",
			"application/pptx"
		],
		autoDetectOrder: 40,
		extract: extractPptxContent
	};
}

function createTabularDocumentExtractor() {
	return {
		id: "tabular",
		label: "Tabular Data (CSV/TSV)",
		mimeTypes: [
			"text/csv",
			"text/tab-separated-values",
			"text/tsv"
		],
		autoDetectOrder: 50,
		extract: extractTabularContent
	};
}

function createJsonDocumentExtractor() {
	return {
		id: "json",
		label: "JSON Document",
		mimeTypes: [
			"application/json",
			"text/json"
		],
		autoDetectOrder: 60,
		extract: extractJsonContent
	};
}

function createArchiveDocumentExtractor() {
	return {
		id: "archive",
		label: "Archive (ZIP/TAR/GZ)",
		mimeTypes: [
			"application/zip",
			"application/x-zip-compressed",
			"application/x-tar",
			"application/gzip",
			"application/x-gzip",
			"application/x-compressed-tar"
		],
		autoDetectOrder: 70,
		extract: extractArchiveContent
	};
}

// Unified direct ingestor
async function extractGeneralFile({ buffer, mimeType, fileName }) {
	const lower = (fileName || "").toLowerCase();
	const req = {
		buffer,
		mimeType: mimeType || "",
		fileName: fileName || "",
		maxPages: 50,
		maxPixels: 2e6,
		minTextChars: 10
	};

	if (lower.endsWith(".docx") || lower.endsWith(".doc") || mimeType?.includes("wordprocessingml") || mimeType?.includes("msword")) {
		return extractDocxContent(req);
	}
	if (lower.endsWith(".xlsx") || lower.endsWith(".xls") || mimeType?.includes("spreadsheetml") || mimeType?.includes("ms-excel")) {
		return extractXlsxContent(req);
	}
	if (lower.endsWith(".pptx") || lower.endsWith(".ppt") || mimeType?.includes("presentationml") || mimeType?.includes("ms-powerpoint")) {
		return extractPptxContent(req);
	}
	if (lower.endsWith(".pdf") || mimeType === "application/pdf") {
		return extractPdfContent(req);
	}
	if (lower.endsWith(".csv") || lower.endsWith(".tsv") || mimeType?.includes("csv") || mimeType?.includes("tsv") || mimeType?.includes("tab-separated")) {
		return extractTabularContent(req);
	}
	if (lower.endsWith(".json") || mimeType?.includes("json")) {
		return extractJsonContent(req);
	}
	if (lower.endsWith(".zip") || lower.endsWith(".tar") || lower.endsWith(".gz") || lower.endsWith(".tgz") || lower.endsWith(".tar.gz") || mimeType?.includes("zip") || mimeType?.includes("tar") || mimeType?.includes("gzip")) {
		return extractArchiveContent(req);
	}

	return null;
}

export {
	createPdfDocumentExtractor,
	createDocxDocumentExtractor,
	createXlsxDocumentExtractor,
	createPptxDocumentExtractor,
	createTabularDocumentExtractor,
	createJsonDocumentExtractor,
	createArchiveDocumentExtractor,
	extractGeneralFile
};
