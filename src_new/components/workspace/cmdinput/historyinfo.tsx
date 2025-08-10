// Copyright 2023, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import * as React from "react";
import { observer } from "mobx-react";
import { sprintf } from "sprintf-js";
import { If, For } from "tsx-control-statements/components";
import { clsx } from "clsx";
import dayjs from "dayjs";
import localizedFormat from "dayjs/plugin/localizedFormat";
import { GlobalModel } from "@/models";
import { isBlank } from "@/utils/util";
import { AuxiliaryCmdView } from "./auxview";

dayjs.extend(localizedFormat);

const TDots = "⋮";

function truncateWithTDots(str: string, maxLen: number): string {
    if (str == null) {
        return "";
    }
    if (str.length <= maxLen) {
        return str;
    }
    return str.slice(0, maxLen - 1) + TDots;
}

const HItem: React.FC<{
    hitem: any;
    isSelected: boolean;
    opts: any;
    snames: Record<string, string>;
    scrNames: Record<string, string>;
    onClick: (hitem: any) => void;
}> = observer(({ hitem, isSelected, opts, snames, scrNames, onClick }) => {
    const renderRemote = (hitem: any): any => {
        if (hitem.remote == null || isBlank(hitem.remote.remoteid)) {
            return sprintf("%-15s ", "");
        }
        const r = GlobalModel.getRemote(hitem.remote.remoteid);
        if (r == null) {
            return sprintf("%-15s ", "???");
        }
        let rname = !isBlank(r.remotealias) ? r.remotealias : r.remotecanonicalname;
        if (!isBlank(hitem.remote.name)) {
            rname = `${rname}:${hitem.remote.name}`;
        }
        return sprintf("%-15s ", `[${truncateWithTDots(rname, 13)}]`);
    };

    const renderHInfoText = (): string => {
        let remoteStr = "";
        if (!opts.limitRemote) {
            remoteStr = renderRemote(hitem);
        }
        const selectedStr = isSelected ? "*" : " ";
        const lineNumStr = hitem.linenum > 0 ? `(${hitem.linenum})` : "";

        if (isBlank(opts.queryType) || opts.queryType === "screen") {
            return selectedStr + sprintf("%7s", lineNumStr) + " " + remoteStr;
        }
        if (opts.queryType === "session") {
            let screenStr = "";
            if (!isBlank(hitem.screenid)) {
                const scrName = scrNames[hitem.screenid];
                if (scrName != null) {
                    screenStr = `[${truncateWithTDots(scrName, 15)}]`;
                }
            }
            return selectedStr + sprintf("%17s", screenStr) + sprintf("%7s", lineNumStr) + " " + remoteStr;
        }
        if (opts.queryType === "global") {
            let sessionStr = "";
            if (!isBlank(hitem.sessionid)) {
                const sessionName = snames[hitem.sessionid];
                if (sessionName != null) {
                    sessionStr = `#${truncateWithTDots(sessionName, 15)}`;
                }
            }
            let screenStr = "";
            if (!isBlank(hitem.screenid)) {
                const scrName = scrNames[hitem.screenid];
                if (scrName != null) {
                    screenStr = `[${truncateWithTDots(scrName, 13)}]`;
                }
            }
            return `${selectedStr}${sprintf("%15s", sessionStr)} ${sprintf("%15s", screenStr)}${sprintf("%7s", lineNumStr)} ${remoteStr}`;
        }
        return "-";
    };

    const lines = hitem.cmdstr.split("\n");
    const infoText = renderHInfoText();
    const infoTextSpacer = " ".repeat(infoText.length);

    return (
        <div
            key={hitem.historynum}
            className={clsx(
                "history-item cursor-pointer rounded-md",
                { "is-selected font-bold text-primary bg-selected hover:bg-selected-hover": isSelected },
                { "history-haderror text-red-500": hitem.haderror },
                `hnum-${hitem.historynum}`,
                "hover:bg-hover"
            )}
            onClick={() => onClick(hitem)}
        >
            <div className="history-line whitespace-pre">
                {infoText} {lines[0]}
            </div>
            {lines.slice(1).map((line, idx) => (
                <div key={idx} className="history-line whitespace-pre">
                    {infoTextSpacer} {line}
                </div>
            ))}
        </div>
    );
});

export const HistoryInfo: React.FC = observer(() => {
    const lastClickHNum = React.useRef<string | null>(null);
    const lastClickTs = React.useRef(0);

    const handleScrollbarInitialized = () => {
        const inputModel = GlobalModel.inputModel;
        let hitem = inputModel.getHistorySelectedItem();
        if (hitem == null) {
            hitem = inputModel.getFirstHistoryItem();
        }
        if (hitem != null) {
            inputModel.scrollHistoryItemIntoView(hitem.historynum);
        }
    };

    const handleClose = () => {
        GlobalModel.inputModel.closeAuxView();
    };

    const handleItemClick = (hitem: any) => {
        const inputModel = GlobalModel.inputModel;
        const selItem = inputModel.getHistorySelectedItem();
        inputModel.setAuxViewFocus(!inputModel.getAuxViewFocus());
        if (lastClickHNum.current === hitem.historynum && selItem?.historynum === hitem.historynum) {
            inputModel.grabSelectedHistoryItem();
            return;
        }
        inputModel.setHistorySelectionNum(hitem.historynum);
        const now = Date.now();
        lastClickHNum.current = hitem.historynum;
        lastClickTs.current = now;
        setTimeout(() => {
            if (lastClickTs.current === now) {
                lastClickHNum.current = null;
                lastClickTs.current = 0;
            }
        }, 3000);
    };

    const handleClickType = () => {
        const inputModel = GlobalModel.inputModel;
        inputModel.setAuxViewFocus(true);
        inputModel.toggleHistoryType();
    };

    const handleClickRemote = () => {
        const inputModel = GlobalModel.inputModel;
        inputModel.setAuxViewFocus(true);
        inputModel.toggleRemoteType();
    };

    const getTitleBarContents = (): React.ReactElement[] => {
        const opts = GlobalModel.inputModel.historyQueryOpts.get();
        return [
            <div className="history-opt whitespace-nowrap cursor-pointer hover:text-primary" key="screen" onClick={handleClickType}>
                [for {opts.queryType} &#x2318;S]
            </div>,
            <div className="history-opt whitespace-nowrap" key="query-str" title="type to search">
                [containing '{opts.queryStr}']
            </div>,
            <div className="history-opt whitespace-nowrap cursor-pointer hover:text-primary" key="remote" onClick={handleClickRemote}>
                [{opts.limitRemote ? "this" : "any"} remote &#x2318;R]
            </div>,
        ];
    };

    const inputModel = GlobalModel.inputModel;
    const selItem = inputModel.getHistorySelectedItem();
    const hitems = inputModel.filteredHistoryItems;
    const opts = inputModel.historyQueryOpts.get();
    let snames: Record<string, string> = {};
    let scrNames: Record<string, string> = {};
    if (opts.queryType === "global") {
        scrNames = GlobalModel.getScreenNames();
        snames = GlobalModel.getSessionNames();
    } else if (opts.queryType === "session") {
        scrNames = GlobalModel.getScreenNames();
    }

    return (
        <AuxiliaryCmdView
            title="History"
            className="cmd-history font-mono text-sm"
            onClose={handleClose}
            titleBarContents={getTitleBarContents()}
            iconClass="fa-sharp fa-solid fa-clock-rotate-left"
            scrollable={true}
            onScrollbarInitialized={handleScrollbarInitialized}
        >
            <div
                className={clsx(
                    "history-items text-main flex flex-col-reverse min-h-full",
                    { "show-remotes": !opts.limitRemote },
                    { "show-sessions": opts.queryType === "global" }
                )}
            >
                <If condition={hitems.length === 0}>[no history]</If>
                <If condition={hitems.length > 0}>
                    {hitems.map((hitem, idx) => (
                        <HItem
                            key={hitem.historyid}
                            hitem={hitem}
                            isSelected={hitem === selItem}
                            opts={opts}
                            snames={snames}
                            scrNames={scrNames}
                            onClick={handleItemClick}
                        />
                    ))}
                </If>
            </div>
        </AuxiliaryCmdView>
    );
});