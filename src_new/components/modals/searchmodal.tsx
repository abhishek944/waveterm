import * as React from "react";
import { useState, useCallback, useEffect } from "react";
import { observer } from "mobx-react";
import { Search, ChevronUp, ChevronDown, X, Target, Regex, Type, Square } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/modal";
import { TextField } from "@/components/ui/textfield";
import { Button } from "@/components/ui/button";
import { InputDecoration } from "@/components/ui/inputdecoration";
import { GlobalModel } from "@/models";

interface SearchModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export const SearchModal: React.FC<SearchModalProps> = observer(({ isOpen, onClose }) => {
    const [searchText, setSearchText] = useState("");
    const [useRegex, setUseRegex] = useState(false);
    const [caseSensitive, setCaseSensitive] = useState(false);
    const [wholeWord, setWholeWord] = useState(false);
    const [matchCount, setMatchCount] = useState("0/0");
    const [findInSelection, setFindInSelection] = useState(false);

    // Handle search with Electron APIs
    const handleSearch = useCallback(
        (text: string) => {
            if (!text.trim()) {
                (window as any).api.stopFindInPage("clearSelection");
                setMatchCount("0/0");
                return;
            }

            const options: any = {
                forward: true,
                findNext: false,
                matchCase: caseSensitive,
                wordStart: wholeWord,
                medialCapitalAsWordStart: false,
            };

            (window as any).api.findInPage(text, options);

            // Keep focus on search input and move caret to end
            requestAnimationFrame(() => {
                const input = document.getElementById('search-input') as HTMLInputElement;
                if (input) {
                    const len = input.value.length;
                    input.focus();
                    input.setSelectionRange(len, len);
                }
            });
        },
        [caseSensitive, wholeWord]
    );

    // Listen for search results
    useEffect(() => {
        (window as any).api.onFindInPageResult((result: any) => {
            if (result.matches > 0) {
                setMatchCount(`${result.activeMatchOrdinal}/${result.matches}`);
            } else {
                setMatchCount("0/0");
            }

            // Refocus input after highlight
            requestAnimationFrame(() => {
                const input = document.getElementById('search-input') as HTMLInputElement;
                if (input) {
                    const len = input.value.length;
                    input.focus();
                    input.setSelectionRange(len, len);
                }
            });
        });
    }, []);

    // Handle keyboard shortcuts
    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent) => {
            if (e.key === "Enter") {
                e.preventDefault();
                e.stopPropagation();
                try {
                    (e.nativeEvent as any).stopImmediatePropagation();
                } catch (err) {}
                if (e.shiftKey) {
                    // Previous match
                    (window as any).api.findInPage(searchText, { forward: false, findNext: true });
                } else {
                    // Next match
                    (window as any).api.findInPage(searchText, { forward: true, findNext: true });
                }
            } else if (e.key === "Escape") {
                onClose();
            }
        },
        [searchText, onClose]
    );

    // Handle close
    const handleClose = useCallback(() => {
        (window as any).api.stopFindInPage("clearSelection");
        onClose();
    }, [onClose]);

    return (
        <Dialog open={isOpen} onOpenChange={handleClose}>
            <DialogContent className="w-[800px] p-0 border-0 bg-gray-800" hideCloseButton>
                <div className="flex items-center gap-2 p-3">
                    {/* Search Input */}
                    <div className="flex-1 min-w-[400px]">
                        <TextField id="search-input"
                            value={searchText}
                            onChange={(e) => {
                                setSearchText(e.target.value);
                                handleSearch(e.target.value);
                            }}
                            onKeyDown={handleKeyDown}
                            placeholder="Search..."
                            className="bg-gray-700 border-gray-600 text-white placeholder:text-gray-400"
                            decoration={{
                                startDecoration: (
                                    <InputDecoration position="start">
                                        <Search className="w-4 h-4 text-gray-400" />
                                    </InputDecoration>
                                ),
                            }}
                            autoFocus
                        />
                    </div>

                    {/* Search Options */}
                    <div className="flex items-center gap-1">
                        <Button
                            variant={useRegex ? "default" : "outline"}
                            size="icon"
                            onClick={() => setUseRegex(!useRegex)}
                            title="Use Regular Expression"
                            className="h-8 w-8"
                        >
                            <Regex className="w-3 h-3" />
                        </Button>
                        <Button
                            variant={caseSensitive ? "default" : "outline"}
                            size="icon"
                            onClick={() => setCaseSensitive(!caseSensitive)}
                            title="Match Case"
                            className="h-8 w-8"
                        >
                            <Type className="w-3 h-3" />
                        </Button>
                        <Button
                            variant={wholeWord ? "default" : "outline"}
                            size="icon"
                            onClick={() => setWholeWord(!wholeWord)}
                            title="Match Whole Word"
                            className="h-8 w-8"
                        >
                            <Square className="w-3 h-3" />
                        </Button>
                    </div>

                    {/* Find in Selection Button */}
                    <Button
                        variant={findInSelection ? "default" : "outline"}
                        size="icon"
                        onClick={() => setFindInSelection(!findInSelection)}
                        title="Find in Selection"
                        className="h-8 w-8"
                    >
                        <Target className="w-3 h-3" />
                    </Button>

                    {/* Match Count */}
                    <div className="text-gray-400 text-sm min-w-[40px] text-center font-mono">{matchCount}</div>

                    {/* Navigation Arrows */}
                    <div className="flex gap-1">
                        <Button
                            variant="outline"
                            size="icon"
                            onClick={() =>
                                (window as any).api.findInPage(searchText, { forward: false, findNext: true })
                            }
                            title="Previous Match"
                            className="h-8 w-8"
                        >
                            <ChevronUp className="w-3 h-3" />
                        </Button>
                        <Button
                            variant="outline"
                            size="icon"
                            onClick={() =>
                                (window as any).api.findInPage(searchText, { forward: true, findNext: true })
                            }
                            title="Next Match"
                            className="h-8 w-8"
                        >
                            <ChevronDown className="w-3 h-3" />
                        </Button>
                    </div>

                    {/* Close Button */}
                    <Button
                        variant="outline"
                        size="icon"
                        onClick={handleClose}
                        title="Close Search"
                        className="h-8 w-8"
                    >
                        <X className="w-3 h-3" />
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
});
