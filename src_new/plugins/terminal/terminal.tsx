// Copyright 2023, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import * as React from "react";
import * as mobx from "mobx";
import { observer } from "mobx-react";
import dayjs from "dayjs";
import localizedFormat from "dayjs/plugin/localizedFormat";
import { If } from "tsx-control-statements/components";
import { GlobalModel } from "@/models";
import { debounce } from "throttle-debounce";
import { termHeightFromRows, windowWidthToCols } from "@/utils/textmeasure";
import { clsx } from "clsx";
import * as lineutil from "@/components/line/lineutil";
import * as appconst from "@/app/appconst";
import "xterm/css/xterm.css";

dayjs.extend(localizedFormat);

const TerminalKeybindings: React.FC<{ termWrap: any; lineid: string }> = ({ termWrap, lineid }) => {
    React.useEffect(() => {
        const keybindManager = GlobalModel.keybindManager;
        const domain = `line-${lineid}`;

        keybindManager.registerKeybinding("plugin", domain, "terminal:copy", () => {
            const sel = termWrap.terminal.getSelection();
            navigator.clipboard.writeText(sel);
            return true;
        });

        keybindManager.registerKeybinding("plugin", domain, "terminal:paste", () => {
            navigator.clipboard.readText().then((text) => {
                termWrap.dataHandler?.(text, termWrap);
            });
            return true;
        });

        keybindManager.registerKeybinding("plugin", domain, "generic:selectAbove", () => {
            termWrap.terminal.scrollLines(-1);
            return true;
        });

        keybindManager.registerKeybinding("plugin", domain, "generic:selectBelow", () => {
            termWrap.terminal.scrollLines(1);
            return true;
        });

        keybindManager.registerKeybinding("plugin", domain, "generic:selectPageAbove", () => {
            termWrap.terminal.scrollLines(-10);
            return true;
        });

        keybindManager.registerKeybinding("plugin", domain, "generic:selectPageBelow", () => {
            termWrap.terminal.scrollLines(10);
            return true;
        });

        keybindManager.unregisterDomain(domain);
    }, [termWrap, lineid]);

    return null;
};

export const TerminalRenderer: React.FC<{
    screen: LineContainerType;
    line: LineType;
    width: number;
    staticRender: boolean;
    visible: OV<boolean>;
    onHeightChange: () => void;
    collapsed: boolean;
}> = observer(({ screen, line, width, staticRender, visible, onHeightChange, collapsed }) => {
    const [termLoaded, setTermLoaded] = React.useState(false);
    const elemRef = React.useRef<HTMLDivElement>(null);
    const termRef = React.useRef<HTMLDivElement>(null);
    const loadingRef = React.useRef(false);

    const unloadTerminal = React.useCallback(
        (unmount: boolean) => {
            console.log("[TerminalRenderer] unloadTerminal " + JSON.stringify({ lineid: line.lineid, unmount }));
            screen.unloadRenderer(line.lineid);
            if (!unmount) {
                setTermLoaded(false);
                if (termRef.current) {
                    termRef.current.replaceChildren();
                }
            }
        },
        [screen, line.lineid]
    );

    const loadTerminal = React.useCallback(() => {
        const cmd = screen.getCmd(line);
        if (cmd == null || termRef.current == null) {
            console.log(
                "[TerminalRenderer] loadTerminal aborted (no cmd or ref) " +
                    JSON.stringify({ hasCmd: !!cmd, hasRef: !!termRef.current, lineid: line.lineid })
            );
            return;
        }
        console.log("[TerminalRenderer] loadTerminal " + JSON.stringify({ lineid: line.lineid, width }));
        screen.loadTerminalRenderer(termRef.current, line, cmd, width);
        setTermLoaded(true);
        loadingRef.current = false;
    }, [screen, line, width]);

    React.useEffect(() => {
        if (!staticRender) {
            const vis = ((): boolean => {
                const anyVis: any = visible as any;
                if (typeof anyVis === "boolean") return anyVis && !collapsed;
                const v = anyVis?.get?.();
                return (v ?? !!anyVis) && !collapsed;
            })();
            if (vis && !termLoaded && !loadingRef.current) {
                loadingRef.current = true;
                console.log("[TerminalRenderer] effect -> load " + JSON.stringify({ lineid: line.lineid }));
                loadTerminal();
            } else if (!vis && termLoaded) {
                console.log("[TerminalRenderer] effect -> unload " + JSON.stringify({ lineid: line.lineid }));
                unloadTerminal(false);
            }
        }
    }, [staticRender, collapsed, termLoaded, loadTerminal, unloadTerminal]);

    React.useEffect(() => {
        return () => {
            if (termLoaded) {
                console.log("[TerminalRenderer] unmount -> unload", { lineid: line.lineid });
                unloadTerminal(true);
            }
        };
    }, [termLoaded, unloadTerminal]);

    const roRef = React.useRef<ResizeObserver | null>(null);
    React.useEffect(() => {
        if (!onHeightChange) return;
        if (elemRef.current && !roRef.current) {
            // Reduced logging to avoid console spam
            // console.log("[TerminalRenderer] attaching ResizeObserver " + JSON.stringify({ lineid: line.lineid }));
            const debouncedHeightChange = debounce(50, () => onHeightChange());
            roRef.current = new ResizeObserver(debouncedHeightChange);
            roRef.current.observe(elemRef.current);
        }
        return () => {
            if (roRef.current) {
                roRef.current.disconnect();
                roRef.current = null;
            }
        };
    }, [onHeightChange, line.lineid]);

    React.useEffect(() => {
        const termWrap = screen.getTermWrap(line.lineid);
        if (termLoaded && termWrap) {
            const cols = windowWidthToCols(width, GlobalModel.getTermFontSize());
            // Reduced logging to avoid console spam
            // console.log(
            //     "[TerminalRenderer] width effect -> resizeCols " + JSON.stringify({ lineid: line.lineid, cols, width })
            // );
            termWrap.resizeCols(cols);
        }
    }, [width, termLoaded, line.lineid, screen]);

    const clickTermBlock = () => {
        const termWrap = screen.getTermWrap(line.lineid);
        if (termWrap != null) {
            termWrap.giveFocus();
        }
    };

    const isPhysicalFocused = mobx.computed(() => screen.getIsFocused(line.linenum)).get();
    const isFocused = mobx.computed(() => isPhysicalFocused && screen.getFocusType() === "cmd").get();
    const cmd = screen.getCmd(line);
    const usedRows = screen.getUsedRows(lineutil.getRendererContext(line), line, cmd, width);
    const wrapForRow = screen.getTermWrap(line.lineid);
    const isSidebar = screen.getContainerType() === appconst.LineContainer_Sidebar;
    let termHeight = 0;

    if (usedRows > 0) {
        const measuredRowHeight = typeof wrapForRow?.getFontHeight === "function" ? wrapForRow.getFontHeight() : 0;
        if (measuredRowHeight && measuredRowHeight > 0) {
            termHeight = Math.ceil(measuredRowHeight * usedRows);
        } else {
            termHeight = termHeightFromRows(usedRows, GlobalModel.getTermFontSize(), cmd.getTermMaxRows());
        }
    }

    if (isSidebar) {
        // In sidebar, rely on flexbox layout to fill the height.
        // Set termHeight to -1 sentinel so we can treat it specially in styles below.
        termHeight = -1;
    }
    // Debug logging for sidebar terminals
    try {
        if (isSidebar) {
            console.log(
                "[TerminalRenderer] sidebar render " +
                    JSON.stringify({
                        lineid: line.lineid,
                        usedRows,
                        termHeight,
                        termLoaded,
                        isSidebar,
                        measuredRowHeight: wrapForRow?.getFontHeight?.() || null,
                        termRows: wrapForRow?.terminal?.rows || null,
                    })
            );
        }
    } catch {}
    const termWrap = screen.getTermWrap(line.lineid);

    // Sidebar auto rows
    useSidebarAutoRows(isSidebar, termLoaded, elemRef, line.lineid, screen);

    return (
        <>
            {/* Tailwind-only; remove custom CSS hooks */}
            {(() => {
                return (
                    <div
                        ref={elemRef}
                        className={clsx(
                            "w-full overflow-x-hidden",
                            termHeight === 0 ? "h-0" : "",
                            isSidebar ? "flex flex-col h-full" : ""
                        )}
                        data-usedrows={usedRows}
                        style={isSidebar ? { height: "100%" } : {}}
                    >
                        <If condition={!isFocused}>
                            <div className="term-block" onClick={clickTermBlock} />
                        </If>
                        <If condition={isFocused}>
                            <TerminalKeybindings termWrap={termWrap} lineid={line.lineid} />
                        </If>
                        <div
                            className={clsx("w-full", isSidebar ? "flex-1" : "")}
                            ref={termRef}
                            data-lineid={line.lineid}
                            style={{
                                height: isSidebar ? "100%" : termHeight,
                                minHeight: isSidebar ? "100%" : "auto",
                            }}
                            data-debug-height={termHeight}
                            data-is-sidebar={isSidebar}
                        />
                        <If condition={!termLoaded}>
                            <div className="terminal-loading-message">...</div>
                        </If>
                    </div>
                );
            })()}
        </>
    );
});

// Sidebar auto-resize hook: adjust terminal rows when container height changes
function useSidebarAutoRows(
    isSidebar: boolean,
    termLoaded: boolean,
    elemRef: React.RefObject<HTMLDivElement>,
    lineId: string,
    screen: any
) {
    React.useEffect(() => {
        if (!isSidebar || !termLoaded) return;

        const container = elemRef.current;
        if (!container) return;

        const lineHeight = GlobalModel.lineHeightEnv.lineHeight || 15;

        const updateRows = () => {
            const termWrap = screen.getTermWrap(lineId);
            if (!termWrap) return;
            // Increase allowed rows for sidebar to prevent clamping
            // TODO: Change this according to screen height.
            if ((termWrap as any).maxRows < 42) {
                (termWrap as any).maxRows = 42;
            }
            const height = container.clientHeight;
            const rows = Math.max(5, Math.floor(height / lineHeight));
            if (termWrap.terminal && termWrap.terminal.rows !== rows) {
                try {
                    termWrap.resize({ rows, cols: termWrap.terminal.cols });
                } catch (e) {
                    console.error("[SidebarRows] resize error", e);
                }
            }
        };

        updateRows();
        const ro = new ResizeObserver(updateRows);
        ro.observe(container);
        return () => ro.disconnect();
    }, [isSidebar, termLoaded, elemRef, lineId, screen]);
}
