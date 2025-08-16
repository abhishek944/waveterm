// Copyright 2023, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import * as React from "react";
import * as mobx from "mobx";
import { observer } from "mobx-react";
import dayjs from "dayjs";
import localizedFormat from "dayjs/plugin/localizedFormat";
import { Choose, If, When, Otherwise } from "tsx-control-statements/components";
import { GlobalModel, GlobalCommandRunner, Cmd } from "@/models";
import { clsx } from "clsx";
import { getTermPtyData } from "@/utils/modelutil";
import { isBlank } from "@/utils/util";
import { PluginModel } from "@/plugins/plugins";
import * as lineutil from "@/components/line/lineutil";
import * as appconst from "@/appconst";
import { RotateIcon } from "@/components/icons/icons";
import { Markdown } from "@/components/ui/markdown";
import { Prompt } from "@/components/prompt/prompt";
import * as util from "@/utils/util";
import { ErrorBoundary } from "@/components/error/errorboundary";
import { TerminalRenderer } from "@/plugins/terminal/terminal";
import { SimpleBlobRenderer } from "@/plugins/core/basicrenderer";
import { IncrementalRenderer } from "@/plugins/core/incrementalrenderer";

dayjs.extend(localizedFormat);

// Thread lines are now managed in backend database instead of localStorage
const threadedLinesObs = mobx.observable.set<string>([], { deep: false });

function setThreadedLine(lineID: string, added: boolean): void {
    mobx.action(() => {
        if (added) {
            threadedLinesObs.add(lineID);
        } else {
            threadedLinesObs.delete(lineID);
        }
        // Note: Thread persistence is handled by backend database
    })();
}

const ThreadModeRenderer: React.FC<{
    screen: LineContainerType;
    line: LineType;
    width: number;
    onHeightChange: LineHeightChangeCallbackType;
}> = observer(({ screen, line, width: _width, onHeightChange }) => {
    const [content, setContent] = React.useState("");
    const [loading, setLoading] = React.useState(true);
    const [parsedResponse, setParsedResponse] = React.useState<{ explanation?: string; command?: string } | null>(null);
    const modelRef = React.useRef<RendererModel | null>(null);
    const decoderRef = React.useRef(new TextDecoder());
    const rawContentRef = React.useRef("");
    const isSidebar = screen.getContainerType() === appconst.LineContainer_Sidebar;
    
    // Track linestate changes to ensure reactivity
    const lineState = line.linestate || {};
    const cmdExecLineId = lineState.cmdexeclineid as string | undefined;
    
    // Helper function to attempt JSON parsing
    const tryParseResponse = (text: string) => {
        try {
            const parsed = JSON.parse(text.trim());
            if (parsed.explanation || parsed.command) {
                setParsedResponse(parsed);
                return true;
            }
        } catch (e) {
            // Not valid JSON
        }
        return false;
    };

    React.useEffect(() => {
        
        // No special handling for sidebar view anymore - thread lines show normally in sidebar
        // The command execution is now a separate line that gets added to sidebar
        // Register a lightweight renderer to receive PTY streaming (main view only)
        const model: RendererModel = {
            initialize: (_params) => {
            },
            dispose: () => {
            },
            reload: (_delayMs: number) => {},
            giveFocus: () => {},
            updateOpts: (_opts) => {},
            setIsDone: () => {},
            receiveData: (pos: number, data: Uint8Array) => {
                const chunk = decoderRef.current.decode(data);
                rawContentRef.current += chunk;
                setContent((prev) => prev + chunk);
                
                // Try to parse as JSON for structured response
                tryParseResponse(rawContentRef.current);
            },
            updateHeight: (_newHeight: number) => {},
        };
        modelRef.current = model;
        screen.registerRenderer(line.lineid, model);

        // Preload existing PTY buffer
        (async () => {
            try {
                const cmd = screen.getCmd(line);
                if (!cmd) {
                    setLoading(false);
                    return;
                }
                const termContext = { screenId: cmd.screenId, lineId: line.lineid, lineNum: line.linenum };
                const ptyDataResult = await getTermPtyData(termContext);
                if (ptyDataResult?.data) {
                    const initial = decoderRef.current.decode(ptyDataResult.data);
                    rawContentRef.current = initial;
                    setContent(initial);
                    
                    // Try to parse as JSON
                    tryParseResponse(initial);
                }
            } catch (err) {
                console.error("[ThreadModeRenderer] error preloading content:", err);
            } finally {
                setLoading(false);
            }
        })();

        return () => {
            // Unregister renderer
            if (modelRef.current) {
                screen.unloadRenderer(line.lineid);
                modelRef.current = null;
            }
        };
    }, [screen, line, isSidebar]);

    React.useEffect(() => {
        if (!loading) {
            const elem = document.querySelector(`[data-lineid="${line.lineid}"]`);
            if (elem) {
                onHeightChange(line.linenum, (elem as HTMLElement).scrollHeight, 0);
            }
        }
    }, [loading, content, parsedResponse, line.lineid, line.linenum, onHeightChange]);
    
    // Watch for cmdexeclineid changes and update sidebar if it's showing this thread line
    React.useEffect(() => {
        if (cmdExecLineId && !isSidebar) {
            const activeScreen = GlobalModel.getActiveScreen();
            if (activeScreen) {
                const curViewOpts = activeScreen.viewOpts.get();
                const sidebarLineId = curViewOpts?.sidebar?.sidebarlineid;
                
                // If sidebar is showing this thread line, update it to show the command execution
                if (sidebarLineId === line.lineid) {
                    const newViewOpts = {
                        ...curViewOpts,
                        sidebar: {
                            ...(curViewOpts.sidebar || {}),
                            sidebarlineid: cmdExecLineId,
                        },
                    };
                    mobx.action(() => {
                        activeScreen.viewOpts.set(newViewOpts);
                    })();
                    if (cmdExecLineId) {
                        GlobalModel.submitCommand("sidebar", "add", null, { nohist: "1", line: cmdExecLineId }, false);
                    }
                }
            }
        }
    }, [cmdExecLineId, line.lineid, isSidebar, lineState]);

    const fontSize = GlobalModel.getTermFontSize();
    const fontFamily = GlobalModel.getTermFontFamily();
    
    const handleCommandClick = async (e: React.MouseEvent) => {
        e.stopPropagation();
        
        if (!parsedResponse?.command || isSidebar) {
            return; // Don't open sidebar if we're already in the sidebar
        }
        
        // Re-read the cmdExecLineId from line state to get the latest value
        const latestCmdExecLineId = line.linestate?.cmdexeclineid as string | undefined;
        console.log("[ThreadModeRenderer] handleCommandClick - cmdExecLineId:", cmdExecLineId, "latest:", latestCmdExecLineId);
        
        // Open sidebar immediately
        console.log("[ThreadModeRenderer] Opening sidebar...");
        try {
            await GlobalModel.submitCommand("sidebar", "open", null, { nohist: "1" }, false);
            console.log("[ThreadModeRenderer] Sidebar open command completed");
        } catch (err) {
            console.error("[ThreadModeRenderer] Error opening sidebar:", err);
            return; // Don't continue if sidebar open failed
        }
        
        if (latestCmdExecLineId) {
            // We have cmdExecLineId, show command execution
            console.log("[ThreadModeRenderer] Have cmdExecLineId, will open sidebar with it");
            setTimeout(async () => {
                const activeScreen = GlobalModel.getActiveScreen();
                console.log("[ThreadModeRenderer] activeScreen:", activeScreen);
                if (activeScreen) {
                    const curViewOpts: any = activeScreen.viewOpts.get() || {};
                    console.log("[ThreadModeRenderer] Current viewOpts:", curViewOpts);
                    const newViewOpts = {
                        ...curViewOpts,
                        sidebar: {
                            ...(curViewOpts.sidebar || {}),
                            open: true,
                            sidebarlineid: latestCmdExecLineId,
                        },
                    };
                    console.log("[ThreadModeRenderer] Setting new viewOpts:", newViewOpts);
                    mobx.action(() => {
                        activeScreen.viewOpts.set(newViewOpts);
                    })();
                    if (latestCmdExecLineId) {
                        console.log("[ThreadModeRenderer] Calling sidebar add with line:", latestCmdExecLineId);
                        try {
                            await GlobalModel.submitCommand("sidebar", "add", null, { nohist: "1", line: latestCmdExecLineId }, false);
                            console.log("[ThreadModeRenderer] Sidebar add command completed");
                        } catch (err) {
                            console.error("[ThreadModeRenderer] Error calling sidebar add:", err);
                        }
                    }
                } else {
                    console.error("[ThreadModeRenderer] No active screen found!");
                }
            }, 100);
        } else {
            // Show the thread line in sidebar while waiting for command execution
            // The component will re-render when cmdexeclineid is available
            console.log("[ThreadModeRenderer] No cmdExecLineId yet, showing thread line in sidebar");
            console.log("[ThreadModeRenderer] Line state:", line.linestate);
            setTimeout(async () => {
                const activeScreen = GlobalModel.getActiveScreen();
                console.log("[ThreadModeRenderer] (else branch) activeScreen:", activeScreen);
                if (activeScreen) {
                    const curViewOpts: any = activeScreen.viewOpts.get() || {};
                    const newViewOpts = {
                        ...curViewOpts,
                        sidebar: {
                            ...(curViewOpts.sidebar || {}),
                            open: true,
                            sidebarlineid: line.lineid,
                        },
                    };
                    console.log("[ThreadModeRenderer] (else branch) Setting viewOpts with thread line:", line.lineid);
                    mobx.action(() => {
                        activeScreen.viewOpts.set(newViewOpts);
                    })();
                    try {
                        await GlobalModel.submitCommand("sidebar", "add", null, { nohist: "1", line: line.lineid }, false);
                        console.log("[ThreadModeRenderer] (else branch) Sidebar add completed");
                    } catch (err) {
                        console.error("[ThreadModeRenderer] (else branch) Error:", err);
                    }
                }
            }, 100);
        }
    };

    const renderContent = () => {
        if (loading) {
            return <div className="text-white/50 italic">Loading...</div>;
        }
        
        if (content === "") {
            return <div className="text-white/50 italic">No content available</div>;
        }
        
        // Thread lines now render the same way in both main view and sidebar
        
        // If we have parsed structured response, render it nicely
        if (parsedResponse) {
            return (
                <>
                    {parsedResponse.explanation && (
                        <div className="mb-3">
                            <Markdown 
                                text={parsedResponse.explanation} 
                                onClickExecute={(cmd) => GlobalModel.submitRawCommand(cmd, false, true)} 
                            />
                        </div>
                    )}
                    {parsedResponse.command && (
                        <>
                            <div className="text-white/50 text-xs mb-2">Command executed:</div>
                            <div 
                                className="mt-2 p-3 bg-black/50 rounded font-mono text-sm border border-white/10 cursor-pointer hover:bg-black/70 transition-colors"
                                onClick={handleCommandClick}
                                title="Click to view command execution in sidebar"
                            >
                                <div className="flex items-center justify-between">
                                    <div className="text-green-400">{parsedResponse.command}</div>
                                    <div className="text-white/30 text-xs">
                                        <i className="fa-sharp fa-regular fa-arrow-right-to-bracket" /> View in sidebar
                                    </div>
                                </div>
                            </div>
                        </>
                    )}
                </>
            );
        }
        
        // Otherwise render as plain text/markdown
        // Try to parse as JSON one more time in case it's a structured response
        try {
            const parsed = JSON.parse(content);
            if (parsed.explanation || parsed.command) {
                return (
                    <>
                        {parsed.explanation && (
                            <div className="mb-3">
                                <Markdown 
                                    text={parsed.explanation} 
                                    onClickExecute={(cmd) => GlobalModel.submitRawCommand(cmd, false, true)} 
                                />
                            </div>
                        )}
                        {parsed.command && (
                            <>
                                <div className="text-white/50 text-xs mb-2">Command executed:</div>
                                <div 
                                    className="mt-2 p-3 bg-black/50 rounded font-mono text-sm border border-white/10 cursor-pointer hover:bg-black/70 transition-colors"
                                    onClick={handleCommandClick}
                                    title="Click to view command execution in sidebar"
                                >
                                    <div className="flex items-center justify-between">
                                        <div className="text-green-400">{parsed.command}</div>
                                        <div className="text-white/30 text-xs">
                                            <i className="fa-sharp fa-regular fa-arrow-right-to-bracket" /> View in sidebar
                                        </div>
                                    </div>
                                </div>
                            </>
                        )}
                    </>
                );
            }
        } catch (e) {
            // Not JSON, render as markdown
        }
        
        return (
            <Markdown text={content} onClickExecute={(cmd) => GlobalModel.submitRawCommand(cmd, false, true)} />
        );
    };

    return (
        <div className="bg-white/2 rounded-md my-1 overflow-hidden" style={{ fontSize: fontSize, fontFamily: fontFamily }}>
            <div className="p-2.5">
                <div className="w-full" style={{ overflowWrap: 'break-word', wordBreak: 'break-word' }}>
                    {renderContent()}
                </div>
            </div>
        </div>
    );
});

const AgentModeRenderer: React.FC<{
    screen: LineContainerType;
    line: LineType;
    width: number;
    onHeightChange: LineHeightChangeCallbackType;
}> = observer(({ screen, line, width, onHeightChange }) => {
    const [content, setContent] = React.useState("");
    const [loading, setLoading] = React.useState(true);
    const modelRef = React.useRef<RendererModel | null>(null);
    const decoderRef = React.useRef(new TextDecoder());

    React.useEffect(() => {
        // Register a lightweight renderer to receive PTY streaming
        const model: RendererModel = {
            initialize: (_params) => {},
            dispose: () => {},
            reload: (_delayMs: number) => {},
            giveFocus: () => {},
            updateOpts: (_opts) => {},
            setIsDone: () => {},
            receiveData: (pos: number, data: Uint8Array) => {
                const chunk = decoderRef.current.decode(data);
                setContent((prev) => prev + chunk);
            },
            updateHeight: (_newHeight: number) => {},
        };
        modelRef.current = model;
        screen.registerRenderer(line.lineid, model);

        // Preload existing PTY buffer
        (async () => {
            try {
                const cmd = screen.getCmd(line);
                if (!cmd) {
                    setLoading(false);
                    return;
                }
                const termContext = { screenId: cmd.screenId, lineId: line.lineid, lineNum: line.linenum };
                const ptyDataResult = await getTermPtyData(termContext);
                if (ptyDataResult?.data) {
                    const initial = decoderRef.current.decode(ptyDataResult.data);
                    setContent(initial);
                }
            } catch (err) {
                console.error("[AgentModeRenderer] error preloading content:", err);
            } finally {
                setLoading(false);
            }
        })();

        return () => {
            // Unregister renderer
            screen.unloadRenderer(line.lineid);
            modelRef.current = null;
        };
    }, [screen, line]);

    React.useEffect(() => {
        if (!loading) {
            const elem = document.querySelector(`[data-lineid="${line.lineid}"] .agent-mode-content`);
            if (elem) {
                onHeightChange(line.linenum, (elem as HTMLElement).scrollHeight, 0);
            }
        }
    }, [loading, content, line.lineid, line.linenum, onHeightChange]);

    const fontSize = GlobalModel.getTermFontSize();
    const fontFamily = GlobalModel.getTermFontFamily();

    return (
        <div className="bg-white/2 rounded-md my-1 overflow-hidden" style={{ fontSize: fontSize, fontFamily: fontFamily }}>
            <div className="p-2.5 agent-mode-content">
                <div className="w-full" style={{ overflowWrap: 'break-word', wordBreak: 'break-word' }}>
                    {loading && <div className="text-white/50 italic">Loading...</div>}
                    {!loading && content === "" && <div className="text-white/50 italic">No content available</div>}
                    {!loading && content !== "" && (
                        <Markdown text={content} onClickExecute={(cmd) => GlobalModel.submitRawCommand(cmd, false, true)} />
                    )}
                </div>
            </div>
        </div>
    );
});

const cmdShouldMarkError = (cmd: Cmd): boolean => {
    if (cmd.getStatus() === "error") return true;
    const exitCode = cmd.getExitCode();
    return ![0, 130, 141].includes(exitCode);
};

const getIsHidePrompt = (line: LineType): boolean => {
    const rendererPlugin =
        !isBlank(line.renderer) && line.renderer !== "terminal" && line.renderer !== "none"
            ? PluginModel.getRendererPluginByName(line.renderer)
            : null;
    return rendererPlugin?.hidePrompt ?? false;
};

const LineActions: React.FC<{ screen: LineContainerType; line: LineType; cmd: Cmd }> = observer(
    ({ screen, line, cmd }) => {
        const isThreadMode = GlobalModel.isThreadMode.get();
        
        const clickAddToThread = (e: React.MouseEvent) => {
            e.stopPropagation();
            setThreadedLine(line.lineid, !threadedLinesObs.has(line.lineid));
        };
        const clickStar = () => GlobalCommandRunner.lineStar(line.lineid, (line.star ?? 0) === 0 ? 1 : 0);
        const clickPin = () => GlobalCommandRunner.linePin(line.lineid, !line.pinned);
        // const clickBookmark = () => GlobalCommandRunner.lineBookmark(line.lineid);
        const clickDelete = () => GlobalCommandRunner.lineDelete(line.lineid, true);
        const clickRestart = () => GlobalCommandRunner.lineRestart(line.lineid, true);
        const clickChat = (e: React.MouseEvent) => {
            e.stopPropagation();
            const termWrap = screen.getTermWrap(line.lineid);
            if (termWrap && cmd) {
                GlobalModel.sidebarchatModel.setCmdAndOutput(
                    cmd.getCmdStr(),
                    termWrap.getOutput(false),
                    screen.getUsedRows(lineutil.getRendererContext(line), line, cmd, 300) * 2,
                    cmdShouldMarkError(cmd)
                );
                GlobalModel.inputModel.setChatSidebarFocus();
                GlobalModel.sidebarchatModel.resetSelectedCodeBlockIndex();
            }
        };
        const clickMinimize = () => {
            const currentMinimized = line.linestate?.["wave:min"] ?? false;
            const newMinimizedState = !currentMinimized;
            console.log(`[clickMinimize] Line ${line.lineid} - current: ${currentMinimized}, new: ${newMinimizedState}, linestate:`, line.linestate);
            
            // Use setLineState to update the wave:min property
            const newLineState = { ...(line.linestate || {}), "wave:min": newMinimizedState };
            GlobalCommandRunner.setLineState(line.screenid, line.lineid, newLineState, true)
                .then((result) => {
                    console.log("setLineState result:", result);
                    if (result.update) {
                        console.log("setLineState update:", result.update);
                    }
                })
                .catch((error) => {
                    console.error("setLineState error:", error);
                });
        };
        const clickMoveToSidebar = () => GlobalCommandRunner.screenSidebarAddLine(line.lineid);
        const clickRemoveFromSidebar = () => GlobalCommandRunner.screenSidebarRemove();
        
        // Check if this line is currently in the sidebar
        const isLineInSidebar = screen.isLineIdInSidebar && screen.isLineIdInSidebar(line.lineid);
        const handleLineSettings = (e: React.MouseEvent) => {
            e.preventDefault();
            e.stopPropagation();
            mobx.action(() => GlobalModel.lineSettingsModal.set(line.linenum))();
            GlobalModel.modalsModel.pushModal(appconst.LINE_SETTINGS);
        };

        const isMinimized = line.linestate?.["wave:min"] ?? false;
        const containerType = screen.getContainerType();

        return (
            <div
                className={clsx(
                    "absolute top-2 right-2 flex items-center rounded p-1 text-[var(--line-actions-inactive-color)]",
                    // Hidden by default; reveal on parent .group hover
                    "opacity-0 pointer-events-none bg-transparent transition-opacity duration-150",
                    "group-hover:opacity-100 group-hover:pointer-events-auto group-hover:bg-[var(--line-actions-bg-color)] backdrop-blur-sm"
                )}
            >
                <Choose>
                    <When condition={containerType === appconst.LineContainer_Main}>
                        <If condition={isThreadMode}>
                            <div
                                key="thread"
                                title={threadedLinesObs.has(line.lineid) ? "Added to thread" : "Add to thread"}
                                className="px-1 cursor-pointer hover:text-[var(--line-actions-active-color)]"
                                onClick={clickAddToThread}
                            >
                                {threadedLinesObs.has(line.lineid) ? (
                                    <i className="fa-sharp fa-solid fa-check fa-fw" />
                                ) : (
                                    <i className="fa-sharp fa-regular fa-comment fa-fw" />
                                )}
                            </div>
                        </If>
                        <div
                            key="chat"
                            title="Ask Wave AI"
                            className="px-1 cursor-pointer hover:text-[var(--line-actions-active-color)]"
                            onClick={clickChat}
                        >
                            <i className="fa-sharp fa-regular fa-sparkles fa-fw" />
                        </div>
                        <div
                            key="restart"
                            title="Restart Command"
                            className="px-1 cursor-pointer hover:text-[var(--line-actions-active-color)]"
                            onClick={clickRestart}
                        >
                            <i className="fa-sharp fa-regular fa-arrows-rotate fa-fw" />
                        </div>
                        {/* <div
                            key="delete"
                            title="Delete Line (&#x2318;D)"
                            className="px-1 cursor-pointer hover:text-[var(--line-actions-active-color)]"
                            onClick={clickDelete}
                        >
                            <i className="fa-sharp fa-regular fa-trash fa-fw" />
                        </div> */}
                        {/* <div
                            key="bookmark"
                            title="Bookmark"
                            className="px-1 cursor-pointer hover:text-[var(--line-actions-active-color)]"
                            onClick={clickBookmark}
                        >
                            <i className="fa-sharp fa-regular fa-bookmark fa-fw" />
                        </div> */}
                        <If condition={!isLineInSidebar}>
                            <div
                                key="minimize"
                                title={isMinimized ? "Show Output" : "Hide Output"}
                                className={clsx(
                                    "px-1 cursor-pointer hover:text-[var(--line-actions-active-color)]",
                                    isMinimized && "text-[var(--line-actions-active-color)]"
                                )}
                                onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    clickMinimize();
                                }}
                            >
                                {!isMinimized ? (
                                    <i className="fa-sharp fa-regular fa-circle-minus fa-fw" />
                                ) : (
                                    <i className="fa-sharp fa-regular fa-circle-plus fa-fw" />
                                )}
                            </div>
                        </If>
                        <If condition={line.linetype !== "thread_mode" && !isLineInSidebar}>
                            <div
                                className="px-1 cursor-pointer hover:text-[var(--line-actions-active-color)]"
                                onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    clickMoveToSidebar();
                                }}
                                title="Move to Sidebar"
                            >
                                <i className="fa-sharp fa-solid fa-right-to-line fa-fw" />
                            </div>
                        </If>
                        {/* <div
                            key="settings"
                            title="Line Settings"
                            className="px-1 cursor-pointer hover:text-[var(--line-actions-active-color)]"
                            onClick={handleLineSettings}
                        >
                            <i className="fa-sharp fa-regular fa-ellipsis-vertical fa-fw" />
                        </div> */}
                    </When>
                    <When condition={containerType === appconst.LineContainer_Sidebar}>
                        {/* <div
                            key="bookmark"
                            title="Bookmark"
                            className="px-1 cursor-pointer hover:text-[var(--line-actions-active-color)]"
                            onClick={clickBookmark}
                        >
                            <i className="fa-sharp fa-regular fa-bookmark fa-fw" />
                        </div> */}
                        <div
                            className="px-1 cursor-pointer hover:text-[var(--line-actions-active-color)]"
                            onClick={clickRemoveFromSidebar}
                            title="Remove from Sidebar"
                        >
                            <i className="fa-sharp fa-solid fa-left-to-line fa-fw" />
                        </div>
                    </When>
                </Choose>
            </div>
        );
    }
);

const SmallLineAvatar: React.FC<{ line: LineType; cmd: Cmd; onRightClick?: (e: any) => void }> = ({
    line,
    cmd,
    onRightClick,
}) => {
    const lineNumStr = (line.linenumtemp ? "~" : "#") + String(line.linenum);
    const status = cmd != null ? cmd.getStatus() : "done";
    const exitcode = cmd != null ? cmd.getExitCode() : 0;
    const isComment = line.linetype == "text";
    let icon = null;
    let iconTitle = null;
    if (isComment) {
        icon = <i className="fa-sharp fa-solid fa-comment" />;
        iconTitle = "comment";
    } else if (status == "done") {
        if (exitcode === 0) {
            icon = <i className="fa-sharp fa-solid fa-check text-[var(--term-bright-green)]" />;
            iconTitle = "success";
        } else {
            icon = <i className="fa-sharp fa-solid fa-xmark text-[var(--line-error-color)]" />;
            iconTitle = "exitcode " + exitcode;
        }
    } else if (status == "hangup") {
        icon = <i className="fa-sharp fa-solid fa-triangle-exclamation text-[var(--line-warning-color)]" />;
        iconTitle = status;
    } else if (status == "error") {
        icon = <i className="fa-sharp fa-solid fa-xmark text-[var(--line-error-color)]" />;
        iconTitle = "error";
    } else if (status == "running" || status == "detached") {
        icon = <RotateIcon className="text-[var(--line-warning-color)] animate-spin" />;
        iconTitle = "running";
    } else {
        icon = <i className="fa-sharp fa-solid fa-question text-[var(--line-error-color)]" />;
        iconTitle = "unknown";
    }
    return (
        <div className="flex items-center" onContextMenu={onRightClick}>
            <div className="text-[var(--term-gray)] mr-2">{lineNumStr}</div>
            <div title={iconTitle} className="inline-block ml-2 h-[var(--termfontsize-sm)] leading-none">
                {icon}
            </div>
        </div>
    );
};

const LineText: React.FC<{
    screen: LineContainerType;
    line: LineType;
    renderMode: RenderModeType;
    noSelect?: boolean;
}> = observer(({ screen, line, noSelect }) => {
    const clickHandler = React.useCallback(() => {
        if (noSelect) {
            return;
        }
        GlobalCommandRunner.screenSelectLine(String(line.linenum));
    }, [line, noSelect]);

    const onAvatarRightClick = React.useCallback(
        (e: React.MouseEvent) => {
            if (noSelect) {
                return;
            }
            e.preventDefault();
            e.stopPropagation();
            if (line != null) {
                mobx.action(() => {
                    GlobalModel.lineSettingsModal.set(line.linenum);
                })();
            }
        },
        [line, noSelect]
    );

    const formattedTime = lineutil.getLineDateTimeStr(line.ts);
    const isSelected = mobx
        .computed(() => screen.getSelectedLine() == line.linenum, {
            name: "computed-isSelected",
        })
        .get();

    return (
        <div
            className={clsx(
                "m-0 px-[calc(var(--termpad)*3)] py-[calc(var(--termpad)*2)] pb-[calc(var(--termpad)*2+1px)]",
                "flex flex-col overflow-x-hidden overflow-y-visible flex-shrink-0 relative whitespace-pre",
                "leading-[11px] font-normal font-[var(--termfontfamily)] scroll-mb-5",
                "focus-parent group",
                { selected: isSelected }
            )}
            data-lineid={line.lineid}
            data-linenum={line.linenum}
            data-screenid={line.screenid}
            onClick={clickHandler}
        >
            {/* subtle highlight for selected text-only line */}
            <If condition={isSelected}>
                <div className="absolute inset-0 pointer-events-none opacity-100 transition-opacity duration-150 bg-gradient-to-r from-white/10 to-transparent" />
            </If>
            <If condition={isSelected}>
                <div
                    key="mask"
                    className="absolute top-0 left-0 w-full h-full bg-transparent z-10 pointer-events-none border-2 border-l-4 border-[var(--line-active-border-color)]"
                ></div>
            </If>
            <div
                key="header"
                className="flex flex-col w-full font-normal font-[var(--termfontfamily)] text-[var(--termfontsize)] leading-[var(--termlineheight)]"
            >
                <div className="flex flex-row text-[var(--termfontsize-sm)] leading-[var(--termlineheight-sm)] text-[var(--term-gray)] items-center">
                    <SmallLineAvatar line={line} cmd={null} onRightClick={onAvatarRightClick} />
                    <div className="mx-[var(--termpad)]">|</div>
                    <div className="flex">{formattedTime}</div>
                </div>
            </div>
            <div key="text" className="text-[var(--term-text-white)] mt-[calc(var(--termpad)+2px)]">
                {line.text}
            </div>
        </div>
    );
});

const Line: React.FC<{
    screen: LineContainerType;
    line: LineType;
    width: number;
    staticRender: boolean;
    visible: OV<boolean>;
    onHeightChange: LineHeightChangeCallbackType;
    overrideCollapsed: OV<boolean>;
    renderMode: RenderModeType;
    noSelect?: boolean;
    topBorder: boolean;
}> = observer((props) => {
    const { line } = props;

    if (line.archived) {
        return null;
    }

    if (line.linetype == "text") {
        return <LineText {...props} />;
    }

    if (line.linetype == "cmd" || line.linetype == "agent_mode" || line.linetype == "thread_mode" || line.linetype == "thread_mode_cmd") {
        return <LineCmd {...props} />;
    }

    return (
        <div className="m-0 px-[calc(var(--termpad)*3)] py-[calc(var(--termpad)*2)] text-[var(--term-text-white)] ml-[5px]">
            [invalid line type '{line.linetype}']
        </div>
    );
});

const LineCmd: React.FC<{
    screen: LineContainerType;
    line: LineType;
    width: number;
    staticRender: boolean;
    visible: OV<boolean>;
    onHeightChange: LineHeightChangeCallbackType;
    renderMode: RenderModeType;
    overrideCollapsed: OV<boolean>;
    noSelect?: boolean;
    showHints?: boolean;
}> = observer(
    ({
        screen,
        line,
        width,
        staticRender,
        visible,
        onHeightChange,
        renderMode,
        overrideCollapsed,
        noSelect,
        showHints,
    }) => {
        const lineRef = React.useRef<HTMLDivElement>(null);
        const lastHeight = React.useRef<number>(0);

        const handleHeightChange = React.useCallback(() => {
            if (onHeightChange == null) {
                return;
            }
            let curHeight = 0;
            const elem = lineRef.current;
            if (elem != null) {
                curHeight = elem.offsetHeight;
            }
            if (lastHeight.current == curHeight) {
                return;
            }
            const oldHeight = lastHeight.current;
            lastHeight.current = curHeight;
            onHeightChange(line.linenum, curHeight, oldHeight);
        }, [line.linenum, onHeightChange]);

        React.useEffect(() => {
            handleHeightChange();
        });

        const handleClick = React.useCallback(
            (e: React.MouseEvent) => {
                if (noSelect) {
                    return;
                }
                const sel = window.getSelection();
                if (lineRef.current != null) {
                    const selText = sel.toString();
                    if (sel.anchorNode != null && lineRef.current.contains(sel.anchorNode) && !isBlank(selText)) {
                        return;
                    }
                }
                if (e.metaKey) {
                    screen.toggleLineSelect(line.linenum);
                } else {
                    GlobalCommandRunner.screenSelectLine(String(line.linenum), "cmd");
                }
            },
            [line.linenum, noSelect, screen]
        );

        const cmd = screen.getCmd(line);
        if (cmd == null) {
            return (
                <div
                    className="line line-invalid"
                    ref={lineRef}
                    data-lineid={line.lineid}
                    data-linenum={line.linenum}
                    data-screenid={line.screenid}
                >
                    [cmd not found '{line.lineid}']
                </div>
            );
        }

        const isSelected = screen.getSelectedLines().includes(line.linenum);
        const cmdError = cmdShouldMarkError(cmd);
        const isThreaded = threadedLinesObs.has(line.lineid);

        const mainDivCn = clsx(
            "line",
            "line-cmd",
            // Ensure full-width container and clip any overflowing child content (xterm, renderers)
            "w-full overflow-hidden bg-[var(--line-bg-color)] rounded-md my-1 p-2.5 border border-[var(--app-border-color)]",
            { selected: isSelected },
            { "cmd-done": !cmd.isRunning() },
            { "has-error": cmdError },
            { threaded: isThreaded }
        );

        return (
            <>
                <style>
                    {`
                    .line-cmd.cmd-done .xterm-cursor {
                        display: none;
                    }
                `}
                </style>
                <div
                    className={clsx(mainDivCn, "flex-shrink-0 group relative")}
                    ref={lineRef}
                    onClick={handleClick}
                    data-lineid={line.lineid}
                    data-linenum={line.linenum}
                    data-screenid={line.screenid}
                >
                    {/* subtle highlight for selected line */}
                    <If condition={isSelected}>
                        <div className="absolute inset-0 rounded-md pointer-events-none opacity-100 transition-opacity duration-150 bg-gradient-to-r from-white/10 to-transparent" />
                    </If>
                    <If condition={isSelected || cmdError}>
                        <div className={clsx("line-mask", { "error-mask": cmdError })}></div>
                    </If>
                    <LineActions screen={screen} line={line} cmd={cmd} />
                    <LineHeader line={line} cmd={cmd} />
                    <LineContent
                        screen={screen}
                        line={line}
                        cmd={cmd}
                        width={width > 20 ? width - 20 : 0}
                        onHeightChange={handleHeightChange}
                    />
                </div>
            </>
        );
    }
);

const LineHeader: React.FC<{ line: LineType; cmd: Cmd }> = observer(({ line, cmd }) => {
    const hidePrompt = getIsHidePrompt(line);

    const renderMeta1 = () => {
        let formattedTime: string = "";
        const restartTs = cmd.getRestartTs();
        let timeTitle: string = null;
        if (restartTs != null && restartTs > 0) {
            formattedTime = "restarted @ " + lineutil.getLineDateTimeStr(restartTs);
            timeTitle = "original start time " + lineutil.getLineDateTimeStr(line.ts);
        } else {
            formattedTime = lineutil.getLineDateTimeStr(line.ts);
        }
        const renderer = line.renderer;
        const durationMs = cmd.getDurationMs();
        return (
            <div className="flex items-center text-xs text-gray-400">
                <SmallLineAvatar line={line} cmd={cmd} />
                <div className="mx-2">|</div>
                <Prompt rptr={cmd.remote} festate={cmd.getRemoteFeState()} color={false} />
                <div className="mx-2">|</div>
                <div title={timeTitle} className="ts">
                    {formattedTime} <If condition={durationMs > 0}>({util.formatDuration(durationMs)})</If>
                </div>
                <If condition={!isBlank(renderer) && renderer != "terminal"}>
                    <div className="mx-2">|</div>
                    <div className="renderer">
                        <i className="fa-sharp fa-solid fa-fill mr-2" />
                        {renderer}
                    </div>
                </If>
            </div>
        );
    };

    const renderCmdText = () => {
        if (cmd == null) {
            return <div className="font-mono text-green-400">(cmd not found)</div>;
        }
        const isMultiLine = lineutil.isMultiLineCmdText(cmd.getCmdStr());
        return (
            <>
                <div
                    className={clsx("overflow-auto max-h-24 whitespace-pre text-gray-300 font-bold w-full mt-2", {
                        "border-l-2 border-gray-600 ml-1 pl-2": isMultiLine,
                    })}
                >
                    {lineutil.getFullCmdText(cmd.getCmdStr())}
                </div>
                <br></br>
            </>
        );
    };

    return (
        <div
            className={clsx("flex flex-col w-full font-normal font-mono text-sm leading-5", {
                "hide-prompt": hidePrompt,
            })}
        >
            {renderMeta1()}
            <If condition={!hidePrompt}>{renderCmdText()}</If>
        </div>
    );
});

/* const RtnState: React.FC<{ cmd: Cmd; line: LineType }> = observer(({ cmd, line }) => {
    const [rtnStateDiff, setRtnStateDiff] = React.useState<string>(null);
    const rtnStateDiffFetched = React.useRef(false);

    React.useEffect(() => {
        const checkStateDiffLoad = () => {
            if (cmd == null || !cmd.getRtnState() || rtnStateDiffFetched.current) {
                return;
            }
            if (cmd.getStatus() != "done") {
                return;
            }
            fetchRtnStateDiff();
        };

        const fetchRtnStateDiff = () => {
            if (rtnStateDiffFetched.current) {
                return;
            }
            rtnStateDiffFetched.current = true;
            const usp = new URLSearchParams({
                linenum: String(line.linenum),
                screenid: line.screenid,
                lineid: line.lineid,
            });
            const url = GlobalModel.getBaseHostPort() + "/api/rtnstate?" + usp.toString();
            const fetchHeaders = GlobalModel.getFetchHeaders();
            fetch(url, { headers: fetchHeaders })
                .then((resp) => {
                    if (!resp.ok) {
                        throw new Error(`Bad fetch response for /api/rtnstate: ${resp.status} ${resp.statusText}`);
                    }
                    return resp.text();
                })
                .then((text) => {
                    setRtnStateDiff(text ?? "");
                })
                .catch((err) => {
                    setRtnStateDiff("ERROR " + err.toString());
                });
        };

        checkStateDiffLoad();
    }, [cmd, line]);

    const termFontSize = GlobalModel.getTermFontSize();
    let rtnStateDiffSize = termFontSize - 2;
    if (rtnStateDiffSize < 10) {
        rtnStateDiffSize = Math.max(termFontSize, 10);
    }

    return (
        <div
            className="relative"
            style={{
                visibility: cmd.getStatus() == "done" ? "visible" : "hidden",
            }}
        >
            <If condition={rtnStateDiff == null || rtnStateDiff == ""}>
                <div className="text-xs text-gray-400 bg-gray-800 px-2 py-1 inline-block z-10 relative">
                    state unchanged
                </div>
                <div className="h-px bg-gray-700 absolute top-1/2 w-1/2 min-w-[300px]"></div>
            </If>
            <If condition={rtnStateDiff != null && rtnStateDiff != ""}>
                <div className="text-xs text-gray-400 bg-gray-800 px-2 py-1 inline-block z-10 relative">new state</div>
                <div className="h-px bg-gray-700 absolute top-1/2 w-1/2 min-w-[300px]"></div>
                <div className="font-mono text-gray-300 whitespace-pre ml-2 pl-2 pb-px text-xs max-h-12 overflow-y-auto rtl">
                    <div className="ltr">{rtnStateDiff}</div>
                </div>
            </If>
        </div>
    );
});
*/

const LineContent: React.FC<{
    screen: LineContainerType;
    line: LineType;
    cmd: Cmd;
    width: number;
    onHeightChange: LineHeightChangeCallbackType;
}> = observer(({ screen, line, cmd, width, onHeightChange }) => {
    const rendererPlugin =
        !isBlank(line.renderer) && line.renderer !== "terminal" && line.renderer !== "none"
            ? PluginModel.getRendererPluginByName(line.renderer)
            : null;
    
    // Access linestate through a computed to ensure reactivity
    const lineState = line.linestate || {};
    const waveMin = lineState["wave:min"];
    const isMinimized = waveMin && screen.getContainerType() === appconst.LineContainer_Main;

    const makeRendererModelInitializeParams = (): RendererModelInitializeParams => {
        const context = lineutil.getRendererContext(line);
        let savedHeight = screen.getContentHeight(context);
        if (savedHeight == null) {
            if (line.contentheight != null && line.contentheight != -1) {
                savedHeight = line.contentheight;
            } else {
                savedHeight = 0;
            }
        }
        const api = {
            saveHeight: (height: number) => {
                screen.setContentHeight(lineutil.getRendererContext(line), height);
            },
            onFocusChanged: (focus: boolean) => {
                screen.setLineFocus(line.linenum, focus);
            },
            dataHandler: (data: string, model: RendererModel) => {
                cmd.handleDataFromRenderer(data, model);
            },
        };
        return {
            context: context,
            isDone: !cmd.isRunning(),
            savedHeight: savedHeight,
            opts: {
                maxSize: screen.getMaxContentSize(),
                idealSize: screen.getIdealContentSize(),
                termOpts: cmd.getTermOpts(),
                termFontSize: GlobalModel.getTermFontSize(),
                termFontFamily: GlobalModel.getTermFontFamily(),
            },
            ptyDataSource: getTermPtyData,
            lineState: line.linestate,
            api: api,
            rawCmd: cmd.getAsWebCmd(line.lineid),
        };
    };

    if (isMinimized) {
        return null;
    }

    return (
        <ErrorBoundary plugin={rendererPlugin?.name} lineContext={lineutil.getRendererContext(line)}>
            <Choose>
                <When condition={rendererPlugin == null && line.renderer !== "none"}>
                    <Choose>
                        <When condition={line.linetype == "agent_mode"}>
                            <AgentModeRenderer
                                screen={screen}
                                line={line}
                                width={width}
                                onHeightChange={onHeightChange}
                            />
                        </When>
                        <When condition={line.linetype == "thread_mode"}>
                            <ThreadModeRenderer
                                screen={screen}
                                line={line}
                                width={width}
                                onHeightChange={onHeightChange}
                            />
                        </When>
                        <Otherwise>
                            <TerminalRenderer
                                screen={screen}
                                line={line}
                                width={width}
                                staticRender={false}
                                visible={mobx.observable.box(true)}
                                onHeightChange={() => onHeightChange(line.linenum, 0, 0)}
                                collapsed={false}
                            />
                        </Otherwise>
                    </Choose>
                </When>
                <When condition={rendererPlugin != null && rendererPlugin.rendererType == "simple"}>
                    <SimpleBlobRenderer
                        rendererContainer={screen}
                        lineId={line.lineid}
                        plugin={rendererPlugin}
                        onHeightChange={() => onHeightChange(line.linenum, 0, 0)}
                        initParams={makeRendererModelInitializeParams()}
                        scrollToBringIntoViewport={() => {
                            const container = document.getElementsByClassName("lines")[0];
                            const targetDiv = document.querySelector(`[data-lineid="${line.lineid}"]`);
                            if (container && targetDiv) {
                                const targetPosition = targetDiv.getBoundingClientRect();
                                const containerPosition = container.getBoundingClientRect();
                                if (targetPosition.top < containerPosition.top) {
                                    container.scrollTop += targetPosition.top - containerPosition.top;
                                } else if (targetPosition.bottom > containerPosition.bottom) {
                                    container.scrollTop += targetPosition.bottom - containerPosition.bottom;
                                }
                            }
                        }}
                        isSelected={screen.getSelectedLines().includes(line.linenum)}
                        shouldFocus={
                            screen.getSelectedLines().includes(line.linenum) && screen.getFocusType() === "cmd"
                        }
                    />
                </When>
                <When condition={rendererPlugin != null && rendererPlugin.rendererType == "full"}>
                    <IncrementalRenderer
                        rendererContainer={screen}
                        lineId={line.lineid}
                        plugin={rendererPlugin}
                        onHeightChange={() => onHeightChange(line.linenum, 0, 0)}
                        initParams={makeRendererModelInitializeParams()}
                        isSelected={screen.getSelectedLines().includes(line.linenum)}
                    />
                </When>
            </Choose>
            {/* <If condition={cmd.getRtnState()}>
                <RtnState cmd={cmd} line={line} />
            </If> */}
        </ErrorBoundary>
    );
});

export { Line, LineActions, AgentModeRenderer, ThreadModeRenderer };
