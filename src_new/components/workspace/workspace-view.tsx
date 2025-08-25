// Copyright 2023, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import * as React from "react";
import { observer } from "mobx-react";
import { clsx } from "clsx";
import dayjs from "dayjs";
import localizedFormat from "dayjs/plugin/localizedFormat";
import { If } from "tsx-control-statements/components";
import { GlobalModel, GlobalCommandRunner } from "@/models";
import { CmdInput } from "@/components/workspace";
import { ScreenView } from "@/components/workspace";
import { ScreenTabs } from "@/components/workspace";
import { ErrorBoundary } from "@/components/error/errorboundary";

dayjs.extend(localizedFormat);

const SessionKeybindings: React.FC = () => {
    React.useEffect(() => {
        const keybindManager = GlobalModel.keybindManager;
        keybindManager.registerKeybinding("mainview", "session", "app:toggleSidebar", (waveEvent) => {
            GlobalModel.handleToggleSidebar();
            return true;
        });
        keybindManager.registerKeybinding("mainview", "session", "app:newTab", (waveEvent) => {
            GlobalModel.onNewTab();
            return true;
        });
        keybindManager.registerKeybinding("mainview", "session", "app:closeCurrentTab", (waveEvent) => {
            GlobalModel.onCloseCurrentTab();
            return true;
        });
        for (let index = 1; index <= 9; index++) {
            keybindManager.registerKeybinding("mainview", "session", "app:selectTab-" + index, (waveEvent) => {
                GlobalModel.onSwitchScreenCmd(index);
                return true;
            });
        }
        keybindManager.registerKeybinding("mainview", "session", "app:selectTabLeft", (waveEvent) => {
            GlobalModel.onBracketCmd(-1);
            return true;
        });
        keybindManager.registerKeybinding("mainview", "session", "app:selectTabRight", (waveEvent) => {
            GlobalModel.onBracketCmd(1);
            return true;
        });
        keybindManager.registerKeybinding("pane", "screen", "app:selectLineAbove", (waveEvent) => {
            GlobalModel.onMetaArrowUp();
            return true;
        });
        keybindManager.registerKeybinding("pane", "screen", "app:selectLineBelow", (waveEvent) => {
            GlobalModel.onMetaArrowDown();
            return true;
        });
        keybindManager.registerKeybinding("pane", "screen", "app:restartCommand", (waveEvent) => {
            GlobalModel.onRestartCommand();
            return true;
        });
        keybindManager.registerKeybinding("pane", "screen", "app:restartLastCommand", (waveEvent) => {
            GlobalModel.onRestartLastCommand();
            return true;
        });
        keybindManager.registerKeybinding("pane", "screen", "app:focusSelectedLine", (waveEvent) => {
            GlobalModel.onFocusSelectedLine();
            return true;
        });
        keybindManager.registerKeybinding("pane", "screen", "app:deleteActiveLine", (waveEvent) => {
            return GlobalModel.handleDeleteActiveLine();
        });
        keybindManager.registerKeybinding("mainview", "session", "app:openSearchModal", (waveEvent) => {
            try {
                const activeScreen = GlobalModel.getActiveScreen();
                if (activeScreen) {
                    const selectedLines = activeScreen.getSelectedLines();
                    if (selectedLines && selectedLines.length > 0) {
                        const selectedLineIds: string[] = [];
                        for (const ln of selectedLines) {
                            const line = activeScreen.getLineByNum(ln);
                            if (line && line.lineid) selectedLineIds.push(line.lineid);
                        }
                        const firstLineId = selectedLineIds[0];
                        // Use any browser text selection as initial search text when available
                        const selection = window.getSelection ? window.getSelection()?.toString() : "";
                        const initialText = selection && selection.length > 0 ? selection : "";
                        if (firstLineId) {
                            GlobalModel.openLineSearch(firstLineId, initialText, selectedLineIds);
                            return true;
                        }
                    }
                }
            } catch (e) {
                console.warn("error opening line search:", e);
            }
            // fallback to global search modal
            GlobalModel.openSearchModal();
            return true;
        });
        keybindManager.registerKeybinding("pane", "screen", "app:copy", (waveEvent) => {
            // First check if we have a terminal selection
            const activeScreen = GlobalModel.getActiveScreen();
            if (activeScreen) {
                const selectedLines = activeScreen.getSelectedLines();
                if (selectedLines && selectedLines.length > 0) {
                    // Check if there's a terminal selection in any of the selected lines
                    for (const lineNum of selectedLines) {
                        const line = activeScreen.getLineByNum(lineNum);
                        if (line) {
                            const termWrap = activeScreen.getTermWrap(line.lineid);
                            if (termWrap && termWrap.terminal) {
                                const termSelection = termWrap.terminal.getSelection();
                                console.log("Terminal selection:", termSelection);
                                if (termSelection && termSelection.length > 0) {
                                    console.log("Copying terminal selection:", termSelection);
                                    navigator.clipboard.writeText(termSelection);
                                    return true;
                                }
                            }
                        }
                    }
                }
            }
            
            // Check browser text selection
            const selection = window.getSelection();
            const selectedText = selection ? selection.toString() : "";
            
            if (selectedText.length > 0) {
                // If there's text selected, copy it to clipboard
                console.log("Copying browser selected text:", selectedText);
                navigator.clipboard.writeText(selectedText);
                return true;
            }
            
            // Otherwise, copy the entire block
            console.log("No text selected, copying entire block");
            GlobalModel.copySelectedBlock();
            return true;
        });

        return () => {
            keybindManager.unregisterDomain("session");
            keybindManager.unregisterDomain("screen");
        };
    }, []);

    return null;
};



export const WorkspaceView: React.FC = observer(() => {
    const sessionRef = React.useRef<HTMLDivElement>(null);

    const session = GlobalModel.getActiveSession();
    let activeScreen: any | null = null;
    let sessionId: string = "none";
    if (session != null) {
        sessionId = session.sessionId;
        activeScreen = session.getActiveScreen();
    }
    const isHidden = GlobalModel.activeMainView.get() != "session";
    const mainSidebarModel = GlobalModel.mainSidebarModel;
    const inputPosition = GlobalModel.inputPosition.get();

    return (
        <div
            ref={sessionRef}
            className={clsx("absolute inset-0 flex flex-col overflow-hidden", { "hidden": isHidden })}
            id={sessionId}
            data-sessionid={sessionId}
        >
            <If condition={!isHidden}>
                <SessionKeybindings key="keybindings" />
            </If>
            <ScreenTabs key={"tabs-" + sessionId} session={session} />
            <ErrorBoundary key="eb">
                <div className="flex flex-col flex-1 overflow-hidden">
                    <If condition={activeScreen != null && inputPosition === "top"}>
                        <div className="px-2 pt-2">
                            <div className="my-1">
                                <CmdInput key={"cmdinput-" + sessionId} />
                            </div>
                        </div>
                    </If>
                    <div className="flex-1 relative overflow-hidden px-2">
                        <ScreenView key={`screenview-${sessionId}`} session={session} screen={activeScreen} />
                    </div>
                    <If condition={activeScreen != null && inputPosition !== "top"}>
                        <div className="px-2 pb-2">
                            <div className="my-1">
                                <CmdInput key={"cmdinput-" + sessionId} />
                            </div>
                        </div>
                    </If>
                </div>
            </ErrorBoundary>
        </div>
    );
});
