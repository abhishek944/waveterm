// Copyright 2023, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { observer } from "mobx-react";
import { action, computed } from "mobx";
import { clsx } from "clsx";
import { GlobalModel, GlobalCommandRunner } from "@/models";
import { Modal, TextField, InputDecoration, Tooltip } from "@/elements";
import * as util from "@/util/util";
import { Screen } from "@/models";
import { TabIcon } from "@/elements/tabicon";

type ViewDataType = {
    label: string;
    value: string;
};

type SwitcherDataType = {
    sessionId: string;
    sessionName: string;
    sessionIdx: number;
    screenId: string;
    screenIdx: number;
    screenName: string;
    icon: string;
    color: string;
    viewData?: ViewDataType;
};

const MaxOptionsToDisplay = 100;
const additionalOptions = [
    { label: "Connections", value: "connections" },
    { label: "History", value: "history" },
    { label: "Settings", value: "clientsettings" },
].map((item, index) => ({
    sessionId: `additional-${index}`,
    sessionName: "",
    sessionIdx: -1,
    screenId: `additional-${index}`,
    screenIdx: -1,
    screenName: "",
    icon: "",
    color: "",
    viewData: item,
}));

const TabSwitcherModal: React.FC = observer(() => {
    const [sOptions, setSOptions] = useState<SwitcherDataType[]>([]);
    const [focusedIdx, setFocusedIdx] = useState(0);
    const [searchValue, setSearchValue] = useState("");
    
    const activeSessionIdx = GlobalModel.getActiveSession().sessionIdx.get();
    const optionRefs = useRef<(React.RefObject<HTMLDivElement>)[]>([]);
    const listWrapperRef = useRef<HTMLDivElement>(null);
    const prevFocusedIdx = useRef(0);

    const getTabIcon = (screen: Screen): string => {
        let tabIcon = "default";
        const screenOpts = screen.opts.get();
        if (screenOpts != null && !util.isBlank(screenOpts.tabicon)) {
            tabIcon = screenOpts.tabicon;
        }
        return tabIcon;
    };

    const getTabColor = (screen: Screen): string => {
        let tabColor = "default";
        const screenOpts = screen.opts.get();
        if (screenOpts != null && !util.isBlank(screenOpts.tabcolor)) {
            tabColor = screenOpts.tabcolor;
        }
        return tabColor;
    };

    const options = useMemo(() => {
        const opts: SwitcherDataType[] = [];
        const oSessions = GlobalModel.sessionList;
        const oScreens = GlobalModel.screenMap;
        
        oScreens.forEach((oScreen) => {
            if (oScreen == null || oScreen.archived.get()) {
                return;
            }
            const foundSession = oSessions.find((s) => {
                return s.sessionId === oScreen.sessionId && !s.archived.get();
            });
            if (!foundSession) {
                return;
            }
            const data: SwitcherDataType = {
                sessionName: foundSession.name.get(),
                sessionId: foundSession.sessionId,
                sessionIdx: foundSession.sessionIdx.get(),
                screenName: oScreen.name.get(),
                screenId: oScreen.screenId,
                screenIdx: oScreen.screenIdx.get(),
                icon: getTabIcon(oScreen),
                color: getTabColor(oScreen),
            };
            opts.push(data);
        });
        return opts;
    }, []);

    const sortOptions = useCallback((opts: SwitcherDataType[]): SwitcherDataType[] => {
        const mainOptions = opts.filter((o) => o.sessionIdx !== -1);
        mainOptions.sort((a, b) => {
            const aInCurrentSession = a.sessionIdx === activeSessionIdx;
            const bInCurrentSession = b.sessionIdx === activeSessionIdx;

            if (aInCurrentSession && bInCurrentSession) {
                return a.screenIdx - b.screenIdx;
            } else if (aInCurrentSession) {
                return -1;
            } else if (bInCurrentSession) {
                return 1;
            } else {
                if (a.sessionIdx === b.sessionIdx) {
                    return a.screenIdx - b.screenIdx;
                } else {
                    return a.sessionIdx - b.sessionIdx;
                }
            }
        });

        const additionalOpts = opts.filter((o) => o.sessionIdx === -1);
        additionalOpts.sort((a, b) => a.viewData?.label.localeCompare(b.viewData?.label));

        return mainOptions.concat(additionalOpts);
    }, [activeSessionIdx]);

    const filterOptions = useCallback((searchInput: string): SwitcherDataType[] => {
        const searchLower = searchInput.toLowerCase();

        let filteredScreens = options.filter((tab) => {
            if (searchInput.includes("/")) {
                const [sessionFilter, screenFilter] = searchInput.split("/").map((s) => s.trim().toLowerCase());
                return (
                    tab.sessionName.toLowerCase().includes(sessionFilter) &&
                    tab.screenName.toLowerCase().includes(screenFilter)
                );
            } else {
                return (
                    tab.sessionName.toLowerCase().includes(searchLower) ||
                    tab.screenName.toLowerCase().includes(searchLower)
                );
            }
        });

        if (searchLower.length > 0) {
            const additionalFiltered = additionalOptions.filter((item) =>
                item.viewData?.label.toLowerCase().includes(searchLower)
            );
            filteredScreens = filteredScreens.concat(additionalFiltered);
        }

        return filteredScreens;
    }, [options]);

    useEffect(() => {
        const sorted = sortOptions(options).slice(0, MaxOptionsToDisplay);
        setSOptions(sorted);
    }, [options, sortOptions]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                closeModal();
            } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
                e.preventDefault();
                const newIndex = calculateNewIndex(e.key === "ArrowUp");
                setFocusedIdx(newIndex);
            } else if (e.key === "Enter") {
                e.preventDefault();
                handleSelect(focusedIdx);
            }
        };

        document.addEventListener("keydown", handleKeyDown);
        return () => {
            document.removeEventListener("keydown", handleKeyDown);
        };
    }, [focusedIdx, sOptions]);

    useEffect(() => {
        if (focusedIdx !== prevFocusedIdx.current) {
            const optionElement = optionRefs.current[focusedIdx]?.current;
            if (optionElement) {
                optionElement.scrollIntoView({ block: "nearest" });
            }
            prevFocusedIdx.current = focusedIdx;
        }
        if (focusedIdx >= sOptions.length && sOptions.length > 0) {
            setFocusedIdx(sOptions.length - 1);
        }
    }, [focusedIdx, sOptions]);

    const calculateNewIndex = (isUpKey: boolean) => {
        if (isUpKey) {
            return Math.max(focusedIdx - 1, 0);
        } else {
            return Math.min(focusedIdx + 1, sOptions.length - 1);
        }
    };

    const closeModal = (): void => {
        GlobalModel.modalsModel.popModal();
    };

    const handleSelect = (index: number): void => {
        const selectedOption = sOptions[index];
        if (!selectedOption) return;
        
        if (selectedOption.sessionIdx === -1) {
            GlobalCommandRunner.switchView(selectedOption.viewData.value);
            closeModal();
            return;
        }
        GlobalCommandRunner.switchScreen(selectedOption.screenId, selectedOption.sessionId);
        closeModal();
    };

    const handleSearch = (val: string): void => {
        setSearchValue(val);
        let filteredOptions: SwitcherDataType[];
        if (val === "") {
            filteredOptions = sortOptions(options).slice(0, MaxOptionsToDisplay);
        } else {
            filteredOptions = filterOptions(val);
            filteredOptions = sortOptions(filteredOptions);
            if (filteredOptions.length > MaxOptionsToDisplay) {
                filteredOptions = filteredOptions.slice(0, MaxOptionsToDisplay);
            }
        }
        setSOptions(filteredOptions);
        setFocusedIdx(0);
    };

    const renderOption = (option: SwitcherDataType, index: number): JSX.Element => {
        if (!optionRefs.current[index]) {
            optionRefs.current[index] = React.createRef();
        }
        return (
            <div
                key={option.sessionId + "/" + option.screenId}
                ref={optionRefs.current[index]}
                className={clsx(
                    "px-2 py-[5px] pl-2 flex items-center border border-transparent w-full overflow-hidden cursor-pointer",
                    "hover:border-white/15 hover:rounded hover:bg-[var(--app-selected-mask-color)]",
                    {
                        "border-white/15 rounded bg-[var(--app-selected-mask-color)]": focusedIdx === index,
                    }
                )}
                onClick={() => handleSelect(index)}
            >
                {option.sessionIdx !== -1 ? (
                    <>
                        <TabIcon icon={option.icon} color={option.color} />
                        <div className="flex-grow overflow-hidden text-ellipsis whitespace-nowrap pr-[5px] pl-[5px]">
                            #{option.sessionName} / {option.screenName}
                        </div>
                    </>
                ) : (
                    <div className="flex-grow overflow-hidden text-ellipsis whitespace-nowrap pr-[5px] pl-[5px]">
                        {option.viewData?.label}
                    </div>
                )}
            </div>
        );
    };

    return (
        <Modal className="w-[452px] min-h-[384px]">
            <div className="flex flex-col p-0 w-full">
                <div className="px-5 pt-5 pb-0">
                    <TextField
                        onChange={handleSearch}
                        maxLength={400}
                        autoFocus={true}
                        decoration={{
                            startDecoration: (
                                <InputDecoration position="start">
                                    <div className="opacity-50 text-[13px]">Go to:</div>
                                </InputDecoration>
                            ),
                            endDecoration: (
                                <InputDecoration>
                                    <Tooltip
                                        message={`Type to filter workspaces, tabs and views.`}
                                        icon={<i className="fa-sharp fa-regular fa-circle-question" />}
                                    >
                                        <i className="fa-sharp fa-regular fa-circle-question" />
                                    </Tooltip>
                                </InputDecoration>
                            ),
                        }}
                    />
                </div>
                <div className="overflow-hidden py-2.5 pb-5 w-full">
                    <div 
                        ref={listWrapperRef} 
                        className="w-full max-h-[300px] overflow-y-auto px-5 pr-4 scrollbar-hide hover:scrollbar-default"
                    >
                        <div className="w-full">
                            {sOptions.map((option, index) => renderOption(option, index))}
                        </div>
                    </div>
                </div>
            </div>
        </Modal>
    );
});

export { TabSwitcherModal };