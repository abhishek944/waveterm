// Copyright 2023, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import * as React from "react";
import { observer } from "mobx-react";
import * as mobx from "mobx";
import * as util from "@/utils/util";
import { If } from "tsx-control-statements/components";
import { clsx } from "clsx";
import { GlobalModel, GlobalCommandRunner, Screen } from "@/models";
import { getMonoFontSize } from "@/utils/textmeasure";
import * as appconst from "@/app/appconst";

type OV<T> = mobx.IObservableValue<T>;
const MaxInputLength = 10 * 1024;

function pageSize(div: any): number {
    if (div == null) {
        return 300;
    }
    let size = div.clientHeight;
    if (size > 500) {
        size = size - 100;
    } else if (size > 200) {
        size = size - 30;
    }
    return size;
}

function scrollDiv(div: any, amt: number) {
    if (div == null) {
        return;
    }
    let newScrollTop = div.scrollTop + amt;
    if (newScrollTop < 0) {
        newScrollTop = 0;
    }
    div.scrollTo({ top: newScrollTop, behavior: "smooth" });
}

const HistoryKeybindings: React.FC = () => {
    React.useEffect(() => {
        if (GlobalModel.activeMainView.get() !== "session") {
            return;
        }
        const inputModel = GlobalModel.inputModel;
        const keybindManager = GlobalModel.keybindManager;
        keybindManager.registerKeybinding("pane", "history", "generic:cancel", () => {
            inputModel.resetHistory();
            return true;
        });
        keybindManager.registerKeybinding("pane", "history", "generic:confirm", () => {
            inputModel.grabSelectedHistoryItem();
            return true;
        });
        keybindManager.registerKeybinding("pane", "history", "history:closeHistory", () => {
            inputModel.resetInput();
            return true;
        });
        keybindManager.registerKeybinding("pane", "history", "history:toggleShowRemotes", () => {
            inputModel.toggleRemoteType();
            return true;
        });
        keybindManager.registerKeybinding("pane", "history", "history:changeScope", () => {
            inputModel.toggleHistoryType();
            return true;
        });
        keybindManager.registerKeybinding("pane", "history", "generic:selectAbove", () => {
            inputModel.moveHistorySelection(1);
            return true;
        });
        keybindManager.registerKeybinding("pane", "history", "generic:selectBelow", () => {
            inputModel.moveHistorySelection(-1);
            return true;
        });
        keybindManager.registerKeybinding("pane", "history", "generic:selectPageAbove", () => {
            inputModel.moveHistorySelection(10);
            return true;
        });
        keybindManager.registerKeybinding("pane", "history", "generic:selectPageBelow", () => {
            inputModel.moveHistorySelection(-10);
            return true;
        });
        keybindManager.registerKeybinding("pane", "history", "history:selectPreviousItem", () => {
            inputModel.moveHistorySelection(1);
            return true;
        });
        keybindManager.registerKeybinding("pane", "history", "history:selectNextItem", () => {
            inputModel.moveHistorySelection(-1);
            return true;
        });

        return () => {
            keybindManager.unregisterDomain("history");
        };
    }, []);

    return null;
};

const CmdInputKeybindings: React.FC<{ inputObject: any }> = ({ inputObject }) => {
    const curPress = React.useRef("");
    const lastTab = React.useRef(false);

    React.useEffect(() => {
        if (GlobalModel.activeMainView.get() !== "session") {
            return;
        }
        const keybindManager = GlobalModel.keybindManager;
        const inputModel = GlobalModel.inputModel;

        keybindManager.registerKeybinding("pane", "cmdinput", "cmdinput:autocomplete", () => {
            curPress.current = "tab";
            if (GlobalModel.autocompleteModel.isEnabled) {
                if (lastTab.current) {
                    const curLine = inputModel.curLine;
                    if (curLine !== "") {
                        inputModel.setActiveAuxView(appconst.InputAuxView_Suggestions);
                    }
                } else {
                    lastTab.current = true;
                }
            } else {
                const wasLastTab = lastTab.current;
                lastTab.current = true;
                const curLine = inputModel.curLine;
                if (wasLastTab) {
                    GlobalModel.submitCommand("_compgen", null, [curLine], { comppos: String(curLine.length), compshow: "1", nohist: "1" }, true);
                } else {
                    GlobalModel.submitCommand("_compgen", null, [curLine], { comppos: String(curLine.length), nohist: "1" }, true);
                }
            }
            return true;
        });

        keybindManager.registerKeybinding("pane", "cmdinput", "generic:confirm", () => {
            GlobalModel.closeTabSettings();
            if (GlobalModel.inputModel.isEmpty()) {
                const activeWindow = GlobalModel.getScreenLinesForActiveScreen();
                const activeScreen = GlobalModel.getActiveScreen();
                if (activeScreen != null && activeWindow != null && activeWindow.lines.length > 0) {
                    activeScreen.setSelectedLine(0);
                    GlobalCommandRunner.screenSelectLine("E");
                }
            } else {
                setTimeout(() => GlobalModel.inputModel.uiSubmitCommand(), 0);
            }
            return true;
        });

        keybindManager.registerKeybinding("pane", "cmdinput", "generic:cancel", () => {
            GlobalModel.closeTabSettings();
            inputModel.closeAuxView();
            return true;
        });

        keybindManager.registerKeybinding("pane", "cmdinput", "cmdinput:expandInput", () => {
            inputModel.toggleExpandInput();
            return true;
        });

        keybindManager.registerKeybinding("pane", "cmdinput", "cmdinput:clearInput", () => {
            inputModel.resetInput();
            return true;
        });

        keybindManager.registerKeybinding("pane", "cmdinput", "cmdinput:cutLineLeftOfCursor", () => {
            inputObject.controlU();
            return true;
        });

        keybindManager.registerKeybinding("pane", "cmdinput", "cmdinput:cutWordLeftOfCursor", () => {
            inputObject.controlW();
            return true;
        });

        keybindManager.registerKeybinding("pane", "cmdinput", "cmdinput:paste", () => {
            inputObject.controlY();
            return true;
        });

        keybindManager.registerKeybinding("pane", "cmdinput", "cmdinput:openHistory", () => {
            inputModel.openHistory();
            return true;
        });

        keybindManager.registerKeybinding("pane", "cmdinput", "cmdinput:previousHistoryItem", () => {
            curPress.current = "historyupdown";
            inputObject.controlP();
            return true;
        });

        keybindManager.registerKeybinding("pane", "cmdinput", "cmdinput:nextHistoryItem", () => {
            curPress.current = "historyupdown";
            inputObject.controlN();
            return true;
        });

        keybindManager.registerKeybinding("pane", "cmdinput", "cmdinput:openAIChat", () => {
            inputModel.openAIAssistantChat();
            return true;
        });

        keybindManager.registerKeybinding("pane", "cmdinput", "generic:selectAbove", () => {
            curPress.current = "historyupdown";
            return inputObject.arrowUpPressed();
        });

        keybindManager.registerKeybinding("pane", "cmdinput", "generic:selectBelow", () => {
            curPress.current = "historyupdown";
            return inputObject.arrowDownPressed();
        });

        keybindManager.registerKeybinding("pane", "cmdinput", "generic:selectRight", () => {
            return inputObject.arrowRightPressed();
        });

        keybindManager.registerKeybinding("pane", "cmdinput", "generic:selectPageAbove", () => {
            curPress.current = "historyupdown";
            inputObject.scrollPage(true);
            return true;
        });

        keybindManager.registerKeybinding("pane", "cmdinput", "generic:selectPageBelow", () => {
            curPress.current = "historyupdown";
            inputObject.scrollPage(false);
            return true;
        });

        keybindManager.registerKeybinding("pane", "cmdinput", "generic:expandTextInput", () => {
            inputObject.modEnter();
            return true;
        });

        const domainCallback = () => {
            if (curPress.current !== "tab") {
                lastTab.current = false;
            }
            if (curPress.current !== "historyupdown") {
                inputObject.lastHistoryUpDown = false;
            }
            curPress.current = "";
            return false;
        };

        keybindManager.registerDomainCallback("cmdinput", domainCallback);

        return () => {
            keybindManager.unregisterDomain("cmdinput");
        };
    }, [inputObject]);

    return null;
};

export const TextAreaInput: React.FC<{ screen: Screen; onHeightChange: () => void }> = observer(
    ({ screen, onHeightChange }) => {
        const lastHistoryUpDown = React.useRef(false);
        const lastFocusType = React.useRef<string | null>(null);
        const mainInputRef = React.useRef<HTMLTextAreaElement>(null);
        const historyInputRef = React.useRef<HTMLInputElement>(null);
        const controlRef = React.useRef<HTMLDivElement>(null);
        const lastHeight = React.useRef(0);
        const lastSP = React.useRef<any>({ str: "", pos: appconst.NoStrPos });
        const [version, setVersion] = React.useState(0);

        const incVersion = () => setVersion((v) => v + 1);

        const getCurSP = (): any => {
            const textarea = mainInputRef.current;
            if (textarea == null) {
                return lastSP.current;
            }
            const { value: str, selectionStart: pos, selectionEnd: endPos } = textarea;
            if (pos !== endPos) {
                return { str, pos: appconst.NoStrPos };
            }
            return { str, pos };
        };

        const updateSP = () => {
            const curSP = getCurSP();
            if (curSP.str === lastSP.current.str && curSP.pos === lastSP.current.pos) {
                return;
            }
            lastSP.current = curSP;
            GlobalModel.sendCmdInputText(screen.screenId, curSP);
        };

        const setFocus = () => {
            GlobalModel.inputModel.giveFocus();
        };

        const getTextAreaMaxCols = (): number => {
            const taElem = mainInputRef.current;
            if (taElem == null) return 0;
            const cs = window.getComputedStyle(taElem);
            const padding = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
            const borders = parseFloat(cs.borderLeft) + parseFloat(cs.borderRight);
            const contentWidth = taElem.clientWidth - padding - borders;
            const fontSize = getMonoFontSize(parseInt(cs.fontSize));
            return Math.floor(contentWidth / Math.ceil(fontSize.width));
        };

        const checkHeight = (shouldFire: boolean) => {
            const elem = controlRef.current;
            if (elem == null) return;
            const curHeight = elem.offsetHeight;
            if (lastHeight.current === curHeight) return;
            lastHeight.current = curHeight;
            if (shouldFire && onHeightChange != null) {
                onHeightChange();
            }
        };

        const updateCursorPosIfForced = () => {
            const inputModel = GlobalModel.inputModel;
            const fcpos = inputModel.forceCursorPos.get();
            if (fcpos != null && fcpos !== appconst.NoStrPos) {
                if (mainInputRef.current != null) {
                    mainInputRef.current.selectionStart = fcpos;
                    mainInputRef.current.selectionEnd = fcpos;
                }
                inputModel.forceCursorPos.set(null);
            }
        };

        React.useEffect(() => {
            const activeScreen = GlobalModel.getActiveScreen();
            if (activeScreen != null) {
                const focusType = activeScreen.focusType.get();
                if (focusType === "input") {
                    setFocus();
                }
                lastFocusType.current = focusType;
            }
            checkHeight(false);
            updateSP();
            updateCursorPosIfForced();
        }, []);

        React.useEffect(() => {
            const activeScreen = GlobalModel.getActiveScreen();
            if (activeScreen != null) {
                const focusType = activeScreen.focusType.get();
                if (lastFocusType.current !== focusType && focusType === "input") {
                    setFocus();
                }
                lastFocusType.current = focusType;
            }
            const inputModel = GlobalModel.inputModel;
            updateCursorPosIfForced();
            if (inputModel.forceInputFocus) {
                inputModel.forceInputFocus = false;
                setFocus();
            }
            checkHeight(true);
            updateSP();
        });

        const getLinePos = (elem: any): { numLines: number; linePos: number } => {
            const numLines = elem.value.split("\n").length;
            const linePos = elem.value.substr(0, elem.selectionStart).split("\n").length;
            return { numLines, linePos };
        };

        const arrowUpPressed = (): boolean => {
            const inputModel = GlobalModel.inputModel;
            if (!inputModel.isHistoryLoaded()) {
                lastHistoryUpDown.current = true;
                inputModel.loadHistory(false, 1, "screen");
                return true;
            }
            const currentRef = mainInputRef.current;
            if (currentRef == null) return true;
            const linePos = getLinePos(currentRef);
            if (!lastHistoryUpDown.current && linePos.linePos > 1) {
                return false;
            }
            inputModel.moveHistorySelection(1);
            lastHistoryUpDown.current = true;
            return true;
        };

        const arrowDownPressed = (): boolean => {
            const inputModel = GlobalModel.inputModel;
            if (!inputModel.isHistoryLoaded()) return true;
            const currentRef = mainInputRef.current;
            if (currentRef == null) return true;
            const linePos = getLinePos(currentRef);
            if (!lastHistoryUpDown.current && linePos.linePos < linePos.numLines) {
                return false;
            }
            inputModel.moveHistorySelection(-1);
            lastHistoryUpDown.current = true;
            return true;
        };

        const arrowRightPressed = (): boolean => {
            const curSP = getCurSP();
            if (curSP.pos < curSP.str.length) return false;
            GlobalModel.autocompleteModel.applyPrimarySuggestion();
            return true;
        };

        const scrollPage = (up: boolean) => {
            const inputModel = GlobalModel.inputModel;
            const infoScroll = inputModel.hasScrollingInfoMsg();
            if (infoScroll) {
                const div = document.querySelector(".cmd-input-info");
                const amt = pageSize(div);
                scrollDiv(div, up ? -amt : amt);
            }
        };

        const modEnter = () => {
            const currentRef = mainInputRef.current;
            if (currentRef == null) return;
            currentRef.setRangeText("\n", currentRef.selectionStart, currentRef.selectionEnd, "end");
            GlobalModel.inputModel.curLine = currentRef.value;
        };

        const onChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
            GlobalModel.inputModel.curLine = e.target.value;
        };

        const onSelect = () => {
            incVersion();
        };

        const controlU = () => {
            if (mainInputRef.current == null) return;
            const { selectionStart, value } = mainInputRef.current;
            if (selectionStart > value.length) return;
            const cutValue = value.substring(0, selectionStart);
            const restValue = value.substring(selectionStart);
            const cmdLineUpdate = { str: restValue, pos: 0 };
            navigator.clipboard.writeText(cutValue);
            GlobalModel.inputModel.updateCmdLine(cmdLineUpdate);
        };

        const controlP = () => {
            const inputModel = GlobalModel.inputModel;
            if (!inputModel.isHistoryLoaded()) {
                lastHistoryUpDown.current = true;
                inputModel.loadHistory(false, 1, "screen");
                return;
            }
            inputModel.moveHistorySelection(1);
            lastHistoryUpDown.current = true;
        };

        const controlN = () => {
            const inputModel = GlobalModel.inputModel;
            inputModel.moveHistorySelection(-1);
            lastHistoryUpDown.current = true;
        };

        const controlW = () => {
            if (mainInputRef.current == null) return;
            const { selectionStart, value } = mainInputRef.current;
            if (selectionStart > value.length) return;
            let cutSpot = selectionStart - 1;
            let initial = true;
            for (; cutSpot >= 0; cutSpot--) {
                const ch = value[cutSpot];
                if (ch === " " && initial) continue;
                initial = false;
                if (ch === " ") {
                    cutSpot++;
                    break;
                }
            }
            if (cutSpot === -1) cutSpot = 0;
            const cutValue = value.slice(cutSpot, selectionStart);
            const prevValue = value.slice(0, cutSpot);
            const restValue = value.slice(selectionStart);
            const cmdLineUpdate = { str: prevValue + restValue, pos: prevValue.length };
            navigator.clipboard.writeText(cutValue);
            GlobalModel.inputModel.updateCmdLine(cmdLineUpdate);
        };

        const controlY = () => {
            if (mainInputRef.current == null) return;
            navigator.clipboard.readText().then((clipText) => {
                clipText = clipText ?? "";
                const { selectionStart, selectionEnd, value } = mainInputRef.current as any;
                if (selectionStart > value.length || selectionEnd > value.length) return;
                const newValue = value.substring(0, selectionStart) + clipText + value.substring(selectionEnd);
                const cmdLineUpdate = { str: newValue, pos: selectionStart + clipText.length };
                GlobalModel.inputModel.updateCmdLine(cmdLineUpdate);
            });
        };

        const handleHistoryInput = (e: React.ChangeEvent<HTMLInputElement>) => {
            const inputModel = GlobalModel.inputModel;
            const opts = mobx.toJS(inputModel.historyQueryOpts.get());
            opts.queryStr = e.target.value;
            inputModel.setHistoryQueryOpts(opts);
        };

        const handleFocus = (e: React.FocusEvent) => {
            e.preventDefault();
            GlobalModel.inputModel.giveFocus();
        };

        const handleMainBlur = () => {
            if (document.activeElement === mainInputRef.current) return;
            GlobalModel.inputModel.setPhysicalInputFocused(false);
        };

        const handleHistoryBlur = () => {
            if (document.activeElement === historyInputRef.current) return;
            GlobalModel.inputModel.setPhysicalInputFocused(false);
        };

        const model = GlobalModel;
        const inputModel = model.inputModel;
        const curLine = inputModel.curLine;
        let displayLines = 1;
        const numLines = curLine.split("\n").length;
        const maxCols = getTextAreaMaxCols();
        let longLine = false;
        if (maxCols !== 0 && curLine.length >= maxCols - 4) {
            longLine = true;
        }
        if (numLines > 1 || longLine || inputModel.inputExpanded.get()) {
            displayLines = 5;
        }

        const auxViewFocused = inputModel.getAuxViewFocus();
        if (auxViewFocused) {
            displayLines = 1;
        }
        const activeScreen = GlobalModel.getActiveScreen();
        if (activeScreen != null) {
            activeScreen.focusType.get(); // for reaction
        }
        const termFontSize = GlobalModel.getTermFontSize();
        const fontSize = getMonoFontSize(termFontSize);
        const termPad = fontSize.pad;
        const computedInnerHeight = displayLines * fontSize.height + 2 * termPad;
        const computedOuterHeight = computedInnerHeight + 2 * termPad;
        let shellType: string = "";
        if (screen != null) {
            const ri = screen.getCurRemoteInstance();
            if (ri?.shelltype != null) {
                shellType = ri.shelltype;
            }
            if (shellType === "") {
                const rptr = screen.curRemote.get();
                if (rptr != null) {
                    const remote = GlobalModel.getRemote(rptr.remoteid);
                    if (remote != null) {
                        shellType = remote.defaultshelltype;
                    }
                }
            }
        }
        const renderCmdInputKeybindings =
            inputModel.shouldRenderAuxViewKeybindings(null) ||
            inputModel.shouldRenderAuxViewKeybindings(appconst.InputAuxView_Info);
        const renderHistoryKeybindings = inputModel.shouldRenderAuxViewKeybindings(appconst.InputAuxView_History);

        const primaryAutocompleteSuggestion = GlobalModel.autocompleteModel.getPrimarySuggestionCompletion();

        const inputObject = {
            controlU,
            controlW,
            controlY,
            controlP,
            controlN,
            arrowUpPressed,
            arrowDownPressed,
            arrowRightPressed,
            scrollPage,
            modEnter,
            lastHistoryUpDown: lastHistoryUpDown.current,
        };

        return (
            <div
                className="control is-expanded relative"
                ref={controlRef}
                style={{ height: computedOuterHeight }}
            >
                <If condition={renderCmdInputKeybindings}>
                    <CmdInputKeybindings inputObject={inputObject} />
                </If>
                <If condition={renderHistoryKeybindings}>
                    <HistoryKeybindings />
                </If>

                {/* <If condition={!util.isBlank(shellType)}>
                    <div className="absolute bottom-[-13px] right-0 text-xs text-gray-400 select-none">{shellType}</div>
                </If> */}
                <If condition={primaryAutocompleteSuggestion}>
                    <div
                        className="absolute top-0 left-0 resize-none overflow-auto whitespace-pre-wrap font-mono bg-transparent border-none shadow-none text-gray-500 z-10"
                        style={{ height: computedInnerHeight, minHeight: computedInnerHeight, fontSize: termFontSize, padding: `${termPad}px 0` }}
                    >
                        {`${"\xa0".repeat(curLine.length)}${primaryAutocompleteSuggestion}`}
                    </div>
                </If>
                <textarea
                    key="main"
                    ref={mainInputRef}
                    spellCheck="false"
                    autoComplete="off"
                    autoCorrect="off"
                    id="main-cmd-input"
                    onFocus={handleFocus}
                    onBlur={handleMainBlur}
                    style={{ height: computedInnerHeight, minHeight: computedInnerHeight, fontSize: termFontSize, padding: `${termPad}px 0` }}
                    value={curLine}
                    onChange={onChange}
                    onSelect={onSelect}
                    placeholder="Type here..."
                    maxLength={MaxInputLength}
                    className={clsx("textarea absolute top-0 left-0 resize-none overflow-auto whitespace-pre-wrap font-mono bg-transparent border-none shadow-none outline-none focus:outline-none focus:ring-0 text-white placeholder:text-gray-400 z-20", { "display-disabled": auxViewFocused })}
                ></textarea>
                <input
                    key="history"
                    ref={historyInputRef}
                    spellCheck="false"
                    autoComplete="off"
                    autoCorrect="off"
                    className="hidden"
                    type="text"
                    onFocus={handleFocus}
                    onBlur={handleHistoryBlur}
                    onChange={handleHistoryInput}
                    value={inputModel.historyQueryOpts.get().queryStr}
                />
            </div>
        );
    }
);