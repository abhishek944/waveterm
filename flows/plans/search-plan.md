# Search Implementation Plan - Cmd+F Functionality

## Overview

This plan outlines the implementation of a search functionality for Wave Terminal using Electron's built-in `webContents.findInPage()` and `webContents.stopFindInPage()` APIs. The search will work across all content types (terminal output, markdown, code blocks, etc.) and provide a native browser-like search experience.

## Architecture

### Key Components

1. **Electron Integration**: Leverage native browser search capabilities
2. **Search Modal**: Custom UI using existing design system components
3. **Keybinding System**: Integrate with existing keybinding infrastructure
4. **State Management**: Add search state to the global model

### Benefits of Using Electron's findInPage()

-   **Native Performance**: Uses optimized browser search engine
-   **Automatic Highlighting**: Electron handles all highlighting automatically
-   **Works with All Content**: Terminal output, markdown, code blocks, etc.
-   **Advanced Features**: Built-in regex, case sensitivity, whole word matching
-   **Keyboard Navigation**: Standard browser search shortcuts work
-   **Accessibility**: Native browser accessibility features
-   **No Custom Implementation**: Leverages proven, tested code

## Implementation Steps

### Step 1: Add Electron APIs to Preload Script

**File**: `src_new/electron/preload.js`

Add these functions to the existing `api` object:

```javascript
findInPage: (searchText, options) => ipcRenderer.send("find-in-page", searchText, options),
stopFindInPage: (action) => ipcRenderer.send("stop-find-in-page", action),
onFindInPageResult: (callback) => ipcRenderer.on("find-in-page-result", callback),
```

### Step 2: Add IPC Handlers in Main Process

**File**: `src_new/electron/emain.ts`

Add these IPC handlers after the existing ones:

```typescript
ipcMain.on("find-in-page", (event, searchText, options) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (window) {
        window.webContents.findInPage(searchText, options);
    }
});

ipcMain.on("stop-find-in-page", (event, action) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (window) {
        window.webContents.stopFindInPage(action);
    }
});
```

Add to the `createWindow` function, after existing webContents event handlers:

```typescript
win.webContents.on("found-in-page", (event, result) => {
    win.webContents.send("find-in-page-result", result);
});
```

### Step 3: Update TypeScript Types

**File**: `src_new/types/custom.d.ts`

Add to the `ElectronApi` type:

```typescript
findInPage: (searchText: string, options?: any) => void;
stopFindInPage: (action: "clearSelection" | "keepSelection" | "activateSelection") => void;
onFindInPageResult: (callback: (result: any) => void) => void;
```

### Step 4: Create Search Modal Component

**File**: `src_new/components/modals/searchmodal.tsx`

Create a new search modal using existing UI components:

```typescript
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
        });
    }, []);

    // Handle keyboard shortcuts
    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent) => {
            if (e.key === "Enter") {
                e.preventDefault();
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
            <DialogContent className="w-[600px] p-0 border-0 bg-gray-800">
                <div className="flex items-center gap-2 p-3">
                    {/* Search Input */}
                    <div className="flex-1">
                        <TextField
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
```

### Step 5: Add Search State Management

**File**: `src_new/models/model.ts`

Add to the Model class:

```typescript
searchModalOpen: OV<boolean> = mobx.observable.box(false, { name: "searchModalOpen" });

openSearchModal() {
    mobx.action(() => {
        this.searchModalOpen.set(true);
    })();
}

closeSearchModal() {
    mobx.action(() => {
        this.searchModalOpen.set(false);
        // Stop any active search
        (window as any).api.stopFindInPage("clearSelection");
    })();
}
```

### Step 6: Add Keybinding

**File**: `assets/default-keybindings.json`

Add this entry to the keybindings array:

```json
{
    "command": "app:openSearchModal",
    "keys": ["Cmd:f"]
}
```

### Step 7: Register Keybinding Handler

**File**: `src_new/components/workspace/workspace-view.tsx`

Add to the `SessionKeybindings` component:

```typescript
keybindManager.registerKeybinding("mainview", "session", "app:openSearchModal", (waveEvent) => {
    GlobalModel.openSearchModal();
    return true;
});
```

### Step 8: Integrate with App

**File**: `src_new/app.tsx`

Add import at the top:

```typescript
import { SearchModal } from "@/components/modals/searchmodal";
```

Add to the render method, before the closing div:

```typescript
<SearchModal isOpen={GlobalModel.searchModalOpen.get()} onClose={() => GlobalModel.closeSearchModal()} />
```

### Step 9: Add Line-level Search Bar (per-line search)

**Files**: `src_new/components/line/line-header.tsx`, `src_new/components/line/linesearchbar.tsx`, `src_new/models/model.ts`, `src_new/components/workspace/workspace-view.tsx`

Add a small inline search bar that appears in the header of a selected line. This bar should replicate the copy functionality currently present in the line header, and add a scoped Cmd+F search that targets the selected line or a contiguous multi-line selection. When the line-level search bar is visible, line actions (copy, rerun, inline menu, etc.) should be hidden to avoid UI collisions.

High-level behavior:
- Single-line: selecting a line and pressing Cmd+F opens the line search bar in that line's header.
- Multi-line: if the user selects a contiguous range of lines (shift+click or drag), the line search bar opens for the selection and searches across those lines.
- Search is performed by programmatically selecting the line element(s) in the DOM (Range + Selection) and then invoking the existing Electron search APIs so native highlighting and navigation are used.
- When the line-level search is visible, do not render the normal line actions for the affected line(s).

Implementation notes:

1. Model changes
   - Update [`src_new/models/model.ts`](src_new/models/model.ts:1) to add observable state for line-level search:

```typescript
// Line-level search state (add to Model class)
lineSearchOpen: OV<boolean> = mobx.observable.box(false, { name: "lineSearchOpen" });
lineSearchLineId: OV<string | null> = mobx.observable.box(null, { name: "lineSearchLineId" });
lineSearchText: OV<string> = mobx.observable.box("", { name: "lineSearchText" });
lineSearchSelectedLineIds: OV<string[] | null> = mobx.observable.box(null, { name: "lineSearchSelectedLineIds" });

openLineSearch(lineId: string, initialText: string = "", selectedLineIds?: string[]) {
    mobx.action(() => {
        this.lineSearchLineId.set(lineId);
        this.lineSearchText.set(initialText);
        this.lineSearchSelectedLineIds.set(selectedLineIds ?? [lineId]);
        this.lineSearchOpen.set(true);
    })();
}

closeLineSearch() {
    mobx.action(() => {
        this.lineSearchOpen.set(false);
        this.lineSearchLineId.set(null);
        this.lineSearchText.set("");
        this.lineSearchSelectedLineIds.set(null);
        (window as any).api.stopFindInPage("clearSelection");
        try {
            window.getSelection()?.removeAllRanges();
        } catch (e) {}
    })();
}
```

2. New UI component: LineSearchBar
   - Create [`src_new/components/line/linesearchbar.tsx`](src_new/components/line/linesearchbar.tsx:1) — a compact search bar intended for the line header. It should reuse existing components (TextField, Button) and mirror the main SearchModal's options (case sensitivity, regex, navigation). Key responsibilities:
     - Place the caret / DOM selection over the target line(s) before calling findInPage so results are scoped to the selected DOM nodes.
     - Update GlobalModel.lineSearchText so the value is globally visible.
     - Provide copy button (reuse existing copy action).
     - Provide navigation (prev/next) and close behavior (which clears selection and closes the bar).

Example (simplified):

```tsx
import React, { useState, useEffect, useCallback, useRef } from "react";
import { observer } from "mobx-react";
import { TextField } from "@/components/ui/textfield";
import { Button } from "@/components/ui/button";
import { GlobalModel } from "@/models";

export const LineSearchBar: React.FC<{ lineId: string; lineRef?: React.RefObject<HTMLElement> }> = observer(({ lineId, lineRef }) => {
    const [text, setText] = useState(GlobalModel.lineSearchText.get());
    const [caseSensitive, setCaseSensitive] = useState(false);

    useEffect(() => {
        GlobalModel.lineSearchText.set(text);
    }, [text]);

    const setDOMSelectionForLines = useCallback((lineIds?: string[]) => {
        // If a lineRef is provided prefer it. Otherwise, resolve DOM nodes by data-line-id attributes.
        try {
            const sel = window.getSelection();
            sel?.removeAllRanges();
            const firstId = (GlobalModel.lineSearchSelectedLineIds.get() || [lineId])[0];
            const lastId = (GlobalModel.lineSearchSelectedLineIds.get() || [lineId]).slice(-1)[0];
            const startEl = document.querySelector(`[data-line-id="${firstId}"]`);
            const endEl = document.querySelector(`[data-line-id="${lastId}"]`);
            if (startEl && endEl) {
                const range = document.createRange();
                range.setStartBefore(startEl);
                range.setEndAfter(endEl);
                sel?.addRange(range);
            } else if (lineRef?.current) {
                const range = document.createRange();
                range.selectNodeContents(lineRef.current);
                sel?.addRange(range);
            }
        } catch (e) {
            // best-effort; search will still work globally if selection fails
        }
    }, [lineId, lineRef]);

    const doSearch = useCallback((query: string, forward = true, findNext = false) => {
        if (!query.trim()) {
            (window as any).api.stopFindInPage("clearSelection");
            return;
        }
        setDOMSelectionForLines();
        (window as any).api.findInPage(query, {
            forward,
            findNext,
            matchCase: caseSensitive,
            wordStart: false,
            medialCapitalAsWordStart: false,
        });
    }, [caseSensitive, setDOMSelectionForLines]);

    return (
        <div className="line-search-bar">
            <TextField
                value={text}
                onChange={(e) => { setText(e.target.value); doSearch(e.target.value); }}
                placeholder="Search in line..."
                size="small"
                autoFocus
            />
            <Button onClick={() => { navigator.clipboard.writeText(document.querySelector(`[data-line-id="${lineId}"]`)?.textContent || ""); }}>
                Copy
            </Button>
            <Button onClick={() => doSearch(text, false, true)}>Prev</Button>
            <Button onClick={() => doSearch(text, true, true)}>Next</Button>
            <Button onClick={() => GlobalModel.closeLineSearch()}>Close</Button>
        </div>
    );
});
```

3. Integrate into line header rendering
   - Update [`src_new/components/line/line-header.tsx`](src_new/components/line/line-header.tsx:1) (or equivalent file) to conditionally render the `LineSearchBar` in the header when GlobalModel.lineSearchOpen is true and GlobalModel.lineSearchLineId matches the line's id.
   - Hide the normal line actions when the line-level search is visible.

Example rendering changes:

```tsx
const isLineSearchVisibleForThisLine = GlobalModel.lineSearchOpen.get() && GlobalModel.lineSearchLineId.get() === line.id;

return (
  <div className="line-header">
    <div className="line-meta"> ... </div>

    {isLineSearchVisibleForThisLine ? (
      <LineSearchBar lineId={line.id} lineRef={lineRef} />
    ) : (
      <LineActions /* copy, rerun, menu etc */ />
    )}
  </div>
);
```

4. Keybinding behavior
   - Modify the keybinding registration in [`src_new/components/workspace/workspace-view.tsx`](src_new/components/workspace/workspace-view.tsx:1) so that `app:openSearchModal` behaves contextually:

```typescript
keybindManager.registerKeybinding("mainview", "session", "app:openSearchModal", (waveEvent) => {
    const selectedLine = GlobalModel.selectedLineId.get();
    const selectedLineIds = GlobalModel.selectedLineRange?.get(); // if your model stores multi-line selection
    if (selectedLine || (selectedLineIds && selectedLineIds.length > 0)) {
        // open the inline line search for that line or range
        GlobalModel.openLineSearch(selectedLine || selectedLineIds![0], GlobalModel.currentSelectionText || "", selectedLineIds);
    } else {
        // fallback to global search modal
        GlobalModel.openSearchModal();
    }
    return true;
});
```

5. DOM selection scoping for multi-line searches
   - When multi-line search is requested, compute the first and last selected line DOM nodes (e.g. based on `data-line-id` attributes) and create a Range that spans them. Add that Range to window.getSelection() before calling `api.findInPage(...)`. This allows Electron's native findInPage to limit matches to the selection (the renderer will find in the selected content).

6. Hide line actions while searchbar is visible
   - Ensure components that render per-line actions check GlobalModel.lineSearchOpen.get() and avoid rendering actions for the affected line(s).
   - This prevents overlapping controls and clarifies the UI focus to search.

Notes:
- This approach leverages the existing `findInPage` pipeline and reuses native highlighting and navigation while providing a compact, contextual UI in the line header.
- The `LineSearchBar` should be keyboard accessible and follow the same option toggles (regex, case) as the main modal, but it should be a compact subset for the header.
- If selection scoping fails for any reason, the search will degrade gracefully to a global search (so the user still finds matches).


## UI Design

### Search Modal Layout

The search modal follows the design shown in the reference image:

```
┌─────────────────────────────────────────────────────────────┐
│ [🔍] [Search Input Field                    ] [.*] [Aa] [□] [🎯] [0/12] [↑] [↓] [×] │
└─────────────────────────────────────────────────────────────┘
```

### Components Used

-   **Dialog**: Modal container with backdrop
-   **TextField**: Search input with search icon decoration
-   **Button**: Toggle buttons for options and navigation
-   **InputDecoration**: Search icon in input field
-   **Lucide Icons**: Consistent iconography

### Search Options

1. **Regex (.\*)**: Toggle regular expression search
2. **Case Sensitive (Aa)**: Toggle case sensitivity
3. **Whole Word (□)**: Toggle whole word matching
4. **Find in Selection (🎯)**: Toggle search within selection only

### Navigation

-   **Previous (↑)**: Navigate to previous match
-   **Next (↓)**: Navigate to next match
-   **Close (×)**: Close search modal and clear highlighting

## User Experience

### Keyboard Shortcuts

-   **Cmd+F**: Open search modal
-   **Enter**: Next match
-   **Shift+Enter**: Previous match
-   **Escape**: Close search modal
-   **Real-time search**: Results update as you type

### Visual Feedback

-   **Match count**: Shows current position and total matches (e.g., "3/12")
-   **Option toggles**: Visual indication of active search options
-   **Highlighting**: Native browser highlighting of matches
-   **Focus management**: Auto-focus on search input when opened

### Search Behavior

-   **Real-time**: Search updates as user types
-   **Case insensitive**: Default behavior (can be toggled)
-   **Word boundaries**: Optional whole word matching
-   **Regular expressions**: Optional regex support
-   **Selection scope**: Optional search within text selection only

## Technical Details

### Electron API Usage

```typescript
// Start search
webContents.findInPage(searchText, {
    forward: true,
    findNext: false,
    matchCase: false,
    wordStart: false,
    medialCapitalAsWordStart: false,
});

// Navigate to next/previous
webContents.findInPage(searchText, {
    forward: true, // or false for previous
    findNext: true,
});

// Stop search
webContents.stopFindInPage("clearSelection"); // or "keepSelection"
```

### Search Options

-   **forward**: Search direction (true = forward, false = backward)
-   **findNext**: Whether to find next occurrence
-   **matchCase**: Case sensitive search
-   **wordStart**: Match whole words only
-   **medialCapitalAsWordStart**: Treat medial capitals as word boundaries

### Event Handling

-   **found-in-page**: Fired when search results are found
-   **result.activeMatchOrdinal**: Current match position (1-based)
-   **result.matches**: Total number of matches
-   **result.selectionArea**: Bounds of the match

## Testing Plan

### Functional Testing

1. **Basic Search**: Test simple text search
2. **Case Sensitivity**: Test case sensitive/insensitive toggle
3. **Whole Word**: Test whole word matching
4. **Regular Expressions**: Test regex search functionality
5. **Navigation**: Test next/previous match navigation
6. **Keyboard Shortcuts**: Test all keyboard shortcuts
7. **Content Types**: Test search in terminal, markdown, code blocks

### Edge Cases

1. **Empty Search**: Handle empty search input
2. **No Results**: Handle searches with no matches
3. **Special Characters**: Test search with special characters
4. **Large Content**: Test search in large documents
5. **Multiple Windows**: Test search in multiple windows
6. **Accessibility**: Test with screen readers and keyboard navigation

### Performance Testing

1. **Large Documents**: Test search performance in large content
2. **Real-time Updates**: Test search performance during typing
3. **Memory Usage**: Monitor memory usage during search operations
4. **Responsiveness**: Ensure UI remains responsive during search

## Future Enhancements

### Potential Improvements

1. **Search History**: Remember recent searches
2. **Replace Functionality**: Add find and replace capability
3. **Advanced Options**: More regex options, search in specific areas
4. **Search Filters**: Filter by content type (terminal, markdown, etc.)
5. **Search Statistics**: Show search statistics and timing
6. **Custom Highlighting**: Customizable highlight colors
7. **Search Bookmarks**: Save and restore search positions

### Integration Opportunities

1. **Command Palette**: Integrate with command palette system
2. **Sidebar Integration**: Add search panel to sidebar
3. **Multi-line Search**: Support for multi-line search patterns
4. **Search in Files**: Extend to search in file contents
5. **Search API**: Expose search functionality to plugins

## Conclusion

This implementation provides a robust, native-feeling search experience that leverages Electron's built-in capabilities while maintaining consistency with the existing UI design system. The search will work seamlessly across all content types and provide users with familiar browser-like search functionality.

The modular approach allows for easy testing, maintenance, and future enhancements while ensuring optimal performance and user experience.
