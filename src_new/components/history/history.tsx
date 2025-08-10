// Copyright 2023, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import * as React from "react";
import { observer } from "mobx-react";
import * as mobx from "mobx";
import { If, For } from "tsx-control-statements/components";
import { clsx } from "clsx";
import { GlobalModel, GlobalCommandRunner } from "@/models";
import dayjs from "dayjs";
import localizedFormat from "dayjs/plugin/localizedFormat";
import customParseFormat from "dayjs/plugin/customParseFormat";
import { Line } from "@/components/line/linecomps";
import { checkKeyPressed, adaptFromReactOrNativeKeyEvent } from "@/utils/keyutil";
import { ReactComponent as ChevronLeftIcon } from "@/assets/icons/history/chevron-left.svg";
import { ReactComponent as ChevronRightIcon } from "@/assets/icons/history/chevron-right.svg";
import { ReactComponent as RightIcon } from "@/assets/icons/history/right.svg";
import { ReactComponent as SearchIcon } from "@/assets/icons/history/search.svg";
import { ReactComponent as TrashIcon } from "@/assets/icons/trash.svg";
import { ReactComponent as CheckedCheckbox } from "@/assets/icons/checked-checkbox.svg";
import { MainView } from "@/components/ui/mainview";
import { TextField } from "@/components/ui/textfield";
import { Select, SelectTrigger, SelectContent, SelectItem } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copybutton";

dayjs.extend(customParseFormat);
dayjs.extend(localizedFormat);

const isBlank = (s: string) => s == null || s === "";

const getHistoryViewTs = (nowDate: Date, ts: number): string => {
    const itemDate = new Date(ts);
    if (nowDate.getFullYear() !== itemDate.getFullYear()) {
        return dayjs(itemDate).format("M/D/YY");
    } else if (nowDate.getMonth() !== itemDate.getMonth() || nowDate.getDate() !== itemDate.getDate()) {
        return dayjs(itemDate).format("MMM D");
    } else {
        return dayjs(itemDate).format("h:mm A");
    }
};

const formatRemoteName = (rnames: Record<string, string>, rptr: RemotePtrType): string => {
    if (rptr == null || isBlank(rptr.remoteid)) return "";
    let rname = rnames[rptr.remoteid] ?? rptr.remoteid.substring(0, 8);
    if (!isBlank(rptr.name)) {
        rname = `${rname}:${rptr.name}`;
    }
    return `[${rname}]`;
};

const formatSSName = (snames: Record<string, string>, scrnames: Record<string, string>, item: HistoryItem): string => {
    if (isBlank(item.sessionid)) return "";
    return `#${snames[item.sessionid] ?? item.sessionid.substring(0, 8)}`;
};

const formatSessionName = (snames: Record<string, string>, sessionId: string): string => {
    if (isBlank(sessionId)) return "";
    return `#${snames[sessionId] ?? sessionId.substring(0, 8)}`;
};

const HistoryCheckbox: React.FC<{ checked: boolean; partialCheck?: boolean; onClick?: () => void }> = ({
    checked,
    partialCheck,
    onClick,
}) => {
    if (checked) {
        return <CheckedCheckbox onClick={onClick} className="w-4 h-4 relative top-0.5" />;
    }
    if (partialCheck) {
        return (
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none">
                <rect x="0.5" y="0.5" width="15" height="15" rx="3.5" fill="#D5FEAF" fillOpacity="0.026" />
                <path
                    fillRule="evenodd"
                    clipRule="evenodd"
                    d="M4 8C4 6.89543 4.89543 6 6 6H10C11.1046 6 12 6.89543 12 8C12 9.10457 11.1046 10 10 10H6C4.89543 10 4 9.10457 4 8Z"
                    fill="#58C142"
                />
                <rect x="0.5" y="0.5" width="15" height="15" rx="3.5" stroke="#3B3F3A" />
            </svg>
        );
    }
    return <div onClick={onClick} className="w-4 h-4 rounded border border-gray-600 bg-opacity-3" />;
};

const HistoryCmdStr: React.FC<{
    cmdstr: string;
    onUse: () => void;
    onCopy: () => void;
    fontSize: "normal" | "large";
    limitHeight: boolean;
}> = ({ cmdstr, onUse, onCopy, fontSize, limitHeight }) => {
    return (
        <div className={clsx("flex items-end", fontSize === "large" ? "text-lg" : "", limitHeight ? "max-h-[70px]" : "")}>
            <div className="flex-grow">
                <code>{cmdstr}</code>
            </div>
            <div className="flex">
                <CopyButton onClick={onCopy} title="Copy" />
                <Button className="secondary ghost" title="Use Command" onClick={onUse}>
                    <i className="fa-sharp fa-solid fa-play" />
                </Button>
            </div>
        </div>
    );
};

const HistoryKeybindings: React.FC = () => {
    React.useEffect(() => {
        const historyViewModel = GlobalModel.historyViewModel;
        const keybindManager = GlobalModel.keybindManager;
        keybindManager.registerKeybinding("mainview", "history", "generic:cancel", () => {
            historyViewModel.handleUserClose();
            return true;
        });
        return () => {
            keybindManager.unregisterDomain("history");
        };
    }, []);
    return null;
};

export const HistoryView: React.FC = observer(() => {
    const hvm = GlobalModel.historyViewModel;
    const [sessionDropdownActive, setSessionDropdownActive] = React.useState(false);
    const [remoteDropdownActive, setRemoteDropdownActive] = React.useState(false);

    const handleNext = () => hvm.goNext();
    const handlePrev = () => hvm.goPrev();
    const changeSearchText = (e: React.ChangeEvent<HTMLInputElement>) =>
        mobx.action(() => hvm.searchText.set(e.target.value))();
    const searchKeyDown = (e: React.KeyboardEvent) => {
        const waveEvent = adaptFromReactOrNativeKeyEvent(e.nativeEvent);
        if (checkKeyPressed(waveEvent, "Enter")) {
            e.preventDefault();
            hvm.submitSearch();
        }
    };
    const handleSelect = (historyId: string) => mobx.action(() => {
        if (hvm.selectedItems.get(historyId)) {
            hvm.selectedItems.delete(historyId);
        } else {
            hvm.selectedItems.set(historyId, true);
        }
    })();
    const handleControlCheckbox = () => mobx.action(() => {
        if (hvm.selectedItems.size > 0) {
            hvm.selectedItems.clear();
        } else {
            hvm.items.forEach(item => hvm.selectedItems.set(item.historyid, true));
        }
    })();
    const handleClickDelete = () => hvm.doSelectedDelete();
    const activateItem = (historyId: string) => {
        if (hvm.activeItem.get() === historyId) {
            hvm.setActiveItem(null);
        } else {
            hvm.setActiveItem(historyId);
        }
    };
    const handleFromTsChange = (date: Date) => {
        const newDate = dayjs(date).format("YYYY-MM-DD");
        const today = dayjs().format("YYYY-MM-DD");
        hvm.setFromDate(newDate === "" || newDate === today ? null : newDate);
    };
    const toggleSessionDropdown = () => {
        setSessionDropdownActive(!sessionDropdownActive);
        if (!sessionDropdownActive) setRemoteDropdownActive(false);
    };
    const clickLimitSession = (sessionId: string) => {
        setSessionDropdownActive(false);
        hvm.setSearchSessionId(sessionId);
    };
    const toggleRemoteDropdown = () => {
        setRemoteDropdownActive(!remoteDropdownActive);
        if (!remoteDropdownActive) setSessionDropdownActive(false);
    };
    const clickLimitRemote = (remoteId: string) => {
        setRemoteDropdownActive(false);
        hvm.setSearchRemoteId(remoteId);
    };
    const toggleShowMeta = () => mobx.action(() => hvm.setSearchShowMeta(!hvm.searchShowMeta.get()))();
    const toggleFilterCmds = () => mobx.action(() => hvm.setSearchFilterCmds(!hvm.searchFilterCmds.get()))();
    const resetAllFilters = () => hvm.resetAllFilters();
    const handleCopy = (item: HistoryItem) => {
        if (!isBlank(item.cmdstr)) navigator.clipboard.writeText(item.cmdstr);
    };
    const handleUse = (item: HistoryItem) => {
        if (isBlank(item.cmdstr)) return;
        mobx.action(() => {
            GlobalModel.showSessionView();
            GlobalModel.inputModel.updateCmdLine({ str: item.cmdstr, pos: item.cmdstr.length });
            setTimeout(() => GlobalModel.inputModel.giveFocus(), 50);
        })();
    };
    const handleClose = () => hvm.closeView();

    const isHidden = GlobalModel.activeMainView.get() !== "history";
    if (isHidden) return null;

    const items = hvm.items.slice();
    const nowDate = new Date();
    const snames = GlobalModel.getSessionNames();
    const rnames = GlobalModel.getRemoteNames();
    const scrnames = GlobalModel.getScreenNames();
    const hasMore = hvm.hasMore.get();
    const offset = hvm.offset.get();
    const numSelected = hvm.selectedItems.size;
    const activeItemId = hvm.activeItem.get();
    const sessionIds = Object.keys(snames);
    const remoteIds = Object.keys(rnames);

    return (
        <MainView className="history-view" title="History" onClose={handleClose}>
            <If condition={!isHidden}>
                <HistoryKeybindings />
            </If>
            <div className="p-2.5">
                <div className="flex items-center">
                    <TextField
                        placeholder="Exact String Search"
                        onChange={changeSearchText}
                        onKeyDown={searchKeyDown}
                        decoration={{ startDecoration: <SearchIcon className="w-6 h-4 pl-1 fill-main" /> }}
                        className="w-full"
                    />
                </div>
                <div className="flex items-center mt-2.5">
                    <Select onValueChange={clickLimitSession} defaultValue={hvm.searchSessionId.get() ?? ""}>
                        <SelectTrigger className="w-40">
                            {hvm.searchSessionId.get()
                                ? formatSessionName(snames, hvm.searchSessionId.get())
                                : "Limit Workspace"}
                        </SelectTrigger>
                        <SelectContent>
                            {sessionIds.map((id) => (
                                <SelectItem key={id} value={id}>
                                    #{snames[id]}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <Select onValueChange={clickLimitRemote} defaultValue={hvm.searchRemoteId.get() ?? ""}>
                        <SelectTrigger className="w-40 ml-4">
                            {hvm.searchRemoteId.get()
                                ? formatRemoteName(rnames, { remoteid: hvm.searchRemoteId.get() })
                                : "Limit Remote"}
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="">(all remotes)</SelectItem>
                            {remoteIds.map((id) => (
                                <SelectItem key={id} value={id}>
                                    [{rnames[id]}]
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <div className="ml-4 p-1.5 bg-secondary rounded flex items-center h-8.5">
                        <input
                            onChange={toggleFilterCmds}
                            type="checkbox"
                            checked={hvm.searchFilterCmds.get()}
                        />
                        <div onClick={toggleFilterCmds} className="pl-2 cursor-pointer select-none">
                            Filter Cmds
                        </div>
                    </div>
                    <Button className="secondary ml-4 h-8.5" onClick={resetAllFilters}>
                        Reset All
                    </Button>
                </div>
            </div>
            <div
                className={clsx(
                    "flex items-center h-9 mb-1.25 mx-2.5 border-b-2 border-bright-blue border-t",
                    { "hidden": items.length === 0 }
                )}
            >
                <div className="ml-4" onClick={handleControlCheckbox} title="Toggle Selection">
                    <HistoryCheckbox
                        checked={numSelected > 0 && numSelected === items.length}
                        partialCheck={numSelected > 0}
                    />
                </div>
                <div
                    className={clsx("ml-3 cursor-pointer text-secondary", { "text-red-500": hvm.deleteActive.get(), "cursor-default opacity-50": numSelected === 0 })}
                    onClick={handleClickDelete}
                >
                    <span>
                        <TrashIcon className="w-3 h-3 fill-main" title="Purge Selected Items" />
                        &nbsp;Delete Items
                    </span>
                </div>
                <div className="flex-grow" />
                <div className="mr-2.5">
                    Showing {offset + 1}-{offset + items.length}
                </div>
                <div
                    className={clsx("px-1.25 cursor-pointer font-bold", { "cursor-default font-normal text-disabled": offset === 0 })}
                    onClick={offset !== 0 ? handlePrev : null}
                >
                    <ChevronLeftIcon className="w-6 h-4 fill-main" />
                </div>
                <div className="w-2.5" />
                <div
                    className={clsx("px-1.25 cursor-pointer font-bold", { "cursor-default font-normal text-disabled": !hasMore })}
                    onClick={hasMore ? handleNext : null}
                >
                    <ChevronRightIcon className="w-6 h-4 fill-main" />
                </div>
            </div>
            <If condition={items.length === 0}>
                <div className="flex justify-center p-8 border border-gray-700 rounded m-5">
                    <div>No History Items Found</div>
                </div>
            </If>
            <div className="flex-grow min-h-[200px] overflow-y-auto h-[calc(100vh-186px)]">
                <div className="m-2.5 flex flex-col w-[calc(100%-20px)] flex-grow min-h-[200px]">
                    {items.map((item, idx) => (
                        <React.Fragment key={item.historyid}>
                            <div
                                className={clsx(
                                    "flex items-center border-b border-gray-700 p-2.5 text-main font-sans",
                                    {
                                        "bg-selected": hvm.selectedItems.get(item.historyid),
                                        "hover:bg-hover": !hvm.selectedItems.get(item.historyid),
                                    }
                                )}
                            >
                                <div
                                    className="w-8 flex-shrink-0 cursor-pointer"
                                    onClick={() => handleSelect(item.historyid)}
                                >
                                    <HistoryCheckbox checked={hvm.selectedItems.get(item.historyid)} />
                                </div>
                                <div className="flex-grow min-w-[300px] relative">
                                    <HistoryCmdStr
                                        cmdstr={item.cmdstr}
                                        onUse={() => handleUse(item)}
                                        onCopy={() => handleCopy(item)}
                                        fontSize="normal"
                                        limitHeight={true}
                                    />
                                    <div
                                        className="flex-grow cursor-pointer"
                                        onClick={() => activateItem(item.historyid)}
                                    />
                                </div>
                                <div className="w-30 flex-shrink-0 truncate ml-6">
                                    {formatSSName(snames, scrnames, item)}
                                </div>
                                <div className="w-40 flex-shrink-0 truncate pr-1.25 max-w-[150px] ml-6">
                                    {formatRemoteName(rnames, item.remote)}
                                </div>
                                <div className="w-20 flex-shrink-0 ml-6">{getHistoryViewTs(nowDate, item.ts)}</div>
                                <div
                                    className="w-8 flex-shrink-0 flex justify-center items-center self-stretch cursor-pointer"
                                    onClick={() => activateItem(item.historyid)}
                                >
                                    {activeItemId !== item.historyid ? (
                                        <svg
                                            xmlns="http://www.w3.org/2000/svg"
                                            width="16"
                                            height="16"
                                            viewBox="0 0 16 16"
                                            fill="none"
                                        >
                                            <path
                                                d="M12.1297 6.62492C12.3999 6.93881 12.3645 7.41237 12.0506 7.68263L8.48447 10.7531C8.20296 10.9955 7.78645 10.9952 7.50519 10.7526L3.94636 7.68213C3.63274 7.41155 3.59785 6.93796 3.86843 6.62434C4.13901 6.31072 4.6126 6.27583 4.92622 6.54641L7.99562 9.19459L11.0719 6.54591C11.3858 6.27565 11.8594 6.31102 12.1297 6.62492Z"
                                                fill="#C3C8C2"
                                            />
                                        </svg>
                                    ) : (
                                        <svg
                                            xmlns="http://www.w3.org/2000/svg"
                                            width="16"
                                            height="16"
                                            viewBox="0 0 16 16"
                                            fill="none"
                                        >
                                            <path
                                                d="M3.87035 9.37508C3.60009 9.06119 3.63546 8.58763 3.94936 8.31737L7.51553 5.24692C7.79704 5.00455 8.21355 5.00476 8.49481 5.24742L12.0536 8.31787C12.3673 8.58845 12.4022 9.06204 12.1316 9.37566C11.861 9.68928 11.3874 9.72417 11.0738 9.45359L8.00438 6.80541L4.92806 9.45409C4.61416 9.72435 4.14061 9.68898 3.87035 9.37508Z"
                                                fill="#C3C8C2"
                                            />
                                        </svg>
                                    )}
                                </div>
                            </div>
                            <If condition={activeItemId === item.historyid}>
                                <div className="flex items-center border-b border-gray-700 p-2.5">
                                    <div className="pr-2.5">
                                        <LineContainer
                                            key={activeItemId}
                                            historyId={activeItemId}
                                            width={1000} // TODO
                                        />
                                    </div>
                                </div>
                            </If>
                        </React.Fragment>
                    ))}
                </div>
            </div>
            <div className={clsx("flex items-center h-9 border-t-2 border-bright-blue", { "hidden": items.length === 0 || !hasMore })}>
                <div className="flex-grow" />
                <div className="mr-2.5">
                    Showing {offset + 1}-{offset + items.length}
                </div>
                <div
                    className={clsx("px-1.25 cursor-pointer font-bold", { "cursor-default font-normal text-disabled": offset === 0 })}
                    onClick={offset !== 0 ? handlePrev : null}
                >
                    <ChevronLeftIcon className="w-6 h-4 fill-main" />
                </div>
                <div className="w-2.5" />
                <div
                    className={clsx("px-1.25 cursor-pointer font-bold", { "cursor-default font-normal text-disabled": !hasMore })}
                    onClick={hasMore ? handleNext : null}
                >
                    <ChevronRightIcon className="w-6 h-4 fill-main" />
                </div>
            </div>
        </MainView>
    );
});

const LineContainer: React.FC<{ historyId: string; width: number }> = observer(({ historyId, width }) => {
    const hvm = GlobalModel.historyViewModel;
    const historyItem = hvm.getHistoryItemById(historyId);
    const line = historyItem ? hvm.getLineById(historyItem.lineid) : null;
    const visible = React.useRef(mobx.observable.box(true));
    const overrideCollapsed = React.useRef(mobx.observable.box(false));

    const viewInContext = () => {
        const screen = GlobalModel.getScreenById(historyItem.sessionid, historyItem.screenid);
        if (screen) {
            hvm.closeView();
            GlobalCommandRunner.lineView(screen.sessionId, screen.screenId, line.linenum);
        }
    };

    if (!historyItem || width === 0) return null;
    if (!line) {
        return (
            <div className="flex justify-center items-center p-5">
                <div>[no line data]</div>
            </div>
        );
    }

    const session = GlobalModel.getSessionById(historyItem.sessionid);
    const screen = GlobalModel.getScreenById(historyItem.sessionid, historyItem.screenid);
    const canViewInContext = session && screen;
    const ssStr = canViewInContext ? `#${session.name.get()}[${screen.name.get()}]` : "";

    return (
        <div className="overflow-x-auto p-2.5">
            <If condition={canViewInContext}>
                <div className="flex items-center ml-5 mb-2.5 mt-2.5">
                    <div title="View in Context" className="cursor-pointer text-main hover:text-main" onClick={viewInContext}>
                        <RightIcon className="w-6 h-4 fill-main" /> {ssStr}
                    </div>
                </div>
            </If>
            <If condition={!session}>
                <div className="h-2.5" />
            </If>
            <Line
                screen={hvm.specialLineContainer as any}
                line={line}
                width={width - 50 < 400 ? 400 : width - 50}
                staticRender={false}
                visible={visible.current}
                onHeightChange={() => {}}
                overrideCollapsed={overrideCollapsed.current}
                topBorder={false}
                renderMode="normal"
                noSelect={true}
            />
        </div>
    );
});