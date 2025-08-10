// Copyright 2023, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import * as React from "react";
import * as mobx from "mobx";
import { observer } from "mobx-react";
import { sprintf } from "sprintf-js";
import { boundMethod } from "autobind-decorator";
import dayjs from "dayjs";
import localizedFormat from "dayjs/plugin/localizedFormat";
import { Choose, If, Otherwise, When } from "tsx-control-statements/components";
import { GlobalModel, GlobalCommandRunner, Cmd } from "@/models";
import { termHeightFromRows } from "@/util/textmeasure";
import { clsx } from "clsx";
import { getTermPtyData } from "@/util/modelutil";
import { renderCmdText, Markdown } from "@/common/elements";
import { SimpleBlobRenderer } from "@/plugins/core/basicrenderer";
import { IncrementalRenderer } from "@/plugins/core/incrementalrenderer";
import { TerminalRenderer } from "@/plugins/terminal/terminal";
import { isBlank } from "@/util/util";
import { PluginModel } from "@/plugins/plugins";
import { Prompt } from "@/common/prompt/prompt";
import * as lineutil from "@/components/line/lineutil";
import { ErrorBoundary } from "@/common/error/errorboundary";
import * as appconst from "@/app/appconst";
import * as util from "@/util/util";
import { RotateIcon } from "@/app/common/icons/icons";

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
        <div className="agent-mode-renderer">
            <div className="p-2.5">
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
        <div className="absolute top-2 right-2 flex items-center rounded bg-line-actions backdrop-blur-sm p-1 text-line-actions-inactive">
            <Choose>
                <When condition={containerType === appconst.LineContainer_Main}>
                    <div key="thread" title={threadedLinesObs.has(line.lineid) ? "Added to thread" : "Add to thread"} className="px-1 cursor-pointer hover:text-line-actions-active" onClick={clickAddToThread}>
                        {threadedLinesObs.has(line.lineid) ? <i className="fa-sharp fa-solid fa-check fa-fw" /> : <i className="fa-sharp fa-regular fa-comment fa-fw" />}
                    </div>
                    <div key="chat" title="Ask Wave AI" className="px-1 cursor-pointer hover:text-line-actions-active" onClick={clickChat}>
                        <i className="fa-sharp fa-regular fa-sparkles fa-fw" />
                    </div>
                    <div key="restart" title="Restart Command" className="px-1 cursor-pointer hover:text-line-actions-active" onClick={clickRestart}>
                        <i className="fa-sharp fa-regular fa-arrows-rotate fa-fw" />
                    </div>
                    <div key="delete" title="Delete Line (&#x2318;D)" className="px-1 cursor-pointer hover:text-line-actions-active" onClick={clickDelete}>
                        <i className="fa-sharp fa-regular fa-trash fa-fw" />
                    </div>
                    <div key="bookmark" title="Bookmark" className="px-1 cursor-pointer hover:text-line-actions-active" onClick={clickBookmark}>
                        <i className="fa-sharp fa-regular fa-bookmark fa-fw" />
                    </div>
                    <div key="minimize" title={isMinimized ? "Show Output" : "Hide Output"} className={clsx("px-1 cursor-pointer hover:text-line-actions-active", isMinimized && "text-line-actions-active")} onClick={clickMinimize}>
                        {isMinimized ? <i className="fa-sharp fa-regular fa-circle-plus fa-fw" /> : <i className="fa-sharp fa-regular fa-circle-minus fa-fw" />}
                    </div>
                    <div className="px-1 cursor-pointer hover:text-line-actions-active" onClick={clickMoveToSidebar} title="Move to Sidebar">
                        <i className="fa-sharp fa-solid fa-right-to-line fa-fw" />
                    </div>
                    <div key="settings" title="Line Settings" className="px-1 cursor-pointer hover:text-line-actions-active" onClick={handleLineSettings}>
                        <i className="fa-sharp fa-regular fa-ellipsis-vertical fa-fw" />
                    </div>
                </When>
                <When condition={containerType === appconst.LineContainer_Sidebar}>
                    <div key="delete" title="Delete Line (&#x2318;D)" className="px-1 cursor-pointer hover:text-line-actions-active" onClick={clickDelete}>
                        <i className="fa-sharp fa-regular fa-trash fa-fw" />
                    </div>
                    <div key="bookmark" title="Bookmark" className="px-1 cursor-pointer hover:text-line-actions-active" onClick={clickBookmark}>
                        <i className="fa-sharp fa-regular fa-bookmark fa-fw" />
                    </div>
                    <div className="px-1 cursor-pointer hover:text-line-actions-active" onClick={clickRemoveFromSidebar} title="Remove from Sidebar">
                        <i className="fa-sharp fa-solid fa-left-to-line fa-fw" />
                    </div>
                </When>
            </Choose>
        </div>
    );
});

// ... rest of the file