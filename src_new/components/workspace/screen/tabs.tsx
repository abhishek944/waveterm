// Copyright 2023, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

import * as React from "react";
import { observer } from "mobx-react";
import * as mobx from "mobx";
import { For } from "tsx-control-statements/components";
import { GlobalModel, GlobalCommandRunner, Session, Screen } from "@/models";
import { ReactComponent as AddIcon } from "@/assets/icons/add.svg";
import { Reorder } from "framer-motion";
import { ScreenTab } from "@/components/workspace";

export const ScreenTabs: React.FC<{ session: Session }> = observer(({ session }) => {
    const tabsRef = React.useRef<HTMLDivElement>(null);
    const [showingScreens, setShowingScreens] = React.useState<Screen[]>([]);
    const lastActiveScreenId = React.useRef<string | null>(null);
    const deltaYHistory = React.useRef<number[]>([]);

    const getScreens = React.useCallback((): Screen[] => {
        if (!session) return [];
        const activeScreenId = session.activeScreenId.get();
        if (!activeScreenId) return [];

        const screens = GlobalModel.getSessionScreens(session.sessionId);
        const visibleScreens = screens.filter((screen) => !screen.archived.get() || activeScreenId === screen.screenId);
        visibleScreens.sort((a, b) => a.screenIdx.get() - b.screenIdx.get());
        return visibleScreens;
    }, [session]);

    React.useEffect(() => {
        setShowingScreens(getScreens());
        const dispose = mobx.reaction(
            () => getScreens(),
            (screens) => setShowingScreens(screens),
            { fireImmediately: true }
        );
        return dispose;
    }, [getScreens]);

    React.useEffect(() => {
        const activeScreenId = session?.activeScreenId.get();
        if (activeScreenId && activeScreenId !== lastActiveScreenId.current) {
            lastActiveScreenId.current = activeScreenId;
            const timeoutId = setTimeout(() => {
                const tabElem = tabsRef.current?.querySelector(`.screen-tab[data-screenid="${activeScreenId}"]`);
                tabElem?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
            }, 100);
            return () => clearTimeout(timeoutId);
        }
    }, [session, showingScreens]);

    const handleWheel = (event: WheelEvent) => {
        if (!tabsRef.current) return;
        deltaYHistory.current.push(Math.abs(event.deltaY));
        if (deltaYHistory.current.length > 5) deltaYHistory.current.shift();
        if (deltaYHistory.current.some((delta) => delta > 0)) {
            tabsRef.current.scrollLeft += event.deltaY;
            event.preventDefault();
        }
    };

    React.useEffect(() => {
        const currentTabsRef = tabsRef.current;
        currentTabsRef?.addEventListener("wheel", handleWheel, { passive: false });
        return () => currentTabsRef?.removeEventListener("wheel", handleWheel);
    }, []);

    const handleNewScreen = () => GlobalCommandRunner.createNewScreen();
    const handleSwitchScreen = (screenId: string) => {
        if (session?.activeScreenId.get() !== screenId) {
            GlobalCommandRunner.switchScreen(screenId);
        }
    };

    if (!session) return null;

    return (
        <div className="flex relative overflow-hidden h-10">
            <div className="overflow-x-scroll overflow-y-hidden no-scrollbar">
                <Reorder.Group
                    className="flex flex-row h-full"
                    ref={tabsRef}
                    as="ul"
                    axis="x"
                    onReorder={setShowingScreens}
                    values={showingScreens}
                >
                    <For each="screen" index="index" of={showingScreens}>
                        <ScreenTab
                            key={screen.screenId}
                            screen={screen}
                            activeScreenId={session.activeScreenId.get()}
                            index={index}
                            onSwitchScreen={handleSwitchScreen}
                        />
                    </For>
                </Reorder.Group>
            </div>
            <div className="flex-shrink-0 cursor-pointer flex items-center h-full" onClick={handleNewScreen}>
                <AddIcon className="w-8 h-8 rounded-full p-1.5" />
            </div>
            <div className="flex-grow min-w-[30px] h-full" style={{ webkitAppRegion: "drag" }} />
        </div>
    );
});