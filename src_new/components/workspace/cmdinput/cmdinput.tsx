// Copyright 2023, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import * as React from "react";
import { observer } from "mobx-react";
import * as mobx from "mobx";
import { Choose, If, When } from "tsx-control-statements/components";
import { clsx } from "clsx";
import dayjs from "dayjs";
import localizedFormat from "dayjs/plugin/localizedFormat";
import { GlobalModel, GlobalCommandRunner, Screen } from "@/models";
import { TextAreaInput } from "@/components/workspace";
import { InfoMsg } from "@/components/workspace";
import { HistoryInfo } from "@/components/workspace";
import { Prompt } from "@/components/prompt/prompt";
import { CenteredIcon, RotateIcon } from "@/components/icons/icons";
import * as util from "@/utils/util";
import * as appconst from "@/appconst";
import { commandRtnHandler } from "@/utils/util";
import { AutocompleteSuggestionView } from "@/components/workspace";
import { AIProviderDropdown } from "@/components/workspace";
import { Button } from "@/components/ui/button";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";

dayjs.extend(localizedFormat);

export const CmdInput: React.FC = observer(() => {
    const cmdInputRef = React.useRef<HTMLDivElement>(null);
    const promptRef = React.useRef<HTMLDivElement>(null);
    const sbcTimeoutId = React.useRef<NodeJS.Timeout>(null);

    const updateCmdInputHeight = () => {
        const elem = cmdInputRef.current;
        if (elem == null) {
            return;
        }
        const height = elem.offsetHeight;
        if (height !== GlobalModel.inputModel.cmdInputHeight.get()) {
            mobx.action(() => {
                GlobalModel.inputModel.cmdInputHeight.set(height);
            })();
        }
    };

    React.useEffect(() => {
        updateCmdInputHeight();
        return () => {
            if (sbcTimeoutId.current) {
                clearTimeout(sbcTimeoutId.current);
            }
        };
    }, []);

    React.useEffect(() => {
        updateCmdInputHeight();
    });

    const clickFocusInputHint = () => {
        GlobalModel.inputModel.giveFocus();
    };

    const baseCmdInputClick = (e: React.SyntheticEvent) => {
        if (promptRef.current?.contains(e.target as Node)) {
            return;
        }
        if ((e.target as HTMLDivElement).classList.contains("cmd-input-context")) {
            e.stopPropagation();
            return;
        }
        GlobalModel.inputModel.setAuxViewFocus(false);
        GlobalModel.inputModel.setChatSidebarFocus(false);
    };

    const clickHistoryAction = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();

        const inputModel = GlobalModel.inputModel;
        if (inputModel.getActiveAuxView() === appconst.InputAuxView_History) {
            inputModel.resetHistory();
        } else {
            inputModel.openHistory();
        }
    };

    const clickAIChatAction = () => {
        const isCollapsed = GlobalModel.rightSidebarModel.getCollapsed();
        GlobalModel.rightSidebarModel.setCollapsed(!isCollapsed);
        if (isCollapsed) {
            (sbcTimeoutId.current as any) = setTimeout(() => {
                GlobalModel.inputModel.setChatSidebarFocus();
            }, 100);
        } else {
            GlobalModel.inputModel.setChatSidebarFocus(false);
        }
    };

    const clickConnectRemote = (remoteId: string) => {
        GlobalCommandRunner.connectRemote(remoteId);
    };

    const toggleFilter = (screen: Screen) => {
        screen.filterRunning.set(!screen.filterRunning.get());
    };

    const clickResetState = () => {
        GlobalCommandRunner.resetShellState();
    };

    const model = GlobalModel;
    const inputModel = model.inputModel;
    const screen = GlobalModel.getActiveScreen();
    let ri: any | null = null;
    let rptr: any | null = null;
    if (screen != null) {
        ri = screen.getCurRemoteInstance();
        rptr = screen.curRemote.get();
    }
    let remote: any | null = null;
    let feState: Record<string, string> | null = null;
    if (ri != null) {
        remote = GlobalModel.getRemote(ri.remoteid);
        feState = ri.festate;
    }
    if (remote == null && rptr != null) {
        remote = GlobalModel.getRemote(rptr.remoteid);
    }
    feState = feState ?? {};
    const focusVal = inputModel.physicalInputFocused.get();
    const inputMode: string = inputModel.inputMode.get();
    const textAreaInputKey = screen == null ? "null" : screen.screenId;
    const win = GlobalModel.getScreenLinesById(screen?.screenId);
    const filterRunning = screen?.filterRunning.get();
    let numRunningLines = 0;
    if (win != null) {
        numRunningLines = mobx.computed(() => win.getRunningCmdLines().length).get();
    }
    let shellInitMsg: string | null = null;
    let hidePrompt = false;

    const openView = inputModel.getActiveAuxView();
    if (ri == null) {
        let shellStr = "shell";
        if (!util.isBlank(remote?.defaultshelltype)) {
            shellStr = remote.defaultshelltype;
        }
        if (numRunningLines > 0) {
            shellInitMsg = `initializing ${shellStr}...`;
        } else {
            hidePrompt = true;
        }
    }

    const inputPosition = GlobalModel.inputPosition.get();
    const isAgentMode = GlobalModel.isAgentMode.get();
    const isThreadMode = GlobalModel.isThreadMode.get();
    const activeScreenId = screen?.screenId;
    const threads = activeScreenId ? GlobalModel.threadsByScreen.get(activeScreenId) ?? [] : [];
    const activeThreadId = GlobalModel.activeThreadId.get();

    return (
        <div
            ref={cmdInputRef}
            className={clsx(
                "max-h-[max(300px,40%)] flex flex-col w-full z-20 rounded-md relative border border-[var(--app-border-color)] bg-gradient-to-br from-blue-950/30 via-purple-950/20 to-pink-950/10 backdrop-blur-md",
                {
                    "has-history": openView === appconst.InputAuxView_History,
                    "agent-mode": isAgentMode,
                    "thread-mode": isThreadMode,
                    active: focusVal,
                }
            )}
        >
            {/* gradient overlay when focused */}
            <If condition={focusVal}>
                <div className="absolute inset-0 rounded-md pointer-events-none opacity-100 transition-opacity duration-150 bg-gradient-to-r from-white/10 to-transparent z-0" />
            </If>
            <Choose>
                <When condition={openView === appconst.InputAuxView_History}>
                    <div className="flex-grow relative z-10"></div>
                    <HistoryInfo />
                </When>
                <When condition={openView === appconst.InputAuxView_Info}>
                    <InfoMsg key="infomsg" className="relative z-10" />
                </When>
                <When condition={openView === appconst.InputAuxView_Suggestions}>
                    <AutocompleteSuggestionView className="relative z-10" />
                </When>
            </Choose>
            <If condition={remote && remote.status != "connected"}>
                <div className="flex flex-row text-red-500 items-center p-2 pl-4 ml-0.5 relative z-10">
                    WARNING:&nbsp;
                    <span className="remote-name">[{GlobalModel.resolveRemoteIdToFullRef(remote.remoteid)}]</span>
                    &nbsp;is {remote.status}
                    <If condition={remote.status != "connecting"}>
                        <Button
                            className="primary outlined ml-2.5 py-1 px-2.5"
                            onClick={() => clickConnectRemote(remote.remoteid)}
                        >
                            Connect Now
                        </Button>
                    </If>
                </div>
            </If>
            <If condition={feState["invalidshellstate"]}>
                <div className="flex flex-row text-red-500 items-center p-2 pl-4 ml-0.5 relative z-10">
                    The shell state for this tab is invalid (
                    <a target="_blank" href="https://legacydocs.waveterm.dev/reference/faq">
                        see FAQ
                    </a>
                    ). Must reset to continue.
                    <Button className="primary outlined ml-2.5 py-1 px-2.5" onClick={clickResetState}>
                        Reset Now
                    </Button>
                </div>
            </If>
            <If condition={ri == null && numRunningLines == 0 && screen?.nextLineNum.get() > 2}>
                <div className="flex flex-row text-red-500 items-center p-2 pl-4 ml-0.5 relative z-10">
                    Shell is not initialized, must reset to continue.
                    <Button className="primary outlined ml-2.5 py-1 px-2.5" onClick={clickResetState}>
                        Reset Now
                    </Button>
                </div>
            </If>
            <div
                key="base-cmdinput"
                className={clsx("relative z-10", {
                    "border-t border-gray-700": openView,
                })}
                onClick={baseCmdInputClick}
            >
                <div className="absolute text-sm leading-tight top-2 right-4 flex flex-row items-center">
                    <If condition={numRunningLines > 0}>
                        <div
                            key="running"
                            className={clsx("inline-flex text-gray-400 opacity-50 hover:opacity-100", {
                                "opacity-100": filterRunning,
                            })}
                            title="Filter for Running Commands"
                            onClick={() => toggleFilter(screen)}
                        >
                            <CenteredIcon>{numRunningLines}</CenteredIcon>{" "}
                            <CenteredIcon>
                                <RotateIcon className="rotate warning spin fill-red-500" />
                            </CenteredIcon>
                        </div>
                    </If>
                </div>
                <If condition={!hidePrompt}>
                    <div
                        key="prompt"
                        className="cmd-input-context text-white whitespace-nowrap flex justify-between items-center font-mono text-sm leading-6 pt-2 px-4 ml-0.5"
                    >
                        <div className="flex items-center flex-nowrap gap-2">
                            <span ref={promptRef}>
                                <Prompt rptr={rptr} festate={feState} color={true} shellInitMsg={shellInitMsg} />
                            </span>
                            {(isThreadMode || isAgentMode) && (
                                <div className="inline-flex items-center px-3 py-1 rounded-lg text-xs font-medium bg-gray-800/60 backdrop-blur-sm border border-gray-700/50 text-white shadow-sm">
                                    {isAgentMode ? "agent" : "thread"}
                                </div>
                            )}
                        </div>
                    </div>
                </If>
                <div
                    key="input"
                    className={clsx(
                        "relative font-mono font-normal leading-6 text-sm border-none cursor-text px-4 pb-2",
                        inputMode != null ? `inputmode-${inputMode}` : null
                    )}
                >
                    <If condition={inputMode != null}>
                        <div className="control cmd-quick-context">
                            <div className="button is-static">{inputMode}</div>
                        </div>
                    </If>
                    <TextAreaInput key={textAreaInputKey} screen={screen} onHeightChange={updateCmdInputHeight} />
                </div>
                {(isThreadMode || isAgentMode) && (
                    <div className="flex items-center gap-2 px-4 pb-2">
                        {/* AI Provider Dropdown */}
                        <AIProviderDropdown />
                        
                        {/* Thread Mode Specific Controls */}
                        {isThreadMode && (
                            <>
                                {/* Thread Selector */}
                                <Select value={activeThreadId || "new-thread"} onValueChange={async (value) => {
                                    if (value === "new-thread") {
                                        // Create a new thread immediately
                                        const rtn = await GlobalCommandRunner.createNewThread(screen.screenId);
                                        commandRtnHandler(rtn, false);
                                        // The new thread ID will be set via the update
                                    } else {
                                        GlobalModel.setActiveThreadId(value);
                                    }
                                }}>
                                    <SelectTrigger 
                                        className="h-7 px-3 text-xs bg-gradient-to-r from-gray-800 to-gray-900 border border-gray-700 rounded-lg w-[140px] hover:from-gray-700 hover:to-gray-800 transition-all duration-200"
                                        onMouseDown={(e) => e.stopPropagation()}
                                    >
                                        <SelectValue placeholder="New Thread…" />
                                    </SelectTrigger>
                                    <SelectContent className="bg-gradient-to-b from-gray-900 to-black border border-gray-700 text-white text-xs rounded-lg shadow-xl">
                                        <SelectItem value="new-thread" className="hover:bg-gradient-to-r hover:from-purple-600/20 hover:to-pink-600/20">New Thread…</SelectItem>
                                        {threads.map((t) => (
                                            <SelectItem 
                                                key={t.threadid} 
                                                value={t.threadid}
                                                className="hover:bg-gradient-to-r hover:from-purple-600/20 hover:to-pink-600/20"
                                            >
                                                {t.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                
                                {/* Execution Mode Selector */}
                                <Select 
                                    value={(() => {
                                        const clientData = GlobalModel.clientData.get();
                                        return clientData?.aiopts?.threadExecutionMode || "manual";
                                    })()}
                                    onValueChange={(value: ThreadExecutionMode) => {
                                        const prtn = GlobalCommandRunner.setAIOpts({
                                            ...GlobalModel.clientData.get()?.aiopts,
                                            threadExecutionMode: value
                                        });
                                        commandRtnHandler(prtn, null);
                                    }}
                                >
                                    <SelectTrigger 
                                        className="h-7 px-3 text-xs bg-gradient-to-r from-gray-800 to-gray-900 border border-gray-700 rounded-lg w-[140px] hover:from-gray-700 hover:to-gray-800 transition-all duration-200"
                                        onMouseDown={(e) => e.stopPropagation()}
                                    >
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent className="bg-gradient-to-b from-gray-900 to-black border border-gray-700 text-white text-xs rounded-lg shadow-xl">
                                        <SelectItem value="manual" className="hover:bg-gradient-to-r hover:from-purple-600/20 hover:to-pink-600/20">Manual</SelectItem>
                                        <SelectItem value="semi-auto" className="hover:bg-gradient-to-r hover:from-purple-600/20 hover:to-pink-600/20">Semi-Auto</SelectItem>
                                        <SelectItem value="full-auto" className="hover:bg-gradient-to-r hover:from-purple-600/20 hover:to-pink-600/20">Full Auto</SelectItem>
                                    </SelectContent>
                                </Select>
                            </>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
});
