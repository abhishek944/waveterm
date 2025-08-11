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

const THREAD_STORAGE_KEY = "threadedLines";
const threadedLinesObs = mobx.observable.set<string>([], { deep: false });

function initThreadedLines() {
    const stored = localStorage.getItem(THREAD_STORAGE_KEY);
    if (stored) {
        const parsed = JSON.parse(stored);
        mobx.action(() => {
            threadedLinesObs.clear();
            parsed.forEach((lineId: string) => threadedLinesObs.add(lineId));
        })();
    }
}
initThreadedLines();

function setThreadedLine(lineID: string, added: boolean): void {
    mobx.action(() => {
        if (added) {
            threadedLinesObs.add(lineID);
        } else {
            threadedLinesObs.delete(lineID);
        }
        localStorage.setItem(THREAD_STORAGE_KEY, JSON.stringify(Array.from(threadedLinesObs)));
    })();
}

const AgentModeRenderer: React.FC<{
    screen: LineContainerType;
    line: LineType;
    width: number;
    onHeightChange: LineHeightChangeCallbackType;
}> = observer(({ screen, line, width, onHeightChange }) => {
    const [content, setContent] = React.useState("");
    const [loading, setLoading] = React.useState(true);

    React.useEffect(() => {
        const loadContent = async () => {
            const cmd = screen.getCmd(line);
            if (!cmd) {
                setLoading(false);
                return;
            }
            try {
                const termContext = { screenId: cmd.screenId, lineId: line.lineid, lineNum: line.linenum };
                const ptyDataResult = await getTermPtyData(termContext);
                if (ptyDataResult?.data) {
                    const decoder = new TextDecoder();
                    const newContent = decoder.decode(ptyDataResult.data);
                    setContent(newContent);
                }
            } catch (err) {
                console.error("Error loading agent mode content:", err);
            } finally {
                setLoading(false);
            }
        };
        loadContent();
    }, [screen, line]);

    React.useEffect(() => {
        if (!loading) {
            const elem = document.querySelector(`[data-lineid="${line.lineid}"] .agent-mode-content`);
            if (elem) {
                onHeightChange(line.linenum, elem.scrollHeight, 0);
            }
        }
    }, [loading, content, line.lineid, line.linenum, onHeightChange]);

    if (loading) {
        return (
            <div className="bg-opacity-2 bg-white rounded-md my-1 p-2.5">
                <div className="text-white/50 italic">Loading...</div>
            </div>
        );
    }

    if (!content) {
        return (
            <div className="bg-opacity-2 bg-white rounded-md my-1 p-2.5">
                <div className="text-white/50 italic">No content available</div>
            </div>
        );
    }

    return (
        <div className="bg-white/[0.02] rounded-md my-1">
            <div className="p-2.5 agent-mode-content">
                <Markdown
                    text={content}
                    onClickExecute={(cmd) => GlobalModel.submitRawCommand(cmd, false, true)}
                />
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
    const rendererPlugin = !isBlank(line.renderer) && line.renderer !== "terminal" && line.renderer !== "none"
        ? PluginModel.getRendererPluginByName(line.renderer)
        : null;
    return rendererPlugin?.hidePrompt ?? false;
};

const LineActions: React.FC<{ screen: LineContainerType; line: LineType; cmd: Cmd }> = observer(({ screen, line, cmd }) => {
    const clickAddToThread = (e: React.MouseEvent) => {
        e.stopPropagation();
        setThreadedLine(line.lineid, !threadedLinesObs.has(line.lineid));
    };
    const clickStar = () => GlobalCommandRunner.lineStar(line.lineid, (line.star ?? 0) === 0 ? 1 : 0);
    const clickPin = () => GlobalCommandRunner.linePin(line.lineid, !line.pinned);
    const clickBookmark = () => GlobalCommandRunner.lineBookmark(line.lineid);
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
    const clickMinimize = () => GlobalCommandRunner.lineMinimize(line.lineid, !line.linestate["wave:min"], true);
    const clickMoveToSidebar = () => GlobalCommandRunner.screenSidebarAddLine(line.lineid);
    const clickRemoveFromSidebar = () => GlobalCommandRunner.screenSidebarRemove();
    const handleLineSettings = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        mobx.action(() => GlobalModel.lineSettingsModal.set(line.linenum))();
        GlobalModel.modalsModel.pushModal(appconst.LINE_SETTINGS);
    };

    const isMinimized = line.linestate["wave:min"];
    const containerType = screen.getContainerType();

    return (
        <div className="absolute top-2 right-2 flex items-center rounded bg-[var(--line-actions-bg-color)] backdrop-blur-sm p-1 text-[var(--line-actions-inactive-color)]">
            <Choose>
                <When condition={containerType === appconst.LineContainer_Main}>
                    <div key="thread" title={threadedLinesObs.has(line.lineid) ? "Added to thread" : "Add to thread"} className="px-1 cursor-pointer hover:text-[var(--line-actions-active-color)]" onClick={clickAddToThread}>
                        {threadedLinesObs.has(line.lineid) ? <i className="fa-sharp fa-solid fa-check fa-fw" /> : <i className="fa-sharp fa-regular fa-comment fa-fw" />}
                    </div>
                    <div key="chat" title="Ask Wave AI" className="px-1 cursor-pointer hover:text-[var(--line-actions-active-color)]" onClick={clickChat}>
                        <i className="fa-sharp fa-regular fa-sparkles fa-fw" />
                    </div>
                    <div key="restart" title="Restart Command" className="px-1 cursor-pointer hover:text-[var(--line-actions-active-color)]" onClick={clickRestart}>
                        <i className="fa-sharp fa-regular fa-arrows-rotate fa-fw" />
                    </div>
                    <div key="delete" title="Delete Line (&#x2318;D)" className="px-1 cursor-pointer hover:text-[var(--line-actions-active-color)]" onClick={clickDelete}>
                        <i className="fa-sharp fa-regular fa-trash fa-fw" />
                    </div>
                    <div key="bookmark" title="Bookmark" className="px-1 cursor-pointer hover:text-[var(--line-actions-active-color)]" onClick={clickBookmark}>
                        <i className="fa-sharp fa-regular fa-bookmark fa-fw" />
                    </div>
                    <div key="minimize" title={isMinimized ? "Show Output" : "Hide Output"} className={clsx("px-1 cursor-pointer hover:text-[var(--line-actions-active-color)]", isMinimized && "text-[var(--line-actions-active-color)]")} onClick={clickMinimize}>
                        {isMinimized ? <i className="fa-sharp fa-regular fa-circle-plus fa-fw" /> : <i className="fa-sharp fa-regular fa-circle-minus fa-fw" />}
                    </div>
                    <div className="px-1 cursor-pointer hover:text-[var(--line-actions-active-color)]" onClick={clickMoveToSidebar} title="Move to Sidebar">
                        <i className="fa-sharp fa-solid fa-right-to-line fa-fw" />
                    </div>
                    <div key="settings" title="Line Settings" className="px-1 cursor-pointer hover:text-[var(--line-actions-active-color)]" onClick={handleLineSettings}>
                        <i className="fa-sharp fa-regular fa-ellipsis-vertical fa-fw" />
                    </div>
                </When>
                <When condition={containerType === appconst.LineContainer_Sidebar}>
                    <div key="delete" title="Delete Line (&#x2318;D)" className="px-1 cursor-pointer hover:text-[var(--line-actions-active-color)]" onClick={clickDelete}>
                        <i className="fa-sharp fa-regular fa-trash fa-fw" />
                    </div>
                    <div key="bookmark" title="Bookmark" className="px-1 cursor-pointer hover:text-[var(--line-actions-active-color)]" onClick={clickBookmark}>
                        <i className="fa-sharp fa-regular fa-bookmark fa-fw" />
                    </div>
                    <div className="px-1 cursor-pointer hover:text-[var(--line-actions-active-color)]" onClick={clickRemoveFromSidebar} title="Remove from Sidebar">
                        <i className="fa-sharp fa-solid fa-left-to-line fa-fw" />
                    </div>
                </When>
            </Choose>
        </div>
    );
});

const SmallLineAvatar: React.FC<{ line: LineType; cmd: Cmd; onRightClick?: (e: any) => void }> = ({ line, cmd, onRightClick }) => {
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

    const onAvatarRightClick = React.useCallback((e: React.MouseEvent) => {
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
    }, [line, noSelect]);

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
                "focus-parent",
                { "selected": isSelected }
            )}
            data-lineid={line.lineid}
            data-linenum={line.linenum}
            data-screenid={line.screenid}
            onClick={clickHandler}
        >
            <If condition={isSelected}>
                <div key="mask" className="absolute top-0 left-0 w-full h-full bg-transparent z-10 pointer-events-none border-2 border-l-4 border-[var(--line-active-border-color)]"></div>
            </If>
            <div key="header" className="flex flex-col w-full font-normal font-[var(--termfontfamily)] text-[var(--termfontsize)] leading-[var(--termlineheight)]">
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
    
    if (line.linetype == "cmd" || line.linetype == "agent_mode" || line.linetype == "thread_mode") {
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
            "bg-[var(--line-bg-color)] rounded-md my-1 p-2.5 border border-[var(--app-border-color)]",
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
                    className={clsx(mainDivCn, "flex-shrink-0")}
                    ref={lineRef}
                    onClick={handleClick}
                    data-lineid={line.lineid}
                    data-linenum={line.linenum}
                    data-screenid={line.screenid}
                >
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
            return (
                <div className="font-mono text-green-400">
                    (cmd not found)
                </div>
            );
        }
        const isMultiLine = lineutil.isMultiLineCmdText(cmd.getCmdStr());
        return (
            <div
                className={clsx(
                    "overflow-auto max-h-24 whitespace-pre text-gray-300 font-bold w-full",
                    {
                        "border-l-2 border-gray-600 ml-1 pl-2": isMultiLine,
                    }
                )}
            >
                {lineutil.getFullCmdText(cmd.getCmdStr())}
            </div>
        );
    };

    return (
        <div className={clsx("flex flex-col w-full font-normal font-mono text-sm leading-5", { "hide-prompt": hidePrompt })}>
            {renderMeta1()}
            <If condition={!hidePrompt}>{renderCmdText()}</If>
        </div>
    );
});

const RtnState: React.FC<{ cmd: Cmd; line: LineType }> = observer(({ cmd, line }) => {
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
                        throw new Error(
                            `Bad fetch response for /api/rtnstate: ${resp.status} ${resp.statusText}`
                        );
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
                <div className="text-xs text-gray-400 bg-gray-800 px-2 py-1 inline-block z-10 relative">state unchanged</div>
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

const LineContent: React.FC<{
    screen: LineContainerType;
    line: LineType;
    cmd: Cmd;
    width: number;
    onHeightChange: LineHeightChangeCallbackType;
}> = observer(({ screen, line, cmd, width, onHeightChange }) => {
    const rendererPlugin = !isBlank(line.renderer) && line.renderer !== "terminal" && line.renderer !== "none"
        ? PluginModel.getRendererPluginByName(line.renderer)
        : null;
    const isMinimized = line.linestate["wave:min"] && screen.getContainerType() === appconst.LineContainer_Main;

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
        <ErrorBoundary
            plugin={rendererPlugin?.name}
            lineContext={lineutil.getRendererContext(line)}
        >
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
                        shouldFocus={screen.getSelectedLines().includes(line.linenum) && screen.getFocusType() === "cmd"}
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
            <If condition={cmd.getRtnState()}>
                <RtnState cmd={cmd} line={line} />
            </If>
        </ErrorBoundary>
    );
});

export { Line, LineActions, AgentModeRenderer };