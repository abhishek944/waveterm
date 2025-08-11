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
import { AutocompleteSuggestionView } from "@/components/workspace";
import { AIProviderDropdown } from "@/components/workspace";
import { Button } from "@/components/ui/button";

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

    return (
        <div
            ref={cmdInputRef}
            className={clsx(
                "max-h-[max(300px,40%)] flex flex-col w-full z-[100] border-t-2 border-gray-700 bg-gray-900 relative",
                {
                    "border-t-0 border-b-2": inputPosition === "top",
                    "has-history": openView === appconst.InputAuxView_History,
                    "agent-mode": isAgentMode,
                    "thread-mode": isThreadMode,
                    active: focusVal,
                }
            )}
        >
            <Choose>
                <When condition={openView === appconst.InputAuxView_History}>
                    <div className="flex-grow"></div>
                    <HistoryInfo />
                </When>
                <When condition={openView === appconst.InputAuxView_Info}>
                    <InfoMsg key="infomsg" />
                </When>
                <When condition={openView === appconst.InputAuxView_Suggestions}>
                    <AutocompleteSuggestionView />
                </When>
            </Choose>
            <If condition={remote && remote.status != "connected"}>
                <div className="flex flex-row text-red-500 items-center p-2 pl-4 ml-0.5">
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
                <div className="flex flex-row text-red-500 items-center p-2 pl-4 ml-0.5">
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
            <If condition={ri == null && numRunningLines == 0}>
                <div className="flex flex-row text-red-500 items-center p-2 pl-4 ml-0.5">
                    Shell is not initialized, must reset to continue.
                    <Button className="primary outlined ml-2.5 py-1 px-2.5" onClick={clickResetState}>
                        Reset Now
                    </Button>
                </div>
            </If>
            <div
                key="base-cmdinput"
                className={clsx("relative", {
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
                        <div className="flex items-center flex-nowrap gap-0">
                            <span ref={promptRef}>
                                <Prompt rptr={rptr} festate={feState} color={true} shellInitMsg={shellInitMsg} />
                                {(isThreadMode || isAgentMode) && (
                                    <span className="text-red-500 font-bold whitespace-nowrap">
                                        {" "}
                                        | Mode: {isAgentMode ? "Agent" : "Thread"}
                                    </span>
                                )}
                            </span>
                            {(isThreadMode || isAgentMode) && <AIProviderDropdown />}
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
            </div>
        </div>
    );
});
