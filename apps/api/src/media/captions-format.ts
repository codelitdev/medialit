/**
 * Turns a transcriber's segments into the captions outputs
 * (pipelines-phase-2.md, D6): WebVTT for players, plain text, and the
 * JSON transcript apps build on. Pure functions, so they are tested alone.
 */
import type { TranscriptSegment } from "../transcription";

/** A caption on screen: at most two lines of 42 characters, 7 seconds. */
export const MAX_LINE_CHARS = 42;
export const MAX_CUE_LINES = 2;
export const MAX_CUE_SECONDS = 7;
/** A pause this long starts a new paragraph in the plain transcript. */
export const PARAGRAPH_PAUSE_SECONDS = 2;

export type Cue = { start: number; end: number; lines: string[] };

/**
 * Drops segments with no words, and a segment repeating the previous one's
 * text more than twice in a row: Whisper sometimes loops on a phrase. Times
 * are made monotonic, so segments never overlap.
 */
export function cleanSegments(
    segments: TranscriptSegment[],
): TranscriptSegment[] {
    const kept: TranscriptSegment[] = [];
    let repeats = 0;
    for (const segment of segments) {
        const text = segment.text.replace(/\s+/g, " ").trim();
        if (!/[\p{L}\p{N}]/u.test(text)) continue;
        const previous = kept[kept.length - 1];
        if (previous && normalize(previous.text) === normalize(text)) {
            repeats++;
            if (repeats >= 2) continue;
        } else {
            repeats = 0;
        }
        const start = Math.max(segment.start, previous?.end ?? 0);
        const end = Math.max(start, segment.end);
        kept.push({ start: round(start), end: round(end), text });
    }
    return kept;
}

function normalize(text: string): string {
    return text
        .toLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, " ")
        .trim();
}

function round(seconds: number): number {
    return Math.round(seconds * 1000) / 1000;
}

/** Wraps words into lines of at most `MAX_LINE_CHARS`. A longer word gets
 * a line of its own. */
export function wrap(words: string[]): string[] {
    const lines: string[] = [];
    let line = "";
    for (const word of words) {
        if (line && line.length + 1 + word.length > MAX_LINE_CHARS) {
            lines.push(line);
            line = word;
        } else {
            line = line ? `${line} ${word}` : word;
        }
    }
    if (line) lines.push(line);
    return lines;
}

/**
 * Splits segments into cues that fit on screen. A segment too long for one
 * cue is cut between words into as few cues as fit, with the words shared
 * evenly, so no cue is left with a word or two that flashes past. Each
 * part's times are shared out by its share of the characters, which tracks
 * speech closely enough for captions.
 */
export function buildCues(segments: TranscriptSegment[]): Cue[] {
    const cues: Cue[] = [];
    for (const segment of segments) {
        const words = segment.text.split(" ").filter(Boolean);
        const totalChars = segment.text.length || 1;
        const duration = segment.end - segment.start;
        const maxChars = Math.max(
            MAX_LINE_CHARS,
            duration > MAX_CUE_SECONDS
                ? Math.floor((totalChars * MAX_CUE_SECONDS) / duration)
                : Infinity,
        );
        let charsBefore = 0;
        for (const part of balancedParts(words, maxChars)) {
            const text = part.join(" ");
            const start = segment.start + (duration * charsBefore) / totalChars;
            charsBefore += text.length + 1;
            const end =
                charsBefore >= totalChars
                    ? segment.end
                    : segment.start + (duration * charsBefore) / totalChars;
            cues.push({
                start: round(start),
                end: round(end),
                lines: wrap(part),
            });
        }
    }
    return cues;
}

/** Cuts words into parts that fit a cue: as few parts as the greedy cut
 * makes, then the smallest limit that still needs no more, which evens out
 * their lengths. */
function balancedParts(words: string[], maxChars: number): string[][] {
    const greedy = cutWords(words, maxChars);
    if (greedy.length < 2) return greedy;
    const total = words.join(" ").length;
    // Two full lines is the most a cue holds, whatever maxChars allows.
    const ceiling = Math.min(maxChars, MAX_LINE_CHARS * MAX_CUE_LINES + 1);
    for (
        let chars = Math.ceil(total / greedy.length);
        chars < ceiling;
        chars++
    ) {
        const parts = cutWords(words, chars);
        if (parts.length === greedy.length) return parts;
    }
    return greedy;
}

/** Fills each part with as many words as fit in `MAX_CUE_LINES` lines and
 * `maxChars` characters. A part always takes at least one word. */
function cutWords(words: string[], maxChars: number): string[][] {
    const parts: string[][] = [];
    let i = 0;
    while (i < words.length) {
        const part: string[] = [];
        while (i < words.length) {
            const next = [...part, words[i]];
            const fits =
                wrap(next).length <= MAX_CUE_LINES &&
                next.join(" ").length <= maxChars;
            if (!fits && part.length > 0) break;
            part.push(words[i]);
            i++;
        }
        parts.push(part);
    }
    return parts;
}

/** `HH:MM:SS.mmm`, as WebVTT wants. */
export function vttTime(seconds: number): string {
    const ms = Math.max(0, Math.round(seconds * 1000));
    const h = Math.floor(ms / 3_600_000);
    const m = Math.floor((ms % 3_600_000) / 60_000);
    const s = Math.floor((ms % 60_000) / 1000);
    const pad = (n: number, width = 2) => String(n).padStart(width, "0");
    return `${pad(h)}:${pad(m)}:${pad(s)}.${pad(ms % 1000, 3)}`;
}

/** Text in a cue can't hold `-->` or raw `<` and `&`. */
function escapeCueText(text: string): string {
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

export function toVtt(cues: Cue[]): string {
    const blocks = cues.map(
        (cue, index) =>
            `${index + 1}\n${vttTime(cue.start)} --> ${vttTime(cue.end)}\n${cue.lines.map(escapeCueText).join("\n")}`,
    );
    return `WEBVTT\n\n${blocks.join("\n\n")}\n`;
}

/** One paragraph per pause of `PARAGRAPH_PAUSE_SECONDS` or more. */
export function toTranscriptText(segments: TranscriptSegment[]): string {
    const paragraphs: string[][] = [];
    let previousEnd = -Infinity;
    for (const segment of segments) {
        if (
            paragraphs.length === 0 ||
            segment.start - previousEnd >= PARAGRAPH_PAUSE_SECONDS
        ) {
            paragraphs.push([]);
        }
        paragraphs[paragraphs.length - 1].push(segment.text);
        previousEnd = segment.end;
    }
    return paragraphs.map((words) => words.join(" ")).join("\n\n") + "\n";
}

/** The contract for apps (D6): `version` changes only on a breaking
 * change, and `id` is the segment's index in this file. */
export function toTranscriptJson(input: {
    language: string;
    durationSeconds: number;
    model: string;
    segments: TranscriptSegment[];
}): string {
    return JSON.stringify({
        version: 1,
        language: input.language,
        durationSeconds: round(input.durationSeconds),
        model: input.model,
        segments: input.segments.map((segment, id) => ({
            id,
            start: segment.start,
            end: segment.end,
            text: segment.text,
        })),
    });
}
