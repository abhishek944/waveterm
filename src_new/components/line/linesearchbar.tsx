import * as React from "react";
import { useState, useCallback, useEffect } from "react";
import { observer } from "mobx-react";
import * as mobx from "mobx";
import { Search, ChevronUp, ChevronDown, X } from "lucide-react";
import { TextField } from "@/components/ui/textfield";
import { Button } from "@/components/ui/button";
import { InputDecoration } from "@/components/ui/inputdecoration";
import { GlobalModel } from "@/models";

interface LineSearchBarProps {
    lineId: string;
    lineRef?: React.RefObject<HTMLElement>;
    className?: string;
}

export const LineSearchBar: React.FC<LineSearchBarProps> = observer(({ lineId, lineRef, className }) => {
    const [text, setText] = useState(GlobalModel.lineSearchText.get() || "");
    const [caseSensitive, setCaseSensitive] = useState(false);
    const [matchCount, setMatchCount] = useState("0/0");

    // Sync with global model text
    useEffect(() => {
        const disposer = mobx.autorun(() => {
            const m = GlobalModel.lineSearchText.get();
            setText(m ?? "");
        });
        return () => disposer();
    }, []);

    // Listen for find-in-page results (global) and refocus input after highlight
    useEffect(() => {
        (window as any).api.onFindInPageResult((result: any) => {
            if (result.matches > 0) {
                setMatchCount(`${result.activeMatchOrdinal}/${result.matches}`);
            } else {
                setMatchCount("0/0");
            }
            // Refocus inline search input after result highlights to preserve typing
            requestAnimationFrame(() => {
                const el = document.getElementById(`line-search-input-${lineId}`) as HTMLInputElement;
                if (el) {
                    el.focus();
                    const len = el.value.length;
                    el.setSelectionRange(len, len);
                }
            });
        });
    }, [lineId]);

    const setDOMSelectionForLines = useCallback((): boolean => {
        try {
            const selectedIds = GlobalModel.lineSearchSelectedLineIds.get() || [lineId];
            const firstId = selectedIds[0];
            const lastId = selectedIds[selectedIds.length - 1];
    
            const sel = window.getSelection();
            sel?.removeAllRanges();
    
            // Attempt to restrict selection to the line content area to avoid including the input
            const contentEl = document.querySelector(`[data-lineid="${firstId}"] .overflow-auto`);
            if (contentEl) {
                const range = document.createRange();
                range.selectNodeContents(contentEl);
                sel?.addRange(range);
                return true;
            }
    
            // Fallback to explicit ref if provided
            if (lineRef && lineRef.current) {
                const range = document.createRange();
                range.selectNodeContents(lineRef.current);
                sel?.addRange(range);
                return true;
            }
    
            // Fallback to entire line container selection
            const startEl = document.querySelector(`[data-lineid="${firstId}"]`);
            const endEl = document.querySelector(`[data-lineid="${lastId}"]`);
            if (!startEl || !endEl) return false;
            const range = document.createRange();
            range.setStartBefore(startEl);
            range.setEndAfter(endEl);
            sel?.addRange(range);
            return true;
        } catch (e) {
            // best-effort selection
            return false;
        }
    }, [lineId, lineRef]);

    const doSearch = useCallback(
        (query: string, forward: boolean = true, findNext: boolean = false) => {
            if (!query.trim()) {
                try { (window as any).api.stopFindInPage("clearSelection"); } catch {}
                setMatchCount("0/0");
                return;
            }

            // Clear previous highlights
            try { (window as any).api.stopFindInPage("clearSelection"); } catch {}

            // Scope search to this line
            setDOMSelectionForLines();

            requestAnimationFrame(() => {
                (window as any).api.findInPage(query, {
                    forward,
                    findNext,
                    matchCase: caseSensitive,
                    wordStart: false,
                    medialCapitalAsWordStart: false,
                    findInSelection: true,
                    findInSelection: true,
                });
                const input = document.getElementById(`line-search-input-${lineId}`) as HTMLInputElement;
                if (input) {
                    const len = input.value.length;
                    input.focus();
                    input.setSelectionRange(len, len);
                }
            });
        },
        [caseSensitive, setDOMSelectionForLines]
    );

    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent) => {
            if (e.key === "Enter") {
                e.preventDefault();
                if (e.shiftKey) {
                    doSearch(text, false, true);
                } else {
                    doSearch(text, true, true);
                }
            } else if (e.key === "Escape") {
                GlobalModel.closeLineSearch();
            }
        },
        [text, doSearch]
    );

    const handleChange = (val: string) => {
        setText(val);
        mobx.action(() => GlobalModel.lineSearchText.set(val))();
        doSearch(val);
    };

    const handleCopy = useCallback(() => {
        try {
            const selectedIds = GlobalModel.lineSearchSelectedLineIds.get() || [lineId];
            const texts: string[] = [];
            for (const id of selectedIds) {
                const el = document.querySelector(`[data-lineid="${id}"]`);
                if (el) texts.push((el as HTMLElement).innerText || (el as HTMLElement).textContent || "");
            }
            const copyText = texts.join("\n");
            navigator.clipboard.writeText(copyText);
        } catch (e) {
            // ignore
        }
    }, [lineId]);

    const handleClose = useCallback(() => {
        // Remove any browser selection ranges (this clears highlights)
        try {
            window.getSelection()?.removeAllRanges();
        } catch (e) {
            // ignore
        }

        // Clear native highlighting (call twice to be safe)
        try {
            (window as any).api.stopFindInPage("clearSelection");
            // call again in next frame in case native highlights persist momentarily
            requestAnimationFrame(() => {
                try {
                    (window as any).api.stopFindInPage("clearSelection");
                } catch (e) {}
            });
        } catch (e) {}

        // Clear the inline search text in the model and close the inline search
        try {
            mobx.action(() => GlobalModel.lineSearchText.set(""))();
        } catch (e) {}

        GlobalModel.closeLineSearch();
    }, []);

    return (
        <div className={`flex items-center gap-1 bg-gray-800 border border-gray-600 rounded px-2 py-1 ${className ?? ""}`}>
            <div className="flex items-center gap-2">
                <InputDecoration position="start">
                    <Search className="w-3 h-3 text-gray-400" />
                </InputDecoration>
                <TextField id={`line-search-input-${lineId}`}
                    value={text}
                    onChange={(e: any) => handleChange(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="search..."
                    className="h-6 w-44 text-xs bg-transparent border-none p-0 text-white placeholder:text-gray-400 focus:outline-none focus:ring-0"
                    autoFocus
                />
            </div>

            <div className="flex items-center gap-1">
                <Button variant={caseSensitive ? "default" : "ghost"} size="sm" onClick={() => setCaseSensitive(!caseSensitive)} className="h-5 w-5 p-0" title="Match Case">
                    Aa
                </Button>
            </div>

            <Button size="sm" variant="ghost" onClick={handleCopy} title="Copy" className="h-5 w-5 p-0">
                <span className="text-xs">Copy</span>
            </Button>

            <div className="text-gray-400 text-xs min-w-[30px] text-center font-mono">{matchCount}</div>

            <div className="flex gap-1">
                <Button variant="ghost" size="sm" onClick={() => doSearch(text, false, true)} title="Previous" className="h-5 w-5 p-0">
                    <ChevronUp className="w-2 h-2" />
                </Button>
                <Button variant="ghost" size="sm" onClick={() => doSearch(text, true, true)} title="Next" className="h-5 w-5 p-0">
                    <ChevronDown className="w-2 h-2" />
                </Button>
            </div>

            <Button variant="ghost" size="sm" onClick={handleClose} title="Close" className="h-5 w-5 p-0">
                <X className="w-2 h-2" />
            </Button>
        </div>
    );
});

export default LineSearchBar;